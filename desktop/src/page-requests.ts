import { ipcMain } from "electron";
import { getMainWindow, isFromMainWindow } from "./windows";

/*
 * Questions main passes to the main window, which holds the mix and drives the Volt: the phone's
 * intents (phone-server.ts) and dimming the display (display-fade.ts). The page answers through
 * preload.ts; no answer within 2 s (or no window) is null.
 */

let nextId = 0;
const waiting = new Map<number, (reply: unknown) => void>();

ipcMain.on("page:reply", (event, id: unknown, reply: unknown) => {
    if (!isFromMainWindow(event) || typeof id !== "number") return;
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
