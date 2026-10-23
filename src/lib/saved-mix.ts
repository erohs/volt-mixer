import { isChannelIcon } from "./channel-icons.ts";
import { minDb } from "./gain.ts";
import { decodeMixCode } from "./mix-code.ts";
import { channels, defaultChannel, hardwarePairs, pairs, pairKey, setLinked, trimName } from "./mixer.ts";
import type { CueName, IChannel, ICueRouting, IMixerState, ISend } from "./mixer.ts";

/** The page-owned part of the mix: what is saved per computer and carried by a mix link. */
export interface ISavedMix {
    version: 1;
    channels: Record<string, Omit<IChannel, "isSoloed">>;
    names: Record<string, string>;
    /** Added later than the rest: older links and saved mixes have none. */
    icons: Record<string, string>;
    linked: Record<string, boolean>;
    cues: Record<CueName, ICueRouting>;
    headphoneSource: CueName;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamped = (value: unknown, low: number, high: number, fallback: number): number =>
    isFiniteNumber(value) ? Math.max(low, Math.min(high, value)) : fallback;
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const readSend = (value: unknown, fallback: ISend, maxDb: number): ISend => {
    const send = record(value);
    return {
        db: clamped(send["db"], minDb, maxDb, fallback.db),
        pan: clamped(send["pan"], -1, 1, fallback.pan),
        isMuted: flag(send["isMuted"], fallback.isMuted),
    };
};

const readChannel = (value: unknown, fallback: IChannel, maxDb: number): IChannel => {
    const channel = record(value);
    return {
        fader: clamped(channel["fader"], minDb, maxDb, fallback.fader),
        pan: clamped(channel["pan"], -1, 1, fallback.pan),
        isMuted: flag(channel["isMuted"], fallback.isMuted),
        isSoloed: false,
        cue1: readSend(channel["cue1"], fallback.cue1, maxDb),
        cue2: readSend(channel["cue2"], fallback.cue2, maxDb),
    };
};

const readCue = (value: unknown): ICueRouting => {
    const cue = record(value);
    return { isMix: flag(cue["isMix"], true), isMirroredToLine34: flag(cue["isMirroredToLine34"], false) };
};

/** The saved mix from page state. Solo is never saved: the other computer shouldn't inherit it. */
export const toSavedMix = (state: IMixerState): ISavedMix => ({
    version: 1,
    channels: Object.fromEntries(
        Object.entries(state.channels).map(([id, { isSoloed: _isSoloed, ...rest }]) => [id, structuredClone(rest)]),
    ),
    names: { ...state.names },
    icons: { ...state.icons },
    linked: { ...state.linked },
    cues: structuredClone(state.cues),
    headphoneSource: state.headphoneSource,
});

/** Applies untrusted saved data (storage or a link) to state: every field validated and clamped. */
export const applySavedMix = (state: IMixerState, value: unknown, maxDb: number): void => {
    const saved = record(value);
    const savedChannels = record(saved["channels"]);
    for (const info of channels) {
        state.channels[info.id] = readChannel(savedChannels[info.id], defaultChannel(info), maxDb);
    }
    const linked = record(saved["linked"]);
    for (const pair of pairs)
        state.linked[pairKey(pair)] = flag(linked[pairKey(pair)], Boolean(state.linked[pairKey(pair)]));
    const cues = record(saved["cues"]);
    state.cues = { cue1: readCue(cues["cue1"]), cue2: readCue(cues["cue2"]) };
    state.headphoneSource = saved["headphoneSource"] === "cue2" ? "cue2" : "cue1";
    state.names = readNames(saved["names"]);
    state.icons = readIcons(saved["icons"]);
};

const readNames = (value: unknown): Record<string, string> => {
    const names: Record<string, string> = {};
    for (const [id, name] of Object.entries(record(value))) {
        if (typeof name === "string" && channels.some((c) => c.id === id) && name.trim()) {
            names[id] = trimName(name);
        }
    }
    return names;
};

const readIcons = (value: unknown): Record<string, string> => {
    const icons: Record<string, string> = {};
    for (const [id, icon] of Object.entries(record(value))) {
        if (channels.some((c) => c.id === id) && isChannelIcon(icon)) icons[id] = icon;
    }
    return icons;
};

/**
 * Takes a saved mix as the page's own, keeping what the Volt itself reports: analog mutes (its
 * Direct flags) and the analog pairs' link state. Afterwards the whole mix can be pushed.
 */
export const adoptSavedMix = (state: IMixerState, value: unknown, maxDb: number): void => {
    const analogMutes = channels
        .filter((c) => c.kind === "analog")
        .map((c) => [c.id, state.channels[c.id]?.isMuted] as const);
    const hardwareLinks = hardwarePairs.map((pair) => [pair, Boolean(state.linked[pairKey(pair)])] as const);
    applySavedMix(state, value, maxDb);
    for (const [pair, isLinkedOnVolt] of hardwareLinks) {
        if (Boolean(state.linked[pairKey(pair)]) !== isLinkedOnVolt) setLinked(state, pair, isLinkedOnVolt, false);
    }
    for (const [id, isMuted] of analogMutes) {
        const channel = state.channels[id];
        if (channel && isMuted !== undefined) channel.isMuted = isMuted;
    }
    state.isMixOwned = true;
};

const toBase64Url = (text: string): string =>
    btoa(String.fromCharCode(...new TextEncoder().encode(text)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");

const fromBase64Url = (code: string): string => {
    const binary = atob(code.replaceAll("-", "+").replaceAll("_", "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

/** A mix as a URL-safe code, for the `#mix=` link that carries it to another computer. */
export const encodeMix = (mix: ISavedMix): string => toBase64Url(JSON.stringify(mix));

/** Decodes a mix code; null when it isn't one. */
export const decodeMix = (code: string): unknown => {
    try {
        return JSON.parse(fromBase64Url(code));
    } catch {
        return null;
    }
};

/** The mix in a link's address: `#m=` (short) or `#mix=` (older links); null when there's none. */
export const mixFromHash = (hash: string): unknown => {
    const short = hash.match(/^#m=([\w-]+)$/)?.[1];
    if (short) return decodeMixCode(short);
    const long = hash.match(/^#mix=([\w-]+)$/)?.[1];
    return long ? decodeMix(long) : null;
};
