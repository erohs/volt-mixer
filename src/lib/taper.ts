import { minDb } from "./gain.ts";
import { newestSpec } from "./spec.ts";

/** The fader's top end when no Volt is connected to say: the newest recorded firmware's. */
const defaultMaxDb = (): number => newestSpec().faderMaxDb;

/**
 * Fader travel as a 0–1 position. The top 80% is linear from −40 dB to the maximum (+12 dB), the
 * bottom 20% from −80 dB down, and 0 is off. 0 dB sits at about 0.815, like a console fader.
 */
export const dbToPosition = (db: number, maxDb: number): number => {
    if (db <= minDb) return 0;
    const position = db >= -40 ? 0.2 + ((db + 40) / (maxDb + 40)) * 0.8 : Math.max(0, ((db + 80) / 40) * 0.2);
    return Math.min(1, position);
};

/** Detent: anything within this many dB of 0 snaps to exactly 0 dB. */
const detentDb = 0.6;

export const positionToDb = (position: number, maxDb: number): number => {
    if (position <= 0) return minDb;
    const db = position >= 0.2 ? -40 + ((position - 0.2) / 0.8) * (maxDb + 40) : -80 + (position / 0.2) * 40;
    if (Math.abs(db) < detentDb) return 0;
    return Math.round(db * 10) / 10;
};

/** Steps a fader by `delta` dB; from off, the first step up lands on −60 dB. */
export const stepDb = (db: number, delta: number, maxDb: number): number => {
    if (db <= minDb) return delta > 0 ? -60 : minDb;
    const next = Math.round((db + delta) * 10) / 10;
    return next < -80 ? minDb : Math.min(maxDb, next);
};

export interface ITick {
    label: string;
    position: number;
}

/** Scale marks beside a fader, placed with the same taper as the fader itself. */
export const faderTicks = (maxDb = defaultMaxDb()): ITick[] =>
    [maxDb, 6, 0, -6, -12, -20, -30, -40]
        .filter((db) => db <= maxDb)
        .map((db) => ({ label: db > 0 ? `+${db}` : `${db}`.replace("-", "−"), position: dbToPosition(db, maxDb) }))
        .concat({ label: "−∞", position: 0 });

export const formatDb = (db: number): string => {
    if (db <= minDb) return "−∞ dB";
    const sign = db > 0 ? "+" : db < 0 ? "−" : "";
    return `${sign}${Math.abs(db).toFixed(1)} dB`;
};

export const spokenDb = (db: number): string => {
    if (db <= minDb) return "off";
    const sign = db > 0 ? "plus " : db < 0 ? "minus " : "";
    return `${sign}${Math.abs(db).toFixed(1)} decibels`;
};

/** Pan as −100…+100, with a centre detent. */
export const snapPan = (percent: number): number => (Math.abs(percent) <= 3 ? 0 : Math.round(percent));

export const formatPan = (percent: number): string => {
    if (percent === 0) return "C";
    return percent < 0 ? `L${-percent}` : `R${percent}`;
};

export const spokenPan = (percent: number): string => {
    if (percent === 0) return "centre";
    return percent < 0 ? `left ${-percent}` : `right ${percent}`;
};
