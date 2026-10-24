import {
    app,
    BrowserWindow,
    nativeTheme,
    screen,
    shell,
    type IpcMainEvent,
    type IpcMainInvokeEvent,
    type Rectangle,
} from "electron";
import path from "path";
import { websiteUrl } from "./app-info";
import { appOrigin, isFromWindow } from "./protocol";
import { loadSettings } from "./settings";

/*
 * The main window drives the Volt (the page's WebHID code runs there), so it's hidden rather than
 * closed while the app lives in the tray. The tray window is a small view of it (src/pages/tray).
 */

const isLinux = process.platform === "linux";
/* The tray's width; its height follows its rows (fitTrayWindow). */
const trayWindowSize = { width: 340, height: 300 };
let mainWindow: BrowserWindow | null = null;
let trayWindow: BrowserWindow | null = null;
let isQuitting = false;
let trayHiddenAt = 0;
let trayIcon: Rectangle | undefined;

/** Lets close and quit through: set when the user chose Quit, or the system is shutting down. */
export const markQuitting = (): void => {
    isQuitting = true;
};

/** Each window gets only its own preload's API. */
const webPreferences = (preload: string) => ({
    preload: path.join(__dirname, preload),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    // On Linux, a spellchecker would fetch its dictionaries from Google; nothing here needs one.
    spellcheck: false,
    // Hidden, the main window still answers the tray and sends to the Volt; the tray sizes itself.
    backgroundThrottling: false,
});

export const isFromMainWindow = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => isFromWindow(event, mainWindow);
export const isFromTrayWindow = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => isFromWindow(event, trayWindow);

/** Links to the web (GitHub, releases) open in the browser; nothing navigates away from the app. */
const lockNavigation = (window: BrowserWindow): void => {
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
    });
    // The windows stay on their page (the mixer drives the Volt). A link to the web opens in the
    // browser, and so does any other page of the site (the guide, Privacy), from the website itself.
    window.webContents.on("will-navigate", (event, url) => {
        event.preventDefault();
        if (url.startsWith("https://")) return void shell.openExternal(url);
        if (url.startsWith(`${appOrigin}/`))
            void shell.openExternal(new URL(url.slice(appOrigin.length + 1), websiteUrl).href);
    });
};

const background = (): string => (nativeTheme.shouldUseDarkColors ? "#171615" : "#f5f3ef");

/** A page that crashes is loaded again: the main window's holds the only connection to the Volt. */
const reloadAfterCrash = (window: BrowserWindow): void => {
    let crashedAt = 0;
    window.webContents.on("render-process-gone", (_event, { reason }) => {
        // Crashing again straight away would only crash again; it waits for the next one.
        const isLooping = Date.now() - crashedAt < 10_000;
        crashedAt = Date.now();
        if (reason !== "clean-exit" && !isLooping && !isQuitting && !window.isDestroyed()) window.webContents.reload();
    });
};

/** Close and minimise put the window in the tray (if chosen); closing it for real quits the app. */
const keepInTray = (window: BrowserWindow): void => {
    window.on("close", (event) => {
        if (isQuitting || !loadSettings().closeToTray) return;
        event.preventDefault();
        window.hide();
    });
    // Closed for real (not to the tray): nothing drives the Volt any more, so the app quits.
    window.on("closed", () => {
        mainWindow = null;
        app.quit();
    });
    // Minimise can't be cancelled, so the window minimises and then hides.
    window.on("minimize", () => loadSettings().minimiseToTray && window.hide());
};

export const createMainWindow = (isShown: boolean): BrowserWindow => {
    const window = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 360,
        minHeight: 400,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: background(),
        webPreferences: webPreferences("preload.js"),
    });
    mainWindow = window;
    lockNavigation(window);
    reloadAfterCrash(window);
    window.once("ready-to-show", () => isShown && window.show());
    keepInTray(window);
    tellVisibility(window, "window:visible");
    void window.loadURL(`${appOrigin}/`);
    return window;
};

/** The window that drives the Volt (and holds the mix), if it exists. */
export const getMainWindow = (): BrowserWindow | null => mainWindow;

export const showMainWindow = (): void => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    trayWindow?.hide();
};

