import { describe, expect, test } from "vitest";
import { searchGuide, sectionsOf, snippetOf, termsOf, textOf, type IGuideSection } from "./guide-search.ts";

const html =
    '<p>Intro &amp; more.</p><h2 id="solo">Solo</h2><p>Plays only <b>soloed</b> channels.</p>' +
    '<h2 id="link">Link</h2><p>Joins a pair.</p>';

const sections: IGuideSection[] = [
    { page: "Channels", heading: "Solo", url: "/guide/channels/#solo", text: "Plays only soloed channels." },
    { page: "Channels", heading: "Link", url: "/guide/channels/#link", text: "Joins a pair; solo is kept." },
    { page: "Outputs", heading: "Mono", url: "/guide/outputs/#mono", text: "Folds the monitor mix to mono." },
];

describe("Using textOf, when the HTML has tags and entities", () => {
    test("then it should give plain text", () => {
        expect(textOf("<p>Mute &amp;  <b>solo</b></p>")).toBe("Mute & solo");
    });
});

describe("Using textOf, when a tag ends just before punctuation", () => {
    test("then it should leave no space before it", () => {
        expect(textOf("Set <b>Cue 1</b>, then <b>Cue 2</b>.")).toBe("Set Cue 1, then Cue 2.");
    });
});

describe("Using sectionsOf, when a page has text before its first heading", () => {
    test("then it should keep it as a section under the page's title", () => {
        expect(sectionsOf("Channels", "/guide/channels/", html)[0]).toEqual({
            page: "Channels",
            heading: "Channels",
            url: "/guide/channels/",
            text: "Intro & more.",
        });
    });
});

describe("Using sectionsOf, when a page has h2 headings", () => {
    test("then it should link each section to its heading", () => {
        expect(sectionsOf("Channels", "/guide/channels/", html).map((section) => section.url)).toEqual([
            "/guide/channels/",
            "/guide/channels/#solo",
            "/guide/channels/#link",
        ]);
    });
});

describe("Using sectionsOf, when a section has markup", () => {
    test("then it should keep only its text", () => {
        expect(sectionsOf("Channels", "/guide/channels/", html)[1]?.text).toBe("Plays only soloed channels.");
    });
});

describe("Using termsOf, when a query has mixed case and extra spaces", () => {
    test("then it should give its words in lower case", () => {
        expect(termsOf("  Solo   LINK ")).toEqual(["solo", "link"]);
    });
});

describe("Using searchGuide, when a word is in a heading and in another section's text", () => {
    test("then it should rank the heading first", () => {
        expect(searchGuide(sections, "solo").map((result) => result.heading)).toEqual(["Solo", "Link"]);
    });
});

describe("Using searchGuide, when only some sections have every word", () => {
    test("then it should leave the others out", () => {
        expect(searchGuide(sections, "solo pair").map((result) => result.heading)).toEqual(["Link"]);
    });
});

describe("Using searchGuide, when a word only appears inside another word", () => {
    test("then it should not match it", () => {
        expect(searchGuide(sections, "lo")).toEqual([]);
    });
});

describe("Using searchGuide, when a word starts another word", () => {
    test("then it should match it", () => {
        expect(searchGuide(sections, "mon").map((result) => result.heading)).toEqual(["Mono"]);
    });
});

describe("Using searchGuide, when the query is empty", () => {
    test("then it should find nothing", () => {
        expect(searchGuide(sections, "   ")).toEqual([]);
    });
});

describe("Using searchGuide, when there are more matches than the limit", () => {
    test("then it should give only as many as the limit", () => {
        expect(searchGuide(sections, "solo", 1)).toHaveLength(1);
    });
});

describe("Using snippetOf, when the match is deep in long text", () => {
    test("then it should cut around it and mark both cuts", () => {
        expect(snippetOf(`${"a ".repeat(100)}solo${" b".repeat(100)}`, ["solo"], 10)).toMatch(/^….*solo.*…$/);
    });
});

describe("Using snippetOf, when it cuts long text", () => {
    test("then it should cut between words", () => {
        expect(snippetOf(`${"word ".repeat(40)}solo${" word".repeat(40)}`, ["solo"], 12)).toMatch(/^…word .* word…$/);
    });
});

describe("Using snippetOf, when the text is short", () => {
    test("then it should give it whole", () => {
        expect(snippetOf("Plays only soloed channels.", ["solo"])).toBe("Plays only soloed channels.");
    });
});
