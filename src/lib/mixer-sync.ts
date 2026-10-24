import * as commands from "./commands.ts";
import type { IReport } from "./commands.ts";
import { mixLegs } from "./crosspoints.ts";
import { crosspointValue } from "./gain.ts";
import { directMask, hardwareLinkMask, phantomMask, routeSources } from "./mixer.ts";
import type { IMixerState } from "./mixer.ts";
import type { ISpec } from "./spec.ts";

/**
 * "mix": what only this page knows (crosspoints and routing), sent once it owns the mix.
 * "reported": what the Volt reports about itself (links, mutes, levels, preamps, display).
 */
export type SyncKind = "mix" | "reported";

export interface ISyncScope {
    /** Only this kind; both when left out. */
    kind?: SyncKind;
    /** Only the keys this accepts ("brightness", "gain0", …); all when left out. */
    keys?: (key: string) => boolean;
}

interface IEntry {
    key: string;
    value: unknown;
    build: () => IReport[];
}

interface IGroup {
    kind: SyncKind;
    entries: (state: IMixerState, spec: ISpec) => IEntry[];
}

export interface IMixerSync {
    /** Reports for what changed since the last diff (`isFull`: everything in scope). */
    diff: (state: IMixerState, spec: ISpec, options?: ISyncScope & { isFull?: boolean }) => IReport[];
    /** Treats the current state as already applied. */
    prime: (state: IMixerState, spec: ISpec, scope?: ISyncScope) => void;
    /** Forgets what was sent, so it goes again on the next diff. */
    forget: (scope?: ISyncScope) => void;
}

const entry = (key: string, value: unknown, build: () => IReport | IReport[]): IEntry => ({
    key,
    value,
    build: () => [build()].flat(),
});

const crosspointEntries = (state: IMixerState, spec: ISpec): IEntry[] =>
    mixLegs(state, spec).map(({ source, destination, linear }) =>
        entry(`x${source}:${destination}`, crosspointValue(spec, linear), () =>
            commands.crosspoint(spec, source, destination, linear),
        ),
    );

const routeEntries = (state: IMixerState, spec: ISpec): IEntry[] => {
    if (!state.isMixOwned) return [];
    const { headphone, line34 } = routeSources(state);
    return [
        entry("routeHeadphone", headphone, () => commands.routePair(spec, "headphone", headphone)),
        entry("routeLine34", line34, () => commands.routePair(spec, "line34", line34)),
    ];
};

const linkEntries = (state: IMixerState, spec: ISpec): IEntry[] => {
    const mask = hardwareLinkMask(state);
    return [entry("links", mask, () => commands.linkMask(spec, mask))];
};

const outputEntries = (state: IMixerState, spec: ISpec): IEntry[] => {
    const { monitor, headphone } = state;
    const direct = directMask(state);
    return [
        entry("direct", direct, () => commands.muteWord(spec, "direct", direct)),
        entry("monitorMute", monitor.isMuted, () => commands.muteWord(spec, "monitorMute", monitor.isMuted)),
        entry("mono", monitor.isMono, () => commands.monitorMono(spec, monitor.isMono)),
        entry("monitorLevel", monitor.level, () => commands.monitorLevel(spec, monitor.level)),
        entry("headphone", [headphone.level, headphone.isMuted], () =>
            commands.headphone(spec, headphone.level, headphone.isMuted),
        ),
    ];
};

const inputEntries = (state: IMixerState, spec: ISpec): IEntry[] => {
    const phantom = phantomMask(state);
    return [
        entry("phantom", phantom, () => commands.phantomMask(spec, phantom)),
        entry("tone", state.tone, () => commands.tone(spec, state.tone)),
        ...state.preamp.gain.map((db, i) => entry(`gain${i}`, db, () => commands.preampGain(spec, i, db))),
    ];
};

const deviceEntries = (state: IMixerState, spec: ISpec): IEntry[] => {
    const { isClipProtected, brightness, digitalFormat } = state.device;
    return [
        entry("clip", isClipProtected, () => commands.clipProtection(spec, isClipProtected)),
        entry("brightness", brightness, () => commands.brightness(spec, brightness)),
        entry("digital", digitalFormat, () => commands.digitalFormat(spec, digitalFormat)),
    ];
};

/** In sending order. Link state goes first: Console sends it before re-writing the pair's crosspoints. */
const groups: IGroup[] = [
    { kind: "reported", entries: linkEntries },
    { kind: "mix", entries: crosspointEntries },
    { kind: "mix", entries: routeEntries },
    { kind: "reported", entries: outputEntries },
    { kind: "reported", entries: inputEntries },
    { kind: "reported", entries: deviceEntries },
];

/** The entries in scope, each with its group's kind; a group of another kind isn't even built. */
const entriesIn = (
    state: IMixerState,
    spec: ISpec,
    { kind, keys = () => true }: ISyncScope,
): (IEntry & { kind: SyncKind })[] =>
    groups
        .filter((group) => kind === undefined || group.kind === kind)
        .flatMap((group) => group.entries(state, spec).map((member) => ({ ...member, kind: group.kind })))
        .filter((member) => keys(member.key));

/** What the Volt reports about itself, as one comparable value: whether a reading changed anything. */
export const reportedSettings = (state: IMixerState, spec: ISpec): string =>
    JSON.stringify(entriesIn(state, spec, { kind: "reported" }).map(({ key, value }) => [key, value]));

/** Remembers what the Volt was last told and produces only the reports that differ. */
export const createMixerSync = (): IMixerSync => {
    const sent = new Map<string, { kind: SyncKind; value: string }>();
    const diff: IMixerSync["diff"] = (state, spec, { isFull = false, ...scope } = {}) => {
        const reports: IReport[] = [];
        for (const { key, kind, value, build } of entriesIn(state, spec, scope)) {
            const text = JSON.stringify(value);
            if (!isFull && sent.get(key)?.value === text) continue;
            sent.set(key, { kind, value: text });
            reports.push(...build());
        }
        return reports;
    };
    return {
        diff,
        prime: (state, spec, scope = {}) => void diff(state, spec, scope),
        forget: ({ kind, keys = () => true } = {}) => {
            for (const [key, { kind: sentKind }] of sent) {
                if ((kind === undefined || kind === sentKind) && keys(key)) sent.delete(key);
            }
        },
    };
};
