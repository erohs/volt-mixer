import { describe, expect, test } from "vitest";
import { channelIcons } from "./channel-icons.ts";
import { minDb } from "./gain.ts";
import { decodeMixCode, encodeMixCode } from "./mix-code.ts";
import { channels, defaultState, pairs, setLinked } from "./mixer.ts";
import { applySavedMix, encodeMix, isMixHash, mixFromHash, toSavedMix, type ISavedMix } from "./saved-mix.ts";

/** A mix like a real one: a few channels moved, a pair linked, a name and an icon. */
const typicalMix = (): ISavedMix => {
    const state = defaultState();
    state.isMixOwned = true;
    Object.assign(state.channels["in1"]!, { fader: -6.5, isMuted: false });
    Object.assign(state.channels["in2"]!, { fader: -12, pan: 0.25 });
    setLinked(state, ["in3", "in4"], true);
    state.channels["in3"]!.fader = state.channels["in4"]!.fader = -3;
    state.channels["in1"]!.cue1 = { db: -10, pan: 0, isMuted: false };
    state.names["in3"] = "PS5";
    state.icons["in3"] = "gamepad-2";
    return toSavedMix(state);
};

/** A mix as the page would hold it after validation, for comparing like with like. */
const validated = (mix: unknown): ISavedMix => {
    const state = defaultState();
    applySavedMix(state, mix, 12);
    return toSavedMix(state);
};

const roundTrip = (mix: ISavedMix): ISavedMix => {
    const state = defaultState();
    applySavedMix(state, decodeMixCode(encodeMixCode(mix)), 12);
    return toSavedMix(state);
};

describe("Using encodeMixCode and decodeMixCode, when a typical mix makes the round trip", () => {
    test("then it should come back the same", () => {
        expect(roundTrip(typicalMix())).toEqual(validated(typicalMix()));
    });
});

describe("Using encodeMixCode, when the mix is a typical one", () => {
    test("then the whole link should stay under 160 characters", () => {
        const link = `https://naovixen.github.io/volt-mixer/#m=${encodeMixCode(typicalMix())}`;
        expect(link.length).toBeLessThan(160);
    });
});

describe("Using encodeMixCode, when the mix is Console's default", () => {
    test("then it should be far shorter than the old link", () => {
        const mix = toSavedMix(defaultState());
        expect(encodeMixCode(mix).length * 10).toBeLessThan(encodeMix(mix).length);
    });
});

describe("Using encodeMixCode, when a level falls between tenths of a dB", () => {
    test("then it should round down, never up", () => {
        const mix = typicalMix();
        mix.channels["in1"]!.fader = -6.0000001;
        expect(roundTrip(mix).channels["in1"]?.fader).toBe(-6.1);
    });
});

describe("Using encodeMixCode, when a level is minus infinity", () => {
    test("then it should come back as silence, not 0 dB", () => {
        const mix = typicalMix();
        mix.channels["in1"]!.fader = -Infinity;
        expect(roundTrip(mix).channels["in1"]?.fader).toBe(minDb);
    });
});

describe("Using encodeMixCode, when a level isn't a number", () => {
    test("then it should come back as silence", () => {
        const mix = typicalMix();
        mix.channels["in1"]!.cue2.db = Number.NaN;
        expect(roundTrip(mix).channels["in1"]?.cue2.db).toBe(minDb);
    });
});

describe("Using encodeMixCode, when a name has emoji", () => {
    test("then it should keep them whole", () => {
        const mix = typicalMix();
        mix.names["in1"] = "🎤 Vocal 🎧";
        expect(roundTrip(mix).names["in1"]).toBe("🎤 Vocal 🎧");
    });
});

describe("Using encodeMixCode, when a name is longer than the name field allows", () => {
    test("then it should cut it there, without splitting an emoji", () => {
        const mix = typicalMix();
        mix.names["in1"] = `a${"🎸".repeat(30)}`;
        expect(roundTrip(mix).names["in1"]).toBe(`a${"🎸".repeat(11)}`);
    });
});

describe("Using decodeMixCode, when the code is cut short", () => {
    test("then it should give null", () => {
        expect(decodeMixCode(encodeMixCode(typicalMix()).slice(0, 12))).toBeNull();
    });
});

describe("Using decodeMixCode, when the code has bytes left over", () => {
    test("then it should give null", () => {
        expect(decodeMixCode(`${encodeMixCode(typicalMix())}AAAA`)).toBeNull();
    });
});

describe("Using decodeMixCode, when the version is unknown", () => {
    test("then it should give null", () => {
        expect(decodeMixCode("CQAA")).toBeNull();
    });
});

describe("Using decodeMixCode, when the code isn't base64", () => {
    test("then it should give null", () => {
        expect(decodeMixCode("!!!")).toBeNull();
    });
});

describe("Using mixFromHash, when the link is an older #mix= one", () => {
    test("then it should still read it", () => {
        const mix = typicalMix();
        expect(mixFromHash(`#mix=${encodeMix(mix)}`)).toEqual(mix);
    });
});

/* The format depends on these orders: a change here needs a new version of the code. */
describe("Using the mix code's orders, when they're checked against the format", () => {
    test("then the channels should be in the order the code was written for", () => {
        expect(channels.map((c) => c.id).join(",")).toBe(
            "in1,in2,in3,in4,spdifL,spdifR,adat1,adat2,adat3,adat4,adat5,adat6,adat7,adat8,loopbackL,loopbackR",
        );
    });

    test("then the pairs should be in the order the code was written for", () => {
        expect(pairs.map((pair) => pair[0]).join(",")).toBe("in1,in3,spdifL,adat1,adat3,adat5,adat7,loopbackL");
    });

    test("then the first icons should be in the order the code was written for", () => {
        expect(Object.keys(channelIcons).slice(0, 4).join(",")).toBe("mic,mic-vocal,headset,headphones");
    });
});

describe.each([
    ["#m=AgAAAA", true],
    ["#mix=eyJ2ZXJzaW9uIjoxfQ", true],
    ["#t=pairing-token", false],
    ["#main", false],
])("Using isMixHash on %s", (hash, isMix) => {
    test(`then it should say ${isMix ? "it's" : "it isn't"} a mix link`, () => {
        expect(isMixHash(hash)).toBe(isMix);
    });
});
