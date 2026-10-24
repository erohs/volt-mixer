import type http from "http";

/*
 * The phones' update streams, one per phone page (its client name), so a phone that reconnects
 * replaces its own stream rather than taking another slot. Each remembers the challenge it was
 * opened with and the highest sequence number used on it (phone-auth.ts). TCP keep-alive notices
 * a phone that left the network, and a stream that stops taking data is closed, not buffered.
 */

interface IStream {
    response: http.ServerResponse;
    nonce: string;
    seq: number;
}

const maxStreams = 4;
const keepAliveMs = 10_000;
/** A few seconds of snapshots: more than this waiting means the phone has stopped reading. */
const maxWaitingBytes = 256 * 1024;
const streams = new Map<string, IStream>();
let onCount = (_count: number): void => {};

/** Tells `listen` how many phones are connected, each time it changes. */
export const watchStreamCount = (listen: (count: number) => void): void => {
    onCount = listen;
};

export const streamCount = (): number => streams.size;

const close = (client: string, stream: IStream): void => {
    if (streams.get(client) !== stream) return;
    streams.delete(client);
    stream.response.destroy();
    onCount(streams.size);
};

/** Adds a phone's stream, in place of its last one; false when other phones have every slot. */
export const addStream = (client: string, nonce: string, response: http.ServerResponse): boolean => {
    const previous = streams.get(client);
    if (previous) close(client, previous);
    if (streams.size >= maxStreams) return false;
    const stream: IStream = { response, nonce, seq: 0 };
    streams.set(client, stream);
    response.socket?.setKeepAlive(true, keepAliveMs);
    response.socket?.setNoDelay(true);
    response.on("close", () => close(client, stream));
    onCount(streams.size);
    return true;
};

/** The challenge `client`'s open stream was opened with, which its changes are signed with. */
export const streamNonce = (client: string): string | null => streams.get(client)?.nonce ?? null;

/** Takes a change's sequence number: false when it isn't above the last one (late or repeated). */
export const takeSeq = (client: string, seq: number): boolean => {
    const stream = streams.get(client);
    if (!stream || seq <= stream.seq) return false;
    stream.seq = seq;
    return true;
};

/** One line to every phone; a phone that has stopped reading is let go. */
export const toStreams = (line: string): void => {
    for (const [client, stream] of streams) {
        stream.response.write(`${line}\n`);
        if (stream.response.writableLength > maxWaitingBytes) close(client, stream);
    }
};

let latest = "";
let sent = "";
let sendTimer: NodeJS.Timeout | undefined;

/** The newest snapshot line, which a new stream starts with. */
export const latestLine = (): string => latest;

/** The main window's snapshot, to every phone: at most 20 a second, and only when something changed. */
export const publishToPhones = (snapshot: unknown): void => {
    latest = JSON.stringify({ kind: "snapshot", snapshot });
    if (sendTimer || latest === sent) return;
    sendTimer = setTimeout(() => {
        sendTimer = undefined;
        sent = latest;
        toStreams(latest);
    }, 50);
};

export const endStreams = (): void => {
    for (const [client, stream] of streams) close(client, stream);
};
