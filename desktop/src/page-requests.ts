import { ipcMain } from "electron";
import { isFromApp } from "./protocol";
import { getMainWindow } from "./windows";

/*
 * Questions main passes to the main window, which holds the mix and drives the Volt: the phone's
 * intents (phone.ts) and dimming the display (display-fade.ts). The page answers through
 * preload.ts; no answer within 2 s (or no window) is null.
 */

let nextId = 0;
const waiting = new Map<number, (reply: unknown) => void>();

/* Only the main window was asked, so only it may answer (the tray window is an app page too). */
ipcMain.on("page:reply", (event, id: unknown, reply: unknown) => {
    if (!isFromApp(event) || event.sender !== getMainWindow()?.webContents || typeof id !== "number") return;
    waiting.get(id)?.(reply);
    waiting.delete(id);
});

export const askPage = (channel: "phone-intent" | "display-fade", request: unknown): Promise<unknown> =>
    new Promise((resolve) => {
        const window = getMainWindow();
        if (!window) return resolve(null);
        const id = nextId++;
        waiting.set(id, resolve);
        window.webContents.send(`page:${channel}`, id, request);
        setTimeout(() => waiting.delete(id) && resolve(null), 2000);
    });
