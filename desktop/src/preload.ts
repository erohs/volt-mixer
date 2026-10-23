import { contextBridge, ipcRenderer } from "electron";

/*
 * window.voltDesktop: the only way the page reaches the app. Its presence is also how the page
 * knows it's in the desktop app (Settings › Desktop app and Tray mixer appear).
 */

/** Main's questions (desktop/src/page-requests.ts), answered by the page. */
const answerMain = (channel: string, answer: (request: unknown) => unknown): void => {
    ipcRenderer.on(`page:${channel}`, async (_event, id: number, request: unknown) => {
        ipcRenderer.send("page:reply", id, await answer(request));
    });
};

contextBridge.exposeInMainWorld("voltDesktop", {
    getState: (): Promise<unknown> => ipcRenderer.invoke("desktop:get"),
    setSettings: (change: unknown): Promise<unknown> => ipcRenderer.invoke("desktop:set", change),
    checkForUpdate: (): Promise<unknown> => ipcRenderer.invoke("desktop:check-update"),
    setTheme: (theme: string): void => ipcRenderer.send("desktop:theme", theme),
    openMainWindow: (): void => ipcRenderer.send("desktop:open-main"),
    hideTray: (): void => ipcRenderer.send("desktop:hide-tray"),
    /** A phone's intent (desktop/src/phone.ts); the answer is the intent's result. */
    onPhoneIntent: (answer: (request: unknown) => unknown): void => answerMain("phone-intent", answer),
    fitTray: (height: number): void => ipcRenderer.send("desktop:fit-tray", height),
    /** The phone remote: its address and link, a new pairing code, and what phones see. */
    phoneInfo: (): Promise<unknown> => ipcRenderer.invoke("desktop:phone-info"),
    rotatePhone: (): Promise<unknown> => ipcRenderer.invoke("desktop:phone-rotate"),
    publishToPhones: (snapshot: unknown): void => ipcRenderer.send("phone:publish", snapshot),
    onPhoneCount: (listen: (count: number) => void): void => {
        ipcRenderer.on("phone:count", (_event, count: number) => listen(count));
    },
});
