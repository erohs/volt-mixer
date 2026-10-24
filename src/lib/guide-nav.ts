/*
 * The guide's order. Each page (src/content/guide) names its group and its place in it in its front
 * matter; this sorts them into the sidebar's groups and the previous and next links.
 */

/** The sidebar's groups, in order. A page naming any other fails the build (src/content.config.ts). */
export const guideGroupTitles = ["Start here", "The mixer", "Beyond this computer", "Help"] as const;

export type GuideGroupTitle = (typeof guideGroupTitles)[number];

export interface IGuidePage {
    /** The page's folder under guide/; "" for the overview. */
    slug: string;
    /** Its name in the sidebar, the previous and next links and search. */
    title: string;
    group: GuideGroupTitle;
    /** Its place in its group, from 1. */
    order: number;
}

export interface IGuideGroup<T extends IGuidePage = IGuidePage> {
    title: GuideGroupTitle;
    pages: T[];
}

/** A page's slug from its file's id: "index" is the overview, at guide/ itself. */
export const slugOfEntry = (id: string): string => (id === "index" ? "" : id);

const positionOf = (page: IGuidePage): number => guideGroupTitles.indexOf(page.group) * 1000 + page.order;

/** The pages in reading order. Throws if the overview isn't first or two pages claim one place. */
export const orderGuide = <T extends IGuidePage>(pages: T[]): T[] => {
    const ordered = [...pages].sort((a, b) => positionOf(a) - positionOf(b));
    if (ordered[0]?.slug !== "")
        throw new Error("The guide has to start with its overview, src/content/guide/index.mdx.");
    const clash = ordered.find((page, i) => i > 0 && positionOf(page) === positionOf(ordered[i - 1]!));
    if (clash)
        throw new Error(`Two guide pages are number ${clash.order} in "${clash.group}", one is "${clash.slug}".`);
    return ordered;
};

/** The pages, in order, under their groups as the sidebar shows them. */
export const groupGuide = <T extends IGuidePage>(pages: T[]): IGuideGroup<T>[] =>
    guideGroupTitles
        .map((title) => ({ title, pages: orderGuide(pages).filter((page) => page.group === title) }))
        .filter((group) => group.pages.length > 0);

/** A page's address under the site's base ("/" in the app, "/volt-mixer/" on the website). */
export const guideHref = (slug: string, base: string): string => `${base}guide/${slug ? `${slug}/` : ""}`;

/** The pages before and after one, for the links at the foot of each page. */
export const neighboursOf = <T extends IGuidePage>(pages: T[], slug: string): { previous?: T; next?: T } => {
    const ordered = orderGuide(pages);
    const index = ordered.findIndex((page) => page.slug === slug);
    const [previous, next] = index === -1 ? [] : [ordered[index - 1], ordered[index + 1]];
    return { ...(previous && { previous }), ...(next && { next }) };
};
