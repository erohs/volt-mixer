import type { APIRoute } from "astro";

/* Two pages, so a hand-written sitemap rather than a dependency. Submitted in Search Console. */
export const GET: APIRoute = ({ site }) => {
    const pageUrl = new URL(import.meta.env.BASE_URL, site).href;
    const privacyUrl = new URL("privacy/", pageUrl).href;
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `<url><loc>${pageUrl}</loc></url>`,
        `<url><loc>${privacyUrl}</loc></url>`,
        "</urlset>",
        "",
    ].join("\n");
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });
};
