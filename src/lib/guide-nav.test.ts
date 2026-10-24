import { describe, expect, test } from "vitest";
import { guideHref, guidePages, neighboursOf, slugOf } from "./guide-nav.ts";

describe("Using guidePages, when the guide is listed", () => {
    test("then it should start with the overview", () => {
        expect(guidePages[0]?.slug).toBe("");
    });
});

describe("Using guidePages, when every page is listed", () => {
    test("then no two pages should share a folder", () => {
        expect(new Set(guidePages.map((page) => page.slug)).size).toBe(guidePages.length);
    });
});

describe("Using guideHref, when the site is served from a folder", () => {
    test("then it should put the page under it", () => {
        expect(guideHref("channels", "/volt-mixer/")).toBe("/volt-mixer/guide/channels/");
    });
});

describe("Using guideHref, when the page is the overview", () => {
    test("then it should link to the guide's folder", () => {
        expect(guideHref("", "/")).toBe("/guide/");
    });
});

describe("Using slugOf, when the address is a page under a base folder", () => {
    test("then it should give the page's folder", () => {
        expect(slugOf("/volt-mixer/guide/channels/")).toBe("channels");
    });
});

describe("Using slugOf, when the address is the overview", () => {
    test("then it should give the overview's empty slug", () => {
        expect(slugOf("/guide/")).toBe("");
    });
});

describe("Using neighboursOf, when the page is the first", () => {
    test("then it should have nothing before it", () => {
        expect(neighboursOf("").previous).toBeUndefined();
    });
});

describe("Using neighboursOf, when the page is in the middle", () => {
    test("then it should link the pages either side", () => {
        const { previous, next } = neighboursOf("your-mix");
        expect([previous?.slug, next?.slug]).toEqual(["getting-started", "channels"]);
    });
});

describe("Using neighboursOf, when the page isn't in the guide", () => {
    test("then it should have no neighbours", () => {
        expect(neighboursOf("nowhere")).toEqual({});
    });
});
