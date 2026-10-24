import { desktopApp, type IPhoneInfo } from "./desktop.ts";
import { setText } from "./dom.ts";
import { drawQr } from "./qr.ts";

/*
 * Settings › Desktop app › Phone remote: the pairing QR code, the address and New code. The app
 * tells the page each time the remote's state changes (desktop/src/phone.ts).
 */

const panel = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-phone]");

/** The pill above the code: green once a phone is in, amber for a problem. */
const status = (info: IPhoneInfo): { text: string; state: string } => {
    if (info.error) return { text: info.error, state: "problem" };
    if (!info.isRunning) return { text: "Starting…", state: "waiting" };
    if (info.phones === 0) return { text: "Waiting for a phone", state: "waiting" };
    return { text: info.phones === 1 ? "1 phone connected" : `${info.phones} phones connected`, state: "connected" };
};

let shownLink = "";
let shownAddresses = "";

/**
 * The address choice, rebuilt only when the list changes, so it never changes under the user.
 * It's shown when there's a choice to make, or when the remote's address isn't one of this
 * computer's (another network): then nothing is chosen, so picking the only one still counts.
 */
const renderAddresses = (element: HTMLElement, info: IPhoneInfo): void => {
    const select = element.querySelector<HTMLSelectElement>("[data-phone-address]")!;
    const isHere = info.addresses.some(({ address }) => address === info.address);
    const row = element.querySelector<HTMLElement>("[data-phone-address-row]")!;
    row.hidden = info.addresses.length === 0 || (isHere && info.addresses.length < 2);
    const addresses = JSON.stringify(info.addresses);
    if (addresses !== shownAddresses) {
        shownAddresses = addresses;
        select.replaceChildren(
            ...info.addresses.map(({ address, name }) => new Option(`${address} (${name})`, address)),
        );
    }
    if (!isHere) select.selectedIndex = -1;
    else if (select.value !== info.address) select.value = info.address;
};

/* Only what changed is written (the status is a live region). */
const render = (info: IPhoneInfo | null): void => {
    const element = panel();
    if (!element || !info) return;
    const { text, state } = status(info);
    setText(element.querySelector("[data-phone-status-text]"), text);
    element.querySelector<HTMLElement>("[data-phone-status]")!.dataset["state"] = state;
    setText(element.querySelector("[data-phone-address-text]"), info.address);
    element.querySelector<SVGElement>("[data-qr='phone']")!.style.display = info.link ? "" : "none";
    if (info.link && info.link !== shownLink) drawQr("phone", info.link);
    shownLink = info.link;
    renderAddresses(element, info);
};

/** Shows the panel while Phone remote is on. */
export const refreshPhone = (isOn: boolean): void => {
    const element = panel();
    if (element) element.hidden = !isOn;
};

export const wirePhone = (): void => {
    const element = panel();
    const app = desktopApp();
    if (!element || !app) return;
    element.querySelector("[data-phone-rotate]")!.addEventListener("click", () => void app.rotatePhone().then(render));
    element.querySelector("[data-phone-address]")!.addEventListener("change", (event) => {
        void app.setSettings({ phoneAddress: (event.target as HTMLSelectElement).value });
    });
    app.onPhoneStatus(render);
    void app.phoneInfo().then(render);
};
