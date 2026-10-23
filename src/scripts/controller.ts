import { autoGain, identifyLights } from "../lib/commands.ts";
import { applyDeviceReport } from "../lib/device-report.ts";
import { applyHardwareState, defaultState } from "../lib/mixer.ts";
import { isMixKey } from "../lib/mixer-sync.ts";
import { parseCommandReport, parseMeters, parseState } from "../lib/reports.ts";
import { adoptSavedMix, mixFromHash, toSavedMix } from "../lib/saved-mix.ts";
import { newestSpec } from "../lib/spec.ts";
import { stripGroups } from "../lib/strip-groups.ts";
import { trayRows } from "../lib/tray-rows.ts";
import { refreshOutputs, runIntent, wireMixerControls } from "./actions.ts";
import { app, hooks, notice, setStatus } from "./app-state.ts";
import { refreshChannelDialog, wireChannelDialog } from "./channel-dialog.ts";
import { initDialogs } from "./dialogs.ts";
import { noteInputLevels, watchInputs } from "./input-activity.ts";
import { resetMeters, showMeterLevels } from "./meters-view.ts";
import { refreshSettings, settingsActions, wireSettingsDialog } from "./settings-dialog.ts";
import { publish, wireRemote, type ITraySnapshot } from "./remote.ts";
import { toast } from "./toast.ts";
import {
    clearRetiredSettings,
    loadMix,
    loadPendingMix,
    loadTheme,
    loadTrayHidden,
    saveMix,
    savePendingMix,
} from "./store.ts";
import { checkOtherProgram, noteOtherReading, restartMixPause, takeMixWhenFree, wireMixPause } from "./mix-pause.ts";
import { initSliders } from "./slider.ts";
import { refreshStrips, renderStrips } from "./strips.ts";
import { applyTheme } from "./theme.ts";
import * as volt from "./volt-connection.ts";
import type { IConnectionInfo } from "./volt-connection.ts";

const element = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const isLive = (): boolean =>
    volt.connectedSpec() !== null && app.isHardwareKnown && app.isSendAllowed && app.hasControl;
let isFlushPending = false;

const refresh = (): void => {
    const live = isLive();
    refreshStrips(app.state, live);
    refreshOutputs(live);
    refreshChannelDialog(live);
    refreshSettings(live);
    const isMixMissing = app.isHardwareKnown && !app.state.isMixOwned && !app.isMixPaused;
    element("[data-mix-setup]").hidden = !(volt.connectedSpec() && isMixMissing);
    element<HTMLButtonElement>("[data-action='push-mix']").disabled = !live || !app.state.isMixOwned;
    publish();
};

const meterNames = (): Set<string> => new Set(Object.keys(newestSpec().reports.meters.offsets));

/** What a tray window shows: the rows the viewer chose, and whether it can change anything. */
const traySnapshot = (): ITraySnapshot => ({
    rows: trayRows(app.state, app.view, loadTrayHidden()),
    maxDb: (volt.connectedSpec() ?? newestSpec()).faderMaxDb,
    isLive: isLive(),
    isMixOwned: app.state.isMixOwned,
    status: element("[data-status]").textContent?.trim() ?? "",
    statusKind: element("[data-status]").dataset["status"] ?? "off",
});

const relayout = (): void => {
    renderStrips(stripGroups(app.state, app.view), meterNames());
    refresh();
};

/** Sends what changed (once per frame) and saves the mix. */
const flush = (): void => {
    isFlushPending = false;
    const spec = volt.connectedSpec();
    if (spec && isLive()) volt.send(app.sync.diff(app.state, spec));
    if (app.state.isMixOwned && app.serial) saveMix(app.serial, toSavedMix(app.state));
    refresh();
};

/** Once per frame, or after 16 ms when there are no frames: a hidden window (the desktop tray). */
const commit = (): void => {
    if (isFlushPending) return;
    isFlushPending = true;
    const flushOnce = (): void => {
        if (isFlushPending) flush();
    };
    requestAnimationFrame(flushOnce);
    window.setTimeout(flushOnce, 16);
};

/** Applies the whole page mix to the Volt, like Console does when it starts. */
const pushMix = (): void => {
    const spec = volt.connectedSpec();
    if (spec && isLive()) volt.send(app.sync.diff(app.state, spec, { isFull: true, filter: isMixKey }));
};

const takeOwnership = (savedMix: unknown): void => {
    const spec = volt.connectedSpec() ?? newestSpec();
    adoptSavedMix(app.state, savedMix, spec.faderMaxDb);
    if (app.serial) saveMix(app.serial, toSavedMix(app.state));
    pushMix();
    relayout();
};

