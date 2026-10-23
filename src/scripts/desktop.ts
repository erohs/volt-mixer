/*
 * window.voltDesktop, added by the desktop app's preload (desktop/src/preload.ts). On the website
 * it's missing, and everything that uses it stays hidden. No imports, so anything can use it.
 */

export interface IDesktopSettings {
    startAtLogin: boolean;
    loginStart: "tray" | "window";
    minimiseToTray: boolean;
    closeToTray: boolean;
    phoneRemote: boolean;
    phoneAddress: string;
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

export interface IVoltDesktop {
    getState: () => Promise<IDesktopState | null>;
    setSettings: (change: Partial<IDesktopSettings>) => Promise<IDesktopState | null>;
    checkForUpdate: () => Promise<IUpdate | null>;
    setTheme: (theme: string) => void;
    openMainWindow: () => void;
    /** Hides the tray window (its Close button). */
    hideTray: () => void;
    /** The phone remote (desktop/src/phone.ts). */
    phoneInfo: () => Promise<IPhoneInfo | null>;
    rotatePhone: () => Promise<IPhoneInfo | null>;
    publishToPhones: (snapshot: unknown) => void;
    onPhoneCount: (listen: (count: number) => void) => void;
    onPhoneIntent: (answer: (intent: unknown) => unknown) => void;
    /** The tray window's content height in CSS px; the app sizes the window to it. */
    fitTray: (height: number) => void;
}

export const desktopApp = (): IVoltDesktop | null => (window as { voltDesktop?: IVoltDesktop }).voltDesktop ?? null;
