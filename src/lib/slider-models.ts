import { minDb } from "./gain.ts";
import { clamp } from "./numbers.ts";
import { dbToPosition, formatDb, formatPan, positionToDb, snapPan, spokenDb, spokenPan, stepDb } from "./taper.ts";

/** How a slider maps its value to travel (0–1), steps with the keyboard and reads out. */
export interface ISliderModel {
    min: number;
    max: number;
    /** The value a double-click returns to. */
    rest: number;
    toPosition: (value: number) => number;
    fromPosition: (position: number) => number;
    step: (value: number, direction: 1 | -1, isLarge: boolean) => number;
    format: (value: number) => string;
    speak: (value: number) => string;
}

/** A linear slider from `min` to `max`, rounded to `stepSize`. */
const linear = (
    min: number,
    max: number,
    stepSize: number,
    largeStep: number,
    format: (v: number) => string,
): ISliderModel => {
    const round = (value: number): number => clamp(Math.round(value / stepSize) * stepSize, min, max);
    return {
        min,
        max,
        rest: min,
        toPosition: (value) => (value - min) / (max - min),
        fromPosition: (position) => round(min + position * (max - min)),
        step: (value, direction, isLarge) => round(value + direction * (isLarge ? largeStep : stepSize)),
        format,
        speak: format,
    };
};

/** A channel fader in dB, with the console taper and a 0 dB detent. End goes to 0 dB, never +12. */
export const faderModel = (maxDb = 12): ISliderModel => ({
    min: minDb,
    max: maxDb,
    rest: 0,
    toPosition: (db) => dbToPosition(db, maxDb),
    fromPosition: (position) => positionToDb(position, maxDb),
    step: (db, direction, isLarge) => stepDb(db, direction * (isLarge ? 3 : 0.5), maxDb),
    format: formatDb,
    speak: spokenDb,
});

/** Pan from −100 (left) to +100 (right), with a centre detent. */
export const panModel = (): ISliderModel => ({
    ...linear(-100, 100, 1, 10, formatPan),
    rest: 0,
    fromPosition: (position) => snapPan(-100 + position * 200),
    speak: spokenPan,
});

/** Monitor and headphone level on Console's 0–100 scale. */
export const levelModel = (): ISliderModel => linear(0, 100, 0.5, 5, (level) => level.toFixed(1));

/** Preamp gain, 0–60 dB in half-dB steps. */
export const gainModel = (): ISliderModel => ({
    ...linear(0, 60, 0.5, 3, (db) => `${db.toFixed(1)} dB`),
    speak: (db) => `${db.toFixed(1)} decibels`,
});

/** CIE lightness (0–100) of a linear light level (0–1): how bright it looks, not how much light. */
const lightness = (light: number): number => (light > 0.008856 ? 116 * Math.cbrt(light) - 16 : 903.3 * light);
const lightFromLightness = (l: number): number => (l > 8 ? ((l + 16) / 116) ** 3 : l / 903.3);

/*
 * Where the Volt's display visibly changes, in lightness, as judged on the hardware: it looks off
 * below about 20 and close to full by 80. The slider spreads that span over 1–90%, and the bright
 * end that barely changes over the last 10%.
 */
const dimmestLightness = 20;
const kneeLightness = 80;
const kneePosition = 0.9;

const lightnessAt = (position: number): number =>
    position < kneePosition
        ? dimmestLightness + (position / kneePosition) * (kneeLightness - dimmestLightness)
        : kneeLightness + ((position - kneePosition) / (1 - kneePosition)) * (100 - kneeLightness);

const positionAt = (l: number): number =>
    l < kneeLightness
        ? (Math.max(l - dimmestLightness, 0) / (kneeLightness - dimmestLightness)) * kneePosition
        : kneePosition + ((l - kneeLightness) / (100 - kneeLightness)) * (1 - kneePosition);

/** Display brightness: the raw 0–255 light level, moved in steps that look the same size. 0% is off. */
export const brightnessModel = (): ISliderModel => {
    const toPosition = (raw: number): number => (raw <= 0 ? 0 : Math.max(positionAt(lightness(raw / 255)), 0.01));
    const toRaw = (pct: number): number =>
        pct <= 0 ? 0 : clamp(Math.round(lightFromLightness(lightnessAt(Math.min(pct, 100) / 100)) * 255), 1, 255);
    const percent = (raw: number): number => Math.round(toPosition(raw) * 100);
    return {
        min: 0,
        max: 255,
        rest: 0,
        toPosition,
        fromPosition: (position) => toRaw(Math.round(position * 100)),
        step: (raw, direction, isLarge) => {
            // Several percents can share a raw level; keep going until the light changes.
            for (let pct = percent(raw) + direction * (isLarge ? 10 : 1); pct >= 0 && pct <= 100; pct += direction) {
                if (toRaw(pct) !== raw) return toRaw(pct);
            }
            return raw;
        },
        format: (raw) => `${percent(raw)}%`,
        speak: (raw) => `${percent(raw)}%`,
    };
};

/** Every slider on the page, by the `data-kind` its markup carries. */
export const sliderModels: Record<string, () => ISliderModel> = {
    fader: () => faderModel(),
    pan: panModel,
    level: levelModel,
    gain: gainModel,
    brightness: brightnessModel,
};
