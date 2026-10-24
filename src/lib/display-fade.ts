import { brightnessModel } from "./slider-models.ts";

/*
 * Dimming the Volt's display while its computer sleeps or shuts down (the desktop app does it).
 * Dimmed is raw 1: it looks off, and no slider position or UA setting gives it (the
 * slider's 1% is raw 8), so a page that later finds it knows Volt Mixer dimmed the display and
 * fades it back up, on whichever computer the KVM switch connects.
 */

export const dimmedBrightness = 1;
/** UA's default (raw), as a new Volt has it; what a page fades back to when it remembers nothing else. */
export const defaultBrightness = 217;

export const isDimmed = (raw: number): boolean => raw === dimmedBrightness;

/** The levels a fade from `from` to `to` passes through, in steps that look the same size; ends on `to`. */
export const fadeLevels = (from: number, to: number, steps: number): number[] => {
    const model = brightnessModel();
    const start = model.toPosition(from);
    const end = model.toPosition(to);
    const between = Array.from({ length: steps - 1 }, (_, i) =>
        model.fromPosition(start + ((end - start) * (i + 1)) / steps),
    );
    return [...between, to];
};
