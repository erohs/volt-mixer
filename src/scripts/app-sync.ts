import { app } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { acceptNewerMix } from "./shared-mix.ts";
import { loadAppSync, loadMixEntry, saveAppSync } from "./store.ts";

/*
 * The website keeping its mix in step with the desktop app on the same computer, which answers on
 * 127.0.0.1 (desktop/src/mix-share.ts). Off unless chosen (Settings › Your mix), so the work laptop
 * never tries. The browser asks once before the site may talk to an app on this computer.
 */

const endpoint = "http://127.0.0.1:48191/api/mix";
const pollMs = 5000;
const pushDelayMs = 500;
let pushTimer = 0;

const isOn = (): boolean => loadAppSync() && desktopApp() === null;

const showStatus = (text: string): void => {
    const status = document.querySelector<HTMLElement>("[data-app-sync-status]");
    if (status) status.textContent = text;
};

/** A request to the app, or null when it isn't running (or the browser didn't allow it). */
const ask = async (init: RequestInit = {}, query = ""): Promise<Response | null> => {
    try {
        return await fetch(`${endpoint}${query}`, { ...init, signal: AbortSignal.timeout(2000) });
    } catch {
        showStatus("The desktop app isn't running, or this browser hasn't allowed the site to reach it.");
        return null;
    }
};

const pushNow = async (): Promise<void> => {
    const local = app.serial ? loadMixEntry(app.serial) : null;
    if (!isOn() || !local) return;
    const body = JSON.stringify({ serial: app.serial, mix: local.mix, changedAt: local.changedAt });
    const response = await ask({ method: "PUT", headers: { "Content-Type": "application/json" }, body });
    if (response?.ok) showStatus("In step with the desktop app.");
};

/** Called after this page saves a changed mix: the app hears about it shortly after. */
export const mixChanged = (): void => {
    if (!isOn()) return;
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => void pushNow(), pushDelayMs);
};

/** Fetches the app's copy for this Volt: newer, it's taken; older, this page's goes to the app. */
export const pullAppMix = async (): Promise<void> => {
    if (!isOn() || !app.serial) return;
    const response = await ask({}, `?serial=${encodeURIComponent(app.serial)}`);
    if (!response) return;
    if (response.status === 404) return void pushNow();
    const body = (await response.json().catch(() => null)) as { mix?: unknown; changedAt?: unknown } | null;
    if (typeof body?.changedAt !== "number") return;
    showStatus("In step with the desktop app.");
    const local = loadMixEntry(app.serial);
    if (!acceptNewerMix(app.serial, body.mix, body.changedAt) && local && local.changedAt > body.changedAt)
        void pushNow();
};

/** Settings › Your mix › Sync with the desktop app: hidden in the app itself, which is the other end. */
export const wireAppSync = (): void => {
    const row = document.querySelector<HTMLElement>("[data-app-sync]");
    const input = row?.querySelector<HTMLInputElement>("input");
    if (!row || !input) return;
    row.hidden = desktopApp() !== null;
    input.checked = loadAppSync();
    input.addEventListener("change", () => {
        saveAppSync(input.checked);
        showStatus(input.checked ? "Looking for the desktop app…" : "");
        if (input.checked) void pullAppMix();
    });
    window.setInterval(() => document.visibilityState === "visible" && void pullAppMix(), pollMs);
};
