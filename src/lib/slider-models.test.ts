import { describe, expect, test } from "vitest";
import { brightnessModel, faderModel, levelModel, panModel } from "./slider-models.ts";

describe("Using the fader model, when stepping up from 0 dB with a large step", () => {
    test("then it should move 3 dB", () => {
        expect(faderModel().step(0, 1, true)).toBe(3);
    });
});

describe("Using the pan model, when dragged just off centre", () => {
    test("then it should snap to centre", () => {
        expect(panModel().fromPosition(0.51)).toBe(0);
    });
});

describe("Using the level model, when dragged past the top", () => {
    test("then it should stop at 100", () => {
        expect(levelModel().fromPosition(1.4)).toBe(100);
    });
});

describe("Using the level model, when stepping down at 0", () => {
    test("then it should stay at 0", () => {
        expect(levelModel().step(0, -1, false)).toBe(0);
    });
});

describe("Using the brightness model, when set halfway", () => {
    test("then it should send the raw level that looks half as bright", () => {
        expect(brightnessModel().fromPosition(0.5)).toBe(54);
    });
});

describe("Using the brightness model, when stepped up from off", () => {
    test("then it should go straight to the dimmest level that is visibly lit", () => {
        expect(brightnessModel().step(0, 1, false)).toBe(8);
    });
});

describe("Using the brightness model, when stepped down one percent at a time", () => {
    test("then it should move the raw level every step", () => {
        const model = brightnessModel();
        const steps = [255];
        while ((steps.at(-1) ?? 0) > 0) steps.push(model.step(steps.at(-1) ?? 0, -1, false));
        expect(steps.every((raw, i) => i === 0 || raw < (steps[i - 1] ?? 0))).toBe(true);
    });
});

describe("Using the brightness model, when reading Console's default of 217", () => {
    test("then it should show 97%", () => {
        expect(brightnessModel().format(217)).toBe("97%");
    });
});

describe("Using the brightness model, when set to 90%", () => {
    test("then it should reach the level that already looks close to full", () => {
        expect(brightnessModel().fromPosition(0.9)).toBe(145);
    });
});
