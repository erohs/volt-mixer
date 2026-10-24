import { app, session } from "electron";
import { allowVolt } from "./hid";
import { answerPages } from "./ipc";
import { watchLifecycle } from "./lifecycle";
import { applyLoginItem, isStartedInTray } from "./login";
import { reconcilePhoneRemote, tellPhoneStatus } from "./phone";
import { registerAppScheme, serveSite } from "./protocol";
import { loadSettings } from "./settings";
import { createTray } from "./tray";
import { createMainWindow, prepareTrayWindow, showMainWindow } from "./windows";

/*
 * Volt Mixer's desktop app: the website (built into ./site) in a window, with WebHID allowed for
 * the Volt, plus a tray icon and tray mixer. One instance at a time: a second launch shows the first.
 */

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    registerAppScheme();
    app.on("second-instance", showMainWindow);
    void app.whenReady().then(() => {
        const settings = loadSettings();
        serveSite();
        allowVolt(session.defaultSession);
        answerPages();
        applyLoginItem(settings.startAtLogin);
        createTray();
        const mainWindow = createMainWindow(!isStartedInTray(settings));
        watchLifecycle(mainWindow);
        mainWindow.webContents.on("did-finish-load", tellPhoneStatus);
        void reconcilePhoneRemote();
        prepareTrayWindow();
    });
}
