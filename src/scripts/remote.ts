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
    /** "on", "off" or "away", as the main window's status is coloured. */
    statusKind: string;
}

export type RemoteMessage =
    | { kind: "hello" }
    | { kind: "bye" }
    | { kind: "intent"; intent: unknown }
    | { kind: "snapshot"; snapshot: ITraySnapshot }
    | { kind: "result"; result: IntentResult };

export const openChannel = (): BroadcastChannel | null =>
    typeof BroadcastChannel === "function" ? new BroadcastChannel("volt-mixer") : null;

interface IResponder {
    /** Only the tab that drives the Volt answers; a read-only second tab stays quiet. */
    isActive: () => boolean;
    snapshot: () => ITraySnapshot;
    run: (intent: Intent) => IntentResult;
}

let channel: BroadcastChannel | null = null;
let responder: IResponder | null = null;
let isTrayOpen = false;

const post = (message: RemoteMessage): void => channel?.postMessage(message);
const isAnswering = (): boolean => isTrayOpen && responder !== null && responder.isActive();

/** Sends the tray what it shows now; called after every refresh. */
export const publish = (): void => {
    if (isAnswering()) post({ kind: "snapshot", snapshot: responder!.snapshot() });
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
