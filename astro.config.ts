import fs from "node:fs";
import mdx from "@astrojs/mdx";
import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import { site } from "./src/lib/site.ts";

/*
 * Two builds of one site. The website (the default) is served from the path in its address
 * (src/lib/site.ts), "/volt-mixer/" on GitHub Pages. VOLT_TARGET=desktop is the desktop app's copy
 * (desktop/scripts/build-site.mjs), served from the root of its own app://volt scheme, without the
 * pages it opens on the website instead (desktop/src/windows.ts).
 */
const isDesktop = process.env["VOLT_TARGET"] === "desktop";
const website = new URL(site.websiteUrl);

/* Routes only the website has. Their files start with "_", so Astro doesn't route them by itself. */
const websitePages = [
    { pattern: "/guide/[...slug]", entrypoint: "./src/pages/_website/guide/[...slug].astro" },
    { pattern: "/guide/search.json", entrypoint: "./src/pages/_website/guide/search.json.ts" },
    { pattern: "/privacy", entrypoint: "./src/pages/_website/privacy.astro" },
    { pattern: "/sitemap.xml", entrypoint: "./src/pages/_website/sitemap.xml.ts" },
];
/* Files in public/ that only those pages and link previews use, left out of the app's copy. */
const websiteFiles = ["guide", "og-image.png"];

const websiteOnly = (): AstroIntegration => ({
    name: "volt-website-only",
    hooks: {
        "astro:config:setup": ({ injectRoute }) => {
            if (!isDesktop) websitePages.forEach((page) => injectRoute(page));
        },
        "astro:build:done": ({ dir }) => {
            if (!isDesktop) return;
            for (const file of websiteFiles) fs.rmSync(new URL(file, dir), { recursive: true, force: true });
        },
    },
});

export default defineConfig({
    site: website.origin,
    base: isDesktop ? "/" : website.pathname,
    trailingSlash: "always",
    /* The user guide (src/content/guide) is MDX, so its pages can use the site's components. */
    integrations: [mdx(), websiteOnly()],
    /*
     * Stylesheets stay files: the desktop app's CSP allows inline styles in attributes only
     * (desktop/src/site-files.ts), so an inlined <style> would be blocked there.
     */
    build: { format: "directory", inlineStylesheets: "never" },
    scopedStyleStrategy: "where",
    /* The toolbar injects hidden, focusable controls, so dev would no longer behave like the built site. */
    devToolbar: { enabled: false },
    compressHTML: true,
    prefetch: false,
    vite: {
        build: {
            /* One stylesheet for the page, so styles never arrive after first paint. */
            cssCodeSplit: false,
        },
    },
});
