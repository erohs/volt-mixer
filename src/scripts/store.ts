import type { IStripView } from "../lib/strip-groups.ts";
import type { ISavedMix } from "../lib/saved-mix.ts";

/*
 * Browser storage, per Volt serial. Storage can be unavailable (private windows, blocked site
 * data), so every access is guarded and the page works without it, just without memory.
 */

const prefix = "volt-mixer";
const mixKey = (serial: string): string => `${prefix}.mix.${serial || "unknown"}`;
const pendingKey = `${prefix}.pending-mix`;
const viewKey = `${prefix}.view`;

const read = (key: string): unknown => {
    try {
        const text = localStorage.getItem(key);
        return text === null ? null : (JSON.parse(text) as unknown);
    } catch {
        return null;
    }
};

const write = (key: string, value: unknown): void => {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* Storage unavailable: the page still works, it just won't remember. */
    }
};

export const loadMix = (serial: string): unknown => read(mixKey(serial));
export const saveMix = (serial: string, mix: ISavedMix | null): void => write(mixKey(serial), mix);

/** A mix opened from a link before the Volt connected; applied once it does. */
export const loadPendingMix = (): unknown => read(pendingKey);
export const savePendingMix = (mix: unknown): void => write(pendingKey, mix);

export type IViewPreferences = IStripView;

/** Digital inputs start hidden and the loopback channel shown, as in Console. */
export const loadView = (): IViewPreferences => {
    const view = read(viewKey) as Partial<IViewPreferences> | null;
    return { isDigitalShown: view?.isDigitalShown === true, isLoopbackShown: view?.isLoopbackShown !== false };
};

export const saveView = (view: IViewPreferences): void => write(viewKey, view);
