import { applySavedMix, toSavedMix } from "../lib/saved-mix.ts";
import { defaultState } from "../lib/mixer.ts";
import { newestSpec } from "../lib/spec.ts";
import { app, hooks } from "./app-state.ts";
import { loadMixEntry, saveMixAt } from "./store.ts";

/*
 * Keeping the desktop app's and the website's copies of a mix in step on one computer: the copy
 * changed most recently wins. Used by both sides (app-sync.ts on the website, the app's handler).
 */

const isSameMix = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Untrusted input, validated the same way as a mix link. */
const validated = (mix: unknown) => {
    const state = defaultState();
    applySavedMix(state, mix, newestSpec().faderMaxDb);
    return toSavedMix(state);
};

/**
 * Takes `mix` for the Volt `serial` if it's newer than this copy and differs from it. The Volt
 * this page has gets it straight away; another Volt's is kept for when that one connects.
 */
export const acceptNewerMix = (serial: string, mix: unknown, changedAt: number): boolean => {
    const local = loadMixEntry(serial);
    if (!Number.isFinite(changedAt) || (local && changedAt <= local.changedAt)) return false;
    const incoming = validated(mix);
    if (local && isSameMix(validated(local.mix), incoming)) return (saveMixAt(serial, incoming, changedAt), false);
    if (serial === app.serial && app.isHardwareKnown) hooks.adoptMix(incoming);
    saveMixAt(serial, serial === app.serial && app.state.isMixOwned ? toSavedMix(app.state) : incoming, changedAt);
    return true;
};
