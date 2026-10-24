import { autoGain, identifyLights } from "../lib/commands.ts";
import { applyDeviceReport } from "../lib/device-report.ts";
import { applyHardwareState, isLinked, matchQuieterGain, voltSettings } from "../lib/mixer.ts";
import { isMixKey } from "../lib/mixer-sync.ts";
import { parseCommandReport, parseMeters, parseState } from "../lib/reports.ts";
import { newestSpec, type ISpec } from "../lib/spec.ts";
import { app, hooks, isLive, layout, notice } from "./app-state.ts";
import { showMeterLevels } from "./meters-view.ts";
import { saveMixSoon } from "./mix-ownership.ts";
import { checkOtherProgram, noteOtherReading, takeMixWhenFree } from "./mix-pause.ts";
import * as volt from "./volt-connection.ts";

/*
 * The conversation with the connected Volt: sending what changed, reading its state and following
 * its front panel. The Volt doesn't tell this page when something else changes it (another program
 * on this computer, the level knobs), so the page re-reads it now and then. Readings that arrive
 * while the user is moving something here are ignored: one taken just before their latest move
 * would undo it. Readings this page didn't ask for come from another program (mix-pause.ts).
 */

const editHoldMs = 1500;
const rereadMs = 1500;
let isFlushPending = false;
let statesAsked = 0;
let stateTimer = 0;

/*
 * The Volt's display eases to a new brightness, and a change that arrives mid-way can leave it
 * stuck short of the value the Volt stored (seen dragging the slider on a 240 Hz screen, changes
 * 4 ms apart; rarer 50 ms apart). Sending the same value again unsticks it. So brightness goes at
 * most every 50 ms, and the last one goes once more when the slider has settled.
 */
const brightnessGapMs = 50;
const brightnessSettleMs = 500;
let brightnessSentAt = -Infinity;
let brightnessTimer = 0;
let settleTimer = 0;

const isEditing = (): boolean => performance.now() - app.lastEditAt < editHoldMs;
const isBrightness = (key: string): boolean => key === "brightness";
/** The settings the Volt reports, as opposed to the mix, which only this page knows. */
const isReportedKey = (key: string): boolean => !isMixKey(key);
/** What a reading confirms; not a brightness that's waiting to go, which the Volt hasn't had yet. */
const isConfirmedKey = (key: string): boolean => isReportedKey(key) && !(isBrightness(key) && brightnessTimer !== 0);

/** Sends brightness once the gap since the last has passed; until then a timer waits to send the latest. */
const sendBrightness = (spec: ISpec): void => {
    const wait = brightnessSentAt + brightnessGapMs - performance.now();
    if (wait > 0) {
        brightnessTimer ||= window.setTimeout(() => ((brightnessTimer = 0), commit()), wait);
        return;
    }
    const reports = app.sync.diff(app.state, spec, { filter: isBrightness });
    if (reports.length === 0) return;
    brightnessSentAt = performance.now();
    volt.send(reports);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => volt.connectedSpec() && isLive() && volt.send(reports), brightnessSettleMs);
};

/** Sends what changed and saves the mix. */
const flush = (): void => {
    isFlushPending = false;
    const spec = volt.connectedSpec();
    if (spec && isLive()) {
        volt.send(app.sync.diff(app.state, spec, { filter: (key) => !isBrightness(key) }));
        sendBrightness(spec);
    }
    saveMixSoon();
    hooks.refresh();
};

/** Once per frame, or after 16 ms when there are no frames: a hidden window (the desktop tray). */
export const commit = (): void => {
    if (isFlushPending) return;
    isFlushPending = true;
    const flushOnce = (): void => {
        if (isFlushPending) flush();
    };
    requestAnimationFrame(flushOnce);
    window.setTimeout(flushOnce, 16);
};

const askForState = (): void => {
    statesAsked++;
    volt.requestState();
};

