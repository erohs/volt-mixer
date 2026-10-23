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

const phoneLink = (token: string): ITrayLink => {
    const headers = { Authorization: `Bearer ${token}` };
    const client = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const pending = new Map<string, unknown>();
    let seq = 0;
    let isSending = false;
    let onMessage: (message: Partial<RemoteMessage>) => void = () => {};
    let onStatus: (status: LinkStatus) => void = () => {};

    /** One change at a time; while one is out, only the newest for each control waits. */
    const drain = async (): Promise<void> => {
        if (isSending) return;
        isSending = true;
        for (const [key, intent] of pending) {
            pending.delete(key);
            const body = JSON.stringify({ client, seq: ++seq, intent });
            const reply = await fetch("/api/intent", {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body,
            }).catch(() => null);
            const result = ((await reply?.json().catch(() => null)) as { result?: unknown } | null)?.result;
            if (result === "needsMix") onMessage({ kind: "result", result });
        }
        isSending = false;
    };

    let retry = 1000;
    const connect = async (): Promise<void> => {
        const response = await fetch("/api/events", { headers, cache: "no-store" }).catch(() => null);
        if (response?.status === 401) return onStatus("unpaired");
        if (response?.ok && response.body) {
            onStatus("connected");
            retry = 1000;
            await readLines(response.body, (line) => onMessage(JSON.parse(line) as Partial<RemoteMessage>)).catch(
                () => {},
            );
        }
        onStatus("lost");
        window.setTimeout(() => void connect(), (retry = Math.min(retry * 2, 10_000)));
    };

    return {
        isPhone: true,
        send: (message) => {
            if (message.kind !== "intent" || !isRemoteIntent(message.intent)) return;
            const intent = message.intent as { type: string; ids?: string[] };
            pending.set(`${intent.type}:${intent.ids?.join(",") ?? ""}`, intent);
            void drain();
        },
        listen: (messages, status) => {
            [onMessage, onStatus] = [messages, status];
            void connect();
        },
    };
};

/** The link for this page: HTTP when it was opened on a phone with a pairing token. */
export const openTrayLink = (): ITrayLink => {
    const token = location.protocol === "http:" ? phoneToken() : "";
    return token ? phoneLink(token) : broadcastLink();
};
