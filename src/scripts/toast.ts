/*
 * A short message that shows above everything, dialogs included (Toast.astro). It goes away by
 * itself after a while, but not while it's hovered or focused; one that tells the user what to do
 * (`isInstruction`) stays until it's dismissed.
 */

const minimumMs = 6000;
/** Time to read it: about 70 ms a character, and never less than the minimum. */
const readingMs = (text: string): number => Math.max(minimumMs, text.length * 70);

let hideTimer = 0;
let isSticky = false;

const part = <T extends HTMLElement>(selector: string): T | null => document.querySelector<T>(selector);

const hide = (): void => {
    const element = part("[data-toast]");
    if (element?.matches(":popover-open")) element.hidePopover();
};

/** Starts the countdown again, unless the toast stays or is hovered or focused. */
const scheduleHide = (): void => {
    window.clearTimeout(hideTimer);
    const element = part("[data-toast]");
    if (!element || isSticky || element.matches(":hover, :focus-within")) return;
    hideTimer = window.setTimeout(hide, readingMs(part("[data-toast-text]")?.textContent ?? ""));
};

/** Dismissed with its button: focus goes to the open dialog's Close button, or the start of the page. */
const dismiss = (): void => {
    hide();
    (part("dialog[open] .head button") ?? part("#main"))?.focus();
};

export const toast = (text: string, { isInstruction = false } = {}): void => {
    const element = part("[data-toast]");
    const announce = part("[data-toast-announce]");
    if (!element || !announce) return;
    part("[data-toast-text]")!.textContent = text;
    // Cleared first, so the same message twice in a row is announced twice.
    announce.textContent = "";
    window.setTimeout(() => (announce.textContent = text), 50);
    isSticky = isInstruction;
    // Shown again each time, so it lands above a dialog opened since the last one.
    hide();
    element.showPopover();
    scheduleHide();
};

export const wireToast = (): void => {
    const element = part("[data-toast]");
    if (!element) return;
    part("[data-toast-dismiss]")?.addEventListener("click", dismiss);
    element.addEventListener("pointerenter", () => window.clearTimeout(hideTimer));
    element.addEventListener("focusin", () => window.clearTimeout(hideTimer));
    // After the pointer or focus has actually left, so :hover and :focus-within are current.
    element.addEventListener("pointerleave", () => window.setTimeout(scheduleHide));
    element.addEventListener("focusout", () => window.setTimeout(scheduleHide));
};
