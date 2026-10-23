/* A short message that shows for a few seconds above everything, dialogs included (Toast.astro). */

const visibleMs = 3500;
let hideTimer = 0;

export const toast = (text: string): void => {
    const element = document.querySelector<HTMLElement>("[data-toast]");
    if (!element) return;
    element.textContent = text;
    // Shown again each time, so it lands above a dialog opened since the last one.
    if (element.matches(":popover-open")) element.hidePopover();
    element.showPopover();
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => element.hidePopover(), visibleMs);
};
