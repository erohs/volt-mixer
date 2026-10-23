import { app, ipcMain, nativeTheme, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { applyLoginItem, loginItemStatus } from "./login";
import { appOrigin } from "./protocol";
import { loadSettings, saveSettings } from "./settings";
import { refreshTrayMenu } from "./tray";
import { checkForUpdate } from "./update";
import { fitTrayWindow, hideTrayWindow, showMainWindow } from "./windows";

/* What the page can ask of the app (through preload.ts). Only the app's own pages are answered. */

const isFromApp = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    event.senderFrame?.url.startsWith(`${appOrigin}/`) === true;

const desktopState = () => ({
    settings: loadSettings(),
    version: app.getVersion(),
    platform: process.platform,
    loginStatus: loginItemStatus(),
});

const setSettings = (change: unknown) => {
    const wasAtLogin = loadSettings().startAtLogin;
    const settings = saveSettings(change);
    if (settings.startAtLogin !== wasAtLogin) applyLoginItem(settings.startAtLogin);
    refreshTrayMenu();
    return desktopState();
};

const themes = new Set(["system", "light", "dark"]);

export const answerPages = (): void => {
    ipcMain.handle("desktop:get", (event) => (isFromApp(event) ? desktopState() : null));
    ipcMain.handle("desktop:set", (event, change: unknown) => (isFromApp(event) ? setSettings(change) : null));
    ipcMain.handle("desktop:check-update", (event) => (isFromApp(event) ? checkForUpdate() : null));
    ipcMain.on("desktop:theme", (event, theme: unknown) => {
        if (isFromApp(event) && typeof theme === "string" && themes.has(theme))
            nativeTheme.themeSource = theme as "system" | "light" | "dark";
    });
    ipcMain.on("desktop:open-main", (event) => isFromApp(event) && showMainWindow());
    ipcMain.on("desktop:hide-tray", (event) => isFromApp(event) && hideTrayWindow());
    ipcMain.on("desktop:fit-tray", (event, height: unknown) => {
        if (isFromApp(event) && typeof height === "number") fitTrayWindow(height);
    });
};
