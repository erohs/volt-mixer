import type { ISpec } from "./spec.ts";

export interface IIdentity {
    vendorId: number;
    productId: number;
    version: string;
    serial: string;
}

/** Everything the Volt reports about itself in its state dump. Fader and pan positions aren't in it. */
export interface IHardwareState {
    phantom: [boolean, boolean];
    digitalFormat: string;
    linkMask: number;
    directMask: number;
    monitor: { isMuted: boolean; level: number; isMono: boolean };
    preampGain: [number, number];
    headphone: { level: number; isMuted: boolean };
    isClipProtected: boolean;
    brightness: number;
    tone: number[];
}

/** A front-panel change or other report, decoded. `type` says which fields are set. */
export type DeviceReport =
    | { type: "state"; data: Uint8Array }
    | { type: "direct"; mask: number }
    | { type: "monitorMute"; isMuted: boolean }
    | { type: "monitorLevel"; level: number }
    | { type: "headphone"; level: number; isMuted: boolean }
    | { type: "tone"; tones: number[] }
    | { type: "phantom"; mask: number }
    | { type: "preampGain"; channel: number; db: number }
    | { type: "mono"; isOn: boolean }
    | { type: "clipProtection"; isOn: boolean }
    | { type: "brightness"; raw: number }
    | { type: "digitalFormat"; format: string }
    | { type: "links"; mask: number }
    | { type: "panel"; field: number; value: number }
    | { type: "unknown"; cmd: number };

const byte = (data: Uint8Array, i: number): number => data[i] ?? 0;
const u16 = (data: Uint8Array, i: number): number => byte(data, i) | (byte(data, i + 1) << 8);

/** Identify reply (report 0x0E): VID, PID, bcdDevice (BCD major, minor/patch nibbles), ASCII serial. */
export const parseIdentify = (data: Uint8Array): IIdentity => {
    const high = byte(data, 5);
    const low = byte(data, 4);
    const version = `${(high >> 4) * 10 + (high & 0xf)}.${low >> 4}.${low & 0xf}`;
    let serial = "";
    for (let i = 6; i < data.length && byte(data, i) >= 0x30 && byte(data, i) <= 0x7a; i++) {
        serial += String.fromCharCode(byte(data, i));
    }
    return { vendorId: u16(data, 0), productId: u16(data, 2), version, serial };
};

const muteWordReport = (spec: ISpec, data: Uint8Array): DeviceReport => {
    const field = byte(data, 7);
    const value = (name: string): number => byte(data, 1 + (spec.muteWordOffsets[name] ?? 0));
    if (field === spec.muteWordFields["direct"]) return { type: "direct", mask: value("direct") };
    if (field === spec.muteWordFields["monitorMute"])
        return { type: "monitorMute", isMuted: value("monitorMute") === 1 };
    if (field === spec.muteWordFields["monitorLevel"]) {
        return { type: "monitorLevel", level: value("monitorLevel") / spec.monitorLevelPerUnit };
    }
    return { type: "unknown", cmd: byte(data, 0) };
};

const panelReport = (spec: ISpec, data: Uint8Array): DeviceReport =>
    byte(data, 1) === spec.linkState.field
        ? { type: "links", mask: byte(data, 2) & 0x0f }
        : { type: "panel", field: byte(data, 1), value: byte(data, 2) };

/** Decodes a command-format report from the Volt (`data` starts at the command byte). */
export const parseCommandReport = (spec: ISpec, data: Uint8Array): DeviceReport => {
    const c = spec.commands;
    const cmd = byte(data, 0);
    const decoders: Record<number, () => DeviceReport> = {
        [c["stateRequest"] ?? -1]: () => ({ type: "state", data }),
        [c["muteWord"] ?? -1]: () => muteWordReport(spec, data),
        [c["headphone"] ?? -1]: () => ({
            type: "headphone",
            level: u16(data, 1) / spec.headphoneLevelScale,
            isMuted: byte(data, 3) === 1,
        }),
        [c["tone"] ?? -1]: () => ({ type: "tone", tones: toneNibbles(byte(data, 1), byte(data, 2)) }),
        [c["phantomMask"] ?? -1]: () => ({ type: "phantom", mask: byte(data, 1) }),
        [c["preampGain"] ?? -1]: () => ({
            type: "preampGain",
            channel: byte(data, 1),
            db: u16(data, 2) / spec.preampGainStepsPerDb,
        }),
        [c["monitorMono"] ?? -1]: () => ({ type: "mono", isOn: byte(data, 2) === 1 }),
        [c["clipProtection"] ?? -1]: () => ({ type: "clipProtection", isOn: byte(data, 1) === 1 }),
        [c["brightness"] ?? -1]: () => ({ type: "brightness", raw: byte(data, 1) }),
        [c["digitalFormat"] ?? -1]: () => ({
            type: "digitalFormat",
            format: spec.digitalFormat[byte(data, 1)] ?? "adat",
        }),
        [c["panelState"] ?? -1]: () => panelReport(spec, data),
    };
    return decoders[cmd]?.() ?? { type: "unknown", cmd };
};

const toneNibbles = (first: number, second: number): number[] => [first & 0xf, first >> 4, second & 0xf, second >> 4];

/** State dump (reply to the state request): `data` starts at the command byte. */
export const parseState = (spec: ISpec, data: Uint8Array): IHardwareState => {
    const layout = spec.stateLayout;
    const at = (offset: number): number => byte(data, 1 + offset);
    const word = (offset: number): number => u16(data, 1 + offset);
    const [gain1 = 0, gain2 = 0] = layout.preampGainU16;
    const [tone1 = 0, tone2 = 0] = layout.toneNibbles;
    return {
        phantom: [Boolean(at(layout.phantomMask) & 1), Boolean(at(layout.phantomMask) & 2)],
        digitalFormat: spec.digitalFormat[at(layout.digitalFormat)] ?? "adat",
        linkMask: at(layout.linkMask) & 0x0f,
        directMask: at(layout.directMask),
        monitor: {
            isMuted: at(layout.monitorMute) === 1,
            level: at(layout.monitorLevel) / spec.monitorLevelPerUnit,
            isMono: at(layout.monitorMono) === 1,
        },
        preampGain: [word(gain1) / spec.preampGainStepsPerDb, word(gain2) / spec.preampGainStepsPerDb],
        headphone: {
            level: word(layout.headphoneLevelU16) / spec.headphoneLevelScale,
            isMuted: at(layout.headphoneMute) === 1,
        },
        isClipProtected: at(layout.clipProtection) === 1,
        brightness: at(layout.brightness),
        tone: toneNibbles(at(tone1), at(tone2)),
    };
};

/** Meter report (0xF1, `data` after the report ID): dBFS per named meter; −Infinity when silent. */
export const parseMeters = (spec: ISpec, data: Uint8Array): Record<string, number> => {
    const meters = spec.reports.meters;
    const levels: Record<string, number> = {};
    for (const [name, offset] of Object.entries(meters.offsets)) {
        // Bit 15 is a flag, not level (seen on Input 1's preamp meter); the level is the low 15 bits.
        const value = u16(data, offset - 1) & 0x7fff;
        levels[name] = value ? 20 * Math.log10(Math.min(value, meters.fullScale) / meters.fullScale) : -Infinity;
    }
    return levels;
};
