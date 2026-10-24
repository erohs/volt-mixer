import { contextBridge, ipcRenderer } from "electron";

/*
 * The main window's window.voltDesktop: the only way the mixer page reaches the app. Its presence
 * is also how the page knows it's in the desktop app (Settings › Desktop app appears). The tray
 * window has its own, smaller one (tray-preload.ts).
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
    /** A phone's intent (desktop/src/phone-server.ts); the answer is the intent's result. */
    onPhoneIntent: (answer: (request: unknown) => unknown): void => answerMain("phone-intent", answer),
    /** Dim or undim the Volt's display (desktop/src/display-fade.ts). */
    onDisplayFade: (answer: (request: unknown) => unknown): void => answerMain("display-fade", answer),
    /** Whether the page is driving a Volt; only then does the app dim it itself at shutdown. */
    setVoltLive: (isLive: boolean): void => ipcRenderer.send("desktop:volt-live", isLive),
    /** The window shown or hidden (desktop/src/windows.ts): the page can't tell by itself. */
    onWindowVisible: (listen: (isVisible: boolean) => void): void => {
        ipcRenderer.on("window:visible", (_event, isVisible: unknown) => listen(isVisible === true));
    },
    /** The phone remote: its address and link, a new pairing code, and what phones see. */
    phoneInfo: (): Promise<unknown> => ipcRenderer.invoke("desktop:phone-info"),
    rotatePhone: (): Promise<unknown> => ipcRenderer.invoke("desktop:phone-rotate"),
    onPhoneStatus: (listen: (info: unknown) => void): void => {
        ipcRenderer.on("phone:status", (_event, info: unknown) => listen(info));
    },
    publishToPhones: (snapshot: unknown): void => ipcRenderer.send("phone:publish", snapshot),
    onPhoneCount: (listen: (count: number) => void): void => {
        ipcRenderer.on("phone:count", (_event, count: number) => listen(count));
    },
});
