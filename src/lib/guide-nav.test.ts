import { describe, expect, test } from "vitest";
import { groupGuide, guideHref, neighboursOf, orderGuide, slugOfEntry, type IGuidePage } from "./guide-nav.ts";

/* Out of order on purpose, as a collection may list them. */
const pages: IGuidePage[] = [
    { slug: "troubleshooting", title: "Troubleshooting", group: "Help", order: 1 },
    { slug: "getting-started", title: "Getting started", group: "Start here", order: 2 },
    { slug: "channels", title: "Channels", group: "The mixer", order: 1 },
    { slug: "", title: "Overview", group: "Start here", order: 1 },
];

describe("Using orderGuide, when the pages come in any order", () => {
    test("then it should put them in reading order, group by group", () => {
        expect(orderGuide(pages).map((page) => page.slug)).toEqual([
            "",
            "getting-started",
            "channels",
            "troubleshooting",
        ]);
    });
});

describe("Using orderGuide, when the overview isn't first", () => {
    test("then it should refuse the guide", () => {
        expect(() => orderGuide(pages.filter((page) => page.slug !== ""))).toThrow(/overview/);
    });
});

describe("Using orderGuide, when two pages claim one place", () => {
    test("then it should refuse the guide", () => {
        expect(() => orderGuide([...pages, { slug: "faq", title: "FAQ", group: "Help", order: 1 }])).toThrow(/"Help"/);
    });
});

describe("Using groupGuide, when a group has no pages", () => {
    test("then it should leave that group out", () => {
        expect(groupGuide(pages).map((group) => group.title)).toEqual(["Start here", "The mixer", "Help"]);
    });
});

describe("Using groupGuide, when a group has pages", () => {
    test("then it should list them in order", () => {
        expect(groupGuide(pages)[0]?.pages.map((page) => page.slug)).toEqual(["", "getting-started"]);
    });
});

describe("Using slugOfEntry, when the file is the overview", () => {
    test("then it should give the guide's own folder", () => {
        expect(slugOfEntry("index")).toBe("");
    });
});

describe("Using slugOfEntry, when the file is any other page", () => {
    test("then it should give its own name", () => {
        expect(slugOfEntry("channels")).toBe("channels");
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

describe("Using neighboursOf, when the page is the first", () => {
    test("then it should have nothing before it", () => {
        expect(neighboursOf(pages, "").previous).toBeUndefined();
    });
});

describe("Using neighboursOf, when the page is in the middle", () => {
    test("then it should link the pages either side, across groups", () => {
        const { previous, next } = neighboursOf(pages, "channels");
        expect([previous?.slug, next?.slug]).toEqual(["getting-started", "troubleshooting"]);
    });
});

describe("Using neighboursOf, when the page isn't in the guide", () => {
    test("then it should have no neighbours", () => {
        expect(neighboursOf(pages, "nowhere")).toEqual({});
    });
});
