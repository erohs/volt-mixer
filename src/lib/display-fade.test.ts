import { describe, expect, test } from "vitest";
import { dimmedBrightness, fadeLevels, isDimmed } from "./display-fade.ts";
import { brightnessModel } from "./slider-models.ts";

describe("Using fadeLevels, when fading the display back up", () => {
    test("then it should end on the remembered level", () => {
        expect(fadeLevels(dimmedBrightness, 145, 6).at(-1)).toBe(145);
    });

    test("then it should never go past the remembered level", () => {
        expect(Math.max(...fadeLevels(dimmedBrightness, 145, 6))).toBeLessThanOrEqual(145);
    });
});

describe("Using isDimmed, when the brightness slider is at its lowest lit position", () => {
    test("then it should not mistake it for Volt Mixer's dimming", () => {
        expect(isDimmed(brightnessModel().fromPosition(0.01))).toBe(false);
    });
});
