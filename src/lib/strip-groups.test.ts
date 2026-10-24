import { describe, expect, test } from "vitest";
import { defaultState } from "./mixer.ts";
import { nextTone, stripGroups } from "./strip-groups.ts";

const shown = { isDigitalShown: false, isLoopbackShown: true };

describe("Using stripGroups, when Line 3/4 is linked and digital inputs are hidden", () => {
    const names = (): string[] => {
        const state = defaultState();
        state.linked["in3-in4"] = true;
        return stripGroups(state, shown).map((group) => group.name);
    };
    test("then it should show Input 1, Input 2, Line 3/4 and Loopback", () => {
        expect(names()).toEqual(["Input 1", "Input 2", "Line 3/4", "Loopback"]);
    });
});

describe("Using stripGroups, when a linked pair has a custom name", () => {
    test("then it should use it for the stereo strip", () => {
        const state = defaultState();
        state.linked["in3-in4"] = true;
        state.names["in3"] = "PS5";
        expect(stripGroups(state, shown).find((group) => group.isStereo && group.ids[0] === "in3")?.name).toBe("PS5");
    });
});

describe("Using stripGroups, when digital inputs are shown in ADAT mode", () => {
    test("then it should show the ADAT strips but not S/PDIF", () => {
        const names = stripGroups(defaultState(), { ...shown, isDigitalShown: true }).map((group) => group.name);
        expect([names.includes("ADAT 1"), names.includes("S/PDIF L")]).toEqual([true, false]);
    });
});

describe("Using stripGroups, when an unlinked pair is shown", () => {
    test("then it should offer the link button on its first strip only", () => {
        const groups = stripGroups(defaultState(), shown).filter(
            (group) => group.ids[0] === "in1" || group.ids[0] === "in2",
        );
        expect(groups.map((group) => Boolean(group.linkPair))).toEqual([true, false]);
    });
});

describe("Using stripGroups, when a linked pair has been renamed", () => {
    test("then it should still name both hardware channels on its link button", () => {
        const state = defaultState();
        state.linked["in3-in4"] = true;
        state.names["in3"] = "PS5";
        state.names["in4"] = "PS5";
        expect(stripGroups(state, shown).find((group) => group.ids[0] === "in3")?.linkLabel).toBe(
            "Stereo link Line 3 and Line 4",
        );
    });
});

describe("Using stripGroups, when the loopback channel is hidden", () => {
    test("then it should leave out the Loopback strip", () => {
        const names = stripGroups(defaultState(), { ...shown, isLoopbackShown: false }).map((group) => group.name);
        expect(names).not.toContain("Loopback");
    });
});

describe("Using nextTone, when Input 1's tone is Off", () => {
    test("then it should step to Warmth", () => {
        expect(nextTone(defaultState(), ["in1"])).toBe(1);
    });
});

describe("Using nextTone, when Input 1's tone is Shine", () => {
    test("then it should step back round to Off", () => {
        const state = defaultState();
        state.tone[0] = 3;
        expect(nextTone(state, ["in1"])).toBe(0);
    });
});
