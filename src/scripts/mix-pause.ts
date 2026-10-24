import { createOtherProgram } from "../lib/other-program.ts";
import { app, layout, type MixHold } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { notice, setCondition } from "./notices.ts";
import { releaseMix } from "./mix-ownership.ts";
import { loadPendingMix } from "./store.ts";

/*
 * Another Volt Mixer on this computer (the desktop app, or the website in another browser) drives
 * the same Volt with its own mix. Two mixes would fight, and this page's faders would show levels
 * the Volt isn't playing. So the website leaves the mix to the other one while it's open, and on
 * connecting listens before it applies its own. The desktop app always keeps its mix.
 */

const listenMs = 3500;
const others = createOtherProgram();
const pausedText =
    "Volt Mixer is also open in the desktop app or another browser, so this page leaves the mix to that one " +
    "until it closes. Levels, 48V and gain still work here.";
const appText = "Volt Mixer is also open in a browser on this computer. The browser leaves the mix to the app.";

let listenUntil = 0;
/** The mix waits to be taken (again) once nothing else is open. */
let isMixWaiting = false;
let takeMix = (): void => {};

const isWebsite = (): boolean => desktopApp() === null;

/** Why a mix change can't be made now, while the mix is held back; null when it isn't. */
export const heldText = (): string | null => {
    if (app.mixHold === "other") return pausedText;
    if (app.mixHold === "listening") return "Your mix goes on the Volt in a moment, once nothing else is using it.";
    return null;
};

const holdNow = (now: number, isOtherOpen: boolean): MixHold => {
    if (!app.hasControl || !isWebsite()) return null;
    if (isOtherOpen) return "other";
    return now < listenUntil ? "listening" : null;
};

/** The mix comes back once nothing holds it, saying so if another Volt Mixer had it. */
const resume = (now: number): void => {
    isMixWaiting = false;
    if (now >= listenUntil + 1000)
        notice("The other Volt Mixer closed, so this page's mix is back on the Volt.", { kind: "info" });
    takeMix();
};

/** Holds the mix back (giving it up if this page had it) or takes it once it's free. */
export const checkOtherProgram = (): void => {
    const now = performance.now();
    const isOtherOpen = app.hasControl && others.isOpen(now);
    setCondition("other-program", isOtherOpen ? (isWebsite() ? pausedText : appText) : null, { kind: "info" });
    const hold = holdNow(now, isOtherOpen);
    if (hold === app.mixHold) return;
    app.mixHold = hold;
    if (hold && app.state.isMixOwned) isMixWaiting = true;
    if (hold) releaseMix();
    // A link kept while the mix was held back waits too.
    if (hold || !(isMixWaiting || loadPendingMix() !== null)) return layout();
    resume(now);
};

/**
 * A state reading this page didn't ask for. Only the tab in control counts them: a read-only tab
 * sees the driving tab's readings too, and would take them for another program's.
 */
export const noteOtherReading = (): void => {
    if (!app.hasControl) return;
    others.note(performance.now());
    checkOtherProgram();
};

/** Takes the mix now, or once nothing else is open. */
export const takeMixWhenFree = (): void => {
    if (app.mixHold) isMixWaiting = true;
    else takeMix();
};

/**
 * On connecting (or disconnecting, or taking over from another tab), the website listens for
 * another Volt Mixer before taking the mix.
 */
export const restartMixPause = (isConnected: boolean): void => {
    others.forget();
    isMixWaiting = false;
    listenUntil = isConnected && isWebsite() ? performance.now() + listenMs : 0;
    if (listenUntil) window.setTimeout(checkOtherProgram, listenMs + 50);
    checkOtherProgram();
};

/** `take` applies this computer's mix (a pending link, or the saved one) to the Volt. */
export const wireMixPause = (take: () => void): void => {
    takeMix = take;
};
