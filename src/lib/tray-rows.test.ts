import { describe, expect, test } from "vitest";
import { defaultState, setLinked } from "./mixer.ts";
import { trayChoices, trayRows } from "./tray-rows.ts";

const view = { isDigitalShown: false, isLoopbackShown: true };
const meters = new Set(["in1", "in2", "in3", "in4", "monitorL", "monitorR"]);

const linkedState = () => {
    const state = defaultState();
    setLinked(state, ["in3", "in4"], true);
    return state;
};

describe("Using trayRows, when nothing has been unticked", () => {
    test("then it should list the outputs first, then every strip on the page", () => {
        expect(trayRows(linkedState(), view, meters, []).map((row) => row.name)).toEqual([
            "Headphones",
            "Monitor",
            "Input 1",
            "Input 2",
            "Line 3/4",
            "Loopback",
        ]);
    });
});

describe("Using trayRows, when a linked pair is unticked", () => {
    test("then it should leave that pair out", () => {
        expect(trayRows(linkedState(), view, meters, ["in3-in4"]).some((row) => row.key === "in3-in4")).toBe(false);
    });
});

describe("Using trayRows, when an unticked pair is unlinked", () => {
    test("then it should leave out both of its channels", () => {
        expect(trayRows(defaultState(), view, meters, ["in3-in4"]).some((row) => row.ids.includes("in4"))).toBe(false);
    });
});

describe("Using trayRows, when a linked pair is shown", () => {
    test("then it should move both channels and show both meters", () => {
        const row = trayRows(linkedState(), view, meters, []).find((r) => r.key === "in3-in4");
        expect([row?.ids, row?.meters]).toEqual([
            ["in3", "in4"],
            ["in3", "in4"],
        ]);
    });
});

describe("Using trayRows, when Input 1 has the Warmth tone", () => {
    test("then its row should carry the tone for the fader colour", () => {
        const state = defaultState();
        state.tone[0] = 1;
        expect(trayRows(state, view, meters, []).find((row) => row.key === "in1-in2")?.tone).toBe("warmth");
    });
});

describe("Using trayChoices, when 3/4 is unlinked", () => {
    test("then it should offer one tick box naming both channels", () => {
        expect(trayChoices(defaultState(), view).find((choice) => choice.key === "in3-in4")?.name).toBe(
            "Line 3 and Line 4",
        );
    });
});
