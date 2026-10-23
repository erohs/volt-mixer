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
const appSyncKey = `${prefix}.app-sync`;

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

/** A saved mix and when it last changed (ms since 1970), to tell which copy is newer. */
export interface IMixEntry {
    mix: unknown;
    changedAt: number;
}

/** Older saves are the mix alone; they count as changed long ago, so any dated copy wins. */
export const loadMixEntry = (serial: string): IMixEntry | null => {
    const saved = read(mixKey(serial)) as Record<string, unknown> | null;
    if (saved === null) return null;
    const isDated = typeof saved === "object" && "mix" in saved && typeof saved["changedAt"] === "number";
    return isDated ? { mix: saved["mix"], changedAt: saved["changedAt"] as number } : { mix: saved, changedAt: 0 };
};

export const loadMix = (serial: string): unknown => loadMixEntry(serial)?.mix ?? null;

/** Saves the mix, dated now if it differs from what's saved; true when it did. null forgets it. */
export const saveMix = (serial: string, mix: ISavedMix | null): boolean => {
    if (mix === null) return (write(mixKey(serial), null), true);
    if (JSON.stringify(loadMix(serial)) === JSON.stringify(mix)) return false;
    write(mixKey(serial), { mix, changedAt: Date.now() });
    return true;
};

/** Saves a mix that came from elsewhere with its own date, so the two copies agree on it. */
export const saveMixAt = (serial: string, mix: ISavedMix, changedAt: number): void =>
    write(mixKey(serial), { mix, changedAt });

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

/** Website only: whether to keep the mix in step with the desktop app on this computer. */
export const loadAppSync = (): boolean => read(appSyncKey) === true;
export const saveAppSync = (isOn: boolean): void => write(appSyncKey, isOn ? true : null);
