import { minDb, panGains } from "./gain.ts";
import type { IHardwareState } from "./reports.ts";
import { busNames, type BusName, type ISpec } from "./spec.ts";

export type ChannelKind = "analog" | "digital" | "loopback";
export type CueName = "cue1" | "cue2";
export type { BusName };

export interface IChannelInfo {
    id: string;
    name: string;
    kind: ChannelKind;
    preampIndex?: number;
    toneIndex?: number;
    format?: "spdif" | "adat";
}

export interface ISend {
    db: number;
    pan: number;
    isMuted: boolean;
}

export interface IChannel {
    fader: number;
    pan: number;
    isMuted: boolean;
    isSoloed: boolean;
    cue1: ISend;
    cue2: ISend;
}

export interface ICueRouting {
    /** On: the cue's outputs carry the monitor mix. Off: the cue's own mix. */
    isMix: boolean;
    isMirroredToLine34: boolean;
}

/** Page state. Fader, pan, cue sends and cue routing are the page's own (the Volt can't report them). */
export interface IMixerState {
    channels: Record<string, IChannel>;
    linked: Record<string, boolean>;
    cues: Record<CueName, ICueRouting>;
    headphoneSource: CueName;
    /** Custom channel names (Console keeps these on the computer too); missing = the default name. */
    names: Record<string, string>;
    /** Custom tray icons (names from src/lib/channel-icons.ts); missing = the channel's default. */
    icons: Record<string, string>;
    /** True once this computer's mix has been applied to the Volt; until then no crosspoint is sent. */
    isMixOwned: boolean;
    preamp: { gain: [number, number]; phantom: [boolean, boolean] };
    tone: number[];
    monitor: { isMuted: boolean; isMono: boolean; level: number };
    headphone: { level: number; isMuted: boolean };
    device: { isClipProtected: boolean; brightness: number; digitalFormat: string };
}

const adat = [1, 2, 3, 4, 5, 6, 7, 8].map((n): IChannelInfo => ({
    id: `adat${n}`,
    name: `ADAT ${n}`,
    kind: "digital",
    format: "adat",
}));

export const channels: IChannelInfo[] = [
    { id: "in1", name: "Input 1", kind: "analog", preampIndex: 0, toneIndex: 0 },
    { id: "in2", name: "Input 2", kind: "analog", preampIndex: 1, toneIndex: 1 },
    { id: "in3", name: "Line 3", kind: "analog", toneIndex: 2 },
    { id: "in4", name: "Line 4", kind: "analog", toneIndex: 3 },
    { id: "spdifL", name: "S/PDIF L", kind: "digital", format: "spdif" },
    { id: "spdifR", name: "S/PDIF R", kind: "digital", format: "spdif" },
    ...adat,
    { id: "loopbackL", name: "Loopback L", kind: "loopback" },
    { id: "loopbackR", name: "Loopback R", kind: "loopback" },
];
export const channelById: Record<string, IChannelInfo> = Object.fromEntries(channels.map((c) => [c.id, c]));

export const pairs: [string, string][] = [
    ["in1", "in2"],
    ["in3", "in4"],
    ["spdifL", "spdifR"],
    ["adat1", "adat2"],
    ["adat3", "adat4"],
    ["adat5", "adat6"],
    ["adat7", "adat8"],
    ["loopbackL", "loopbackR"],
];
/** The analog pairs: bit 0 and bit 1 of the Volt's link mask. */
export const hardwarePairs: [string, string][] = [pairs[0] as [string, string], pairs[1] as [string, string]];
export const buses: readonly BusName[] = busNames;
const analogIds = channels.filter((c) => c.kind === "analog").map((c) => c.id);

export const pairKey = (pair: [string, string]): string => pair.join("-");
export const pairOf = (id: string): [string, string] | undefined => pairs.find((pair) => pair.includes(id));
export const isLinked = (state: IMixerState, id: string): boolean => {
    const pair = pairOf(id);
    return Boolean(pair && state.linked[pairKey(pair)]);
};

/** Channel names are at most 24 UTF-16 units, like the name field's maxlength. */
export const maxNameLength = 24;

