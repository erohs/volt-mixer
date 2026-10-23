import { pairKey, pairOf, type IMixerState } from "./mixer.ts";
import { stripGroups, toneOf, type IStripView, type ToneName } from "./strip-groups.ts";

/*
 * The tray mixer's rows, built by the main window and drawn by the tray window. The tray only
 * draws; everything it shows comes from here, and everything it changes goes back as an intent.
 */

export interface ITrayRow {
    /** What the tray choice is stored under: a channel pair's key (linked or not), or an output. */
    key: string;
    kind: "channel" | "monitor" | "headphone";
    name: string;
    /** The channels a channel row moves together (one, or a linked pair). */
    ids: string[];
    /** Fader dB for a channel, 0–100 for an output. */
    level: number;
    isMuted: boolean;
    tone: ToneName;
    meters: string[];
}

export interface ITrayChoice {
    key: string;
    name: string;
}

const outputRows = (state: IMixerState): ITrayRow[] => [
    {
        key: "headphone",
        kind: "headphone",
        name: "Headphones",
        ids: [],
        level: state.headphone.level,
        isMuted: state.headphone.isMuted,
        tone: "off",
        meters: [],
    },
    {
        key: "monitor",
        kind: "monitor",
        name: "Monitor",
        ids: [],
        level: state.monitor.level,
        isMuted: state.monitor.isMuted,
        tone: "off",
        meters: ["monitorL", "monitorR"],
    },
];

/** The pair a strip belongs to, so a choice survives linking and unlinking. */
const choiceKey = (ids: string[]): string => {
    const pair = pairOf(ids[0] ?? "");
    return pair ? pairKey(pair) : ids.join(",");
};

const channelRows = (state: IMixerState, view: IStripView, meterNames: Set<string>): ITrayRow[] =>
    stripGroups(state, view).map((group) => {
        const first = state.channels[group.ids[0] ?? ""];
        return {
            key: choiceKey(group.ids),
            kind: "channel",
            name: group.name,
            ids: group.ids,
            level: first?.fader ?? 0,
            isMuted: first?.isMuted ?? false,
            tone: toneOf(state, group.ids),
            meters: group.ids.filter((id) => meterNames.has(id)),
        };
    });

/** Headphones, Monitor, then the strips shown on the page, less any the viewer has unticked. */
export const trayRows = (state: IMixerState, view: IStripView, meterNames: Set<string>, hidden: string[]): ITrayRow[] =>
    [...outputRows(state), ...channelRows(state, view, meterNames)].filter((row) => !hidden.includes(row.key));

/** What Settings › Tray mixer lists: one tick box per output and per pair shown on the page. */
export const trayChoices = (state: IMixerState, view: IStripView): ITrayChoice[] => {
    const rows = trayRows(state, view, new Set(), []);
    const seen = new Set<string>();
    return rows
        .filter((row) => !seen.has(row.key) && seen.add(row.key))
        .map((row) => ({ key: row.key, name: row.kind === "channel" ? pairLabel(state, view, row.key) : row.name }));
};

/** An unlinked pair shows two rows; its tick box names both ("Line 3 and Line 4"). */
const pairLabel = (state: IMixerState, view: IStripView, key: string): string => {
    const names = channelRows(state, view, new Set())
        .filter((row) => row.key === key)
        .map((row) => row.name);
    return names.join(" and ");
};
