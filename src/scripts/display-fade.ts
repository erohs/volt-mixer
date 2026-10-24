import { defaultBrightness, dimmedBrightness, fadeLevels, isDimmed } from "../lib/display-fade.ts";
import { app, isLive } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { runIntent } from "./run-intent.ts";
import { loadBrightness, saveBrightness } from "./store.ts";

/*
 * The desktop app dims the Volt's display as its computer sleeps or shuts down, and whichever page
 * connects to the Volt next fades it back up (src/lib/display-fade.ts). Dimming is one step: the
 * system suspends the app within a few reports. Brightness goes through its intent, so it's paced
 * like the slider (volt-session.ts).
 */

const fadeSteps = 6;
const stepMs = 50;
/** A new fade takes over from one still running (waking and sleeping again straight away). */
let fadeId = 0;
let fadeTarget: number | null = null;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
/** Where the display is heading: a running fade's end, or where it is. */
const brightnessNow = (): number => fadeTarget ?? app.state.device.brightness;

const fadeTo = async (target: number): Promise<void> => {
    const id = ++fadeId;
    fadeTarget = target;
    for (const raw of fadeLevels(app.state.device.brightness, target, fadeSteps)) {
        if (id !== fadeId) return;
        runIntent({ type: "brightness", raw });
        await sleep(stepMs);
    }
    if (id === fadeId) fadeTarget = null;
};

/** Remembers the brightness and dims straight away (stopping a fade); false when there's nothing to dim. */
const dimDisplay = (): boolean => {
    const raw = brightnessNow();
    if (!isLive() || raw <= dimmedBrightness) return false;
    saveBrightness(app.serial, raw);
    fadeId++;
    fadeTarget = null;
    runIntent({ type: "brightness", raw: dimmedBrightness });
    return true;
};

/** Brightness the user set, to come back to: the desktop app may dim the Volt with no word to the page. */
export const rememberBrightness = (raw: number): void => {
    if (!isDimmed(raw)) saveBrightness(app.serial, raw);
};

let reportedLive: boolean | null = null;

/**
 * Tells the desktop app whether this page drives a Volt, which it then dims itself at shutdown;
 * called on every refresh, it says so only when that changes (connecting, Use anyway, disconnecting).
 */
export const reportVoltLive = (): void => {
    const live = isLive();
    if (live === reportedLive) return;
    reportedLive = live;
    desktopApp()?.setVoltLive(live);
};

/** Once the Volt's state is known: fades back up if Volt Mixer dimmed it, or remembers the brightness. */
export const undimDisplay = (): void => {
    const raw = brightnessNow();
    if (!isDimmed(raw)) return rememberBrightness(raw);
    if (isLive()) void fadeTo(loadBrightness(app.serial) ?? defaultBrightness);
};

/** The desktop app asks before sleep or shutdown, and again on waking (desktop/src/display-fade.ts). */
export const wireDisplayFade = (): void => {
    desktopApp()?.onDisplayFade((request) => (request === "dim" ? dimDisplay() : (undimDisplay(), true)));
};