/** A name trimmed and cut to the limit, never inside an emoji (a surrogate pair). */
export const trimName = (name: string): string => {
    let result = "";
    for (const character of name.trim()) {
        if (result.length + character.length > maxNameLength) break;
        result += character;
    }
    return result;
};

const silentSend = (): ISend => ({ db: minDb, pan: 0, isMuted: false });

/** Console's default session: every channel at 0 dB, centred; analog inputs muted; loopback on. */
export const defaultChannel = (info: IChannelInfo): IChannel => ({
    fader: 0,
    pan: 0,
    isMuted: info.kind !== "loopback",
    isSoloed: false,
    cue1: silentSend(),
    cue2: silentSend(),
});

export const defaultState = (): IMixerState => {
    const state: IMixerState = {
        channels: Object.fromEntries(channels.map((c) => [c.id, defaultChannel(c)])),
        linked: { "loopbackL-loopbackR": true },
        cues: { cue1: { isMix: true, isMirroredToLine34: false }, cue2: { isMix: true, isMirroredToLine34: false } },
        headphoneSource: "cue1",
        names: {},
        icons: {},
        isMixOwned: false,
        preamp: { gain: [0, 0], phantom: [false, false] },
        tone: [0, 0, 0, 0],
        monitor: { isMuted: false, isMono: false, level: 0 },
        headphone: { level: 79.6, isMuted: false },
        device: { isClipProtected: true, brightness: 217, digitalFormat: "adat" },
    };
    panPair(state, ["loopbackL", "loopbackR"], true);
    return state;
};

const panPair = (state: IMixerState, [a, b]: [string, string], isLinkedNow: boolean): void => {
    const left = state.channels[a];
    const right = state.channels[b];
    if (!left || !right) return;
    const [leftPan, rightPan] = isLinkedNow ? [-1, 1] : [0, 0];
    left.pan = left.cue1.pan = left.cue2.pan = leftPan;
    right.pan = right.cue1.pan = right.cue2.pan = rightPan;
};

/** The quieter of two sends: the lower level, muted if either side is. Pan is set by the link. */
const quieterSend = (a: ISend, b: ISend): ISend => ({
    db: Math.min(a.db, b.db),
    pan: a.pan,
    isMuted: a.isMuted || b.isMuted,
});

/**
 * Gives a linked pair's two sides the quieter side's mix, so a link can only turn things down:
 * the lower fader and sends, muted if either side is. Solo follows either side, so linking never
 * ends a solo (which would bring every other channel back).
 */
export const matchQuieterMix = (state: IMixerState, [a, b]: [string, string]): void => {
    const left = state.channels[a];
    const right = state.channels[b];
    if (!left || !right) return;
    const fader = Math.min(left.fader, right.fader);
    const [isMuted, isSoloed] = [left.isMuted || right.isMuted, left.isSoloed || right.isSoloed];
    const [cue1, cue2] = [quieterSend(left.cue1, right.cue1), quieterSend(left.cue2, right.cue2)];
    for (const side of [left, right])
        Object.assign(side, { fader, isMuted, isSoloed, cue1: { ...cue1 }, cue2: { ...cue2 } });
};

/**
 * Inputs 1/2 just linked (on the page, or with the Volt's INPUT button): both preamps take the
 * lower gain. Not on connecting to a pair that was already linked. Other pairs have no preamp.
 */
export const matchQuieterGain = (state: IMixerState, [a, b]: [string, string]): void => {
    const [first, second] = [channelById[a]?.preampIndex, channelById[b]?.preampIndex];
    if (first === undefined || second === undefined) return;
    const gain = Math.min(state.preamp.gain[first] ?? 0, state.preamp.gain[second] ?? 0);
    state.preamp.gain[first] = state.preamp.gain[second] = gain;
};

/**
 * Links or unlinks a pair. Linking gives both sides the quieter side's mix (preamp gain is matched
 * separately, by matchQuieterGain); tone is never shared, as In 2 could be a different source.
 */
export const setLinked = (state: IMixerState, pair: [string, string], isOn: boolean): void => {
    if (!state.channels[pair[0]] || !state.channels[pair[1]]) return;
    state.linked[pairKey(pair)] = isOn;
    if (isOn) matchQuieterMix(state, pair);
    panPair(state, pair, isOn);
};

