import { base64UrlToBytes, bytesToBase64Url } from "./base64url.ts";
import { channelIcons, isChannelIcon } from "./channel-icons.ts";
import { minDb } from "./gain.ts";
import { channels, defaultChannel, pairKey, pairs, trimName, type IChannel, type ISend } from "./mixer.ts";
import type { ISavedMix } from "./saved-mix.ts";

/*
 * The short form of a mix, for `#m=` links and QR codes: a few dozen bytes instead of JSON.
 * Only channels that differ from Console's defaults are written. Levels are rounded down, so a
 * link can never make anything louder than it was. The order of `channels`, `pairs` and
 * `channelIcons` is part of the format: new icons go at the end, and any reorder needs a new
 * version.
 *
 *   version (u8 = 2)
 *   mask (u16): bit i set = channels[i] follows
 *   per channel: fader (i16, 0.1 dB), pan (i16, 1/10000),
 *                flags (u8: mute, cue 1 mute, cue 2 mute, cue 1 follows, cue 2 follows),
 *                then each cue that follows: send (i16) and pan (i16); a cue that's silent and
 *                centred, as most are, isn't written
 *   links (u8): bit i = pairs[i] linked
 *   routing (u8): cue 1 mix, cue 2 mix, cue 1 to Line 3/4, cue 2 to Line 3/4, headphones on cue 2
 *   names: count (u8), then channel (u8), byte length (u8), UTF-8 (24 UTF-16 units at most)
 *   icons: count (u8), then channel (u8), icon (u8)
 */

const version = 2;
const silence = -1440;
const iconNames = Object.keys(channelIcons);

/** Tenths of a dB, rounded down; anything not a number, or at or below silence, is silence. */
const tenths = (db: number): number => {
    if (!Number.isFinite(db) || db <= minDb) return silence;
    return Math.max(silence, Math.min(240, Math.floor(db * 10 + 1e-6)));
};

const fromTenths = (value: number): number => (value <= silence ? minDb : value / 10);
const panSteps = (pan: number): number =>
    Number.isFinite(pan) ? Math.round(Math.max(-1, Math.min(1, pan)) * 10000) : 0;

const bit = (isOn: boolean, index: number): number => (isOn ? 1 << index : 0);

/** A cue send's two values, or null when it's silent and centred (the default, not written). */
const sendValues = (send: ISend): [number, number] | null => {
    const values: [number, number] = [tenths(send.db), panSteps(send.pan)];
    return values[0] === silence && values[1] === 0 ? null : values;
};

/** A channel as the numbers written for it: fader, pan, flags, then each cue that follows. */
const channelValues = (channel: IChannel): number[] => {
    const [cue1, cue2] = [sendValues(channel.cue1), sendValues(channel.cue2)];
    const flags =
        bit(channel.isMuted, 0) |
        bit(channel.cue1.isMuted, 1) |
        bit(channel.cue2.isMuted, 2) |
        bit(cue1 !== null, 3) |
        bit(cue2 !== null, 4);
    return [tenths(channel.fader), panSteps(channel.pan), flags, ...(cue1 ?? []), ...(cue2 ?? [])];
};

interface IWriter {
    bytes: number[];
    u8: (value: number) => void;
    i16: (value: number) => void;
}

const writer = (): IWriter => {
    const bytes: number[] = [];
    const u8 = (value: number): void => void bytes.push(value & 0xff);
    return { bytes, u8, i16: (value) => (u8(value >> 8), u8(value)) };
};

const writeChannels = (out: IWriter, mix: ISavedMix): void => {
    const listed = channels.map((info) => {
        const values = channelValues({ ...defaultChannel(info), ...mix.channels[info.id], isSoloed: false });
        const defaults = channelValues(defaultChannel(info));
        const isDefault = values.length === defaults.length && values.every((value, i) => value === defaults[i]);
        return isDefault ? null : values;
    });
    const mask = listed.reduce((bits, values, i) => bits | (values ? 1 << i : 0), 0);
    out.i16(mask);
    for (const values of listed) {
        if (!values) continue;
        const [fader, pan, flags, ...sends] = values as [number, number, number, ...number[]];
        out.i16(fader);
        out.i16(pan);
        out.u8(flags);
        sends.forEach(out.i16);
    }
};

