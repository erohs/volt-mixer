import type { ISpec } from "./spec.ts";

/** The API's "off": any fader at or below this is silent. */
export const minDb = -144;

const f32 = Math.fround;

/**
 * Linear gain into the left and right legs for a fader (dB) and an equal-power pan (−1…+1).
 * UA's software works in float32 and truncates; doing the same reproduces its bytes exactly.
 */
export const panGains = (db: number, pan = 0): [number, number] => {
    if (db <= minDb) return [0, 0];
    const linear = f32(10 ** (db / 20));
    const angle = ((pan + 1) * Math.PI) / 4;
    return [f32(linear * f32(Math.cos(angle))), f32(linear * f32(Math.sin(angle)))];
};

/** Crosspoint value on the wire: linear gain × 2^29, clamped to u32. */
export const crosspointValue = (spec: ISpec, linear: number): number =>
    Math.max(0, Math.min(0xffffffff, Math.trunc(linear * spec.gainUnity)));
