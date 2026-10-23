import { app, session } from "electron";
import path from "path";
import { allowVolt } from "./hid";
import { answerPages } from "./ipc";
import { applyLoginItem, isStartedInTray } from "./login";
import { registerAppScheme, serveSite } from "./protocol";
import { loadSettings } from "./settings";
import { createTray } from "./tray";
import { createMainWindow, markQuitting, prepareTrayWindow, showMainWindow } from "./windows";

/*
 * Volt Mixer's desktop app: the website (built into ./site) in a window, with WebHID allowed for
 * the Volt, plus a tray icon and tray mixer. One instance at a time: a second launch shows the first.
 */

const siteDir = app.isPackaged ? path.join(process.resourcesPath, "site") : path.join(__dirname, "..", "site");

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    registerAppScheme();
    app.on("second-instance", showMainWindow);
    app.on("before-quit", () => {
        markQuitting();
        // The saved mix lives in the page's storage; make sure it reaches the disk.
        session.defaultSession.flushStorageData();
    });
    void app.whenReady().then(() => {
        const settings = loadSettings();
        serveSite(siteDir);
        allowVolt(session.defaultSession);
        answerPages();
        applyLoginItem(settings.startAtLogin);
        createTray();
        createMainWindow(!isStartedInTray(settings));
        prepareTrayWindow();
    });
}
