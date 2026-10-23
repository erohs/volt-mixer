import { minDb } from "./gain.ts";
import { channelById, pairOf, pairKey, setLinked, type IChannel, type IMixerState } from "./mixer.ts";

/*
 * What a view asks for, from the page's own controls or from the tray window. Intents from another
 * window are untrusted, so this is the one place they change state: values are clamped, unknown
 * channels are ignored, and mix changes wait until this computer owns the mix.
 */

type ChannelIntent = { type: "fader"; ids: string[]; db: number } | { type: "mute" | "solo"; ids: string[] };
type OutputToggle = "monitorMute" | "monitorMono" | "headphoneMute";

export type Intent =
    | ChannelIntent
    | { type: "link"; id: string }
    | { type: "monitorLevel" | "headphoneLevel"; level: number }
    | { type: OutputToggle };

/** "needsMix": the change is a mix level, and this computer doesn't have the mix yet. */
export type IntentResult = "ok" | "needsMix" | "ignored";

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isIdList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === "string");

const toggles: Record<OutputToggle, (state: IMixerState) => void> = {
    monitorMute: ({ monitor }) => (monitor.isMuted = !monitor.isMuted),
    monitorMono: ({ monitor }) => (monitor.isMono = !monitor.isMono),
    headphoneMute: ({ headphone }) => (headphone.isMuted = !headphone.isMuted),
};

/** Whether a message from another window has an intent's shape. Values are checked when applied. */
export const isIntent = (value: unknown): value is Intent => {
    if (typeof value !== "object" || value === null) return false;
    const { type, ids, id, db, level } = value as Record<string, unknown>;
    if (type === "fader") return isIdList(ids) && isNumber(db);
    if (type === "mute" || type === "solo") return isIdList(ids);
    if (type === "link") return typeof id === "string";
    if (type === "monitorLevel" || type === "headphoneLevel") return isNumber(level);
    return typeof type === "string" && Object.hasOwn(toggles, type);
};

/** Solo, digital mutes and faders are crosspoint levels; analog mutes are the Volt's own. */
const needsMix = (intent: Intent): boolean =>
    intent.type === "fader" ||
    intent.type === "solo" ||
    (intent.type === "mute" && channelById[intent.ids[0] ?? ""]?.kind !== "analog");

/** A group's channels move together, to one new value read before any of them changes. */
const applyToChannels = (state: IMixerState, intent: ChannelIntent, maxDb: number): boolean => {
    const channels = intent.ids.map((id) => state.channels[id]);
    if (!channels.every((channel): channel is IChannel => channel !== undefined)) return false;
    const first = channels[0]!;
    // Only the field asked for: a pair's two mutes can differ (the Volt reports each input's own).
    const change =
        intent.type === "fader"
            ? { fader: clamp(intent.db, minDb, maxDb) }
            : intent.type === "mute"
              ? { isMuted: !first.isMuted }
              : { isSoloed: !first.isSoloed };
    for (const channel of channels) Object.assign(channel, change);
    return true;
};

const toggleLink = (state: IMixerState, id: string): boolean => {
    const pair = pairOf(id);
    if (!pair) return false;
    setLinked(state, pair, !state.linked[pairKey(pair)]);
    return true;
};

/** Applies one intent to the state; the caller commits (and re-lays out after a link). */
export const applyIntent = (state: IMixerState, intent: Intent, maxDb: number): IntentResult => {
    if (needsMix(intent) && !state.isMixOwned) return "needsMix";
    if (intent.type === "fader" || intent.type === "mute" || intent.type === "solo")
        return applyToChannels(state, intent, maxDb) ? "ok" : "ignored";
    if (intent.type === "link") return toggleLink(state, intent.id) ? "ok" : "ignored";
    if (intent.type === "monitorLevel" || intent.type === "headphoneLevel") {
        // Console's 0–100 scale. The Volt jumps loud below 0, so 0 is the floor.
        const level = clamp(intent.level, 0, 100);
        if (intent.type === "monitorLevel") state.monitor.level = level;
        else state.headphone.level = level;
        return "ok";
    }
    toggles[intent.type](state);
    return "ok";
};
