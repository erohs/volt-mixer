import type { APIRoute } from "astro";
import { guideHref, guidePages } from "../lib/guide-nav.ts";

/* A few pages, so a hand-written sitemap rather than a dependency. Submitted in Search Console. */
export const GET: APIRoute = ({ site }) => {
    const pageUrl = new URL(import.meta.env.BASE_URL, site).href;
    const urls = [
        pageUrl,
        ...guidePages.map((page) => new URL(guideHref(page.slug, import.meta.env.BASE_URL), site).href),
        new URL("privacy/", pageUrl).href,
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
