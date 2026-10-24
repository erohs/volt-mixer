/** What the page says about itself in search results, link previews and the footer. */
export const site = {
    name: "Volt Mixer",
    title: "Volt Mixer: control a UA Volt 4 Gen 2 without UAD Console",
    description:
        "Free, open-source control for the Universal Audio Volt 4 Gen 2's built-in mixer: faders, cue mixes, 48V, " +
        "gain and meters in Edge or Chrome. Nothing to install.",
    imageAlt: "Volt Mixer: channel faders and meters for the UA Volt 4 Gen 2, in the browser.",
    /**
     * The website's address: the one place it's written. The build serves the website from its path
     * (astro.config.ts), and canonical links, the sitemap and the guide point here from any build.
     */
    websiteUrl: "https://naovixen.github.io/volt-mixer/",
    repositoryUrl: "https://github.com/naovixen/volt-mixer",
    releasesUrl: "https://github.com/naovixen/volt-mixer/releases",
    licenceUrl: "https://github.com/naovixen/volt-mixer/blob/main/LICENSE",
    privacyPath: "privacy/",
    guidePath: "guide/",
    /* The header's surface colour in each scheme, for the browser bar and link-preview accents. */
    themeColor: { light: "#fffefc", dark: "#201f1d" },
};

/**
 * A page's address on the website, from its path in this build, which is served from `base`
 * ("/volt-mixer/" for the website, "/" in the desktop app).
 */
export const websiteUrlOf = (pathname: string, base: string): string =>
    new URL(pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, ""), site.websiteUrl)
        .href;
