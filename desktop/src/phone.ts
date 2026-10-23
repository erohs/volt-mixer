import { app, ipcMain } from "electron";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { readJson, send } from "./http-helpers";
import { askPage } from "./page-requests";
import { isFromApp } from "./protocol";
import { csp, readSiteFile } from "./site-files";
import { getMainWindow } from "./windows";

/*
 * The phone remote: the tray page, served on the home network while Settings › Desktop app ›
 * Phone remote is on. The phone pairs by scanning a QR code that carries a secret token; every
 * API request must send it. Only private addresses are served, the Host must be this computer's
 * address (against DNS rebinding), and only the tray page's own files are offered. It's plain
 * HTTP, so someone able to watch the home network could read the token: the setting says so.
 *
 *   GET  /api/events   one JSON line per change ({ kind: "snapshot", snapshot }), blank keep-alives
 *   POST /api/intent   { client, seq, intent } → { result }; an older seq from a phone is ignored
 */

const port = 48190;
const maxStreams = 4;
const maxBodyBytes = 4096;
const intentsPerSecond = 50;
const securityHeaders = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
};
const pageFiles = new Set(["/tray/", "/theme.js", "/icon.svg", "/apple-touch-icon.png", "/icon-192.png"]);

let server: http.Server | null = null;
let boundAddress = "";
let startError = "";
let keepAlive: NodeJS.Timeout | undefined;
const streams = new Set<http.ServerResponse>();
const lastSeq = new Map<string, number>();
const rates = new Map<string, { second: number; count: number }>();

// ---------- the pairing token ----------

const tokenFile = (): string => path.join(app.getPath("userData"), "phone.json");
let token = "";

/** A new token: phones paired with the old one stop working. */
export const rotatePhoneToken = (): void => {
    token = crypto.randomBytes(32).toString("base64url");
    try {
        fs.writeFileSync(tokenFile(), JSON.stringify({ token }));
    } catch {
        /* Not writable: the token lasts until the app quits. */
    }
    for (const stream of streams) stream.end();
};

const currentToken = (): string => {
    if (token) return token;
    try {
        const saved = (JSON.parse(fs.readFileSync(tokenFile(), "utf8")) as { token?: unknown }).token;
        if (typeof saved === "string" && saved.length >= 32) return (token = saved);
    } catch {
        /* First run: make one. */
    }
    rotatePhoneToken();
    return token;
};

const digest = (text: string): Buffer => crypto.createHash("sha256").update(text).digest();
const hasToken = (authorization: string | undefined): boolean =>
    crypto.timingSafeEqual(digest(authorization?.match(/^Bearer (\S+)$/)?.[1] ?? ""), digest(currentToken()));

// ---------- addresses ----------

const isPrivate = (ip: string): boolean => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);

export interface IPhoneAddress {
    address: string;
    /** The adapter's name, e.g. "Ethernet" or "Wi-Fi". */
    name: string;
}

/* Adapters a phone can't come in through: virtual switches, VPN tunnels, Bluetooth and the like. */
const unreachable =
    /vethernet|hyper-v|virtualbox|vmware|wsl|docker|vpn|wireguard|tailscale|zerotier|nordlynx|bluetooth|loopback|^(tun|tap|utun|wg)\d*$/i;

/** Home routers mostly hand out 192.168.x.x, then 10.x.x.x; 172.16–31 is often a virtual network. */
const rank = (address: string): number => (address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : 2);

/**
 * This computer's addresses on its home network (Wi-Fi or Ethernet), best first, for the QR code.
 * If every adapter looks virtual, all the private ones are offered rather than none.
 */
export const phoneAddresses = (): IPhoneAddress[] => {
    const all = Object.entries(os.networkInterfaces()).flatMap(([name, nets]) =>
        (nets ?? [])
            .filter((net) => net.family === "IPv4" && !net.internal && isPrivate(net.address))
            .filter((net) => !net.address.startsWith("169.254."))
            .map((net) => ({ address: net.address, name })),
    );
    const real = all.filter((entry) => !unreachable.test(entry.name));
    return (real.length > 0 ? real : all).sort((a, b) => rank(a.address) - rank(b.address));
};

// ---------- snapshots from the main window, to the phones ----------

let latest = "";
let sent = "";
let sendTimer: NodeJS.Timeout | undefined;

const toPhones = (line: string): void => {
    for (const stream of streams) stream.write(`${line}\n`);
};

/** At most 20 a second, and only when something changed. */
ipcMain.on("phone:publish", (event, snapshot: unknown) => {
    if (!isFromApp(event)) return;
    latest = JSON.stringify({ kind: "snapshot", snapshot });
    if (sendTimer || latest === sent) return;
    sendTimer = setTimeout(() => {
        sendTimer = undefined;
        sent = latest;
        toPhones(latest);
    }, 50);
});

/** The main window publishes to phones only while some are connected. */
const tellPageHowMany = (): void => getMainWindow()?.webContents.send("phone:count", streams.size);

// ---------- requests ----------

const remoteIp = (req: http.IncomingMessage): string => req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";

