import { getCollection, type CollectionEntry } from "astro:content";
import Callout from "../../../components/guide/Callout.astro";
import Cards from "../../../components/guide/Cards.astro";
import Compare from "../../../components/guide/Compare.astro";
import Faq from "../../../components/guide/Faq.astro";
import Flow from "../../../components/guide/Flow.astro";
import NumberedList from "../../../components/guide/NumberedList.astro";
import Parts from "../../../components/guide/Parts.astro";
import Shot from "../../../components/guide/Shot.astro";
import Table from "../../../components/guide/Table.astro";
import WebsiteLink from "../../../components/guide/WebsiteLink.astro";
import { orderGuide, slugOfEntry, type IGuidePage } from "../../../lib/guide-nav.ts";

/*
 * The guide's pages (src/content/guide), in order, and what their MDX is drawn with: every page,
 * its search index and the sitemap read them from here.
 */

export interface IGuideEntry extends IGuidePage {
    entry: CollectionEntry<"guide">;
}

/** Every page in reading order; the build fails if the overview is missing or two pages share a place. */
export const guideEntries = async (): Promise<IGuideEntry[]> => {
    const entries = await getCollection("guide");
    return orderGuide(
        entries.map((entry) => ({
            slug: slugOfEntry(entry.id),
            title: entry.data.navTitle ?? entry.data.title,
            group: entry.data.group,
            order: entry.data.order,
            entry,
        })),
    );
};

/** The pages' own blocks, so MDX files need no imports, and how their tables and numbered lists are drawn. */
export const guideComponents = {
    Callout,
    Cards,
    Compare,
    Faq,
    Flow,
    Parts,
    Shot,
    WebsiteLink,
    table: Table,
    ol: NumberedList,
};
