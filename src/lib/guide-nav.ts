/* The guide's pages (src/pages/guide), in reading order, grouped as the sidebar shows them. */

export interface IGuidePage {
    /** The page's folder under guide/; "" for the overview. */
    slug: string;
    title: string;
}

export interface IGuideGroup {
    title: string;
    pages: IGuidePage[];
}

export const guideGroups: IGuideGroup[] = [
    {
        title: "Start here",
        pages: [
            { slug: "", title: "Overview" },
            { slug: "getting-started", title: "Getting started" },
            { slug: "your-mix", title: "Your mix" },
        ],
    },
    {
        title: "The mixer",
        pages: [
            { slug: "channels", title: "Channels" },
            { slug: "channel-settings", title: "Channel settings" },
            { slug: "outputs", title: "Outputs and cues" },
            { slug: "sliders", title: "Sliders and keys" },
            { slug: "settings", title: "Settings" },
        ],
    },
    {
        title: "Beyond this computer",
        pages: [
            { slug: "other-computers", title: "Other computers" },
            { slug: "desktop-app", title: "Desktop app" },
            { slug: "your-phone", title: "Your phone" },
        ],
    },
    {
        title: "Help",
        pages: [
            { slug: "use-cases", title: "Use cases" },
            { slug: "troubleshooting", title: "Troubleshooting" },
        ],
    },
];

export const guidePages: IGuidePage[] = guideGroups.flatMap((group) => group.pages);

/** A page's address under the site's base ("/" locally, "/volt-mixer/" on GitHub Pages). */
export const guideHref = (slug: string, base: string): string => `${base}guide/${slug ? `${slug}/` : ""}`;

/** The page an address shows, from the part after guide/. */
export const slugOf = (pathname: string): string => pathname.replace(/^.*\/guide\/?/, "").replace(/\/$/, "");

/** The pages before and after one, for the links at the foot of each page. */
export const neighboursOf = (slug: string): { previous?: IGuidePage; next?: IGuidePage } => {
    const index = guidePages.findIndex((page) => page.slug === slug);
    const [previous, next] = index === -1 ? [] : [guidePages[index - 1], guidePages[index + 1]];
    return { ...(previous && { previous }), ...(next && { next }) };
};