const writeExtras = (out: IWriter, mix: ISavedMix): void => {
    out.u8(pairs.reduce((bits, pair, i) => bits | bit(Boolean(mix.linked[pairKey(pair)]), i), 0));
    const { cue1, cue2 } = mix.cues;
    out.u8(
        bit(cue1.isMix, 0) |
            bit(cue2.isMix, 1) |
            bit(cue1.isMirroredToLine34, 2) |
            bit(cue2.isMirroredToLine34, 3) |
            bit(mix.headphoneSource === "cue2", 4),
    );
    const encoder = new TextEncoder();
    const names = channels.flatMap((info, i) => {
        const name = trimName(mix.names[info.id] ?? "");
        return name ? [[i, encoder.encode(name)] as const] : [];
    });
    out.u8(names.length);
    for (const [index, bytes] of names) {
        out.u8(index);
        out.u8(bytes.length);
        bytes.forEach(out.u8);
    }
    const icons = channels.flatMap((info, i) => {
        const icon = mix.icons?.[info.id];
        return isChannelIcon(icon) ? [[i, iconNames.indexOf(icon)] as const] : [];
    });
    out.u8(icons.length);
    for (const [index, icon] of icons) {
        out.u8(index);
        out.u8(icon);
    }
};

/** A saved mix as the short code that follows `#m=`. */
export const encodeMixCode = (mix: ISavedMix): string => {
    const out = writer();
    out.u8(version);
    writeChannels(out, mix);
    writeExtras(out, mix);
    return bytesToBase64Url(out.bytes);
};

interface IReader {
    u8: () => number;
    i16: () => number;
    bytes: (length: number) => Uint8Array;
    isAtEnd: () => boolean;
}

/** Reads in order; going past the end throws (a RangeError), which decodeMixCode turns into null. */
const reader = (view: DataView): IReader => {
    let offset = 0;
    const take = (length: number): number => {
        offset += length;
        return offset - length;
    };
    return {
        u8: () => view.getUint8(take(1)),
        i16: () => view.getInt16(take(2)),
        bytes: (length) => new Uint8Array(view.buffer, view.byteOffset + take(length), length),
        isAtEnd: () => offset === view.byteLength,
    };
};

const readSend = (input: IReader, isMuted: boolean, isWritten: boolean): ISend =>
    isWritten ? { db: fromTenths(input.i16()), pan: input.i16() / 10000, isMuted } : { db: minDb, pan: 0, isMuted };

const readChannels = (input: IReader): ISavedMix["channels"] => {
    const mask = input.i16() & 0xffff;
    const result: ISavedMix["channels"] = {};
    channels.forEach((info, i) => {
        if (!(mask & (1 << i))) return;
        const fader = fromTenths(input.i16());
        const pan = input.i16() / 10000;
        const flags = input.u8();
        const cue1 = readSend(input, Boolean(flags & 2), Boolean(flags & 8));
        const cue2 = readSend(input, Boolean(flags & 4), Boolean(flags & 16));
        result[info.id] = { fader, pan, isMuted: Boolean(flags & 1), cue1, cue2 };
    });
    return result;
};

const readNames = (input: IReader): Record<string, string> => {
    const names: Record<string, string> = {};
    const decoder = new TextDecoder("utf-8", { fatal: false });
    for (let count = input.u8(); count > 0; count--) {
        const id = channels[input.u8()]?.id;
        const name = decoder.decode(input.bytes(input.u8()));
        if (id) names[id] = name;
    }
    return names;
};

const readIcons = (input: IReader): Record<string, string> => {
    const icons: Record<string, string> = {};
    for (let count = input.u8(); count > 0; count--) {
        const id = channels[input.u8()]?.id;
        const icon = iconNames[input.u8()];
        if (id && icon) icons[id] = icon;
    }
    return icons;
};

/** Reads a `#m=` code into a saved mix (still to be validated by applySavedMix); null if it isn't one. */
export const decodeMixCode = (code: string): ISavedMix | null => {
    try {
        const input = reader(new DataView(base64UrlToBytes(code).buffer));
        if (input.u8() !== version) return null;
        const mixChannels = readChannels(input);
        const linkBits = input.u8();
        const routing = input.u8();
        const mix: ISavedMix = {
            version: 1,
            channels: mixChannels,
            linked: Object.fromEntries(pairs.map((pair, i) => [pairKey(pair), Boolean(linkBits & (1 << i))])),
            cues: {
                cue1: { isMix: Boolean(routing & 1), isMirroredToLine34: Boolean(routing & 4) },
                cue2: { isMix: Boolean(routing & 2), isMirroredToLine34: Boolean(routing & 8) },
            },
            headphoneSource: routing & 16 ? "cue2" : "cue1",
            names: readNames(input),
            icons: readIcons(input),
        };
        return input.isAtEnd() ? mix : null;
    } catch {
        return null;
    }
};
