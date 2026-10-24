import { base64UrlToBytes } from "./base64url.ts";
import { decodeMixCode } from "./mix-code.ts";

/*
 * Mix links: the website's address with the mix after `#m=` (the short code, src/lib/mix-code.ts)
 * or, in older links, `#mix=` (the saved mix as base64 JSON). What they carry is untrusted, and is
 * validated where it's applied (applySavedMix).
 */

/** An older link's mix: base64 JSON; null when it isn't one. */
const decodeLongMix = (code: string): unknown => {
    try {
        return JSON.parse(new TextDecoder().decode(base64UrlToBytes(code)));
    } catch {
        return null;
    }
};

/** Whether an address carries a mix: `#m=` (short) or `#mix=` (older links). */
export const isMixHash = (hash: string): boolean => /^#(m|mix)=/.test(hash);

/** The mix in a link's address part; null when there's none. */
export const mixFromHash = (hash: string): unknown => {
    const short = hash.match(/^#m=([\w-]+)$/)?.[1];
    if (short) return decodeMixCode(short);
    const long = hash.match(/^#mix=([\w-]+)$/)?.[1];
    return long ? decodeLongMix(long) : null;
};

/** The mix in a link as typed or pasted (relative to `base`); null when it isn't a mix link. Never throws. */
export const parseMixLink = (text: string, base?: string): unknown => {
    try {
        return mixFromHash(new URL(text.trim(), base).hash);
    } catch {
        return null;
    }
};
