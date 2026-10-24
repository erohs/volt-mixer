import type { APIRoute } from "astro";
import { guideHref } from "../../lib/guide-nav.ts";
import { site, websiteUrlOf } from "../../lib/site.ts";
import { guideEntries } from "./guide/_entries.ts";

/* A few pages, so a hand-written sitemap rather than a dependency. Submitted in Search Console. */
export const GET: APIRoute = async () => {
    const base = import.meta.env.BASE_URL;
    const urls = [
        site.websiteUrl,
        ...(await guideEntries()).map((page) => websiteUrlOf(guideHref(page.slug, base), base)),
        websiteUrlOf(`${base}${site.privacyPath}`, base),
    ];
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((url) => `<url><loc>${url}</loc></url>`),
        "</urlset>",
        "",
    ].join("\n");
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });
};
