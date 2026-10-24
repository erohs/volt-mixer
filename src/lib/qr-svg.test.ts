import { describe, expect, test } from "vitest";
import { qrCode } from "./qr-svg.ts";

const link = "https://naovixen.github.io/volt-mixer/#m=AsAP_78AAAD_iAAAAf_i2PAZ-mDY8Ppg2PD_4icQGfpgJxD6YCcQ";

describe("Using qrCode, when given a mix link", () => {
    test("then the top-left finder pattern should start inside the quiet zone, as a run of 7", () => {
        expect(qrCode(link).path.startsWith("M4 4h7v1h-7z")).toBe(true);
    });

    test("then its size should include the quiet zone on both sides", () => {
        expect((qrCode(link).size - 8 - 21) % 4).toBe(0);
    });
});

describe("Using qrCode, when given the same text twice", () => {
    test("then it should draw the same code", () => {
        expect(qrCode(link)).toEqual(qrCode(link));
    });
});
