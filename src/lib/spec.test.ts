import { describe, expect, test } from "vitest";
import { compareVersions, missingFromSpec, protocol, specFor, type IProtocol, type ISpec } from "./spec.ts";

const complete = specFor("1.0.3").spec;
const { tone: _tone, ...commandsWithoutTone } = complete.commands;
const withNewer = (newer: Partial<ISpec>): IProtocol => ({
    ...protocol,
    firmware: { "1.0.3": complete, "1.0.4": { ...complete, ...newer } as ISpec },
});
const lackingTone = withNewer({ commands: commandsWithoutTone as ISpec["commands"] });

describe.each(Object.keys(protocol.firmware))("Using missingFromSpec on the recorded firmware %s", (version) => {
    test("then nothing the page sends should be missing", () => {
        expect(missingFromSpec(protocol.firmware[version] as ISpec)).toEqual([]);
    });
});

describe("Using missingFromSpec, when a spec has no Tone command", () => {
    test("then it should name it", () => {
        expect(missingFromSpec(lackingTone.firmware["1.0.4"] as ISpec)).toEqual(["commands.tone"]);
    });
});

describe("Using missingFromSpec, when a spec has no Cue 2 bus", () => {
    test("then it should name it", () => {
        const buses = { monitor: [0, 1], cue1: [2, 3] } as ISpec["mixBuses"];
        expect(missingFromSpec({ ...complete, mixBuses: buses })).toEqual(["mixBuses.cue2"]);
    });
});

describe("Using specFor, when the firmware's own spec is missing a command", () => {
    test("then it should fall back to the newest complete one", () => {
        expect(specFor("1.0.4", lackingTone).version).toBe("1.0.3");
    });

    test("then it shouldn't count as an exact match", () => {
        expect(specFor("1.0.4", lackingTone).isExact).toBe(false);
    });
});

describe("Using specFor, when the firmware isn't recorded", () => {
    test("then it should choose the newest recorded one", () => {
        expect(specFor("9.9.9", withNewer({})).version).toBe("1.0.4");
    });
});

describe("Using compareVersions, when a part has two digits", () => {
    test("then it should compare it as a number", () => {
        expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    });
});
