import type http from "http";

/* Small helpers for the app's two local servers (mix-share.ts, phone.ts). */

export type Headers = Record<string, string>;

/** Ends a response, with a JSON body when one is given. Nothing is cached. */
export const send = (res: http.ServerResponse, status: number, headers: Headers = {}, body?: unknown): void => {
    const json = body === undefined ? undefined : JSON.stringify(body);
    const type: Headers = json === undefined ? {} : { "Content-Type": "application/json" };
    res.writeHead(status, { "Cache-Control": "no-store", ...type, ...headers });
    res.end(json);
};

/** A request's JSON body, or null when it isn't JSON or is longer than `maxBytes`. */
export const readJson = (req: http.IncomingMessage, maxBytes: number): Promise<unknown> =>
    new Promise((resolve) => {
        let text = "";
        req.on("data", (chunk: Buffer) => {
            text += chunk.toString("utf8");
            if (text.length <= maxBytes) return;
            req.destroy();
            resolve(null);
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(text) as unknown);
            } catch {
                resolve(null);
            }
        });
        req.on("error", () => resolve(null));
    });
