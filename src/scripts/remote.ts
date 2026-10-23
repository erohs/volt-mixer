import { isIntent, type Intent, type IntentResult } from "../lib/intents.ts";
import type { ITrayRow } from "../lib/tray-rows.ts";
import { desktopApp } from "./desktop.ts";

/*
 * The main window drives the Volt and answers the tray mixer wherever it's shown: the desktop
 * app's tray window over a BroadcastChannel (same origin, no relay), and phones through the app's
 * phone server (desktop/src/phone.ts, via the preload). They draw what they're sent and ask for
 * changes as intents. Nothing is sent until a tray says hello or a phone connects.
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
let phoneCount = 0;

const post = (message: RemoteMessage): void => channel?.postMessage(message);
const isActive = (): boolean => responder !== null && responder.isActive();

/** Sends the tray and any phones what they show now; called after every refresh. */
export const publish = (): void => {
    if (!isActive() || (!isTrayOpen && phoneCount === 0)) return;
    const snapshot = responder!.snapshot();
    if (isTrayOpen) post({ kind: "snapshot", snapshot });
    if (phoneCount > 0) desktopApp()?.publishToPhones(snapshot);
};

const run = (intent: unknown): IntentResult => (isActive() && isIntent(intent) ? responder!.run(intent) : "ignored");

const onMessage = ({ data }: MessageEvent): void => {
    const message = data as Partial<RemoteMessage> | null;
    if (message?.kind === "hello") return ((isTrayOpen = true), publish());
    if (message?.kind === "bye") return void (isTrayOpen = false);
    if (message?.kind === "intent") post({ kind: "result", result: run(message.intent) });
};

/** Makes this page answer tray windows and phones. */
export const wireRemote = (answer: IResponder): void => {
    responder = answer;
    channel = openChannel();
    channel?.addEventListener("message", onMessage);
    desktopApp()?.onPhoneIntent(run);
    desktopApp()?.onPhoneCount((count) => {
        phoneCount = count;
        publish();
    });
};
