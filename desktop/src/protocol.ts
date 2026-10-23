import { protocol, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import fs from "fs/promises";
import path from "path";

/*
 * The site is served from app://volt/, a secure origin (WebHID needs one) where the build's
 * root-absolute URLs (/_astro/...) resolve. Every response carries a strict CSP.
 */

export const appOrigin = "app://volt";

/** IPC is answered only for the app's own pages. */
export const isFromApp = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    event.senderFrame?.url.startsWith(`${appOrigin}/`) === true;

const contentTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".xml": "application/xml",
};

/* Inline style attributes carry slider ticks and meter zones; scripts are files only. */
const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
].join("; ");

/** Before the app is ready: makes app:// a standard, secure scheme. */
export const registerAppScheme = (): void =>
    protocol.registerSchemesAsPrivileged([
        { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
    ]);

const notFound = (): Response => new Response("Not found", { status: 404 });

/** The file a request maps to inside `siteDir`, or null if it would leave it. */
const fileFor = (siteDir: string, url: URL): string | null => {
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(siteDir, relative, url.pathname.endsWith("/") ? "index.html" : "");
    return file.startsWith(siteDir + path.sep) ? file : null;
};

/** Serves the built site from `siteDir`. */
export const serveSite = (siteDir: string): void =>
    protocol.handle("app", async (request) => {
        const url = new URL(request.url);
        const file = url.host === "volt" ? fileFor(path.resolve(siteDir), url) : null;
        if (!file) return notFound();
        try {
            const body = await fs.readFile(file);
            const type = contentTypes[path.extname(file)] ?? "application/octet-stream";
            return new Response(body, { headers: { "Content-Type": type, "Content-Security-Policy": csp } });
        } catch {
            return notFound();
        }
    });