/** This computer's mix (a link opened before the Volt connected, or the saved one), applied to the Volt. */
const takeSavedMix = (): void => {
    const pendingMix = loadPendingMix();
    const savedMix = pendingMix ?? loadMix(app.serial);
    savePendingMix(null);
    if (pendingMix) toast("Mix applied from the link.");
    if (savedMix) takeOwnership(savedMix);
    else relayout();
};

const onFirstState = (data: Uint8Array): void => {
    const spec = volt.connectedSpec() ?? newestSpec();
    applyHardwareState(app.state, parseState(spec, data));
    app.isHardwareKnown = true;
    app.sync.forget();
    app.sync.prime(app.state, spec);
    if (app.isMixPaused) relayout();
    takeMixWhenFree();
};

/*
 * The Volt doesn't tell this page when something else changes it (another program on this
 * computer, the front panel's level knobs), so the page re-reads it now and then. Readings that
 * arrive while the user is moving something here are ignored: one taken just before their latest
 * move would undo it. Readings this page didn't ask for come from another program (mix-pause.ts).
 */
const editHoldMs = 1500;
const rereadMs = 1500;
let statesAsked = 0;
const isEditing = (): boolean => performance.now() - app.lastEditAt < editHoldMs;

const askForState = (): void => {
    statesAsked++;
    volt.requestState();
};

/** Only the tab that drives the Volt asks; a read-only second tab sees its readings anyway. */
const rereadVolt = (): void => {
    if (!volt.connectedSpec() || !app.isHardwareKnown || !app.hasControl) return;
    // Replies come within milliseconds, so one asked for a tick ago that hasn't come never will.
    statesAsked = 0;
    askForState();
    checkOtherProgram();
};

const onLaterState = (data: Uint8Array): void => {
    if (isEditing()) return;
    const spec = volt.connectedSpec() ?? newestSpec();
    const changed = applyHardwareState(app.state, parseState(spec, data));
    app.sync.prime(app.state, spec, (key) => !isMixKey(key));
    if (changed.length > 0) relayout();
    commit();
};

const showMeters = (levels: Record<string, number>): void => {
    showMeterLevels(levels);
    noteInputLevels(levels);
};

let stateTimer = 0;
const requestStateSoon = (): void => {
    clearTimeout(stateTimer);
    stateTimer = window.setTimeout(askForState, 150);
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
    if (reportId === spec.reports.meters.id) return showMeters(parseMeters(spec, data));
    if (reportId !== spec.reports.command.id) return;
    const report = parseCommandReport(spec, data);
    if (report.type === "state") return onStateReading(data);
    if (!app.isHardwareKnown) return;
    if (report.type === "links" || report.type === "panel") return requestStateSoon();
    if (!applyDeviceReport(app.state, report)) return;
    if (isFlushPending) flush();
    app.sync.prime(app.state, spec, (key) => !isMixKey(key));
    if (report.type === "digitalFormat") relayout();
    else refresh();
};

const onConnected = (info: IConnectionInfo): void => {
    Object.assign(app, { serial: info.serial, isHardwareKnown: false, isSendAllowed: info.isExact });
    app.state.isMixOwned = false;
    // The connection asks for the first reading itself, straight after this.
    statesAsked = 1;
    restartMixPause(true);
    setStatus(info.isIdentified ? `Connected · firmware ${info.version}` : "Connected · firmware unknown", "on");
    element("[data-action='connect']").hidden = true;
    element("[data-action='disconnect']").hidden = false;
    element("[data-device-info]").textContent = info.isIdentified
        ? `Firmware ${info.version}, serial ${info.serial}. Checked against firmware ${info.specVersion}${info.isExact ? "" : " (closest match)"}.`
        : "The Volt didn't identify itself.";
    if (!info.isExact) {
        const unknown = info.isIdentified
            ? `firmware ${info.version}, which this page hasn't been checked against`
            : "unknown firmware";
        notice(`This Volt has ${unknown}, so the page shows its settings but won't change anything.`, {
            label: "Use anyway",
            run: () => {
                app.isSendAllowed = true;
                notice("");
                if (app.state.isMixOwned) pushMix();
                refresh();
            },
        });
    }
    window.setTimeout(() => {
        if (volt.connectedSpec() && !app.isHardwareKnown)
            notice("Connected, but the Volt didn't send its settings. Unplug it and plug it back in.");
    }, 2500);
};

const onDisconnected = ({ isByUser }: { isByUser: boolean }): void => {
    app.isHardwareKnown = false;
    app.state.isMixOwned = false;
    restartMixPause(false);
    if (isByUser) setStatus("Disconnected", "off");
    else setStatus("Volt not connected · on the other computer?", "away");
    element("[data-action='connect']").hidden = false;
    element("[data-action='disconnect']").hidden = true;
    resetMeters();
    refresh();
};

