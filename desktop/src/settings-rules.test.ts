import { describe, expect, test } from "vitest";
import { clean, defaults } from "./settings-rules";

describe("Using clean, when a change has a key the app doesn't know", () => {
    test("then it should drop it", () => {
        expect(clean({ runScript: "calc.exe" }, defaults)).toEqual(defaults);
    });
});

describe("Using clean, when a switch is given a string", () => {
    test("then it should keep the setting as it was", () => {
        expect(clean({ phoneRemote: "true" }, defaults).phoneRemote).toBe(false);
    });
});

describe("Using clean, when the phone address isn't an IPv4 address", () => {
    test("then it should keep the address as it was", () => {
        expect(clean({ phoneAddress: "evil.example" }, defaults).phoneAddress).toBe("");
    });
});

describe("Using clean, when the file isn't an object", () => {
    test("then it should fall back to the defaults", () => {
        expect(clean(null, defaults)).toEqual(defaults);
    });
});
