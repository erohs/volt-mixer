import { clipDb, meterFill, peakFallDbPerSecond } from "../lib/meters.ts";

/*
 * Draws the meters from the Volt's 50-per-second meter reports, with a falling peak and clip hold.
 * At most one frame per report, never one per screen refresh (a 240 Hz screen would draw five times
 * as often for nothing), and none at all once every meter has settled: the Volt sends reports in
 * silence too. Each meter is written only when it changes, and nothing is drawn while no one can
 * see the page (volt-session.ts).
 */

const clipHoldMs = 2000;
const shown = new Map<string, number>();
const clippedUntil = new Map<string, number>();
/** What each meter element last showed, so an unchanged one isn't written again. */
const written = new WeakMap<HTMLElement, string>();
let frame = 0;
let drawnAt = performance.now();
/** Something on a meter was still lit at the last frame: a peak falling, or a clip light to put out. */
let isLit = false;

/** Writes one meter; true while it still has something to show (a level, or a clip light). */
const drawMeter = (meter: HTMLElement, name: string, now: number): boolean => {
    const fill = meterFill(shown.get(name) ?? -Infinity);
    const isClipped = (clippedUntil.get(name) ?? 0) > now;
    const text = `${fill.toFixed(3)}:${isClipped}`;
    if (written.get(meter) !== text) {
        written.set(meter, text);
        meter.style.setProperty("--meter-level", fill.toFixed(3));
        meter.toggleAttribute("data-clipped", isClipped);
    }
    return fill > 0 || isClipped;
};

/** The held peaks fall at the same speed however often frames are drawn. */
const fallPeaks = (now: number): void => {
    const fall = (peakFallDbPerSecond * Math.min(now - drawnAt, 100)) / 1000;
    for (const [name, db] of shown) shown.set(name, db - fall);
    drawnAt = now;
};

const draw = (now: number): void => {
    frame = 0;
    isLit = false;
    for (const meter of document.querySelectorAll<HTMLElement>("[data-meter]")) {
        const name = meter.dataset["meter"] ?? "";
        if (name && drawMeter(meter, name, now)) isLit = true;
    }
    fallPeaks(now);
};

/** New peak levels in dBFS, by meter name: drawn in the next frame, if anything is (or was) lit. */
export const showMeterLevels = (levels: Record<string, number>): void => {
    const now = performance.now();
    let hasLevel = isLit;
    for (const [name, db] of Object.entries(levels)) {
        if (db > (shown.get(name) ?? -Infinity)) shown.set(name, db);
        if (db >= clipDb) clippedUntil.set(name, now + clipHoldMs);
        if (meterFill(db) > 0) hasLevel = true;
    }
    if (hasLevel) frame ||= requestAnimationFrame(draw);
};

/** Empties every meter (disconnected, or shown again after a while unseen). */
export const resetMeters = (): void => {
    shown.clear();
    clippedUntil.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    drawnAt = performance.now();
    draw(drawnAt);
};
