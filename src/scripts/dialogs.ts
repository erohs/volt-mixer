/*
 * Modal dialogs: a click on the backdrop closes them, and Tab cycles inside them, wrapping from
 * the last control back to the first (a native modal lets focus leave for the browser's own UI).
 */

const focusable =
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])';

const visibleFocusable = (dialog: HTMLDialogElement): HTMLElement[] =>
    // checkVisibility, not a size check: the contents of a closed <details> still have a size in Chrome.
    [...dialog.querySelectorAll<HTMLElement>(focusable)].filter((element) => element.checkVisibility());

const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget as HTMLDialogElement;
    const items = visibleFocusable(dialog);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    const isLeaving = event.shiftKey ? document.activeElement === first : document.activeElement === last;
    if (!isLeaving) return;
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
};

/** A click whose point is outside the dialog's box landed on the backdrop. */
const onClick = (event: MouseEvent): void => {
    const dialog = event.currentTarget as HTMLDialogElement;
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const isInside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
    if (!isInside) dialog.close();
};

export const initDialogs = (): void => {
    for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog")) {
        dialog.addEventListener("keydown", onKeyDown);
        dialog.addEventListener("click", onClick);
    }
};
