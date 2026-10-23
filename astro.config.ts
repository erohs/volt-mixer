import { defineConfig } from "astro/config";

/*
 * GitHub Pages serves the site from /<repository>/, so the deploy workflow sets BASE_PATH.
 * Locally it is served from the root.
 */
const base = process.env["BASE_PATH"] ?? "/";

export default defineConfig({
    site: process.env["SITE_ORIGIN"] ?? "http://localhost:4321",
    base,
    trailingSlash: "always",
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
