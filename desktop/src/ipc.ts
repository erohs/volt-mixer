import { app, ipcMain, nativeTheme } from "electron";
import { setVoltLive } from "./display-fade";
import { applyLoginItem, loginItemStatus } from "./login";
import { phoneInfo, reconcilePhoneRemote, rotatePhoneToken, setUpAddress } from "./phone";
import { publishToPhones } from "./phone-streams";
import { loadSettings, saveSettings } from "./settings";
import { refreshTrayMenu } from "./tray";
import { checkForUpdate } from "./update";
import { fitTrayWindow, hideTrayWindow, isFromMainWindow, isFromTrayWindow, showMainWindow } from "./windows";

/*
 * What each window can ask of the app (through preload.ts and tray-preload.ts). Each request is
 * answered only for the window whose preload offers it.
 */

const desktopState = () => ({
    settings: loadSettings(),
    version: app.getVersion(),
    platform: process.platform,
    loginStatus: loginItemStatus(),
});

const setSettings = (change: unknown) => {
    const before = loadSettings();
    let settings = saveSettings(change);
    if (settings.phoneRemote && !before.phoneRemote)
        settings = saveSettings({ phoneAddress: setUpAddress(settings.phoneAddress) });
    if (settings.startAtLogin !== before.startAtLogin) applyLoginItem(settings.startAtLogin);
    void reconcilePhoneRemote();
    refreshTrayMenu();
    return desktopState();
};

const themes = new Set(["system", "light", "dark"]);

const answerMainWindow = (): void => {
    ipcMain.handle("desktop:get", (event) => (isFromMainWindow(event) ? desktopState() : null));
    ipcMain.handle("desktop:set", (event, change: unknown) => (isFromMainWindow(event) ? setSettings(change) : null));
    ipcMain.handle("desktop:check-update", (event) => (isFromMainWindow(event) ? checkForUpdate() : null));
    ipcMain.on("desktop:theme", (event, theme: unknown) => {
        if (isFromMainWindow(event) && typeof theme === "string" && themes.has(theme))
            nativeTheme.themeSource = theme as "system" | "light" | "dark";
    });
    ipcMain.handle("desktop:phone-info", (event) => (isFromMainWindow(event) ? phoneInfo() : null));
    ipcMain.handle("desktop:phone-rotate", (event) => {
        if (!isFromMainWindow(event)) return null;
        rotatePhoneToken();
        return phoneInfo();
    });
    ipcMain.on("desktop:volt-live", (event, isLive: unknown) => isFromMainWindow(event) && setVoltLive(isLive));
    ipcMain.on("phone:publish", (event, snapshot: unknown) => isFromMainWindow(event) && publishToPhones(snapshot));
};

const answerTrayWindow = (): void => {
    ipcMain.on("tray:open-main", (event) => isFromTrayWindow(event) && showMainWindow());
    ipcMain.on("tray:hide", (event) => isFromTrayWindow(event) && hideTrayWindow());
    ipcMain.on("tray:fit", (event, height: unknown) => {
        if (isFromTrayWindow(event) && typeof height === "number") fitTrayWindow(height);
    });
};

export const answerPages = (): void => {
    answerMainWindow();
    answerTrayWindow();
};
