import { describe, expect, test } from "vitest";
import { applyDeviceReport } from "./device-report.ts";
import { defaultState } from "./mixer.ts";

describe("Using applyDeviceReport, when the Volt reports Direct on for Line 3 only", () => {
    test("then it should unmute Line 3 and mute Line 4", () => {
        const state = defaultState();
        applyDeviceReport(state, { type: "direct", mask: 0b0100 });
        expect([state.channels["in3"]?.isMuted, state.channels["in4"]?.isMuted]).toEqual([false, true]);
    });
});

describe("Using applyDeviceReport, when the headphone knob turns", () => {
    test("then it should take the headphone level", () => {
        const state = defaultState();
        applyDeviceReport(state, { type: "headphone", level: 77.6, isMuted: false });
        expect(state.headphone.level).toBe(77.6);
    });
});

describe("Using applyDeviceReport, when the report is a link change", () => {
    test("then it should leave it to the state dump", () => {
        expect(applyDeviceReport(defaultState(), { type: "links", mask: 2 })).toBe(false);
    });
});
