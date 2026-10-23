import { crosspointValue, panGains } from "./gain.ts";
import { clamp } from "./numbers.ts";
import type { BusName, CommandName, ISpec, MuteField } from "./spec.ts";

/** A HID output report: its report ID and the data bytes after it. */
export interface IReport {
    reportId: number;
    data: Uint8Array;
}

const u16le = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff];
const u32le = (value: number): number[] => [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
];

/** A command report: `cmd, ...payload, END`, zero-padded, sent as report `spec.reports.command.id`. */
export const command = (spec: ISpec, cmd: number, payload: number[] = []): IReport => {
    const data = new Uint8Array(spec.reports.command.bytes);
    data[0] = cmd;
    data.set(payload, 1);
    data[1 + payload.length] = spec.end;
    return { reportId: spec.reports.command.id, data };
};

const cmd = (spec: ISpec, name: CommandName): number => spec.commands[name];

export const crosspoint = (spec: ISpec, source: number, destination: number, linear: number): IReport =>
    command(spec, cmd(spec, "crosspoint"), [source, destination, ...u32le(crosspointValue(spec, linear))]);

/** Both legs of a mono source into a stereo bus. */
export const sendToBus = (spec: ISpec, source: number, bus: BusName, db: number, pan: number): IReport[] => {
    const [left, right] = spec.mixBuses[bus];
    const [gainLeft, gainRight] = panGains(db, pan);
    return [crosspoint(spec, source, left, gainLeft), crosspoint(spec, source, right, gainRight)];
};

export const route = (spec: ISpec, destination: number, source: number): IReport =>
    command(spec, cmd(spec, "route"), [destination, source, 0]);

/**
 * Routes a stereo destination ("headphone", "line34") from a stereo source ("monitorMix", "cue1Mix",
 * …). A route not recorded in the protocol data sends nothing: guessing could put the wrong signal
 * in someone's headphones.
 */
export const routePair = (spec: ISpec, destination: string, source: string): IReport[] => {
    const destinations = spec.routeDestinations[destination];
    const sources = spec.routeSources[source];
    if (!destinations || !sources) return [];
    return [route(spec, destinations[0], sources[0]), route(spec, destinations[1], sources[1])];
};

/** Whether the protocol data knows a route source (e.g. "cue2Mix" only once it's been captured). */
export const isRouteKnown = (spec: ISpec, source: string): boolean => spec.routeSources[source] !== undefined;

export const preampGain = (spec: ISpec, channel: number, db: number): IReport =>
    command(spec, cmd(spec, "preampGain"), [
        channel,
        ...u16le(Math.round(clamp(db, 0, spec.preampGainMaxDb) * spec.preampGainStepsPerDb)),
    ]);

/** Tone for all four analog inputs at once, one nibble each (0 Off … 3 Shine). */
export const tone = (spec: ISpec, tones: number[]): IReport => {
    const nibble = (i: number): number => (tones[i] ?? 0) & 0xf;
    return command(spec, cmd(spec, "tone"), [nibble(0) | (nibble(1) << 4), nibble(2) | (nibble(3) << 4), 0, 0]);
};

/**
 * Starts the Volt's own Auto-Gain on the preamps in `mask` (bit 0 = In 1, bit 1 = In 2) for
 * `seconds`. The Volt shows its progress on its display and reports the new gain when it's done.
 */
export const autoGain = (spec: ISpec, mask: number, seconds: number): IReport => {
    const { min, max } = spec.autoGainSeconds;
    return command(spec, cmd(spec, "autoGain"), [mask & 0x03, clamp(Math.round(seconds), min, max)]);
};

export const phantomMask = (spec: ISpec, mask: number): IReport => command(spec, cmd(spec, "phantomMask"), [mask]);

/**
 * One field of the mute word ("direct", "monitorMute", "monitorLevel"); the last byte names the field.
 * Monitor level is clamped at 0: turning below 0 on the hardware makes it jump loud.
 */
export const muteWord = (spec: ISpec, field: MuteField, value: number | boolean): IReport => {
    const payload = [0, 0, 0, 0, 0, 0, spec.muteWordFields[field]];
    let raw = typeof value === "boolean" ? Number(value) : value;
    if (field === "monitorLevel") raw = clamp(Math.round(raw), 0, spec.monitorLevelMax);
    payload[spec.muteWordOffsets[field]] = raw & 0xff;
    return command(spec, cmd(spec, "muteWord"), payload);
};

/** Monitor level on Console's 0–100 scale. */
export const monitorLevel = (spec: ISpec, level: number): IReport =>
    muteWord(spec, "monitorLevel", level * spec.monitorLevelPerUnit);

/** Headphone level on Console's 0–100 scale. */
export const headphone = (spec: ISpec, level: number, isMuted: boolean): IReport => {
    const raw = Math.round(clamp(level * spec.headphoneLevelScale, 0, spec.headphoneLevelMax));
    return command(spec, cmd(spec, "headphone"), [...u16le(raw), Number(isMuted)]);
};

/** Stereo-link state of the analog pairs (bit 0 = 1-2, bit 1 = 3-4), as Console sends it. */
export const linkMask = (spec: ISpec, mask: number): IReport =>
    command(spec, cmd(spec, "panelState"), [spec.linkState.field, spec.linkState.hostFlag | (mask & 0x0f)]);

export const monitorMono = (spec: ISpec, isOn: boolean): IReport =>
    command(spec, cmd(spec, "monitorMono"), [0, Number(isOn)]);
export const clipProtection = (spec: ISpec, isOn: boolean): IReport =>
    command(spec, cmd(spec, "clipProtection"), [Number(isOn)]);
export const brightness = (spec: ISpec, raw: number): IReport => command(spec, cmd(spec, "brightness"), [raw & 0xff]);
export const digitalFormat = (spec: ISpec, name: string): IReport =>
    command(spec, cmd(spec, "digitalFormat"), [Math.max(0, spec.digitalFormat.indexOf(name))]);
export const stateRequest = (spec: ISpec): IReport => command(spec, cmd(spec, "stateRequest"));
export const identifyLights = (spec: ISpec): IReport => command(spec, cmd(spec, "identifyLights"));
export const identify = (spec: ISpec): IReport => ({
    reportId: spec.reports.identify.id,
    data: Uint8Array.from(spec.reports.identify.payload),
});

/** Hex of a report including its ID, for comparing with captures. */
export const toHex = (report: IReport): string =>
    [report.reportId, ...report.data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
