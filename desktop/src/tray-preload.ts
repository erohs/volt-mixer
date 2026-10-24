import { contextBridge, ipcRenderer } from "electron";

/*
 * The tray window's window.voltTray: only what the tray page needs. It reaches the mix through the
 * main window (a BroadcastChannel), never the app's settings or the phone remote.
 */

contextBridge.exposeInMainWorld("voltTray", {
    /** The content's height in CSS px; the app sizes the window to it. */
    fitTray: (height: number): void => ipcRenderer.send("tray:fit", height),
    hideTray: (): void => ipcRenderer.send("tray:hide"),
    openMainWindow: (): void => ipcRenderer.send("tray:open-main"),
    /** The tray window being shown or hidden. */
    onTrayVisible: (listen: (isVisible: boolean) => void): void => {
        ipcRenderer.on("tray:visible", (_event, isVisible: unknown) => listen(isVisible === true));
    },
});
