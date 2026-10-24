/*
 * The guide's pages on a narrow screen (GuideNav.astro): a popover, which opens without script but
 * doesn't hold focus. While it's open the rest of the page is inert, so screen readers stay in it,
 * and Tab wraps round inside it, like the mixer's dialogs; closing it puts focus back on the menu
 * button.
 */

import { wrapTab } from "./dialogs.ts";

const wide = window.matchMedia("(width >= 60rem)");

const setPageInert = (nav: HTMLElement, isInert: boolean): void => {
    for (const element of document.body.children) {
        if (element !== nav && element instanceof HTMLElement) element.inert = isInert;
    }
};

export const wireGuideNav = (): void => {
    const nav = document.querySelector<HTMLElement>("#guide-nav");
    const menuButton = document.querySelector<HTMLElement>(".guide-menu-button");
    if (!nav) return;
    // Before the change, so the page is usable again by the time focus returns to it.
    nav.addEventListener("beforetoggle", (event) => setPageInert(nav, (event as ToggleEvent).newState === "open"));
    nav.addEventListener("toggle", (event) => {
        if ((event as ToggleEvent).newState === "open") nav.querySelector<HTMLElement>("button, a[href]")?.focus();
        // Closed with focus left inside it (now hidden), focus goes back to the menu button.
        else if (nav.contains(document.activeElement) || document.activeElement === document.body) menuButton?.focus();
    });
    nav.addEventListener("keydown", (event) => nav.matches(":popover-open") && wrapTab(event, nav));
    // Widened past the breakpoint, the nav is the sidebar again: closed, so nothing stays inert.
    wide.addEventListener("change", () => {
        if (wide.matches && nav.matches(":popover-open")) nav.hidePopover();
    });
};
