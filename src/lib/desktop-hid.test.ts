import { describe, expect, test } from "vitest";
import { desktopHid } from "./desktop-hid.ts";
import { protocol, specFor, type ISpec } from "./spec.ts";

const complete = specFor("1.0.3").spec;

describe("Using desktopHid on the recorded protocol", () => {
    test("then it should dim the Volt 4 Gen 2 to raw 1 with the brightness command", () => {
        const [reportId, cmd, raw] = desktopHid().dimReports["46"] ?? [];
        expect([reportId, cmd, raw]).toEqual([complete.reports.command.id, complete.commands.brightness, 1]);
    });
});

describe("Using desktopHid, when two firmwares would dim with different reports", () => {
    test("then it should refuse rather than pick one", () => {
        const newer = { ...complete, commands: { ...complete.commands, brightness: 99 } } as ISpec;
        expect(() => desktopHid({ ...protocol, firmware: { "1.0.3": complete, "1.0.4": newer } })).toThrow();
    });
});
