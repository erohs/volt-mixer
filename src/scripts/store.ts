import type { IStripView } from "../lib/strip-groups.ts";
import type { ISavedMix } from "../lib/saved-mix.ts";
import { isTheme, type Theme } from "./theme.ts";

/*
 * Browser storage, per Volt serial. Storage can be unavailable (private windows, blocked site
 * data), so every access is guarded and the page works without it, just without memory.
 */

const prefix = "volt-mixer";
const mixKey = (serial: string): string => `${prefix}.mix.${serial || "unknown"}`;
const pendingKey = `${prefix}.pending-mix`;
const viewKey = `${prefix}.view`;
const themeKey = `${prefix}.theme`;
const trayKey = `${prefix}.tray`;
/** Settings older versions kept that nothing reads any more. */
const retiredKeys = [`${prefix}.app-sync`];

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

/** The saved mix. Version 0.2.0 saved it dated (`{ mix, changedAt }`) for syncing with the website. */
export const loadMix = (serial: string): unknown => {
    const saved = read(mixKey(serial));
    const isDated = typeof saved === "object" && saved !== null && "mix" in saved && "changedAt" in saved;
    return isDated ? (saved as { mix: unknown }).mix : saved;
};

/** Saves the mix if it differs from what's saved; null forgets it. */
export const saveMix = (serial: string, mix: ISavedMix | null): void => {
    if (mix === null || JSON.stringify(loadMix(serial)) !== JSON.stringify(mix)) write(mixKey(serial), mix);
};

/** A mix opened from a link before the Volt connected; applied once it does. */
export const loadPendingMix = (): unknown => read(pendingKey);
export const savePendingMix = (mix: unknown): void => write(pendingKey, mix);
/** Another tab kept a mix from a link (a storage event; this tab's own writes don't fire one). */
export const isPendingMixChange = (event: StorageEvent): boolean => event.key === pendingKey && event.newValue !== null;

/** Digital inputs start hidden and the loopback channel shown, as in Console. */
export const loadView = (): IStripView => {
    const view = read(viewKey) as Partial<IStripView> | null;
    return { isDigitalShown: view?.isDigitalShown === true, isLoopbackShown: view?.isLoopbackShown !== false };
};

export const saveView = (view: IStripView): void => write(viewKey, view);

/** public/theme.js reads this key too, before the page's script loads. */
export const loadTheme = (): Theme => {
    const theme = read(themeKey);
    return isTheme(theme) ? theme : "system";
};

export const saveTheme = (theme: Theme): void => write(themeKey, theme === "system" ? null : theme);

/** The tray mixer rows the viewer has unticked; everything else shows, including new ones. */
export const loadTrayHidden = (): string[] => {
    const hidden = read(trayKey);
    return Array.isArray(hidden) ? hidden.filter((key): key is string => typeof key === "string") : [];
};

export const saveTrayHidden = (hidden: string[]): void => write(trayKey, hidden.length > 0 ? hidden : null);

export const clearRetiredSettings = (): void => retiredKeys.forEach((key) => write(key, null));
