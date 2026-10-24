import { describe, expect, test } from "vitest";
import { minDb } from "./gain.ts";
import { dbToPosition, positionToDb, stepDb } from "./taper.ts";

describe("Using positionToDb, when the fader is just off 0 dB", () => {
    test("then it should snap to exactly 0 dB", () => {
        expect(positionToDb(dbToPosition(0, 12) + 0.005, 12)).toBe(0);
    });
});

describe("Using positionToDb, when the fader is at the bottom", () => {
    test("then it should be off", () => {
        expect(positionToDb(0, 12)).toBe(minDb);
    });
});

describe("Using dbToPosition and positionToDb, when converting −12 dB both ways", () => {
    test("then it should come back as −12 dB", () => {
        expect(positionToDb(dbToPosition(-12, 12), 12)).toBe(-12);
    });
});

describe("Using stepDb, when stepping up from off", () => {
    test("then it should land on −60 dB", () => {
        expect(stepDb(minDb, 0.5, 12)).toBe(-60);
    });
});

describe("Using stepDb, when stepping up at the maximum", () => {
    test("then it should stay at +12 dB", () => {
        expect(stepDb(12, 3, 12)).toBe(12);
    });
});
