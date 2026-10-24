/*
 * Searching the guide. At build time each page is cut into its sections (src/pages/guide/search.json.ts);
 * in the browser a query ranks them (src/scripts/guide-search.ts). Plain text in, plain text out.
 */

export interface IGuideSection {
    /** The page's title. */
    page: string;
    /** The section's heading; the page's title for the text before its first one. */
    heading: string;
    url: string;
    text: string;
}

export interface IGuideResult extends IGuideSection {
    snippet: string;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " };

/** Text from HTML: tags dropped, entities decoded, white space collapsed. */
export const textOf = (html: string): string =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&(#?\w+);/g, (match, name: string) => entities[name] ?? match)
        .replace(/\s+/g, " ")
        .replace(/ ([,.;:!?)])/g, "$1")
        .trim();

/** A page's sections, split at its h2 headings, which carry ids to link to. */
export const sectionsOf = (page: string, url: string, html: string): IGuideSection[] => {
    const parts = html.split(/<h2 id="([^"]+)"[^>]*>(.*?)<\/h2>/);
    const sections: IGuideSection[] = [{ page, heading: page, url, text: textOf(parts[0] ?? "") }];
    for (let i = 1; i + 2 <= parts.length; i += 3) {
        const [id = "", heading = "", body = ""] = parts.slice(i, i + 3);
        sections.push({ page, heading: textOf(heading), url: `${url}#${id}`, text: textOf(body) });
    }
    return sections.filter((section) => section.text || section.heading !== page);
};

/** The words of a query, lower case. */
export const termsOf = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Finds the terms where a word starts, so "mix" finds "mixer" but not "remix". The browser
 * highlights with the same pattern (src/scripts/guide-search.ts).
 */
export const termPattern = (terms: string[]): RegExp => {
    const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})`, "giu");
};

const countOf = (text: string, term: string): number => text.match(termPattern([term]))?.length ?? 0;

/** How well a section matches: a heading counts most, then the page, then how often the text says it. */
const scoreOf = (section: IGuideSection, terms: string[]): number => {
    const scores = terms.map((term) => {
        const [heading, page, text] = [section.heading, section.page, section.text].map((part) => countOf(part, term));
        return (heading ? 10 : 0) + (page ? 4 : 0) + Math.min(text ?? 0, 5);
    });
    return scores.every((score) => score > 0) ? scores.reduce((sum, score) => sum + score, 0) : 0;
};

/** A short piece of the text around the first term it has, cut between words, with … where it's cut. */
export const snippetOf = (text: string, terms: string[], radius = 70): string => {
    const at = text.search(termPattern(terms));
    const from = Math.max(0, at - radius);
    const start = from === 0 ? 0 : text.indexOf(" ", from) + 1;
    const to = Math.min(text.length, Math.max(at, 0) + radius * 2);
    const end = to === text.length ? to : text.lastIndexOf(" ", to);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
};

/** The sections that have every word of the query, best first. */
export const searchGuide = (sections: IGuideSection[], query: string, limit = 12): IGuideResult[] => {
    const terms = termsOf(query);
    if (terms.length === 0) return [];
    return sections
        .map((section) => ({ section, score: scoreOf(section, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ section }) => ({ ...section, snippet: snippetOf(section.text, terms) }));
};
