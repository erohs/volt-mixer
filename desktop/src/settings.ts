import { app } from "electron";
import fs from "fs";
import path from "path";

/*
 * The desktop app's own settings, in a JSON file in the user data folder. Main reads them before
 * any window exists (whether to start in the tray); the page edits them through the preload.
 */

export interface IDesktopSettings {
    startAtLogin: boolean;
    /** Started at login: stay in the tray, or open the window. */
    loginStart: "tray" | "window";
    /** Which window button sends it to the tray; the other behaves as usual. */
    trayOn: "minimise" | "close";
    /** The one-time hint on keeping the tray icon visible (Windows hides new ones). */
    hasSeenTrayHint: boolean;
}

const defaults: IDesktopSettings = {
    startAtLogin: false,
    loginStart: "tray",
    trayOn: "minimise",
    hasSeenTrayHint: false,
};

const file = (): string => path.join(app.getPath("userData"), "settings.json");
let current: IDesktopSettings | null = null;

/** Keeps only known keys with valid values: the file can be edited, and the page is a renderer. */
const clean = (value: unknown, base: IDesktopSettings): IDesktopSettings => {
    const input = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    const flag = (key: "startAtLogin" | "hasSeenTrayHint"): boolean =>
        typeof input[key] === "boolean" ? input[key] : base[key];
    return {
        startAtLogin: flag("startAtLogin"),
        loginStart:
            input["loginStart"] === "window" || input["loginStart"] === "tray" ? input["loginStart"] : base.loginStart,
        trayOn: input["trayOn"] === "close" || input["trayOn"] === "minimise" ? input["trayOn"] : base.trayOn,
        hasSeenTrayHint: flag("hasSeenTrayHint"),
    };
};

export const loadSettings = (): IDesktopSettings => {
    if (current) return current;
    try {
        current = clean(JSON.parse(fs.readFileSync(file(), "utf8")), defaults);
    } catch {
        current = { ...defaults };
    }
    return current;
};

/** Merges a change into the settings and saves them; returns the result. */
export const saveSettings = (change: unknown): IDesktopSettings => {
    current = clean(change, loadSettings());
    try {
        fs.mkdirSync(path.dirname(file()), { recursive: true });
        fs.writeFileSync(file(), JSON.stringify(current, null, 4));
    } catch {
        /* Not writable: the change holds until the app quits. */
    }
    return current;
};
