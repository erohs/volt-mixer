import { describe, expect, test } from "vitest";
import { meterFill } from "./meters.ts";
import { parseIdentify, parseMeters } from "./reports.ts";
import { modelName, specFor } from "./spec.ts";

const spec = specFor("1.0.3").spec;

describe("Using parseIdentify, when bcdDevice is 0x0103", () => {
    test("then it should read the version as 1.0.3", () => {
        expect(parseIdentify(Uint8Array.from([0x5a, 0x2b, 0x2e, 0x00, 0x03, 0x01])).version).toBe("1.0.3");
    });
});

describe("Using parseIdentify, when the major version has two digits", () => {
    test("then it should decode the BCD byte as 12", () => {
        expect(parseIdentify(Uint8Array.from([0x5a, 0x2b, 0x2e, 0x00, 0x10, 0x12])).version).toBe("12.1.0");
    });
});

describe("Using parseMeters, when monitor left reads the captured −30 dBFS test tone", () => {
    test("then it should be about −30 dBFS", () => {
        const data = new Uint8Array(73);
        data.set([0x0c, 0x04], 54);
        expect(Math.round(parseMeters(spec, data)["monitorL"] ?? 0)).toBe(-30);
    });
});

describe("Using meterFill, when the level is −30 dBFS", () => {
    test("then it should fill the meter halfway", () => {
        expect(meterFill(-30)).toBe(0.5);
    });
});

describe("Using modelName, when a Volt 2 Max is connected", () => {
    test("then it should be named from the driver's list", () => {
        expect(modelName(0x0050)).toBe("Volt 2 Max");
    });
});

describe("Using parseMeters, when Input 1's meter has its top flag bit set", () => {
    test("then it should read the level from the low 15 bits, not as full scale", () => {
        const data = new Uint8Array(73);
        data.set([11, 128], 2);
        expect(Math.round(parseMeters(spec, data)["in1"] ?? 0)).toBe(-69);
    });
});
