import { channelById, pairKey, pairs } from "./mixer.ts";
import type { IMixerState } from "./mixer.ts";

export interface IStripGroup {
    /** One channel, or a linked pair shown as one stereo strip. */
    ids: string[];
    isStereo: boolean;
    name: string;
    /** The pair this strip can link or unlink, if any (loopback is always stereo). */
    linkPair?: [string, string];
    /** Accessible name of the link button, e.g. "Stereo link Line 3 and Line 4". */
    linkLabel?: string;
}

const pairName = (state: IMixerState, [a, b]: [string, string]): string => {
    const custom = state.names[a];
    if (custom) return custom;
    const names: Record<string, string> = {
        in1: "Inputs 1/2",
        in3: "Line 3/4",
        spdifL: "S/PDIF",
        loopbackL: "Loopback",
    };
    const number = (id: string): string => channelById[id]?.name.match(/\d+$/)?.[0] ?? "";
    return names[a] ?? `ADAT ${number(a)}/${number(b)}`;
};

const channelName = (state: IMixerState, id: string): string => state.names[id] ?? channelById[id]?.name ?? id;

/** Which optional strips the viewer has chosen to see (Settings › View). Hidden ones still play. */
export interface IStripView {
    isDigitalShown: boolean;
    isLoopbackShown: boolean;
}

const isPairShown = (state: IMixerState, [a]: [string, string], view: IStripView): boolean => {
    const info = channelById[a];
    if (info?.kind === "loopback") return view.isLoopbackShown;
    if (info?.kind !== "digital") return true;
    return view.isDigitalShown && info.format === state.device.digitalFormat;
};

/** The strips to show, in hardware order: a linked pair is one stereo strip. */
export const stripGroups = (state: IMixerState, view: IStripView): IStripGroup[] =>
    pairs
        .filter((pair) => isPairShown(state, pair, view))
        .flatMap((pair): IStripGroup[] => {
            const linkPair = channelById[pair[0]]?.kind === "loopback" ? undefined : pair;
            // The hardware names, not custom ones: a renamed pair shares one name, which would read twice.
            const link = linkPair && {
                linkPair,
                linkLabel: `Stereo link ${pair.map((id) => channelById[id]?.name ?? id).join(" and ")}`,
            };
            if (state.linked[pairKey(pair)]) {
                return [{ ids: [...pair], isStereo: true, name: pairName(state, pair), ...link }];
            }
            return pair.map((id, i) => ({
                ids: [id],
                isStereo: false,
                name: channelName(state, id),
                ...(i === 0 ? link : {}),
            }));
        });
