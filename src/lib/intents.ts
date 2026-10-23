import { minDb } from "./gain.ts";
import { channelById, matchQuieterGain, pairOf, pairKey, setLinked, type IChannel, type IMixerState } from "./mixer.ts";

/*
 * What a view asks for, from the page's own controls or from the tray window. Intents from another
 * window are untrusted, so this is the one place they change state: values are clamped, unknown
 * channels are ignored, and mix changes wait until this computer owns the mix.
 */

/*
 * A switch either flips (`to` left out: a button on the page or in the tray) or is set to `to`
 * (the phone, whose messages could arrive twice or late, so flipping could undo a change).
 */
type ChannelIntent =
    | { type: "fader"; ids: string[]; db: number }
    | { type: "mute"; ids: string[]; to?: boolean }
    | { type: "solo"; ids: string[]; to?: boolean };
type OutputToggle = "monitorMute" | "monitorMono" | "headphoneMute";

/* One member per type, so TypeScript can narrow each check. */
export type Intent =
    | ChannelIntent
    | { type: "link"; id: string }
    | { type: "monitorLevel"; level: number }
    | { type: "headphoneLevel"; level: number }
    | { type: "monitorMute"; to?: boolean }
    | { type: "monitorMono"; to?: boolean }
    | { type: "headphoneMute"; to?: boolean };

/** "needsMix": the change is a mix level, and this computer doesn't have the mix yet. */
export type IntentResult = "ok" | "needsMix" | "ignored";

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isIdList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === "string");

const toggles: Record<OutputToggle, (state: IMixerState, to: boolean | undefined) => void> = {
    monitorMute: ({ monitor }, to) => (monitor.isMuted = to ?? !monitor.isMuted),
    monitorMono: ({ monitor }, to) => (monitor.isMono = to ?? !monitor.isMono),
    headphoneMute: ({ headphone }, to) => (headphone.isMuted = to ?? !headphone.isMuted),
};

/** Whether a message from another window has an intent's shape. Values are checked when applied. */
export const isIntent = (value: unknown): value is Intent => {
    if (typeof value !== "object" || value === null) return false;
    const { type, ids, id, db, level, to } = value as Record<string, unknown>;
    if (to !== undefined && typeof to !== "boolean") return false;
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
              ? { isMuted: intent.to ?? !first.isMuted }
              : { isSoloed: intent.to ?? !first.isSoloed };
    for (const channel of channels) Object.assign(channel, change);
    return true;
};

const toggleLink = (state: IMixerState, id: string): boolean => {
    const pair = pairOf(id);
    if (!pair) return false;
    const isOn = !state.linked[pairKey(pair)];
    setLinked(state, pair, isOn);
    if (isOn) matchQuieterGain(state, pair);
    return true;
};

/** Applies one intent to the state; the caller commits (and re-lays out after a link). */
export const applyIntent = (state: IMixerState, intent: Intent, maxDb: number): IntentResult => {
    if (needsMix(intent) && !state.isMixOwned) return "needsMix";
    if (intent.type === "fader" || intent.type === "mute" || intent.type === "solo")
        return applyToChannels(state, intent, maxDb) ? "ok" : "ignored";
    if (intent.type === "link") return toggleLink(state, intent.id) ? "ok" : "ignored";
    if (intent.type === "monitorMute" || intent.type === "monitorMono" || intent.type === "headphoneMute") {
        toggles[intent.type](state, intent.to);
        return "ok";
    }
    // Console's 0–100 scale. The Volt jumps loud below 0, so 0 is the floor.
    const level = clamp(intent.level, 0, 100);
    if (intent.type === "monitorLevel") state.monitor.level = level;
    else state.headphone.level = level;
    return "ok";
};
