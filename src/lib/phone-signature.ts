import { hmacSha256, toHex } from "./hmac.ts";

/*
 * How a phone signs its requests to the desktop app's phone remote (desktop/src/phone-auth.ts
 * checks them). The pairing token from the QR code is the HMAC key and never crosses the network.
 * A stream is opened by signing a challenge the app just made up; each change on it is signed
 * with that challenge and a number that only grows, so a copied request can't be played again.
 */

export interface ISignedRequest {
    method: "GET" | "POST";
    path: string;
    /** The phone page's own name: letters, digits, _ and -. */
    client: string;
    /** 0 opens the stream; each change after it is higher than the last. */
    seq: number;
    /** The app's challenge the stream was opened with. */
    nonce: string;
    body: string;
}

/** The text a signature covers. desktop/src/phone-auth.ts builds the same, and a test holds them together. */
export const signedText = ({ method, path, client, seq, nonce, body }: ISignedRequest): string =>
    [method, path, client, String(seq), nonce, body].join("\n");

const encoder = new TextEncoder();

/** The request's signature in hex, keyed with the pairing token. */
export const signRequest = (token: string, request: ISignedRequest): string =>
    toHex(hmacSha256(encoder.encode(token), encoder.encode(signedText(request))));
