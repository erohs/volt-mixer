import * as commands from "./commands.ts";
import type { IReport } from "./commands.ts";
import { crosspointValue } from "./gain.ts";
import { crosspointTable, directMask, hardwareLinkMask, phantomMask, routeSources } from "./mixer.ts";
import type { IMixerState } from "./mixer.ts";
import type { ISpec } from "./spec.ts";

type KeyFilter = (key: string) => boolean;

interface IEntry {
    key: string;
    value: unknown;
    build: () => IReport[];
}

export interface IMixerSync {
    /** Reports for what changed since the last diff (`isFull`: everything). */
    diff: (state: IMixerState, spec: ISpec, options?: { isFull?: boolean; filter?: KeyFilter }) => IReport[];
    /** Treats the current state as already applied. */
    prime: (state: IMixerState, spec: ISpec, filter?: KeyFilter) => void;
    /** Forgets what was sent, so it goes again on the next diff. */
    forget: (filter?: KeyFilter) => void;
}

export const isCrosspointKey: KeyFilter = (key) => key.startsWith("x");
export const isMixKey: KeyFilter = (key) => key.startsWith("x") || key.startsWith("route");

const crosspointEntries = (state: IMixerState, spec: ISpec): IEntry[] =>
    [...crosspointTable(state, spec)].map(([key, linear]) => {
        const [source = 0, destination = 0] = key.split(":").map(Number);
        return {
            key: `x${key}`,
            value: crosspointValue(spec, linear),
            build: () => [commands.crosspoint(spec, source, destination, linear)],
        };
    });

const routeEntries = (state: IMixerState, spec: ISpec): IEntry[] => {
    if (!state.isMixOwned) return [];
    const sources = routeSources(state);
    return [
        {
            key: "routeHeadphone",
            value: sources.headphone,
            build: () => commands.routePair(spec, "headphone", sources.headphone),
        },
        { key: "routeLine34", value: sources.line34, build: () => commands.routePair(spec, "line34", sources.line34) },
    ];
};

const deviceEntries = (state: IMixerState, spec: ISpec): IEntry[] => [
    { key: "direct", value: directMask(state), build: () => [commands.muteWord(spec, "direct", directMask(state))] },
    {
        key: "monitorMute",
        value: state.monitor.isMuted,
        build: () => [commands.muteWord(spec, "monitorMute", state.monitor.isMuted)],
    },
    { key: "mono", value: state.monitor.isMono, build: () => [commands.monitorMono(spec, state.monitor.isMono)] },
    {
        key: "monitorLevel",
        value: state.monitor.level,
        build: () => [commands.monitorLevel(spec, state.monitor.level)],
    },
    { key: "phantom", value: phantomMask(state), build: () => [commands.phantomMask(spec, phantomMask(state))] },
    { key: "tone", value: state.tone, build: () => [commands.tone(spec, state.tone)] },
    ...state.preamp.gain.map((db, i) => ({
        key: `gain${i}`,
        value: db,
        build: () => [commands.preampGain(spec, i, db)],
    })),
    {
        key: "headphone",
        value: [state.headphone.level, state.headphone.isMuted],
        build: () => [commands.headphone(spec, state.headphone.level, state.headphone.isMuted)],
    },
    {
        key: "clip",
        value: state.device.isClipProtected,
        build: () => [commands.clipProtection(spec, state.device.isClipProtected)],
    },
    {
        key: "brightness",
        value: state.device.brightness,
        build: () => [commands.brightness(spec, state.device.brightness)],
    },
    {
        key: "digital",
        value: state.device.digitalFormat,
        build: () => [commands.digitalFormat(spec, state.device.digitalFormat)],
    },
];

/** Link state goes first: Console sends it before re-writing the pair's crosspoints. */
const entries = (state: IMixerState, spec: ISpec): IEntry[] => [
    { key: "links", value: hardwareLinkMask(state), build: () => [commands.linkMask(spec, hardwareLinkMask(state))] },
    ...crosspointEntries(state, spec),
    ...routeEntries(state, spec),
    ...deviceEntries(state, spec),
];

/** Remembers what the Volt was last told and produces only the reports that differ. */
export const createMixerSync = (): IMixerSync => {
    const sent = new Map<string, string>();
    const diff: IMixerSync["diff"] = (state, spec, { isFull = false, filter = () => true } = {}) => {
        const reports: IReport[] = [];
        for (const entry of entries(state, spec)) {
            if (!filter(entry.key)) continue;
            const value = JSON.stringify(entry.value);
            if (!isFull && sent.get(entry.key) === value) continue;
            sent.set(entry.key, value);
            reports.push(...entry.build());
        }
        return reports;
    };
    return {
        diff,
        prime: (state, spec, filter) => void diff(state, spec, filter ? { filter } : {}),
        forget: (filter = () => true) => [...sent.keys()].filter(filter).forEach((key) => sent.delete(key)),
    };
};
