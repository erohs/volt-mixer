import { contextBridge, ipcRenderer } from "electron";

/*
 * window.voltDesktop: the only way the page reaches the app. Its presence is also how the page
 * knows it's in the desktop app (Settings › Desktop app and Tray mixer appear).
 */

contextBridge.exposeInMainWorld("voltDesktop", {
    getState: (): Promise<unknown> => ipcRenderer.invoke("desktop:get"),
    setSettings: (change: unknown): Promise<unknown> => ipcRenderer.invoke("desktop:set", change),
    checkForUpdate: (): Promise<unknown> => ipcRenderer.invoke("desktop:check-update"),
    setTheme: (theme: string): void => ipcRenderer.send("desktop:theme", theme),
    openMainWindow: (): void => ipcRenderer.send("desktop:open-main"),
    quit: (): void => ipcRenderer.send("desktop:quit"),
    /** The website on this computer asking for, or offering, a mix (desktop/src/mix-share.ts). */
    onMixRequest: (answer: (request: unknown) => unknown): void => {
        ipcRenderer.on("mix-share:request", async (_event, id: number, request: unknown) => {
            ipcRenderer.send("mix-share:reply", id, await answer(request));
        });
    },
    fitTray: (height: number): void => ipcRenderer.send("desktop:fit-tray", height),
});
