import { encodeMixCode } from "../lib/mix-code.ts";
import { toSavedMix } from "../lib/saved-mix.ts";
import { site } from "../lib/site.ts";
import { app } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { drawQr } from "./qr.ts";
import { toast } from "./toast.ts";

/* Settings › Your mix › Mix link: the link in a box that copies itself, and its QR code below. */

/** The mix as a link to the website. In the desktop app the page is app://volt/, which opens nowhere else. */
export const mixLink = (): string => {
    const url = desktopApp() ? new URL(site.websiteUrl) : new URL(import.meta.env.BASE_URL, location.origin);
    url.hash = `m=${encodeMixCode(toSavedMix(app.state))}`;
    return url.href;
};

const box = (): HTMLInputElement | null => document.querySelector<HTMLInputElement>("[data-mix-link]");
const code = (): HTMLDetailsElement | null => document.querySelector<HTMLDetailsElement>("[data-mix-qr]");

/** Keeps the link and its QR code current while Settings is open. */
export const refreshMixLink = (): void => {
    const input = box();
    if (!input?.closest("dialog")?.open) return;
    const link = mixLink();
    if (input.value === link) return;
    input.value = link;
    if (code()?.open) drawQr("mix", link);
};

const copy = async (input: HTMLInputElement): Promise<void> => {
    input.select();
    try {
        await navigator.clipboard.writeText(input.value);
        toast("Mix link copied.");
    } catch {
        toast("Couldn't copy it: the link is selected, so copy it with Ctrl+C.");
    }
};

export const wireMixLink = (): void => {
    const input = box();
    const details = code();
    if (!input || !details) return;
    input.addEventListener("click", () => void copy(input));
    document.querySelector("[data-mix-copy]")?.addEventListener("click", () => void copy(input));
    input.addEventListener("keydown", (event) => event.key === "Enter" && void copy(input));
    // Drawn when it's opened, from the link the box shows.
    details.addEventListener("toggle", () => details.open && drawQr("mix", input.value || mixLink()));
};
