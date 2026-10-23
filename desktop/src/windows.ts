import { app, BrowserWindow, nativeTheme, screen, shell, type Rectangle } from "electron";
import path from "path";
import { appOrigin } from "./protocol";
import { loadSettings } from "./settings";

/*
 * The main window drives the Volt (the page's WebHID code runs there), so it's hidden rather than
 * closed while the app lives in the tray. The tray window is a small view of it (src/pages/tray).
 */

const isLinux = process.platform === "linux";
const trayWindowSize = { width: 380, height: 460 };
let mainWindow: BrowserWindow | null = null;
let trayWindow: BrowserWindow | null = null;
let isQuitting = false;
let trayHiddenAt = 0;

/** Lets close and quit through: set when the user chose Quit, or the system is shutting down. */
export const markQuitting = (): void => {
    isQuitting = true;
};

const webPreferences = {
    preload: path.join(__dirname, "preload.js"),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    // Hidden in the tray it still has to answer the tray window and send to the Volt.
    backgroundThrottling: false,
};

/** Links to the web (GitHub, releases) open in the browser; nothing navigates away from the app. */
const lockNavigation = (window: BrowserWindow): void => {
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== appOrigin) event.preventDefault();
    });
};

const background = (): string => (nativeTheme.shouldUseDarkColors ? "#171615" : "#f5f3ef");

export const createMainWindow = (isShown: boolean): BrowserWindow => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 360,
        minHeight: 400,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: background(),
        webPreferences,
    });
    lockNavigation(mainWindow);
    mainWindow.once("ready-to-show", () => isShown && mainWindow?.show());
    mainWindow.on("close", (event) => {
        if (isQuitting || loadSettings().trayOn !== "close") return;
        event.preventDefault();
        mainWindow?.hide();
    });
    // Windows is shutting down or signing out: let the window close.
    mainWindow.on("session-end", markQuitting);
    // Closed for real (not to the tray): nothing drives the Volt any more, so the app quits.
    mainWindow.on("closed", () => {
        mainWindow = null;
        app.quit();
    });
    // Minimise can't be cancelled, so the window minimises and then hides.
    mainWindow.on("minimize", () => loadSettings().trayOn === "minimise" && mainWindow?.hide());
    void mainWindow.loadURL(`${appOrigin}/`);
    return mainWindow;
};

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
        webPreferences,
    });
    lockNavigation(window);
    if (process.platform === "darwin") window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Like the Windows volume flyout: clicking anywhere else puts it away.
    window.on("blur", () => {
        if (isLinux) return;
        trayHiddenAt = Date.now();
        window.hide();
    });
    void window.loadURL(`${appOrigin}/tray/`);
    return window;
};

/** Above (or below) the tray icon, kept inside the screen's work area. */
const placeNear = (window: BrowserWindow, icon: Rectangle): void => {
    const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: icon.y });
    const { width, height } = trayWindowSize;
    const x = Math.round(
        Math.min(Math.max(icon.x + icon.width / 2 - width / 2, workArea.x), workArea.x + workArea.width - width),
    );
    const isBarAtTop = icon.y < workArea.y + workArea.height / 2;
    const y = isBarAtTop ? workArea.y + 8 : workArea.y + workArea.height - height - 8;
    window.setPosition(x, Math.round(y));
};

/** The tray window's own close button. */
export const hideTrayWindow = (): void => trayWindow?.hide();

/** Opens or closes the tray window. `icon` is where the tray icon is (none on Linux). */
export const toggleTrayWindow = (icon?: Rectangle): void => {
    trayWindow ??= createTrayWindow();
    // The click that blurred it shouldn't reopen it straight away.
    if (trayWindow.isVisible() || Date.now() - trayHiddenAt < 250) return trayWindow.hide();
    if (icon && icon.width > 0) placeNear(trayWindow, icon);
    trayWindow.show();
    trayWindow.focus();
};
