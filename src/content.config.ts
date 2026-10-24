import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { guideGroupTitles } from "./lib/guide-nav.ts";

/* The user guide: one MDX file per page, placed in the sidebar by its group and order. */
const guide = defineCollection({
    loader: glob({ pattern: "*.mdx", base: "./src/content/guide" }),
    schema: z.object({
        title: z.string(),
        /** Its name in the sidebar, the previous and next links and search, when shorter than the title. */
        navTitle: z.string().optional(),
        description: z.string(),
        lead: z.string(),
        group: z.enum(guideGroupTitles),
        /** Its place in its group, from 1 (src/lib/guide-nav.ts). */
        order: z.number().int().positive(),
    }),
});

export const collections = { guide };
