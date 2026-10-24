import { app, powerMonitor, session, type BrowserWindow } from "electron";
import { dimDisplay, undimDisplay } from "./display-fade";
import { reconcilePhoneRemote, stopPhoneRemote } from "./phone";
import { markQuitting, showMainWindow } from "./windows";

/*
 * Everything the app does as it goes away, for a while (sleep) or for good (Quit, shutdown,
 * signing out), and as it comes back. Each system says so differently: Quit sends before-quit,
 * macOS and Linux shutdowns send powerMonitor's shutdown, and Windows tells only the window
 * (query-session-end, then session-end) and doesn't send before-quit at all.
 */

/** The saved mix lives in the page's storage, which Chromium writes out only now and then. */
const saveStorage = (): void => session.defaultSession.flushStorageData();

/** Sleeping, or a Windows shutdown asked about (which another program may yet refuse). */
const pausing = (): void => {
    dimDisplay();
    saveStorage();
};

/** For good: windows that hide to the tray close instead. */
const quitting = (): void => {
    markQuitting();
    saveStorage();
};

export const watchLifecycle = (mainWindow: BrowserWindow): void => {
    app.on("before-quit", () => {
        quitting();
        stopPhoneRemote();
    });
    powerMonitor.on("shutdown", () => {
        dimDisplay();
        quitting();
    });
    powerMonitor.on("suspend", pausing);
    mainWindow.on("query-session-end", pausing);
    mainWindow.on("session-end", quitting);
    powerMonitor.on("resume", () => {
        undimDisplay();
        void reconcilePhoneRemote();
    });
    // macOS: the Dock icon clicked (or the app opened again) while its window is in the tray.
    app.on("activate", showMainWindow);
};
