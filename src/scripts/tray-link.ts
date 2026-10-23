import { isRemoteIntent } from "../lib/intents.ts";
import { openChannel, type RemoteMessage } from "./remote.ts";

/*
 * How the tray page reaches the main window. In the desktop app it's a BroadcastChannel. On a
 * phone (served by desktop/src/phone.ts, opened from the QR code's #t=… link) it's HTTP: updates
 * stream down as JSON lines, and changes go up one at a time, newest first, each with a rising
 * sequence number so the app can drop any that arrive late. The page is plain HTTP there, so
 * nothing here may need a secure context.
 */

export type LinkStatus = "connected" | "lost" | "unpaired";

export interface ITrayLink {
    isPhone: boolean;
    send: (message: RemoteMessage) => void;
    listen: (onMessage: (message: Partial<RemoteMessage>) => void, onStatus: (status: LinkStatus) => void) => void;
}

const broadcastLink = (): ITrayLink => {
    const channel = openChannel();
    return {
        isPhone: false,
        send: (message) => channel?.postMessage(message),
        listen: (onMessage) => channel?.addEventListener("message", (event) => onMessage(event.data)),
    };
};

const tokenKey = "volt-mixer.phone-token";

/** The token from the QR code's link, kept on the phone and taken out of the address bar. */
const phoneToken = (): string => {
    const fromLink = location.hash.match(/^#t=([\w-]+)$/)?.[1];
    try {
        if (fromLink) localStorage.setItem(tokenKey, fromLink);
        if (fromLink) history.replaceState(null, "", location.pathname);
        return fromLink ?? localStorage.getItem(tokenKey) ?? "";
    } catch {
        return fromLink ?? "";
    }
};

/** Reads the stream line by line until it ends; each line is one message. */
const readLines = async (body: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
        buffer += decoder.decode(part.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.filter((line) => line.trim()).forEach(onLine);
    }
};

/** One phone page's connection to the app. */
interface IPhone {
    headers: Record<string, string>;
    /** Names this page to the app, so its sequence numbers are told apart from another phone's. */
    client: string;
    /** The newest change per control, waiting to be sent. */
    pending: Map<string, unknown>;
    seq: number;
    isSending: boolean;
    retryMs: number;
    onMessage: (message: Partial<RemoteMessage>) => void;
    onStatus: (status: LinkStatus) => void;
}

const postIntent = async (phone: IPhone, intent: unknown): Promise<void> => {
    const reply = await fetch("/api/intent", {
        method: "POST",
        headers: { ...phone.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ client: phone.client, seq: ++phone.seq, intent }),
    }).catch(() => null);
    const result = ((await reply?.json().catch(() => null)) as { result?: unknown } | null)?.result;
    if (result === "needsMix") phone.onMessage({ kind: "result", result });
};

/** One change at a time; while one is out, only the newest for each control waits. */
const drain = async (phone: IPhone): Promise<void> => {
    if (phone.isSending) return;
    phone.isSending = true;
    for (const [key, intent] of phone.pending) {
        phone.pending.delete(key);
        await postIntent(phone, intent);
    }
    phone.isSending = false;
};

/** Follows the app's updates; when the stream ends, tries again, waiting longer each time (up to 10 s). */
const connect = async (phone: IPhone): Promise<void> => {
    const response = await fetch("/api/events", { headers: phone.headers, cache: "no-store" }).catch(() => null);
    if (response?.status === 401) return phone.onStatus("unpaired");
    if (response?.ok && response.body) {
        phone.onStatus("connected");
        phone.retryMs = 1000;
        const onLine = (line: string): void => phone.onMessage(JSON.parse(line) as Partial<RemoteMessage>);
        await readLines(response.body, onLine).catch(() => {});
    }
    phone.onStatus("lost");
    phone.retryMs = Math.min(phone.retryMs * 2, 10_000);
    window.setTimeout(() => void connect(phone), phone.retryMs);
};

const phoneLink = (token: string): ITrayLink => {
    const phone: IPhone = {
        headers: { Authorization: `Bearer ${token}` },
        client: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
        pending: new Map(),
        seq: 0,
        isSending: false,
        retryMs: 1000,
        onMessage: () => {},
        onStatus: () => {},
    };
    return {
        isPhone: true,
        send: (message) => {
            if (message.kind !== "intent" || !isRemoteIntent(message.intent)) return;
            const intent = message.intent as { type: string; ids?: string[] };
            phone.pending.set(`${intent.type}:${intent.ids?.join(",") ?? ""}`, intent);
            void drain(phone);
        },
        listen: (onMessage, onStatus) => {
            Object.assign(phone, { onMessage, onStatus });
            void connect(phone);
        },
    };
};

/** The link for this page: HTTP when it was opened on a phone with a pairing token. */
export const openTrayLink = (): ITrayLink => {
    const token = location.protocol === "http:" ? phoneToken() : "";
    return token ? phoneLink(token) : broadcastLink();
};
