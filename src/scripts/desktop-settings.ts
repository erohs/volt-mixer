import { notice } from "./notices.ts";
import { desktopApp, type IDesktopSettings, type IDesktopState } from "./desktop.ts";
import { refreshPhone, wirePhone } from "./phone-settings.ts";

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
    for (const input of element.querySelectorAll<HTMLInputElement>("[data-desktop]")) {
        const value = state.settings[input.dataset["desktop"] as keyof IDesktopSettings];
        input.checked = input.type === "radio" ? input.value === value : value === true;
    }
    // How it starts at sign-in only matters while Auto start is on.
    element.querySelector<HTMLElement>("[data-desktop-login-start]")!.hidden = !state.settings.startAtLogin;
    refreshPhone(state.settings.phoneRemote);
    const login = element.querySelector<HTMLElement>("[data-desktop-login-status]")!;
    login.textContent = state.loginStatus;
    login.hidden = !state.loginStatus;
};

const onChange = async (event: Event): Promise<void> => {
    const input = (event.target as Element).closest<HTMLInputElement>("[data-desktop]");
    const key = input?.dataset["desktop"];
    if (!input || !key) return;
    const value = input.type === "radio" ? input.value : input.checked;
    state = (await desktopApp()?.setSettings({ [key]: value })) ?? state;
    render();
};

/** The check's outcome, under the Check button; a newer version links to its release. */
const showUpdate = (text: string, link?: string): void => {
    const status = group()!.querySelector<HTMLElement>("[data-update-status]")!;
    status.textContent = text;
    if (!link) return;
    // A new window, which the app hands to the browser (it never navigates away itself).
    const download = Object.assign(document.createElement("a"), {
        href: link,
        target: "_blank",
        rel: "noopener",
        textContent: "Download it",
    });
    status.append(" ", download, ".");
};

const checkForUpdate = async (button: HTMLButtonElement): Promise<void> => {
    button.disabled = true;
    showUpdate("Checking…");
    const update = await desktopApp()?.checkForUpdate();
    button.disabled = false;
    if (!update) return showUpdate("Couldn't reach GitHub. Try again later.");
    if (!update.isNewer) return showUpdate(`Up to date: ${state?.version ?? update.version} is the latest.`);
    showUpdate(`Volt Mixer ${update.version} is available.`, update.url);
};

/** Once, on the first run: where the app went when its window closes. */
const showTrayHint = (): void => {
    if (!state || state.settings.hasSeenTrayHint) return;
    notice(trayHints[state.platform] ?? trayHints["linux"]!, { kind: "info" });
    void desktopApp()?.setSettings({ hasSeenTrayHint: true });
};

export const wireDesktopSettings = async (): Promise<void> => {
    const element = group();
    const app = desktopApp();
    if (element) element.hidden = !app;
    if (!element || !app) return;
    element.addEventListener("change", (event) => void onChange(event));
    const check = element.querySelector<HTMLButtonElement>("[data-action='check-update']")!;
    check.addEventListener("click", () => void checkForUpdate(check));
    wirePhone();
    state = await app.getState();
    render();
    showTrayHint();
};
