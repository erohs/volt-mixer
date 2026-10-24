import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/*
 * The phone remote's pairing token: the key phones sign their requests with (phone-auth.ts). It
 * reaches a phone only in the QR code's link, after the #, which browsers never send. Kept in the
 * user data folder, readable only by this user.
 */

const tokenFile = (): string => path.join(app.getPath("userData"), "phone.json");
/**
 * Up to 0.5.0 phones sent the token itself with every request, where it could be read off the
 * network; a token from then is replaced, not kept as a key.
 */
const scheme = "hmac";
let token = "";

/** Owner only. Writing with a mode sets it only on a new file, and 0.5.0 wrote it readable to all. */
const restrict = (): void => {
    try {
        fs.chmodSync(tokenFile(), 0o600);
    } catch {
        /* Windows keeps the user data folder to its user anyway. */
    }
};

const save = (): void => {
    try {
        fs.writeFileSync(tokenFile(), JSON.stringify({ token, scheme }), { mode: 0o600 });
        restrict();
    } catch {
        /* Not writable: the token lasts until the app quits. */
    }
};

/** A new token: phones paired with the old one stop working. */
export const rotateToken = (): void => {
    token = crypto.randomBytes(32).toString("base64url");
    save();
};

export const currentToken = (): string => {
    if (token) return token;
    try {
        const saved = JSON.parse(fs.readFileSync(tokenFile(), "utf8")) as { token?: unknown; scheme?: unknown };
        if (saved.scheme === scheme && typeof saved.token === "string" && /^[\w-]{32,}$/.test(saved.token)) {
            restrict();
            return (token = saved.token);
        }
    } catch {
        /* First run: make one. */
    }
    rotateToken();
    return token;
};
