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
    /** Minimise hides the window to the tray; off, it minimises to the taskbar as usual. */
    minimiseToTray: boolean;
    /** Close hides the window to the tray; off, closing it quits. */
    closeToTray: boolean;
    /** Serve the phone remote on the home network (desktop/src/phone.ts). */
    phoneRemote: boolean;
    /** Which of this computer's addresses the phone uses; empty for the first one. */
    phoneAddress: string;
    /** The one-time hint on keeping the tray icon visible (Windows hides new ones). */
    hasSeenTrayHint: boolean;
}

const defaults: IDesktopSettings = {
    startAtLogin: false,
    loginStart: "tray",
    minimiseToTray: true,
    closeToTray: true,
    phoneRemote: false,
    phoneAddress: "",
    hasSeenTrayHint: false,
};

const file = (): string => path.join(app.getPath("userData"), "settings.json");
let current: IDesktopSettings | null = null;

type Flag = "startAtLogin" | "minimiseToTray" | "closeToTray" | "phoneRemote" | "hasSeenTrayHint";
const isAddress = (value: unknown): value is string =>
    typeof value === "string" && /^(\d{1,3}\.){3}\d{1,3}$/.test(value);

/** Keeps only known keys with valid values: the file can be edited, and the page is a renderer. */
const clean = (value: unknown, base: IDesktopSettings): IDesktopSettings => {
    const input = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    const flag = (key: Flag): boolean => (typeof input[key] === "boolean" ? input[key] : base[key]);
    const loginStart = input["loginStart"];
    return {
        startAtLogin: flag("startAtLogin"),
        loginStart: loginStart === "window" || loginStart === "tray" ? loginStart : base.loginStart,
        minimiseToTray: flag("minimiseToTray"),
        closeToTray: flag("closeToTray"),
        phoneRemote: flag("phoneRemote"),
        phoneAddress: isAddress(input["phoneAddress"]) ? input["phoneAddress"] : base.phoneAddress,
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
