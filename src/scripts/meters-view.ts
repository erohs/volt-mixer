import { clipDb, meterFill, peakFallDbPerSecond } from "../lib/meters.ts";

/*
 * Draws the meters from the Volt's 50-per-second meter reports, with a falling peak and clip hold.
 * The Volt sends them in silence too, so a frame is drawn only while something on a meter moves
 * (a level above the floor, a peak falling, a clip light to put out), and each meter is written
 * only when it changes. Nothing is drawn while no one can see the page (volt-session.ts).
 */

const clipHoldMs = 2000;
const shown = new Map<string, number>();
const clippedUntil = new Map<string, number>();
/** What each meter element last showed, so an unchanged one isn't written again. */
const written = new WeakMap<HTMLElement, string>();
let frame = 0;
let drawnAt = 0;

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

/** The held peaks fall at the same speed on any screen, however many frames it draws. */
const fallPeaks = (now: number): void => {
    const fall = (peakFallDbPerSecond * Math.min(now - drawnAt, 100)) / 1000;
    for (const [name, db] of shown) shown.set(name, db - fall);
    drawnAt = now;
};

const draw = (now: number): void => {
    frame = 0;
    let isMoving = false;
    for (const meter of document.querySelectorAll<HTMLElement>("[data-meter]")) {
        const name = meter.dataset["meter"] ?? "";
        if (name && drawMeter(meter, name, now)) isMoving = true;
    }
    fallPeaks(now);
    if (isMoving) frame = requestAnimationFrame(draw);
};

const drawSoon = (): void => {
    if (frame) return;
    drawnAt = performance.now();
    frame = requestAnimationFrame(draw);
};

/** New peak levels in dBFS, by meter name. */
export const showMeterLevels = (levels: Record<string, number>): void => {
    const now = performance.now();
    let hasNews = false;
    for (const [name, db] of Object.entries(levels)) {
        if (db > (shown.get(name) ?? -Infinity)) shown.set(name, db);
        if (db >= clipDb) clippedUntil.set(name, now + clipHoldMs);
        if (meterFill(db) > 0) hasNews = true;
    }
    if (hasNews) drawSoon();
};

/** Empties every meter (disconnected, or shown again after a while unseen). */
export const resetMeters = (): void => {
    shown.clear();
    clippedUntil.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    draw(performance.now());
};
