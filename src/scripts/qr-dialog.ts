import { drawQr } from "./qr.ts";

/* The QR dialog (QrDialog.astro): a link drawn as a QR code, with the link itself below it. */

const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>("#qr-dialog")!;

/** Opens the dialog with `link` as its code. */
export const showQr = (link: string): void => {
    drawQr("mix", link);
    dialog().querySelector("[data-qr-link]")!.textContent = link;
    dialog().showModal();
};
