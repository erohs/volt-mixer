import { createOtherProgram } from "../lib/other-program.ts";
import { app, clearNotice, layout, notice } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { toast } from "./toast.ts";

/*
 * Another Volt Mixer on this computer (the desktop app, or the website in another browser) drives
 * the same Volt with its own mix. Two mixes would fight, and this page's faders would show levels
 * the Volt isn't playing. So the website leaves the mix to the other one while it's open, and on
 * connecting listens before it applies its own. The desktop app always keeps its mix.
 */

const listenMs = 3500;
const others = createOtherProgram();
const websiteText =
    "Volt Mixer is also open in the desktop app or another browser, so this page leaves the mix to that one " +
    "until it closes. Levels, 48V and gain still work here.";
const appText = "Volt Mixer is also open in a browser on this computer. The browser leaves the mix to the app.";

let listenUntil = 0;
let isOtherShown = false;
/** The mix waits to be taken (again) once nothing else is open. */
let isMixWaiting = false;
let takeMix = (): void => {};

const isWebsite = (): boolean => desktopApp() === null;

/** Says when another Volt Mixer opens or closes; a read-only second tab says nothing. */
const showOther = (isOpen: boolean): void => {
    if (isOpen === isOtherShown) return;
    isOtherShown = isOpen;
    const text = isWebsite() ? websiteText : appText;
    if (isOpen) notice(text);
    else clearNotice(text);
};

/** Pauses the mix (gives it up if this page had it) or takes it once it's free. */
export const checkOtherProgram = (): void => {
    const now = performance.now();
    const isOtherOpen = app.hasControl && others.isOpen(now);
    showOther(isOtherOpen);
    const isPaused = app.hasControl && isWebsite() && (isOtherOpen || now < listenUntil);
    if (isPaused === app.isMixPaused) return;
    app.isMixPaused = isPaused;
    if (isPaused && app.state.isMixOwned) isMixWaiting = true;
    if (isPaused) app.state.isMixOwned = false;
    if (isPaused || !isMixWaiting) return layout();
    isMixWaiting = false;
    if (now >= listenUntil + 1000) toast("The other Volt Mixer closed, so this page's mix is back on the Volt.");
    takeMix();
};

/** A state reading this page didn't ask for. */
export const noteOtherReading = (): void => {
    others.note(performance.now());
    checkOtherProgram();
};

/** Takes the mix now, or once nothing else is open. */
export const takeMixWhenFree = (): void => {
    if (app.isMixPaused) isMixWaiting = true;
    else takeMix();
};

/** On connecting (or disconnecting), the website listens for another Volt Mixer before taking the mix. */
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