/** A mix link (`#m=`, or an older `#mix=`): applied now if the Volt is ready, otherwise kept until it connects. */
const receiveMixLink = (link: string): boolean => {
    const mix = mixFromHash(new URL(link, location.href).hash);
    if (!mix) return (toast("That isn't a Volt Mixer mix link."), false);
    if (volt.connectedSpec() && app.isHardwareKnown && !app.isMixPaused) {
        takeOwnership(mix);
        toast("Mix applied from the link.");
    } else {
        savePendingMix(mix);
        toast(
            `Mix received. It will be applied when ${app.isMixPaused ? "the other Volt Mixer closes" : "the Volt connects"}.`,
        );
    }
    return true;
};

const readMixFromAddress = (): void => {
    if (!/^#mix?=/.test(location.hash)) return;
    receiveMixLink(location.href);
    history.replaceState(null, "", location.pathname + location.search);
};

/** Starts Auto-Gain, then re-reads the state dump once it's done to show the new gain. */
const startAutoGain = (mask: number, seconds: number): boolean => {
    const spec = volt.connectedSpec();
    if (!spec || !isLive() || mask === 0) return false;
    volt.send([autoGain(spec, mask, seconds)]);
    window.setTimeout(askForState, (seconds + 1.5) * 1000);
    return true;
};

const confirmThen = (question: string, run: () => void): void => {
    if (window.confirm(question)) run();
};

const pageActions: Record<string, () => void> = {
    connect: () =>
        void volt
            .pair()
            .then(
                (result) =>
                    result === "cancelled" && toast('No Volt was chosen. Click Connect Volt and pick "Volt 4 Gen 2".'),
            ),
    disconnect: () => void volt.disconnect(),
    identify: () => {
        const spec = volt.connectedSpec();
        if (spec && isLive()) volt.send([identifyLights(spec)]);
    },
    "mix-defaults": () =>
        confirmThen("Set every channel to 0 dB, like a new UAD Console session?", () =>
            takeOwnership(toSavedMix(defaultState())),
        ),
    "push-mix": () => confirmThen("Apply this computer's mix to the Volt?", pushMix),
    "forget-mix": () =>
        confirmThen("Forget this computer's mix? The Volt keeps playing what it has.", () => {
            saveMix(app.serial, null);
            app.state.isMixOwned = false;
            relayout();
        }),
    ...settingsActions,
};

const wirePage = (): void => {
    document.addEventListener("click", (event) => {
        const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset["action"] ?? "";
        pageActions[action]?.();
    });
    element("[data-mix-paste]").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = element<HTMLInputElement>("[data-mix-link-input]");
        if (receiveMixLink(input.value)) input.value = "";
    });
    window.addEventListener("hashchange", readMixFromAddress);
};

const wireConnection = (): void => {
    const on = <T>(type: string, handler: (detail: T) => void): void =>
        volt.connectionEvents.addEventListener(type, (event) => handler((event as CustomEvent<T>).detail));
    on("connected", onConnected);
    on("disconnected", onDisconnected);
    on("report", onReport);
    on<{ message: string }>("error", ({ message }) => notice(message));
    on<{ message: string }>("sendfailed", ({ message }) => {
        notice(message);
        app.sync.forget(isMixKey);
        requestStateSoon();
    });
    window.setInterval(rereadVolt, rereadMs);
};

/** The desktop app's tray window sends intents here; only a page that can drive the Volt applies them. */
const answerOthers = (): void => {
    wireRemote({
        isActive: () => app.hasControl,
        snapshot: traySnapshot,
        run: (intent) => (isLive() ? runIntent(intent) : "ignored"),
    });
};

/** Only one tab drives the Volt; any other stays read-only. */
const holdControlLock = (): void => {
    void navigator.locks?.request("volt-mixer-control", { ifAvailable: true }, (lock) => {
        app.hasControl = lock !== null;
        if (!lock)
            notice("Volt Mixer is open in another tab or window. Use that one, or close it and reload this page.");
        refresh();
        return lock ? new Promise<void>(() => {}) : undefined;
    });
};

export const start = (): void => {
    Object.assign(hooks, { commit, layout: relayout, refresh, autoGain: startAutoGain });
    wireMixPause(takeSavedMix);
    clearRetiredSettings();
    applyTheme(loadTheme());
    initSliders(document);
    initDialogs();
    watchInputs();
    wireMixerControls();
    wireChannelDialog();
    wireSettingsDialog();
    wirePage();
    relayout();
    if (!volt.isWebHidSupported()) {
        notice(
            "This browser can't talk to USB devices. Open this page in Microsoft Edge or Google Chrome; Firefox and Safari don't support WebHID.",
        );
        element<HTMLButtonElement>("[data-action='connect']").disabled = true;
        return;
    }
    readMixFromAddress();
    holdControlLock();
    answerOthers();
    wireConnection();
    volt.watchDevices();
    void volt.reconnect().then((isConnected) => isConnected || setStatus("Not connected", "off"));
};
