import { describe, expect, test } from "vitest";
import { createOtherProgram, otherProgramWindowMs } from "./other-program.ts";

const withReadings = (...times: number[]) => {
    const other = createOtherProgram();
    times.forEach(other.note);
    return other;
};

describe("Using createOtherProgram, when one unasked-for reading arrives", () => {
    test("then it should not count as another program", () => {
        expect(withReadings(1000).isOpen(1000)).toBe(false);
    });
});

describe("Using createOtherProgram, when two arrive 1.5 s apart", () => {
    test("then it should count as another program", () => {
        expect(withReadings(1000, 2500).isOpen(2500)).toBe(true);
    });
});

describe("Using createOtherProgram, when two arrive further apart than the window", () => {
    test("then it should not count as another program", () => {
        expect(withReadings(1000, 1000 + otherProgramWindowMs).isOpen(1000 + otherProgramWindowMs)).toBe(false);
    });
});

describe("Using createOtherProgram, when the readings stop", () => {
    test("then it should stop counting once the window has passed", () => {
        expect(withReadings(1000, 2500).isOpen(2500 + otherProgramWindowMs)).toBe(false);
    });
});

describe("Using createOtherProgram, when it's told to forget", () => {
    test("then earlier readings should no longer count", () => {
        const other = withReadings(1000, 2500);
        other.forget();
        expect(other.isOpen(2500)).toBe(false);
    });
});
