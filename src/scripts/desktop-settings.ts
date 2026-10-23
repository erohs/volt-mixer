import { notice } from "./app-state.ts";
import { desktopApp, type IDesktopSettings, type IDesktopState } from "./desktop.ts";

/* Settings › Desktop app: start at login, the tray, updates. Shown only in the desktop app. */

const group = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-group="desktop"]');
let state: IDesktopState | null = null;

const trayHints: Record<string, string> = {
    win32: "Volt Mixer keeps running in the tray. To keep its icon in view, turn it on in Windows Settings › Personalisation › Taskbar › Other system tray icons.",
    darwin: "Volt Mixer keeps running in the menu bar. Click its icon for the mixer.",
    linux: "Volt Mixer keeps running in the tray; its menu opens the mixer. On GNOME, tray icons need the AppIndicator extension.",
};

const render = (): void => {
    const element = group();
    if (!element || !state) return;
    for (const input of element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-desktop]")) {
        const value = state.settings[input.dataset["desktop"] as keyof IDesktopSettings];
        if (input instanceof HTMLInputElement) input.checked = value === true;
        else input.value = String(value);
    }
    element.querySelector("#updates-description")!.textContent = `Version ${state.version}`;
    const login = element.querySelector<HTMLElement>("[data-desktop-login-status]")!;
    login.textContent = state.loginStatus;
    login.hidden = !state.loginStatus;
};

const onChange = async (event: Event): Promise<void> => {
    const input = (event.target as Element).closest<HTMLInputElement | HTMLSelectElement>("[data-desktop]");
    const key = input?.dataset["desktop"];
    if (!input || !key) return;
    const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
    state = (await desktopApp()?.setSettings({ [key]: value })) ?? state;
    render();
};

const checkForUpdate = async (): Promise<void> => {
    const update = await desktopApp()?.checkForUpdate();
    if (!update) return notice("Couldn't reach GitHub to check for updates. Try again later.");
    if (!update.isNewer) return notice(`You have the latest version (${state?.version ?? update.version}).`);
    notice(`Volt Mixer ${update.version} is available.`, { label: "Download", run: () => window.open(update.url) });
};

/** Once, on the first run: where the app went when its window closes. */
const showTrayHint = (): void => {
    if (!state || state.settings.hasSeenTrayHint) return;
    notice(trayHints[state.platform] ?? trayHints["linux"]!);
    void desktopApp()?.setSettings({ hasSeenTrayHint: true });
};

export const wireDesktopSettings = async (): Promise<void> => {
    const element = group();
    const app = desktopApp();
    if (element) element.hidden = !app;
    if (!element || !app) return;
    element.addEventListener("change", (event) => void onChange(event));
    element.querySelector("[data-action='check-update']")?.addEventListener("click", () => void checkForUpdate());
    state = await app.getState();
    render();
    showTrayHint();
};
