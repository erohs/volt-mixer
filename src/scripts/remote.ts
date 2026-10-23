import { isIntent, type Intent, type IntentResult } from "../lib/intents.ts";
import type { ITrayRow } from "../lib/tray-rows.ts";

/*
 * The main window and the desktop app's tray window talk over a BroadcastChannel (same origin, so
 * no main-process relay). The main window drives the Volt and answers; the tray draws what it's
 * sent and asks for changes as intents. Nothing is sent until a tray says hello.
 */

export interface ITraySnapshot {
    rows: ITrayRow[];
    maxDb: number;
    isLive: boolean;
    isMixOwned: boolean;
    status: string;
}

export type RemoteMessage =
    | { kind: "hello" }
    | { kind: "bye" }
    | { kind: "intent"; intent: unknown }
    | { kind: "snapshot"; snapshot: ITraySnapshot }
    | { kind: "meters"; levels: Record<string, number> }
    | { kind: "result"; result: IntentResult };

export const openChannel = (): BroadcastChannel | null =>
    typeof BroadcastChannel === "function" ? new BroadcastChannel("volt-mixer") : null;

interface IResponder {
    /** Only the tab that drives the Volt answers; a read-only second tab stays quiet. */
    isActive: () => boolean;
    snapshot: () => ITraySnapshot;
    run: (intent: Intent) => IntentResult;
}

const meterIntervalMs = 50;
let channel: BroadcastChannel | null = null;
const pendingMeters = new Map<string, number>();
let responder: IResponder | null = null;
let isTrayOpen = false;
let meterTimer = 0;

const post = (message: RemoteMessage): void => channel?.postMessage(message);
const isAnswering = (): boolean => isTrayOpen && responder !== null && responder.isActive();

/** Sends the tray what it shows now; called after every refresh. */
export const publish = (): void => {
    if (isAnswering()) post({ kind: "snapshot", snapshot: responder!.snapshot() });
};

const sendMeters = (): void => {
    meterTimer = 0;
    post({ kind: "meters", levels: Object.fromEntries(pendingMeters) });
    pendingMeters.clear();
};

/** Meter peaks, at most 20 times a second, keeping the highest peak in between. */
export const publishMeters = (levels: Record<string, number>): void => {
    if (!isAnswering()) return;
    for (const [name, db] of Object.entries(levels))
        pendingMeters.set(name, Math.max(db, pendingMeters.get(name) ?? -Infinity));
    meterTimer ||= window.setTimeout(sendMeters, meterIntervalMs);
};

const onMessage = ({ data }: MessageEvent): void => {
    const message = data as Partial<RemoteMessage> | null;
    if (message?.kind === "hello") return ((isTrayOpen = true), publish());
    if (message?.kind === "bye") return void (isTrayOpen = false);
    if (message?.kind !== "intent" || !responder?.isActive() || !isIntent(message.intent)) return;
    post({ kind: "result", result: responder.run(message.intent) });
};

/** Makes this page answer tray windows. */
export const wireRemote = (answer: IResponder): void => {
    responder = answer;
    channel = openChannel();
    channel?.addEventListener("message", onMessage);
};
