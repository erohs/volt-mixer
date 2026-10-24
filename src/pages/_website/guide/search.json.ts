import type { APIRoute } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { render } from "astro:content";
import { getContainerRenderer } from "@astrojs/mdx/container-renderer";
import { guideHref } from "../../../lib/guide-nav.ts";
import { sectionsOf } from "../../../lib/guide-search.ts";
import { guideComponents, guideEntries } from "./_entries.ts";

/*
 * The guide's search index: every page's content, rendered without its layout and cut into its
 * sections as plain text (src/lib/guide-search.ts).
 */
export const GET: APIRoute = async () => {
    const base = import.meta.env.BASE_URL;
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const pages = await Promise.all(
        (await guideEntries()).map(async (page) => {
            const { Content } = await render(page.entry);
            const html = await container.renderToString(Content, { props: { components: guideComponents } });
            return sectionsOf(page.title, guideHref(page.slug, base), html);
        }),
    );
    return new Response(JSON.stringify(pages.flat()), { headers: { "Content-Type": "application/json" } });
};