/** Why a request is refused (a status), or 0 if it may go on. */
const refusal = (req: http.IncomingMessage): number => {
    if (req.headers.host !== `${boundAddress}:${port}`) return 421;
    if (!isPrivate(remoteIp(req))) return 403;
    const origin = req.headers.origin;
    return origin && origin !== `http://${boundAddress}:${port}` ? 403 : 0;
};

const serveFile = async (res: http.ServerResponse, pathname: string): Promise<void> => {
    if (pathname === "/") return send(res, 302, { Location: "/tray/" });
    const isPageFile = pageFiles.has(pathname) || pathname.startsWith("/_astro/");
    const file = isPageFile ? await readSiteFile(pathname) : null;
    if (!file) return send(res, 404, securityHeaders);
    res.writeHead(200, { ...securityHeaders, "Content-Type": file.type, "Cache-Control": "no-cache" });
    res.end(file.body);
};

const openStream = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    if (streams.size >= maxStreams) return send(res, 503, securityHeaders);
    res.writeHead(200, { ...securityHeaders, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
    res.flushHeaders();
    res.socket?.setNoDelay(true);
    streams.add(res);
    tellPageHowMany();
    if (latest) res.write(`${latest}\n`);
    req.on("close", () => {
        streams.delete(res);
        tellPageHowMany();
    });
};

/** Counted per address: the client name is the phone's own choice. */
const isWithinRate = (address: string): boolean => {
    const second = Math.floor(Date.now() / 1000);
    const rate = rates.get(address);
    const count = rate?.second === second ? rate.count + 1 : 1;
    if (rates.size > 64) rates.clear();
    rates.set(address, { second, count });
    return count <= intentsPerSecond;
};

/** Keeps each phone page's last sequence number; past 64, the one heard from longest ago goes. */
const rememberSeq = (client: string, seq: number): void => {
    lastSeq.delete(client);
    if (lastSeq.size >= 64) lastSeq.delete(lastSeq.keys().next().value ?? "");
    lastSeq.set(client, seq);
};

/** One intent from a phone. Its seq only grows, so a late or repeated one is dropped, not applied. */
const takeIntent = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    if (!req.headers["content-type"]?.startsWith("application/json")) return send(res, 415, securityHeaders);
    const body = (await readJson(req, maxBodyBytes)) as { client?: unknown; seq?: unknown; intent?: unknown } | null;
    const { client, seq } = body ?? {};
    if (typeof client !== "string" || client.length > 40 || typeof seq !== "number")
        return send(res, 400, securityHeaders);
    if (!isWithinRate(remoteIp(req))) return send(res, 429, securityHeaders);
    if (seq <= (lastSeq.get(client) ?? -1)) return send(res, 200, securityHeaders, { result: "stale" });
    rememberSeq(client, seq);
    const result = await askPage("phone-intent", body?.intent);
    send(res, 200, securityHeaders, { result: result ?? "ignored" });
};

const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const refused = refusal(req);
    if (refused) return send(res, refused, securityHeaders);
    const url = new URL(req.url ?? "/", `http://${boundAddress}:${port}`);
    if (!url.pathname.startsWith("/api/")) return req.method === "GET" ? serveFile(res, url.pathname) : send(res, 405);
    if (!hasToken(req.headers.authorization)) return send(res, 401, securityHeaders);
    if (url.pathname === "/api/events" && req.method === "GET") return openStream(req, res);
    if (url.pathname === "/api/intent" && req.method === "POST") return takeIntent(req, res);
    send(res, 404, securityHeaders);
};

// ---------- on and off ----------

export const stopPhoneRemote = (): void => {
    clearInterval(keepAlive);
    for (const stream of streams) stream.end();
    streams.clear();
    server?.close();
    server?.closeAllConnections();
    server = null;
    tellPageHowMany();
};

/** Serves phones on `address` (or this computer's first private address). */
export const startPhoneRemote = (address: string): void => {
    stopPhoneRemote();
    const addresses = phoneAddresses().map((entry) => entry.address);
    boundAddress = addresses.includes(address) ? address : (addresses[0] ?? "");
    startError = boundAddress ? "" : "This computer isn't on a home network.";
    if (!boundAddress) return;
    server = http.createServer((req, res) => void handle(req, res).catch(() => send(res, 500)));
    Object.assign(server, { headersTimeout: 10_000, requestTimeout: 10_000, maxConnections: 16 });
    server.on("error", (error: NodeJS.ErrnoException) => {
        startError =
            error.code === "EADDRINUSE"
                ? `Port ${port} is in use by another program.`
                : "The phone remote couldn't start.";
        server = null;
    });
    server.listen(port, boundAddress);
    keepAlive = setInterval(() => toPhones(""), 20_000);
};

/** What Settings shows: the address, the link for the QR code, and how many phones are connected. */
export const phoneInfo = () => ({
    isRunning: server !== null,
    address: boundAddress,
    addresses: phoneAddresses(),
    link: server ? `http://${boundAddress}:${port}/tray/#t=${currentToken()}` : "",
    error: startError,
    phones: streams.size,
});
