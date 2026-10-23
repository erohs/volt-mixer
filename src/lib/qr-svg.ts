import { encode } from "uqr";

/**
 * A QR code for `text` as one SVG path, in module units, with the standard 4-module quiet zone.
 * Dark modules on a row are joined into runs, so the path stays short. Error correction M copes
 * with a smudged screen or a low-resolution webcam.
 */
export const qrCode = (text: string): { size: number; path: string } => {
    const { data, size } = encode(text, { ecc: "M", border: 4 });
    const runs: string[] = [];
    data.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            if (!row[x]) continue;
            const start = x;
            while (row[x + 1]) x++;
            const length = x - start + 1;
            runs.push(`M${start} ${y}h${length}v1h-${length}z`);
        }
    });
    return { size, path: runs.join("") };
};
