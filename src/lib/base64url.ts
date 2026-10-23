/* URL-safe base64 without padding, for the codes in mix links. */

export const bytesToBase64Url = (bytes: ArrayLike<number>): string =>
    btoa(String.fromCharCode(...Array.from(bytes)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");

/** Throws on text that isn't base64 (atob's InvalidCharacterError); callers turn that into "no mix". */
export const base64UrlToBytes = (code: string): Uint8Array =>
    Uint8Array.from(atob(code.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
