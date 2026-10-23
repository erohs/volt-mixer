/*
 * window.voltDesktop, added by the desktop app's preload (desktop/src/preload.ts). On the website
 * it's missing, and everything that uses it stays hidden. No imports, so anything can use it.
 */

export interface IDesktopSettings {
    startAtLogin: boolean;
    loginStart: "tray" | "window";
    minimiseToTray: boolean;
    closeToTray: boolean;
    hasSeenTrayHint: boolean;
}

export interface IDesktopState {
    settings: IDesktopSettings;
    version: string;
    platform: string;
    /** Set when macOS needs the login item approved. */
    loginStatus: string;
}

export interface IUpdate {
    isNewer: boolean;
    version: string;
    url: string;
}

export interface IVoltDesktop {
    getState: () => Promise<IDesktopState | null>;
    setSettings: (change: Partial<IDesktopSettings>) => Promise<IDesktopState | null>;
    checkForUpdate: () => Promise<IUpdate | null>;
    setTheme: (theme: string) => void;
    openMainWindow: () => void;
    /** Quits the app, like the tray menu's Quit. */
    quit: () => void;
    /** The tray window's content height in CSS px; the app sizes the window to it. */
    fitTray: (height: number) => void;
}

export const desktopApp = (): IVoltDesktop | null => (window as { voltDesktop?: IVoltDesktop }).voltDesktop ?? null;
