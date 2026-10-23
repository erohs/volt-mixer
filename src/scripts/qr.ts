import { qrCode } from "../lib/qr-svg.ts";

/** Draws `text` as a QR code into a QrCode.astro element (found by its name). */
export const drawQr = (name: string, text: string): void => {
    const svg = document.querySelector<SVGSVGElement>(`[data-qr="${name}"]`);
    if (!svg) return;
    const { size, path } = qrCode(text);
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.querySelector("path")!.setAttribute("d", path);
};