/**
 * Adopts what the Volt reports. Links first, so the hardware's own mutes win. Returns the pairs whose
 * link changed; the preamp gain the Volt reports wins too, so for a pair that just linked the caller
 * matches its gains afterwards (matchQuieterGain), once the reported gains count as sent.
 */
export const applyHardwareState = (state: IMixerState, hardware: IHardwareState): [string, string][] => {
    const changed = hardwarePairs.filter(
        (pair, i) => Boolean(state.linked[pairKey(pair)]) !== Boolean(hardware.linkMask & (1 << i)),
    );
    for (const pair of changed) setLinked(state, pair, !state.linked[pairKey(pair)]);
    analogIds.forEach((id, i) => {
        const channel = state.channels[id];
        if (channel) channel.isMuted = !(hardware.directMask & (1 << i));
    });
    state.preamp = { gain: [...hardware.preampGain], phantom: [...hardware.phantom] };
    state.tone = [...hardware.tone];
    state.monitor = { ...hardware.monitor };
    state.headphone = { ...hardware.headphone };
    state.device = {
        isClipProtected: hardware.isClipProtected,
        brightness: hardware.brightness,
        digitalFormat: hardware.digitalFormat,
    };
    return changed;
};

const monitorSend = (info: IChannelInfo, channel: IChannel, isSoloActive: boolean): ISend => {
    // Analog mute is the Volt's Direct flag; digital and loopback mutes are a silent crosspoint.
    const isOff = (info.kind !== "analog" && channel.isMuted) || (isSoloActive && !channel.isSoloed);
    return { db: channel.fader, pan: channel.pan, isMuted: isOff };
};

/** Linear gain of every channel leg into every bus ("source:destination"); empty until the mix is owned. */
export const crosspointTable = (state: IMixerState, spec: ISpec): Map<string, number> => {
    const table = new Map<string, number>();
    if (!state.isMixOwned) return table;
    const isSoloActive = channels.some((c) => state.channels[c.id]?.isSoloed);
    for (const info of channels) {
        const channel = state.channels[info.id];
        const source = spec.sources[info.id];
        if (!channel || source === undefined) continue;
        for (const bus of buses) {
            const send = bus === "monitor" ? monitorSend(info, channel, isSoloActive) : channel[bus];
            const [gainLeft, gainRight] = panGains(send.isMuted ? minDb : Math.min(send.db, spec.faderMaxDb), send.pan);
            const [left, right] = spec.mixBuses[bus];
            table.set(`${source}:${left}`, gainLeft);
            table.set(`${source}:${right}`, gainRight);
        }
    }
    return table;
};

/** What the Volt reports about itself, as page state: compared to tell whether a reading changed anything. */
export const voltSettings = (state: IMixerState): unknown => ({
    links: hardwareLinkMask(state),
    direct: directMask(state),
    preamp: state.preamp,
    tone: state.tone,
    monitor: state.monitor,
    headphone: state.headphone,
    device: state.device,
});

export const hardwareLinkMask = (state: IMixerState): number =>
    hardwarePairs.reduce((mask, pair, i) => mask | (state.linked[pairKey(pair)] ? 1 << i : 0), 0);

export const directMask = (state: IMixerState): number =>
    analogIds.reduce((mask, id, i) => mask | (state.channels[id]?.isMuted ? 0 : 1 << i), 0);

export const phantomMask = (state: IMixerState): number =>
    state.preamp.phantom.reduce((mask, isOn, i) => mask | (isOn ? 1 << i : 0), 0);

/** What feeds the headphones and Line Out 3/4, from the cue routing. Keys are spec.routeSources names. */
export const routeSources = (state: IMixerState): { headphone: string; line34: string } => {
    const sourceOf = (cue: CueName): string => (state.cues[cue].isMix ? "monitorMix" : `${cue}Mix`);
    const mirrored = (["cue1", "cue2"] as const).find((cue) => state.cues[cue].isMirroredToLine34);
    return { headphone: sourceOf(state.headphoneSource), line34: mirrored ? sourceOf(mirrored) : "playback34" };
};
