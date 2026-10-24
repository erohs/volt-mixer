import type { APIRoute } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { getCollection, render } from "astro:content";
import { getContainerRenderer } from "@astrojs/mdx/container-renderer";
import { guideHref, guidePages } from "../../lib/guide-nav.ts";
import { sectionsOf } from "../../lib/guide-search.ts";

/*
 * The guide's search index: every page's content, rendered without its layout and cut into its
 * sections as plain text (src/lib/guide-search.ts).
 */
export const GET: APIRoute = async () => {
    const base = import.meta.env.BASE_URL;
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const entries = await getCollection("guide");
    const pages = await Promise.all(
        guidePages.map(async (page) => {
            const entry = entries.find((candidate) => candidate.id === (page.slug || "index"));
            if (!entry) throw new Error(`The guide lists "${page.slug}", but src/content/guide has no such page.`);
            const { Content } = await render(entry);
            return sectionsOf(page.title, guideHref(page.slug, base), await container.renderToString(Content));
        }),
    );
    return new Response(JSON.stringify(pages.flat()), { headers: { "Content-Type": "application/json" } });
};
