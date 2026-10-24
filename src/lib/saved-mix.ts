import { isChannelIcon } from "./channel-icons.ts";
import { minDb } from "./gain.ts";
import { clamp, isFiniteNumber } from "./numbers.ts";
import {
    channels,
    defaultChannel,
    hardwarePairs,
    isAlwaysLinked,
    isChannelId,
    pairs,
    pairKey,
    setLinked,
    trimName,
} from "./mixer.ts";
import type { ChannelId, CueName, IChannel, ICueRouting, IMixerState, ISend } from "./mixer.ts";

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

const clamped = (value: unknown, low: number, high: number, fallback: number): number =>
    isFiniteNumber(value) ? clamp(value, low, high) : fallback;
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
    for (const pair of pairs) {
        const isOn = isAlwaysLinked(pair) || flag(linked[pairKey(pair)], Boolean(state.linked[pairKey(pair)]));
        // Linking evens out a saved pair whose sides differ (the quieter wins) and sets its pans.
        if (isOn) setLinked(state, pair, true);
        else state.linked[pairKey(pair)] = false;
    }
    const cues = record(saved["cues"]);
    state.cues = { cue1: readCue(cues["cue1"]), cue2: readCue(cues["cue2"]) };
    state.headphoneSource = saved["headphoneSource"] === "cue2" ? "cue2" : "cue1";
    state.names = readNames(saved["names"]);
    state.icons = readIcons(saved["icons"]);
};

const readNames = (value: unknown): Partial<Record<ChannelId, string>> => {
    const names: Partial<Record<ChannelId, string>> = {};
    for (const [id, name] of Object.entries(record(value))) {
        if (isChannelId(id) && typeof name === "string" && name.trim()) names[id] = trimName(name);
    }
    return names;
};

const readIcons = (value: unknown): Partial<Record<ChannelId, string>> => {
    const icons: Partial<Record<ChannelId, string>> = {};
    for (const [id, icon] of Object.entries(record(value))) {
        if (isChannelId(id) && isChannelIcon(icon)) icons[id] = icon;
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
        if (Boolean(state.linked[pairKey(pair)]) !== isLinkedOnVolt) setLinked(state, pair, isLinkedOnVolt);
    }
    for (const [id, isMuted] of analogMutes) {
        const channel = state.channels[id];
        if (channel && isMuted !== undefined) channel.isMuted = isMuted;
    }
    state.isMixOwned = true;
};
