/*
 * The desktop app's settings and how a change is checked: only known keys with valid values, as the
 * file can be edited and the page is a renderer. No Electron here, so Vitest can test it.
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

export const defaults: IDesktopSettings = {
    startAtLogin: false,
    loginStart: "tray",
    minimiseToTray: true,
    closeToTray: true,
    phoneRemote: false,
    phoneAddress: "",
    hasSeenTrayHint: false,
};

type Flag = "startAtLogin" | "minimiseToTray" | "closeToTray" | "phoneRemote" | "hasSeenTrayHint";
const isAddress = (value: unknown): value is string =>
    typeof value === "string" && /^(\d{1,3}\.){3}\d{1,3}$/.test(value);

/** Keeps only known keys with valid values: the file can be edited, and the page is a renderer. */
export const clean = (value: unknown, base: IDesktopSettings): IDesktopSettings => {
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
