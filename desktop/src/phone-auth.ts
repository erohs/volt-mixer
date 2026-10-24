import crypto from "crypto";

/*
 * Whether a phone remote request comes from a paired phone. The phone signs each request with
 * HMAC-SHA256, keyed with the pairing token from the QR code, which never crosses the network
 * (src/lib/phone-signature.ts). A stream opens by signing a challenge this app just made up, used
 * once; each change is signed with that challenge and a number higher than the last. So a request
 * copied off the network can't open a stream or make a change again. No Electron here, so Vitest
 * can test it.
 */

export interface ISignedRequest {
    method: string;
    path: string;
    client: string;
    seq: number;
    nonce: string;
    body: string;
}

/** The text a signature covers; the same as the phone's (src/lib/phone-signature.ts). */
export const signedText = ({ method, path, client, seq, nonce, body }: ISignedRequest): string =>
    [method, path, client, String(seq), nonce, body].join("\n");

const hexSignature = /^[0-9a-f]{64}$/;

export const isSignedBy = (token: string, request: ISignedRequest, signature: string): boolean => {
    if (!hexSignature.test(signature)) return false;
    const expected = crypto.createHmac("sha256", token).update(signedText(request)).digest();
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), expected);
};

const challengeMs = 10_000;
const maxChallenges = 8;
/** Each challenge not yet used, with when it was made. */
const challenges = new Map<string, number>();

/** A new challenge; past eight waiting, the oldest goes. */
export const issueChallenge = (now = Date.now()): string => {
    for (const [nonce, madeAt] of challenges) if (now - madeAt > challengeMs) challenges.delete(nonce);
    if (challenges.size >= maxChallenges) challenges.delete(challenges.keys().next().value ?? "");
    const nonce = crypto.randomBytes(16).toString("base64url");
    challenges.set(nonce, now);
    return nonce;
};

/** Uses up a challenge: true once, within 10 s of it being made. */
export const takeChallenge = (nonce: string, now = Date.now()): boolean => {
    const madeAt = challenges.get(nonce);
    challenges.delete(nonce);
    return madeAt !== undefined && now - madeAt <= challengeMs;
};
