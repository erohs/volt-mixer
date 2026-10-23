import { qrCode } from "../lib/qr-svg.ts";

/* The QR dialog (QrDialog.astro): a link drawn as a QR code, with the link itself below it. */

const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>("#qr-dialog")!;

/** Opens the dialog with `link` as its code. */
export const showQr = (link: string): void => {
    const { size, path } = qrCode(link);
    const svg = dialog().querySelector<SVGSVGElement>("[data-qr]")!;
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.querySelector("[data-qr-path]")!.setAttribute("d", path);
    dialog().querySelector("[data-qr-link]")!.textContent = link;
    dialog().showModal();
};
