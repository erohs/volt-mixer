import { clipDb, meterFill, peakFallDb } from "../lib/meters.ts";

/* Draws the meters from the Volt's 50-per-second meter reports, with a falling peak and clip hold. */

const clipHoldMs = 2000;
const shown = new Map<string, number>();
const clippedUntil = new Map<string, number>();
let frame = 0;

const draw = (): void => {
    frame = 0;
    const now = performance.now();
    for (const meter of document.querySelectorAll<HTMLElement>("[data-meter]")) {
        const name = meter.dataset["meter"] ?? "";
        if (!name) continue;
        const db = shown.get(name) ?? -Infinity;
        meter.style.setProperty("--meter-level", meterFill(db).toFixed(3));
        meter.toggleAttribute("data-clipped", (clippedUntil.get(name) ?? 0) > now);
        shown.set(name, db - peakFallDb);
    }
};

/** New peak levels in dBFS, by meter name. */
export const showMeterLevels = (levels: Record<string, number>): void => {
    const now = performance.now();
    for (const [name, db] of Object.entries(levels)) {
        shown.set(name, Math.max(db, shown.get(name) ?? -Infinity));
        if (db >= clipDb) clippedUntil.set(name, now + clipHoldMs);
    }
    frame ||= requestAnimationFrame(draw);
};

export const resetMeters = (): void => {
    shown.clear();
    clippedUntil.clear();
    draw();
};
