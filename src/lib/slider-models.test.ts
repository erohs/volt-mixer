import { describe, expect, test } from "vitest";
import { brightnessModel, dragValue, faderModel, sliderModel, type ISliderModel } from "./slider-models.ts";
import { specFor } from "./spec.ts";

const spec = specFor("1.0.3").spec;
const model = (kind: string): ISliderModel => sliderModel(kind, spec);
/** Where a drag that started at `start` lands after moving `travel` of the slider's length. */
const dragged = (kind: string, start: number, travel: number): number =>
    dragValue(model(kind), start, model(kind).toPosition(start) + travel);

describe("Using the fader model, when stepping up from 0 dB with a large step", () => {
    test("then it should move 3 dB", () => {
        expect(faderModel(12).step(0, 1, true)).toBe(3);
    });
});

describe("Using sliderModel for a fader, when the spec's maximum is +12 dB", () => {
    test("then it should stop at +12 dB", () => {
        expect(model("fader").max).toBe(12);
    });
});

describe("Using sliderModel for preamp gain, when the spec's maximum is 60 dB", () => {
    test("then it should stop at 60 dB", () => {
        expect(model("gain").max).toBe(60);
    });
});

describe("Using the pan model, when dragged just off centre", () => {
    test("then it should snap to centre", () => {
        expect(model("pan").fromPosition(0.51)).toBe(0);
    });
});

describe("Using the level model, when dragged past the top", () => {
    test("then it should stop at 100", () => {
        expect(model("level").fromPosition(1.4)).toBe(100);
    });
});

describe("Using the level model, when stepping down at 0", () => {
    test("then it should stay at 0", () => {
        expect(model("level").step(0, -1, false)).toBe(0);
    });
});

describe.each([
    ["gain", 37.3],
    ["level", 79.8],
    ["fader", -0.5],
    ["fader", -12.3],
])("Using dragValue on a %s at %d, when the pointer doesn't move", (kind, start) => {
    test("then it should leave the value where it was", () => {
        expect(dragged(kind, start, 0)).toBe(start);
    });
});

describe.each([
    ["gain", 37.3],
    ["level", 79.8],
    ["fader", -0.5],
])("Using dragValue on a %s at %d, when the pointer moves down a hair", (kind, start) => {
    test("then it should not raise it", () => {
        expect(dragged(kind, start, -0.0001)).toBeLessThanOrEqual(start);
    });
});

describe("Using dragValue on a fader at −0.5 dB, when the pointer moves up a hair", () => {
    test("then it should snap to the 0 dB detent", () => {
        expect(dragged("fader", -0.5, 0.0001)).toBe(0);
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
