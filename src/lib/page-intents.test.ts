import { describe, expect, test } from "vitest";
import { applyIntent, changesLayout, type Intent } from "./intents.ts";
import { defaultState, setLinked, type IMixerState } from "./mixer.ts";
import { specFor } from "./spec.ts";

/* The intents only the page's own controls send: channel settings and Settings. */

const spec = specFor("1.0.3").spec;

const ownedState = (): IMixerState => {
    const state = defaultState();
    state.isMixOwned = true;
    setLinked(state, ["in3", "in4"], true);
    return state;
};

const after = (intent: Intent, state = ownedState()): IMixerState => {
    applyIntent(state, intent, spec);
    return state;
};

describe("Using applyIntent, when a linked pair's cue send moves", () => {
    test("then both sides should take the level and keep their own pans", () => {
        const { channels } = after({ type: "cueSend", ids: ["in3", "in4"], cue: "cue1", db: -6 });
        expect([channels.in3.cue1, channels.in4.cue1].map((send) => [send.db, send.pan])).toEqual([
            [-6, -1],
            [-6, 1],
        ]);
    });
});

describe("Using applyIntent, when the pan moves before this computer has the mix", () => {
    test("then it should wait for the mix", () => {
        expect(applyIntent(defaultState(), { type: "pan", id: "in1", pan: 0.5 }, spec)).toBe("needsMix");
    });
});

describe("Using applyIntent, when the preamp gain is asked for above the maximum", () => {
    test("then it should clamp it to 60 dB", () => {
        expect(after({ type: "preampGain", ids: ["in1"], db: 200 }).preamp.gain[0]).toBe(60);
    });
});

describe("Using applyIntent, when the gain is asked for on a line input", () => {
    test("then it should ignore it, as Line 3 has no preamp", () => {
        expect(applyIntent(ownedState(), { type: "preampGain", ids: ["in3"], db: 20 }, spec)).toBe("ignored");
    });
});

describe("Using applyIntent, when a tone that doesn't exist is asked for", () => {
    test("then it should ignore it", () => {
        expect(applyIntent(ownedState(), { type: "tone", ids: ["in1"], tone: 7 }, spec)).toBe("ignored");
    });
});

describe("Using applyIntent, when the brightness is asked for above the maximum", () => {
    test("then it should clamp it to 255", () => {
        expect(after({ type: "brightness", raw: 300 }).device.brightness).toBe(255);
    });
});

describe("Using applyIntent, when Line Out 3/4 goes back to computer playback", () => {
    test("then no cue should be mirrored to it", () => {
        const state = after({ type: "mirror", cue: "cue2" });
        applyIntent(state, { type: "mirror", cue: null }, spec);
        expect([state.cues.cue1.isMirroredToLine34, state.cues.cue2.isMirroredToLine34]).toEqual([false, false]);
    });
});

describe("Using applyIntent, when a name is cleared", () => {
    test("then the channel should go back to its own name", () => {
        const state = after({ type: "rename", ids: ["in1"], name: "Vocal" });
        applyIntent(state, { type: "rename", ids: ["in1"], name: "   " }, spec);
        expect(state.names.in1).toBeUndefined();
    });
});

describe("Using applyIntent, when an icon that isn't in the list is asked for", () => {
    test("then it should ignore it", () => {
        expect(applyIntent(ownedState(), { type: "icon", ids: ["in1"], icon: "skull" }, spec)).toBe("ignored");
    });
});

describe("Using changesLayout, when a channel is renamed", () => {
    test("then the strips should be rebuilt", () => {
        expect(changesLayout({ type: "rename", ids: ["in1"], name: "Vocal" })).toBe(true);
    });
});
