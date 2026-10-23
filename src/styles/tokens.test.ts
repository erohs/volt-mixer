import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/* Every text and control colour pair the page uses meets WCAG 2.2 AA, in both themes. */

/* The main :root block only; the prefers-contrast block below it maps tokens onto others. */
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8").split("@media")[0] ?? "";

const themeColours = (theme: 0 | 1): Record<string, string> => {
    const colours: Record<string, string> = {};
    for (const [, name = "", value = ""] of css.matchAll(/--(color-[\w-]+):\s*([^;]+);/g)) {
        const pair = value.match(/light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/i);
        colours[name] = pair ? (pair[1 + theme] ?? "") : value.trim();
    }
    return colours;
};

const luminance = (hex: string): number => {
    const channel = (i: number): number => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

const contrast = (a: string, b: string): number => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (lighter + 0.05) / (darker + 0.05);
};

/** [foreground, background, minimum ratio]: 4.5 for text, 3 for controls and graphics (1.4.11). */
const pairs: [string, string, number][] = [
    ["text-primary", "background-page", 4.5],
    ["text-primary", "background-surface", 4.5],
    ["text-secondary", "background-page", 4.5],
    ["text-secondary", "background-surface", 4.5],
    ["text-primary", "background-raised", 4.5],
    ["text-secondary", "background-raised", 4.5],
    ["border", "background-raised", 3],
    ["text-secondary", "background-raised", 3],
    ["text-accent", "background-surface", 4.5],
    ["text-on-accent", "background-accent", 4.5],
    ["text-on-danger", "background-danger", 4.5],
    ["text-on-solo", "background-solo", 4.5],
    ["text-success", "background-surface", 4.5],
    ["text-warning", "background-surface", 4.5],
    ["background-danger", "background-surface", 4.5],
    ["text-primary", "background-warning", 4.5],
    ["border", "background-surface", 3],
    ["border", "background-page", 3],
    ["border-solo", "background-surface", 3],
    ["background-accent", "background-surface", 3],
    ["background-danger", "background-surface", 3],
    ["focus", "background-surface", 3],
    ["focus", "background-page", 3],
    ["focus", "background-raised", 3],
    ["focus", "background-track", 3],
    ["background-accent", "background-raised", 3],
    ["background-accent", "background-track", 3],
    ["fader-warmth", "background-track", 3],
    ["fader-focus", "background-track", 3],
    ["fader-shine", "background-track", 3],
    ["fader-warmth", "background-surface", 3],
    ["fader-focus", "background-surface", 3],
    ["fader-shine", "background-surface", 3],
    ["meter-safe", "background-track", 3],
    ["meter-caution", "background-track", 3],
    ["meter-danger", "background-track", 3],
    ["text-on-tone", "tone-warmth", 4.5],
    ["text-on-tone", "tone-focus", 4.5],
    ["text-on-tone", "tone-shine", 4.5],
    ["monitor", "background-surface", 3],
    ["headphone", "background-surface", 3],
];

describe.each([
    ["light", 0],
    ["dark", 1],
] as const)("Using the %s theme's colour tokens", (_name, theme) => {
    const colours = themeColours(theme);
    test.each(pairs)("then --color-%s on --color-%s should reach %s:1", (foreground, background, minimum) => {
        expect(
            contrast(colours[`color-${foreground}`] ?? "", colours[`color-${background}`] ?? ""),
        ).toBeGreaterThanOrEqual(minimum);
    });
});
