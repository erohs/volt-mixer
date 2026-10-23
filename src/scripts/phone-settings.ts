import { desktopApp, type IPhoneInfo } from "./desktop.ts";
import { drawQr } from "./qr.ts";

/* Settings › Desktop app › Phone remote: the pairing QR code, the address and New code. */

const panel = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-phone]");
const pollMs = 3000;

/** The pill above the code: green once a phone is in, amber for a problem. */
const status = (info: IPhoneInfo): { text: string; state: string } => {
    if (info.error) return { text: info.error, state: "problem" };
    if (!info.isRunning) return { text: "Starting…", state: "waiting" };
    if (info.phones === 0) return { text: "Waiting for a phone", state: "waiting" };
    return { text: info.phones === 1 ? "1 phone connected" : `${info.phones} phones connected`, state: "connected" };
};

const render = (info: IPhoneInfo | null): void => {
    const element = panel();
    if (!element || !info) return;
    const { text, state } = status(info);
    element.querySelector("[data-phone-status-text]")!.textContent = text;
    element.querySelector<HTMLElement>("[data-phone-status]")!.dataset["state"] = state;
    element.querySelector("[data-phone-address-text]")!.textContent = info.address;
    element.querySelector<SVGElement>("[data-qr='phone']")!.style.display = info.link ? "" : "none";
    if (info.link) drawQr("phone", info.link);
    const select = element.querySelector<HTMLSelectElement>("[data-phone-address]")!;
    element.querySelector<HTMLElement>("[data-phone-address-row]")!.hidden = info.addresses.length < 2;
    select.replaceChildren(...info.addresses.map(({ address, name }) => new Option(`${address} (${name})`, address)));
    select.value = info.address;
};

/** Shows the panel while Phone remote is on; the server may take a moment to start. */
export const refreshPhone = (isOn: boolean): void => {
    const element = panel();
    if (!element) return;
    element.hidden = !isOn;
    if (isOn) window.setTimeout(() => void desktopApp()?.phoneInfo().then(render), 300);
};

export const wirePhone = (): void => {
    const element = panel();
    const app = desktopApp();
    if (!element || !app) return;
    element.querySelector("[data-phone-rotate]")!.addEventListener("click", () => void app.rotatePhone().then(render));
    element.querySelector("[data-phone-address]")!.addEventListener("change", (event) => {
        void app
            .setSettings({ phoneAddress: (event.target as HTMLSelectElement).value })
            .then(() => refreshPhone(true));
    });
    // While Settings is open, keep the phone count and any error current.
    window.setInterval(() => {
        const isShown = !element.hidden && element.closest("dialog")?.open === true;
        if (isShown) void app.phoneInfo().then(render);
    }, pollMs);
};
