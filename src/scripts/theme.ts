import { site } from "../lib/site.ts";

/* System, Light or Dark. Every colour is a light-dark() pair, so the theme is just color-scheme. */

export type Theme = "system" | "light" | "dark";

export const isTheme = (value: unknown): value is Theme => value === "system" || value === "light" || value === "dark";

/** Sets the page's colour scheme and the browser bar colour to match. */
export const applyTheme = (theme: Theme): void => {
    if (theme === "system") delete document.documentElement.dataset["theme"];
    else document.documentElement.dataset["theme"] = theme;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        const scheme = theme === "system" ? (meta.media.includes("dark") ? "dark" : "light") : theme;
        meta.content = site.themeColor[scheme];
    }
};
