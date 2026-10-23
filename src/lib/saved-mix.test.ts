import { describe, expect, test } from "vitest";
import { minDb } from "./gain.ts";
import { defaultState } from "./mixer.ts";
import { adoptSavedMix, applySavedMix, decodeMix, encodeMix, toSavedMix } from "./saved-mix.ts";

const fromSaved = (value: unknown): ReturnType<typeof defaultState> => {
    const state = defaultState();
    applySavedMix(state, value, 12);
    return state;
};

describe("Using applySavedMix, when a saved fader is far above the maximum", () => {
    test("then it should clamp it to +12 dB", () => {
        expect(fromSaved({ channels: { in3: { fader: 1000 } } }).channels["in3"]?.fader).toBe(12);
    });
});

describe("Using applySavedMix, when a saved cue send is missing", () => {
    test("then it should fall back to a silent send", () => {
        expect(fromSaved({ channels: { in3: { cue1: null } } }).channels["in3"]?.cue1).toEqual({
            db: minDb,
            pan: 0,
            isMuted: false,
        });
    });
});

describe("Using applySavedMix, when the saved data isn't an object", () => {
    test("then it should leave the default mix", () => {
        expect(fromSaved("not a mix").channels["in1"]?.fader).toBe(0);
    });
});

describe("Using applySavedMix, when a saved channel name is too long", () => {
    test("then it should keep the first 24 characters", () => {
        expect(fromSaved({ names: { in3: "PS5 ".repeat(10) } }).names["in3"]?.length).toBe(24);
    });
});

describe("Using encodeMix and decodeMix, when a mix makes the round trip", () => {
    test("then it should come back unchanged", () => {
        const state = defaultState();
        (state.channels["in3"] ?? { fader: 0 }).fader = -7.5;
        const mix = toSavedMix(state);
        expect(decodeMix(encodeMix(mix))).toEqual(mix);
    });
});

describe("Using decodeMix, when the code is garbage", () => {
    test("then it should return null", () => {
        expect(decodeMix("%%%")).toBeNull();
    });
});

describe("Using adoptSavedMix, when the saved mix has Line 3/4 linked but the Volt doesn't", () => {
    test("then the Volt's link state should win", () => {
        const state = defaultState();
        adoptSavedMix(state, { linked: { "in3-in4": true } }, 12);
        expect(state.linked["in3-in4"]).toBe(false);
    });
});

describe("Using adoptSavedMix, when the saved mix has Line 3 unmuted but the Volt has it muted", () => {
    test("then the Volt's mute should win", () => {
        const state = defaultState();
        adoptSavedMix(state, { channels: { in3: { isMuted: false } } }, 12);
        expect(state.channels["in3"]?.isMuted).toBe(true);
    });
});

describe("Using applySavedMix, when a saved icon isn't one of the channel icons", () => {
    test("then it should drop it, so the channel keeps its default", () => {
        expect(fromSaved({ icons: { in1: "skull", in2: "guitar" } }).icons).toEqual({ in2: "guitar" });
    });
});

describe("Using applySavedMix, when the saved mix predates icons", () => {
    test("then it should have no custom icons", () => {
        expect(fromSaved({ names: { in1: "Mic" } }).icons).toEqual({});
    });
});
