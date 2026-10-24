/*
 * A button that answers for a moment with a tick (it worked) or a cross (it didn't), in place of
 * what it shows; the markup and styles are .button--feedback (src/styles/button.css). The words
 * go to a live region (showMessage with isQuiet), as the icons say nothing to a screen reader.
 */

const shownMs = 1500;
const timers = new WeakMap<HTMLElement, number>();

/** Shows the tick or the cross on `button`; `onDone` runs when its own content is back. */
export const flashButton = (button: HTMLElement | null, kind: "success" | "error", onDone = (): void => {}): void => {
    if (!button) return;
    window.clearTimeout(timers.get(button));
    button.dataset["feedback"] = kind;
    const timer = window.setTimeout(() => {
        delete button.dataset["feedback"];
        onDone();
    }, shownMs);
    timers.set(button, timer);
};

/** Marks a field as refused (red), or as fine again. */
export const setInvalid = (input: HTMLInputElement, isInvalid: boolean): void => {
    if (isInvalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
};

/** Puts the button's own content back now (an outcome that isn't a tick or a cross came in). */
export const clearFeedback = (button: HTMLElement | null): void => {
    if (!button) return;
    window.clearTimeout(timers.get(button));
    delete button.dataset["feedback"];
};
