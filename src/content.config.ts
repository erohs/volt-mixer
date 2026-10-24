import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/* The user guide: one MDX file per page, ordered by src/lib/guide-nav.ts. */
const guide = defineCollection({
    loader: glob({ pattern: "*.mdx", base: "./src/content/guide" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        lead: z.string(),
    }),
});

export const collections = { guide };
