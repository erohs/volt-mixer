/*
 * window.voltDesktop and window.voltTray, added by the desktop app's preloads (desktop/src/preload.ts,
 * tray-preload.ts). On the website they're missing, and everything that uses them stays hidden. No
 * imports, so anything can use them.
 */

export interface IDesktopSettings {
    startAtLogin: boolean;
    loginStart: "tray" | "window";
    minimiseToTray: boolean;
    closeToTray: boolean;
    phoneRemote: boolean;
    phoneAddress: string;
    hasSeenTrayHint: boolean;
    dimOnSleep: boolean;
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

export interface IPhoneInfo {
    isRunning: boolean;
    address: string;
    /** This computer's home-network addresses, best first, with their adapters' names. */
    addresses: { address: string; name: string }[];
    /** The link the QR code carries, with the pairing token; empty while it's off. */
    link: string;
    error: string;
    phones: number;
}

/** The main window's window.voltDesktop (desktop/src/preload.ts). */
export interface IVoltDesktop {
    getState: () => Promise<IDesktopState | null>;
    setSettings: (change: Partial<IDesktopSettings>) => Promise<IDesktopState | null>;
    checkForUpdate: () => Promise<IUpdate | null>;
    setTheme: (theme: string) => void;
    /** The phone remote (desktop/src/phone.ts). */
    phoneInfo: () => Promise<IPhoneInfo | null>;
    rotatePhone: () => Promise<IPhoneInfo | null>;
    /** The phone remote's state, each time it changes. */
    onPhoneStatus: (listen: (info: IPhoneInfo) => void) => void;
    publishToPhones: (snapshot: unknown) => void;
    onPhoneCount: (listen: (count: number) => void) => void;
    onPhoneIntent: (answer: (intent: unknown) => unknown) => void;
    /** Before sleep or shutdown ("dim") and on waking ("undim"); see display-fade.ts. */
    onDisplayFade: (answer: (request: unknown) => unknown) => void;
    /** Whether this page is driving a Volt; only then does the app dim it itself at shutdown. */
    setVoltLive: (isLive: boolean) => void;
    /** The main window being shown or hidden (the app tells it; the page can't tell by itself). */
    onWindowVisible: (listen: (isVisible: boolean) => void) => void;
}

/** The tray window's window.voltTray (desktop/src/tray-preload.ts). */
export interface IVoltTray {
    /** The tray window's content height in CSS px; the app sizes the window to it. */
    fitTray: (height: number) => void;
    /** Hides the tray window (its Close button). */
    hideTray: () => void;
    openMainWindow: () => void;
    /** The tray window being shown or hidden (the app tells it; the page can't tell by itself). */
    onTrayVisible: (listen: (isVisible: boolean) => void) => void;
}

/** The desktop app's API in its main window; null on the website and in the tray window. */
export const desktopApp = (): IVoltDesktop | null => (window as { voltDesktop?: IVoltDesktop }).voltDesktop ?? null;

/** The desktop app's API in its tray window; null anywhere else. */
export const trayApp = (): IVoltTray | null => (window as { voltTray?: IVoltTray }).voltTray ?? null;