/** Only the tab that drives the Volt asks; a read-only second tab sees its readings anyway. */
export const rereadVolt = (): void => {
    if (!volt.connectedSpec() || !app.isHardwareKnown || !app.hasControl) return;
    // Replies come within milliseconds, so one asked for a tick ago that hasn't come never will.
    statesAsked = 0;
    askForState();
    checkOtherProgram();
};

const requestStateSoon = (): void => {
    window.clearTimeout(stateTimer);
    stateTimer = window.setTimeout(askForState, 150);
};

const onFirstState = (data: Uint8Array): void => {
    const spec = volt.connectedSpec() ?? newestSpec();
    applyHardwareState(app.state, parseState(spec, data));
    app.isHardwareKnown = true;
    app.sync.forget();
    app.sync.prime(app.state, spec);
    if (app.isMixPaused) layout();
    takeMixWhenFree();
};

const onLaterState = (data: Uint8Array): void => {
    if (isEditing()) return;
    const spec = volt.connectedSpec() ?? newestSpec();
    const before = JSON.stringify(voltSettings(app.state));
    const changed = applyHardwareState(app.state, parseState(spec, data));
    if (changed.length === 0 && JSON.stringify(voltSettings(app.state)) === before) return;
    app.sync.prime(app.state, spec, isConfirmedKey);
    // Linked with the INPUT button: the preamps take the lower gain, which the commit sends.
    for (const pair of changed) if (isLinked(app.state, pair[0])) matchQuieterGain(app.state, pair);
    if (changed.length > 0) layout();
    commit();
};

/** Every state reading reaches every program that has the Volt open; this page's own are counted. */
const onStateReading = (data: Uint8Array): void => {
    const isOwn = statesAsked > 0;
    statesAsked = Math.max(0, statesAsked - 1);
    if (!isOwn) noteOtherReading();
    if (app.isHardwareKnown) onLaterState(data);
    else onFirstState(data);
};

const onReport = ({ reportId, data }: { reportId: number; data: Uint8Array }): void => {
    const spec = volt.connectedSpec();
    if (!spec) return;
    if (reportId === spec.reports.meters.id) return showMeterLevels(parseMeters(spec, data));
    if (reportId !== spec.reports.command.id) return;
    const report = parseCommandReport(spec, data);
    if (report.type === "state") return onStateReading(data);
    if (!app.isHardwareKnown) return;
    if (report.type === "links" || report.type === "panel") return requestStateSoon();
    // This page's own pending changes go out first, so the Volt's report isn't sent back to it.
    if (isFlushPending) flush();
    if (!applyDeviceReport(app.state, report)) return;
    app.sync.prime(app.state, spec, isConfirmedKey);
    if (report.type === "digitalFormat") layout();
    else hooks.refresh();
};

/** A new connection asks for its first reading itself, straight after the "connected" event. */
export const startSession = (): void => {
    statesAsked = 1;
};

/** Starts Auto-Gain, then re-reads the state dump once it's done to show the new gain. */
export const startAutoGain = (mask: number, seconds: number): boolean => {
    const spec = volt.connectedSpec();
    if (!spec || !isLive() || mask === 0) return false;
    volt.send([autoGain(spec, mask, seconds)]);
    window.setTimeout(askForState, (seconds + 1.5) * 1000);
    return true;
};

export const identifyVolt = (): void => {
    const spec = volt.connectedSpec();
    if (spec && isLive()) volt.send([identifyLights(spec)]);
};

export const wireSession = (): void => {
    volt.connectionEvents.addEventListener("report", (event) => onReport((event as CustomEvent).detail));
    volt.connectionEvents.addEventListener("sendfailed", (event) => {
        notice((event as CustomEvent<{ message: string }>).detail.message, { kind: "error" });
        app.sync.forget(isMixKey);
        requestStateSoon();
    });
    window.setInterval(rereadVolt, rereadMs);
    // A page that was in the background may be well behind (browsers slow its timers), so it
    // catches up before anything can be moved from what it shows.
    window.addEventListener("focus", rereadVolt);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && rereadVolt());
};
