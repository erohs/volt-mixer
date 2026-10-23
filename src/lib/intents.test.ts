import { describe, expect, test } from "vitest";
import { minDb } from "./gain.ts";
import { applyIntent, isRemoteIntent, type Intent } from "./intents.ts";
import { defaultState, setLinked, type IMixerState } from "./mixer.ts";
import { specFor } from "./spec.ts";

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

describe("Using applyIntent, when solo is pressed on a linked pair", () => {
    test("then it should solo both sides", () => {
        const { channels } = after({ type: "solo", ids: ["in3", "in4"] });
        expect([channels["in3"]?.isSoloed, channels["in4"]?.isSoloed]).toEqual([true, true]);
    });
});

describe("Using applyIntent, when solo is pressed twice on a linked pair", () => {
    test("then it should clear both sides", () => {
        const state = after({ type: "solo", ids: ["in3", "in4"] });
        const { channels } = after({ type: "solo", ids: ["in3", "in4"] }, state);
        expect([channels["in3"]?.isSoloed, channels["in4"]?.isSoloed]).toEqual([false, false]);
    });
});

describe("Using applyIntent, when mute is pressed on a linked digital pair", () => {
    test("then it should mute both sides", () => {
        // Loopback starts unmuted and linked, as in Console.
        const state = ownedState();
        setLinked(state, ["loopbackL", "loopbackR"], true);
        const { channels } = after({ type: "mute", ids: ["loopbackL", "loopbackR"] }, state);
        expect([channels["loopbackL"]?.isMuted, channels["loopbackR"]?.isMuted]).toEqual([true, true]);
    });
});

describe("Using applyIntent, when a linked pair's fader moves while its mutes differ", () => {
    test("then it should leave each side's mute as it was", () => {
        const state = ownedState();
        state.channels["in3"]!.isMuted = false;
        state.channels["in4"]!.isMuted = true;
        const { channels } = after({ type: "fader", ids: ["in3", "in4"], db: -10 }, state);
        expect([channels["in3"]?.isMuted, channels["in4"]?.isMuted]).toEqual([false, true]);
    });
});

describe("Using applyIntent, when a fader is asked for far above the maximum", () => {
    test("then it should clamp it to +12 dB", () => {
        expect(after({ type: "fader", ids: ["in1"], db: 500 }).channels["in1"]?.fader).toBe(12);
    });
});

describe("Using applyIntent, when a fader is asked for far below silence", () => {
    test("then it should clamp it to the minimum", () => {
        expect(after({ type: "fader", ids: ["in1"], db: -5000 }).channels["in1"]?.fader).toBe(minDb);
    });
});

describe("Using applyIntent, when the monitor level is asked for below 0", () => {
    test("then it should stop at 0, because the Volt jumps loud below it", () => {
        expect(after({ type: "monitorLevel", level: -20 }).monitor.level).toBe(0);
    });
});

describe("Using applyIntent, when the headphone level is asked for above 100", () => {
    test("then it should stop at 100", () => {
        expect(after({ type: "headphoneLevel", level: 250 }).headphone.level).toBe(100);
    });
});

describe("Using applyIntent, when a fader moves before this computer has the mix", () => {
    test("then it should report that the mix is needed", () => {
        expect(applyIntent(defaultState(), { type: "fader", ids: ["in1"], db: -10 }, spec)).toBe("needsMix");
    });
});

describe("Using applyIntent, when an analog input is muted before this computer has the mix", () => {
    test("then it should mute it, because analog mutes are the Volt's own", () => {
        const state = defaultState();
        state.channels["in1"]!.isMuted = false;
        expect(after({ type: "mute", ids: ["in1"] }, state).channels["in1"]?.isMuted).toBe(true);
    });
});

describe("Using isRemoteIntent, when the message names a channel that doesn't exist", () => {
    test("then it should refuse it", () => {
        expect(isRemoteIntent({ type: "fader", ids: ["in1", "in9"], db: -10 })).toBe(false);
    });
});

describe("Using isRemoteIntent, when a phone asks for 48V", () => {
    test("then it should refuse it, as only the page's own controls may", () => {
        expect(isRemoteIntent({ type: "phantom", ids: ["in1"], to: true })).toBe(false);
    });
});

describe("Using applyIntent, when the link button is pressed on a linked pair", () => {
    test("then it should unlink it", () => {
        expect(after({ type: "link", id: "in3" }).linked["in3-in4"]).toBe(false);
    });
});

describe("Using applyIntent, when headphone mute is pressed", () => {
    test("then it should mute the headphones", () => {
        expect(after({ type: "headphoneMute" }).headphone.isMuted).toBe(true);
    });
});

describe("Using isRemoteIntent, when a message has an unknown type", () => {
    test("then it should reject it", () => {
        expect(isRemoteIntent({ type: "eraseEverything" })).toBe(false);
    });
});

describe("Using isRemoteIntent, when a fader message has no level", () => {
    test("then it should reject it", () => {
        expect(isRemoteIntent({ type: "fader", ids: ["in1"] })).toBe(false);
    });
});

describe("Using isRemoteIntent, when a message names an inherited property as its type", () => {
    test("then it should reject it", () => {
        expect(isRemoteIntent({ type: "toString" })).toBe(false);
    });
});

describe("Using isRemoteIntent, when a monitor mute message arrives", () => {
    test("then it should accept it", () => {
        expect(isRemoteIntent({ type: "monitorMute" })).toBe(true);
    });
});

describe("Using applyIntent, when a mute asks for a state rather than a flip", () => {
    test("then sending it twice should leave the channel muted", () => {
        const state = after({ type: "mute", ids: ["loopbackL", "loopbackR"], to: true });
        expect(
            after({ type: "mute", ids: ["loopbackL", "loopbackR"], to: true }, state).channels["loopbackL"]?.isMuted,
        ).toBe(true);
    });
});

describe("Using applyIntent, when headphone mute asks to be off and it already is", () => {
    test("then it should stay off", () => {
        expect(after({ type: "headphoneMute", to: false }).headphone.isMuted).toBe(false);
    });
});

describe("Using isRemoteIntent, when a switch's target isn't true or false", () => {
    test("then it should reject it", () => {
        expect(isRemoteIntent({ type: "monitorMute", to: "yes" })).toBe(false);
    });
});
