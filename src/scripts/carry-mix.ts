import { isMixHash, mixFromHash } from "../lib/saved-mix.ts";
import { flashButton } from "./button-feedback.ts";
import { showMessage } from "./messages.ts";
import { drawQr } from "./qr.ts";
import { loadCarriedLink, saveCarriedLink } from "./store.ts";

/*
 * A browser that can't reach a Volt (CarryMix.astro): a mix link opened here is kept, and shown as
 * a QR code and a link to take to the computer with the Volt; with none, the panel says what a
 * phone can do. Nothing leaves the device unless the user shares it.
 */

const panel = (): HTMLElement => document.querySelector<HTMLElement>("[data-carry]")!;
const message = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-message='carry']");

const isMixLink = (link: string): boolean => {
    try {
        return mixFromHash(new URL(link).hash) !== null;
    } catch {
        return false;
    }
};

/** A mix link in the address is kept (and taken out of the address); otherwise the one kept before. */
const carriedLink = (): string | null => {
    if (isMixHash(location.hash) && isMixLink(location.href)) {
        saveCarriedLink(location.href);
        history.replaceState(null, "", location.pathname + location.search);
    }
    const link = loadCarriedLink();
    return link && isMixLink(link) ? link : null;
};

const copy = async (link: string, button: HTMLElement): Promise<void> => {
    try {
        await navigator.clipboard.writeText(link);
        flashButton(button, "success");
        showMessage(message(), "success", "Link copied.", { isQuiet: true });
    } catch {
        flashButton(button, "error");
        showMessage(message(), "error", "Couldn't copy it. Use Send the link instead.");
    }
};

/** The carried mix, or (with none, or once it's forgotten) what a phone can do. */
const showPart = (link: string | null): void => {
    if (!link) saveCarriedLink(null);
    panel().querySelector<HTMLElement>("[data-carry-mix]")!.hidden = !link;
    panel().querySelector<HTMLElement>("[data-carry-none]")!.hidden = Boolean(link);
    panel().setAttribute("aria-labelledby", link ? "carry-heading" : "carry-none-heading");
};

const wireButtons = (link: string): void => {
    const share = panel().querySelector<HTMLButtonElement>("[data-carry-share]")!;
    // Only where the device can hand the link to another app (a phone's share sheet).
    share.hidden = typeof navigator.share !== "function";
    share.addEventListener("click", () => void navigator.share({ title: "Volt Mixer mix", url: link }).catch(() => {}));
    const copyButton = panel().querySelector<HTMLButtonElement>("[data-carry-copy]")!;
    copyButton.addEventListener("click", () => void copy(link, copyButton));
    panel()
        .querySelector("[data-carry-forget]")!
        .addEventListener("click", () => showPart(null));
};

/** Shows the panel, with the carried mix if there is one. */
export const showCarryPanel = (): void => {
    const link = carriedLink();
    panel().hidden = false;
    showPart(link);
    if (!link) return;
    drawQr("carry", link);
    wireButtons(link);
};
