import { describe, expect, test } from "vitest";
import { bytesToBase64Url } from "./base64url.ts";
import { encodeMixCode } from "./mix-code.ts";
import { isMixHash, mixFromHash, parseMixLink } from "./mix-links.ts";
import { defaultState } from "./mixer.ts";
import { toSavedMix } from "./saved-mix.ts";

const base = "https://naovixen.github.io/volt-mixer/";
const mix = (() => {
    const state = defaultState();
    state.channels.in3.fader = -7.5;
    return toSavedMix(state);
})();
const longCode = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(mix)));

describe("Using mixFromHash, when the link is an older #mix= one", () => {
    test("then it should still read it", () => {
        expect(mixFromHash(`#mix=${longCode}`)).toEqual(mix);
    });
});

describe("Using mixFromHash, when an older link's code is garbage", () => {
    test("then it should give null", () => {
        expect(mixFromHash("#mix=%%%")).toBeNull();
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

describe.each(["https://", "http://[", "", "not a link"])("Using parseMixLink on the malformed text %j", (text) => {
    test("then it should give null rather than throw", () => {
        expect(parseMixLink(text, base)).toBeNull();
    });
});

describe("Using parseMixLink, when a pasted link has spaces round it", () => {
    test("then it should still read the mix", () => {
        expect(parseMixLink(`  ${base}#m=${encodeMixCode(mix)} `)).not.toBeNull();
    });
});

describe("Using parseMixLink, when the link is only the address part", () => {
    test("then it should read it against the base", () => {
        expect(parseMixLink(`#m=${encodeMixCode(mix)}`, base)).not.toBeNull();
    });
});
