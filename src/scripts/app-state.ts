import { defaultState } from "../lib/mixer.ts";
import type { IMixerState } from "../lib/mixer.ts";
import { createMixerSync } from "../lib/mixer-sync.ts";
import { newestSpec, type ISpec } from "../lib/spec.ts";
import { loadTheme, loadTrayHidden, loadView } from "./store.ts";
import { connectedSpec } from "./volt-connection.ts";

/**
 * Why the website holds back its mix on a connected Volt (src/scripts/mix-pause.ts):
 * "listening" just after connecting, for another Volt Mixer on this computer; "other" while one
 * is open, as it has the mix.
 */
export type MixHold = "listening" | "other" | null;

/** The page's shared state. The controller owns the lifecycle; the other scripts read and change it. */
export const app = {
    state: defaultState() as IMixerState,
    /** What this viewer chose to see: kept here, so a refresh never reads storage. */
    view: { ...loadView(), theme: loadTheme(), trayHidden: loadTrayHidden() },
    sync: createMixerSync(),
    serial: "",
    /** The Volt's state dump has arrived this connection. */
    isHardwareKnown: false,
    /** The firmware matched exactly, or the user chose "Use anyway". */
    isSendAllowed: false,
    /** This tab holds the control lock (only one tab drives the Volt); none until it's granted. */
    hasControl: false,
    mixHold: null as MixHold,
    /** When the user last changed something (performance.now()), so re-reading the Volt waits. */
    lastEditAt: -Infinity,
};

/** The connected Volt's spec, or the newest recorded one while none is. */
export const currentSpec = (): ISpec => connectedSpec() ?? newestSpec();

/** Whether this page may change the Volt now: connected, its settings read, allowed, and in control. */
export const isLive = (): boolean =>
    connectedSpec() !== null && app.isHardwareKnown && app.isSendAllowed && app.hasControl;

/** Whether this computer's mix can go on the Volt now: live, and not held back for another Volt Mixer. */
export const canApplyMix = (): boolean => isLive() && app.mixHold === null;

/** Set by the controller: `sendSoon` sends what changed and refreshes; `layout` rebuilds the strips. */
export const hooks = {
    sendSoon: (): void => {},
    layout: (): void => {},
    refresh: (): void => {},
};

/** For the user's own changes, from the controls; the controller's housekeeping sends directly. */
export const commit = (): void => {
    app.lastEditAt = performance.now();
    hooks.sendSoon();
};
export const layout = (): void => hooks.layout();

export const setStatus = (text: string, status: "off" | "on" | "away"): void => {
    const element = document.querySelector<HTMLElement>("[data-status]");
    if (!element) return;
    element.textContent = text;
    element.dataset["status"] = status;
};
