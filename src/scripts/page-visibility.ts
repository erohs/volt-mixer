import { desktopApp } from "./desktop.ts";

/*
 * Whether anyone can see the mixer page. In a browser the Page Visibility API says. In the desktop
 * app it can't: background throttling is off (so the hidden window keeps answering the tray and
 * the Volt), and that also makes a hidden window count as visible, so the app says instead
 * (desktop/src/windows.ts). The meters and views draw only while the page is seen, and catch up
 * when it's shown again; in the tray, the app idles.
 */

let isWindowShown = true;
const whenShown = new Set<() => void>();

export const isPageShown = (): boolean => (desktopApp() ? isWindowShown : document.visibilityState === "visible");

/** `listen` runs each time the page is shown again, to bring what it shows up to date. */
export const onPageShown = (listen: () => void): void => void whenShown.add(listen);

const shown = (): void => whenShown.forEach((listen) => listen());

export const wirePageVisibility = (): void => {
    const desktop = desktopApp();
    if (!desktop) {
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && shown());
        return;
    }
    desktop.onWindowVisible((isVisible) => {
        const wasShown = isWindowShown;
        isWindowShown = isVisible;
        if (isVisible && !wasShown) shown();
    });
};
