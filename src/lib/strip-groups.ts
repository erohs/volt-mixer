import { channelById, pairKey, pairs } from "./mixer.ts";
import type { ChannelId, IMixerState, Pair } from "./mixer.ts";

/** One channel, or a linked pair shown as one stereo strip. */
export type StripIds = [ChannelId] | Pair;

export interface IStripGroup {
    ids: StripIds;
    isStereo: boolean;
    name: string;
    /** The pair this strip can link or unlink, if any (loopback is always stereo). */
    linkPair?: Pair;
    /** Accessible name of the link button, e.g. "Stereo link Line 3 and Line 4". */
    linkLabel?: string;
}

const pairNames: Partial<Record<ChannelId, string>> = {
    in1: "Inputs 1/2",
    in3: "Line 3/4",
    spdifL: "S/PDIF",
    loopbackL: "Loopback",
};

const pairName = (state: IMixerState, [a, b]: Pair): string => {
    const number = (id: ChannelId): string => channelById[id].name.match(/\d+$/)?.[0] ?? "";
    return state.names[a] ?? pairNames[a] ?? `ADAT ${number(a)}/${number(b)}`;
};

const channelName = (state: IMixerState, id: ChannelId): string => state.names[id] ?? channelById[id].name;

/** Which optional strips the viewer has chosen to see (Settings › View). Hidden ones still play. */
export interface IStripView {
    isDigitalShown: boolean;
    isLoopbackShown: boolean;
}

const isPairShown = (state: IMixerState, [a]: Pair, view: IStripView): boolean => {
    const info = channelById[a];
    if (info.kind === "loopback") return view.isLoopbackShown;
    if (info.kind !== "digital") return true;
    return view.isDigitalShown && info.format === state.device.digitalFormat;
};

/** The strips to show, in hardware order: a linked pair is one stereo strip. */
export const stripGroups = (state: IMixerState, view: IStripView): IStripGroup[] =>
    pairs
        .filter((pair) => isPairShown(state, pair, view))
        .flatMap((pair): IStripGroup[] => {
            const linkPair = channelById[pair[0]].kind === "loopback" ? undefined : pair;
            // The hardware names, not custom ones: a renamed pair shares one name, which would read twice.
            const link = linkPair && {
                linkPair,
                linkLabel: `Stereo link ${pair.map((id) => channelById[id].name).join(" and ")}`,
            };
            if (state.linked[pairKey(pair)]) {
                return [{ ids: [...pair], isStereo: true, name: pairName(state, pair), ...link }];
            }
            return pair.map((id, i) => ({
                ids: [id] as [ChannelId],
                isStereo: false,
                name: channelName(state, id),
                ...(i === 0 ? link : {}),
            }));
        });

export type ToneName = "off" | "warmth" | "focus" | "shine";
const toneNames: ToneName[] = ["off", "warmth", "focus", "shine"];

/** The TONE a strip's first channel has, which colours its fader like the Volt's TONE ring. */
export const toneOf = (state: IMixerState, ids: StripIds): ToneName => {
    const toneIndex = channelById[ids[0]].toneIndex;
    return toneNames[toneIndex === undefined ? 0 : (state.tone[toneIndex] ?? 0)] ?? "off";
};