const createTrayWindow = (): BrowserWindow => {
    const window = new BrowserWindow({
        ...trayWindowSize,
        show: false,
        frame: isLinux,
        resizable: isLinux,
        skipTaskbar: !isLinux,
        alwaysOnTop: !isLinux,
        fullscreenable: false,
        title: "Volt Mixer",
        backgroundColor: background(),
        ...(process.platform === "darwin" ? { type: "panel" } : {}),
        webPreferences: webPreferences("tray-preload.js"),
    });
    lockNavigation(window);
    reloadAfterCrash(window);
    if (process.platform === "darwin") window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    hideOnBlur(window);
    hideOnClose(window);
    tellVisibility(window, "tray:visible");
    void window.loadURL(`${appOrigin}/tray/`);
    return window;
};

/** Alt+F4, Cmd+W or a Linux title bar's close hides it, like its own Close button; quitting closes it. */
const hideOnClose = (window: BrowserWindow): void => {
    window.on("close", (event) => {
        if (isQuitting) return;
        event.preventDefault();
        window.hide();
    });
    window.on("closed", () => {
        if (trayWindow === window) trayWindow = null;
    });
};

/** Like the Windows volume flyout: clicking anywhere else puts it away. */
const hideOnBlur = (window: BrowserWindow): void =>
    void window.on("blur", () => {
        // Windows also sends blur to the window after it's hidden (when the taskbar is clicked);
        // counting that one would swallow the next click on the tray icon.
        if (isLinux || !window.isVisible()) return;
        trayHiddenAt = Date.now();
        window.hide();
    });

/*
 * Tells a window's page whether anyone can see it (the page can't tell: with background throttling
 * off, a hidden window still counts as visible). The tray asks for updates only while it's shown;
 * the main window draws its meters and views only while it's shown, so in the tray it idles.
 */
const tellVisibility = (window: BrowserWindow, channel: string): void => {
    const tell = (): void => {
        if (!window.isDestroyed()) window.webContents.send(channel, window.isVisible() && !window.isMinimized());
    };
    window.on("show", tell);
    window.on("hide", tell);
    window.on("minimize", tell);
    window.on("restore", tell);
    window.webContents.on("did-finish-load", tell);
};

/** Above (or below) the tray icon, kept inside the screen's work area. */
const placeNear = (window: BrowserWindow, icon: Rectangle): void => {
    const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: icon.y });
    const [width, height] = window.getSize() as [number, number];
    const x = Math.round(
        Math.min(Math.max(icon.x + icon.width / 2 - width / 2, workArea.x), workArea.x + workArea.width - width),
    );
    const isBarAtTop = icon.y < workArea.y + workArea.height / 2;
    const y = isBarAtTop ? workArea.y + 8 : workArea.y + workArea.height - height - 8;
    window.setPosition(x, Math.round(y));
};

/** Sizes the tray window to its content (in CSS px, from the page), within the screen. */
export const fitTrayWindow = (height: number): void => {
    if (!trayWindow || !Number.isFinite(height)) return;
    const { workArea } = screen.getDisplayMatching(trayWindow.getBounds());
    const fitted = Math.round(Math.min(Math.max(height, 120), workArea.height - 16));
    const [width, current] = trayWindow.getContentSize() as [number, number];
    if (fitted === current) return;
    trayWindow.setContentSize(width, fitted);
    if (trayIcon) placeNear(trayWindow, trayIcon);
};

/** Made when the app starts and kept hidden, so it opens at once and already the right size. */
export const prepareTrayWindow = (): void => {
    trayWindow ??= createTrayWindow();
};

/**
 * The tray window's own Close button. A hidden window's later blur is ignored (the blur handler
 * checks it's visible), so the next click on the tray icon opens it again first time.
 */
export const hideTrayWindow = (): void => trayWindow?.hide();

/** Opens or closes the tray window. `icon` is where the tray icon is (none on Linux). */
export const toggleTrayWindow = (icon?: Rectangle): void => {
    trayWindow ??= createTrayWindow();
    // The click that blurred it shouldn't reopen it straight away.
    if (trayWindow.isVisible() || Date.now() - trayHiddenAt < 250) return trayWindow.hide();
    if (icon && icon.width > 0) trayIcon = icon;
    if (trayIcon) placeNear(trayWindow, trayIcon);
    trayWindow.show();
    trayWindow.focus();
};
