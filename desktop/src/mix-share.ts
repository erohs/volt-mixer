import { app, ipcMain } from "electron";
import http from "http";
import { isFromApp } from "./protocol";
import { getMainWindow } from "./windows";

/*
 * Shares the mix with the website on this computer, so the two stay in step (the most recent
 * change wins; the page's src/scripts/shared-mix.ts decides). Loopback only, so nothing on the
 * network can reach it and Windows doesn't ask about the firewall. Only the website's own origin
 * may call it, and writes need a JSON body (which makes the browser check that origin first).
 *
 *   GET /api/mix?serial=…   → { mix, changedAt } for that Volt, or 404
 *   PUT /api/mix            { serial, mix, changedAt } → { accepted }
 */

const host = "127.0.0.1";
const port = 48191;
const maxBodyBytes = 8 * 1024;
const allowedOrigins = new Set([
    "https://erohs.github.io",
    // The site run locally while developing (pnpm dev / preview).
    ...(app.isPackaged ? [] : ["http://localhost:4321", "http://127.0.0.1:4331"]),
]);
const isSerial = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,64}$/.test(value);

let server: http.Server | null = null;
let nextRequest = 0;
const waiting = new Map<number, (reply: unknown) => void>();

/** The mix lives in the main window's storage, so each request is passed to that page. */
const askPage = (request: unknown): Promise<unknown> =>
    new Promise((resolve) => {
        const window = getMainWindow();
        if (!window) return resolve(null);
        const id = nextRequest++;
        waiting.set(id, resolve);
        window.webContents.send("mix-share:request", id, request);
        setTimeout(() => waiting.delete(id) && resolve(null), 2000);
    });

ipcMain.on("mix-share:reply", (event, id: unknown, reply: unknown) => {
    if (!isFromApp(event) || typeof id !== "number") return;
    waiting.get(id)?.(reply);
    waiting.delete(id);
});

type Headers = Record<string, string>;

const send = (res: http.ServerResponse, status: number, headers: Headers = {}, body?: unknown): void => {
    const json = body === undefined ? undefined : JSON.stringify(body);
    res.writeHead(status, {
        "Cache-Control": "no-store",
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...headers,
    });
    res.end(json);
};

const readBody = (req: http.IncomingMessage): Promise<unknown> =>
    new Promise((resolve) => {
        let text = "";
        req.on("data", (chunk: Buffer) => {
            text += chunk.toString("utf8");
            if (text.length > maxBodyBytes) req.destroy();
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

/** CORS for the website (and only it), including Chrome's check before reaching this computer. */
const corsFor = (origin: string | undefined): Headers | null =>
    origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : null;

const preflight: Headers = {
    "Access-Control-Allow-Methods": "GET, PUT",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
};

const getMix = async (res: http.ServerResponse, cors: Headers, url: URL): Promise<void> => {
    const serial = url.searchParams.get("serial");
    if (!isSerial(serial)) return send(res, 400, cors);
    const entry = await askPage({ kind: "get", serial });
    send(res, entry ? 200 : 404, cors, entry ?? undefined);
};

const putMix = async (req: http.IncomingMessage, res: http.ServerResponse, cors: Headers): Promise<void> => {
    if (!req.headers["content-type"]?.startsWith("application/json")) return send(res, 415, cors);
    const body = (await readBody(req)) as { serial?: unknown; mix?: unknown; changedAt?: unknown } | null;
    if (!body || !isSerial(body.serial) || typeof body.changedAt !== "number") return send(res, 400, cors);
    const reply = await askPage({ kind: "offer", serial: body.serial, mix: body.mix, changedAt: body.changedAt });
    send(res, 200, cors, reply ?? { accepted: false });
};

const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    // A page on another site resolving its own name to 127.0.0.1 (DNS rebinding) would send its own Host.
    if (req.headers.host !== `${host}:${port}`) return send(res, 421);
    const cors = corsFor(req.headers.origin);
    if (!cors) return send(res, 403);
    if (req.method === "OPTIONS") return send(res, 204, { ...cors, ...preflight });
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/api/mix") return send(res, 404, cors);
    if (req.method === "GET") return getMix(res, cors, url);
    if (req.method === "PUT") return putMix(req, res, cors);
    send(res, 405, cors);
};

/** Starts or stops sharing (Settings › Desktop app › Share mix with the website). */
export const shareMixWithWebsite = (isOn: boolean): void => {
    if (!isOn) {
        server?.close();
        server?.closeAllConnections();
        server = null;
        return;
    }
    if (server) return;
    server = http.createServer((req, res) => void handle(req, res).catch(() => send(res, 500)));
    server.headersTimeout = 10_000;
    server.requestTimeout = 10_000;
    server.on("error", () => (server = null));
    server.listen(port, host);
};
