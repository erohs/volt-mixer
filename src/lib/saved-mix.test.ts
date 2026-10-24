import { describe, expect, test } from "vitest";
import { minDb } from "./gain.ts";
import { defaultState } from "./mixer.ts";
import { adoptSavedMix, applySavedMix } from "./saved-mix.ts";

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

describe("Using adoptSavedMix, when the saved mix has Line 3/4 linked but the Volt doesn't", () => {
    test("then it should let the Volt's link state win", () => {
        const state = defaultState();
        adoptSavedMix(state, { linked: { "in3-in4": true } }, 12);
        expect(state.linked["in3-in4"]).toBe(false);
    });
});

describe("Using adoptSavedMix, when the saved mix has Line 3 unmuted but the Volt has it muted", () => {
    test("then it should let the Volt's mute win", () => {
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

describe("Using applySavedMix, when a saved mix has Loopback unlinked", () => {
    test("then it should keep Loopback linked", () => {
        expect(fromSaved({ linked: { "loopbackL-loopbackR": false } }).linked["loopbackL-loopbackR"]).toBe(true);
    });
});

describe("Using applySavedMix, when a saved linked pair was left centred", () => {
    test("then it should pan its sides hard left and right, as a link does", () => {
        const state = fromSaved({ linked: { "in3-in4": true }, channels: { in3: { pan: 0 }, in4: { pan: 0 } } });
        expect([state.channels.in3.pan, state.channels.in4.pan]).toEqual([-1, 1]);
    });
});
