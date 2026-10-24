import type http from "http";

/* Small helpers for the app's local server (phone-server.ts). */

type Headers = Record<string, string>;

/** Ends a response, with a JSON body when one is given. Nothing is cached. */
export const send = (res: http.ServerResponse, status: number, headers: Headers = {}, body?: unknown): void => {
    const json = body === undefined ? undefined : JSON.stringify(body);
    const type: Headers = json === undefined ? {} : { "Content-Type": "application/json" };
    res.writeHead(status, { "Cache-Control": "no-store", ...type, ...headers });
    res.end(json);
};

/** A request's body as text, or null when it's longer than `maxBytes` or breaks off. */
export const readText = (req: http.IncomingMessage, maxBytes: number): Promise<string | null> =>
    new Promise((resolve) => {
        let text = "";
        req.on("data", (chunk: Buffer) => {
            text += chunk.toString("utf8");
            if (text.length <= maxBytes) return;
            req.destroy();
            resolve(null);
        });
        req.on("end", () => resolve(text));
        req.on("error", () => resolve(null));
    });

/** One header's value, or "" when it's missing or repeated. */
export const header = (req: http.IncomingMessage, name: string): string => {
    const value = req.headers[name];
    return typeof value === "string" ? value : "";
};
