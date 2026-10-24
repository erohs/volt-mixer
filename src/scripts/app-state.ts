import { defaultState } from "../lib/mixer.ts";
import type { IMixerState } from "../lib/mixer.ts";
import { createMixerSync } from "../lib/mixer-sync.ts";
import { fillMessage, type MessageKind } from "./messages.ts";
import { loadView } from "./store.ts";
import { connectedSpec } from "./volt-connection.ts";

/** The page's shared state. The controller owns the lifecycle; the other scripts read and change it. */
export const app = {
    state: defaultState() as IMixerState,
    view: loadView(),
    sync: createMixerSync(),
    serial: "",
    /** The Volt's state dump has arrived this connection. */
    isHardwareKnown: false,
    /** The firmware matched exactly, or the user chose "Use anyway". */
    isSendAllowed: false,
    /** This tab holds the control lock (only one tab drives the Volt). */
    hasControl: true,
    /** Website only: another Volt Mixer on this computer has the mix (src/scripts/mix-pause.ts). */
    isMixPaused: false,
    /** When the user last changed something (performance.now()), so re-reading the Volt waits. */
    lastEditAt: -Infinity,
};

/** Whether this page may change the Volt now: connected, its settings read, allowed, and in control. */
export const isLive = (): boolean =>
    connectedSpec() !== null && app.isHardwareKnown && app.isSendAllowed && app.hasControl;

/** Set by the controller: `commit` sends what changed and refreshes; `layout` rebuilds the strips. */
export const hooks = {
    commit: (): void => {},
    layout: (): void => {},
    refresh: (): void => {},
    /** Starts the Volt's Auto-Gain; false when the Volt can't be changed right now. */
    autoGain: (_mask: number, _seconds: number): boolean => false,
};

/** For the user's own changes, from the controls; the controller's housekeeping commits directly. */
export const commit = (): void => {
    app.lastEditAt = performance.now();
    hooks.commit();
};
export const layout = (): void => hooks.layout();

export interface INoticeOptions {
    /** What sort of message it is; a warning unless said otherwise. */
    kind?: MessageKind;
    /** A button that does something about it. */
    action?: { label: string; run: () => void };
}

const noticeRegion = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-notice]");

/** A button for the notice: its action, or Dismiss (focus then goes to the start of the content). */
const noticeButtons = (action: INoticeOptions["action"]): HTMLButtonElement[] => {
    const template = document.querySelector<HTMLTemplateElement>("#notice-dismiss")!;
    const dismiss = template.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
    dismiss.addEventListener("click", () => (notice(""), document.querySelector<HTMLElement>("#main")?.focus()));
    if (!action) return [dismiss];
    const button = Object.assign(document.createElement("button"), {
        type: "button",
        className: "button",
        textContent: action.label,
    });
    button.addEventListener("click", action.run);
    return [button, dismiss];
};

/** Shows a message about the whole page, which can always be dismissed; "" clears it. */
export const notice = (text: string, { kind = "warning", action }: INoticeOptions = {}): void => {
    const region = noticeRegion();
    if (!region) return;
    region.replaceChildren();
    region.dataset["text"] = text;
    if (!text) return;
    // Warnings and errors interrupt; news and confirmations wait their turn.
    region.setAttribute("aria-live", kind === "warning" || kind === "error" ? "assertive" : "polite");
    region.dataset["kind"] = kind;
    const message = document.createElement("p");
    message.className = "message notice-text";
    fillMessage(message, kind, text);
    region.append(message, ...noticeButtons(action));
};

/** Clears the notice if it's still showing `text`. */
export const clearNotice = (text: string): void => {
    if (noticeRegion()?.dataset["text"] === text) notice("");
};

export const setStatus = (text: string, status: "off" | "on" | "away"): void => {
    const element = document.querySelector<HTMLElement>("[data-status]");
    if (!element) return;
    element.textContent = text;
    element.dataset["status"] = status;
};
