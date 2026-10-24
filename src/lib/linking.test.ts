import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { applyIntent } from "./intents.ts";
import { applyHardwareState, defaultState, setLinked, type IMixerState } from "./mixer.ts";
import { parseState } from "./reports.ts";
import { adoptSavedMix, applySavedMix, toSavedMix } from "./saved-mix.ts";
import { specFor } from "./spec.ts";

/* Linking a pair, however it happens, never turns a fader or send up: the quieter side wins. */

const spec = specFor("1.0.3").spec;
const baseline = (
    JSON.parse(
        readFileSync(new URL("../../reference/decoded/1.0.3-state/state-map.json", import.meta.url), "utf8"),
    ) as { baseline: number[] }
).baseline;
const dumpWith = (changes: Record<number, number>): Uint8Array => {
    const bytes = [...baseline];
    for (const [offset, value] of Object.entries(changes)) bytes[Number(offset)] = value;
    return Uint8Array.from([0x11, ...bytes]);
};

/** Line 3 loud and unmuted, Line 4 quieter and muted, in the mix and in both cues. */
const unevenLines = (): IMixerState => {
    const state = defaultState();
    state.isMixOwned = true;
    Object.assign(state.channels["in3"]!, { fader: 6, isMuted: false });
    Object.assign(state.channels["in4"]!, { fader: -20, isMuted: true });
    state.channels["in3"]!.cue1 = { db: 0, pan: 0, isMuted: false };
    state.channels["in4"]!.cue1 = { db: -30, pan: 0, isMuted: true };
    return state;
};

const linkedLines = (): IMixerState => {
    const state = unevenLines();
    setLinked(state, ["in3", "in4"], true);
    return state;
};

describe("Using setLinked, when the two faders differ", () => {
    test("then it should give both sides the lower one", () => {
        const { channels } = linkedLines();
        expect([channels["in3"]?.fader, channels["in4"]?.fader]).toEqual([-20, -20]);
    });
});

describe("Using setLinked, when the two cue sends differ", () => {
    test("then it should give both sides the lower send, muted", () => {
        const { channels } = linkedLines();
        expect([channels["in3"]?.cue1, channels["in4"]?.cue1].map((send) => [send?.db, send?.isMuted])).toEqual([
            [-30, true],
            [-30, true],
        ]);
    });
});

describe("Using setLinked, when one side is muted", () => {
    test("then it should mute both sides", () => {
        const { channels } = linkedLines();
        expect([channels["in3"]?.isMuted, channels["in4"]?.isMuted]).toEqual([true, true]);
    });
});

describe("Using applyIntent, when Inputs 1/2 are linked with different preamp gains", () => {
    test("then it should give both preamps the lower gain", () => {
        const state = defaultState();
        state.preamp.gain = [50, 10];
        applyIntent(state, { type: "link", id: "in1" }, spec);
        expect(state.preamp.gain).toEqual([10, 10]);
    });
});

describe("Using applyHardwareState, when the Volt reports Line 3/4 linked with different faders", () => {
    test("then it should give both sides the lower fader", () => {
        const state = unevenLines();
        applyHardwareState(state, parseState(spec, dumpWith({ 11: 0b10 })));
        expect([state.channels["in3"]?.fader, state.channels["in4"]?.fader]).toEqual([-20, -20]);
    });
});

describe("Using applySavedMix, when a saved linked pair's sides differ", () => {
    test("then it should give both sides the lower fader", () => {
        const saved = { ...toSavedMix(unevenLines()), linked: { "in3-in4": true } };
        const state = defaultState();
        applySavedMix(state, saved, 12);
        expect([state.channels["in3"]?.fader, state.channels["in4"]?.fader]).toEqual([-20, -20]);
    });
});

describe("Using adoptSavedMix, when Inputs 1/2 are already linked on the Volt", () => {
    test("then it should keep the preamp gains as the Volt has them", () => {
        const state = defaultState();
        applyHardwareState(state, parseState(spec, dumpWith({ 11: 0b01 })));
        state.preamp.gain = [50, 10];
        adoptSavedMix(state, toSavedMix(defaultState()), 12);
        expect(state.preamp.gain).toEqual([50, 10]);
    });
});
