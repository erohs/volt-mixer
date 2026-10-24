/*
 * SHA-256 (FIPS 180-4) and HMAC-SHA256 (RFC 2104), for signing the phone remote's requests
 * (src/lib/phone-signature.ts). The phone's page is plain HTTP on the home network, which isn't a
 * secure context, so crypto.subtle isn't there.
 */

const roundConstants = Uint32Array.from([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
]);
const initialHash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const blockBytes = 64;

const rotate = (word: number, bits: number): number => (word >>> bits) | (word << (32 - bits));

/** The message, then a 1 bit, zeros, and its length in bits, filling whole 64-byte blocks. */
const pad = (message: Uint8Array): DataView => {
    const length = Math.ceil((message.length + 9) / blockBytes) * blockBytes;
    const padded = new Uint8Array(length);
    padded.set(message);
    padded[message.length] = 0x80;
    const view = new DataView(padded.buffer);
    const bits = message.length * 8;
    view.setUint32(length - 8, Math.floor(bits / 2 ** 32));
    view.setUint32(length - 4, bits >>> 0);
    return view;
};

/** The 64 words one block is mixed in with. */
const schedule = (view: DataView, offset: number): Uint32Array => {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
        const early = words[i - 15]!;
        const late = words[i - 2]!;
        const sigma0 = rotate(early, 7) ^ rotate(early, 18) ^ (early >>> 3);
        const sigma1 = rotate(late, 17) ^ rotate(late, 19) ^ (late >>> 10);
        words[i] = words[i - 16]! + sigma0 + words[i - 7]! + sigma1;
    }
    return words;
};

/** The working variables a to h. */
type Working = [number, number, number, number, number, number, number, number];

/** Mixes one block's words into the hash. */
const compress = (hash: Uint32Array, words: Uint32Array): void => {
    let [a, b, c, d, e, f, g, h] = Array.from(hash) as Working;
    for (let i = 0; i < 64; i++) {
        const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
        const choice = (e & f) ^ (~e & g);
        const first = (h + sum1 + choice + roundConstants[i]! + words[i]!) >>> 0;
        const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        [h, g, f, e, d, c, b, a] = [g, f, e, (d + first) >>> 0, c, b, a, (first + sum0 + majority) >>> 0];
    }
    [a, b, c, d, e, f, g, h].forEach((word, i) => (hash[i] = hash[i]! + word));
};

export const sha256 = (message: Uint8Array): Uint8Array => {
    const view = pad(message);
    const hash = Uint32Array.from(initialHash);
    for (let offset = 0; offset < view.byteLength; offset += blockBytes) compress(hash, schedule(view, offset));
    const digest = new DataView(new ArrayBuffer(32));
    hash.forEach((word, i) => digest.setUint32(i * 4, word));
    return new Uint8Array(digest.buffer);
};

const joined = (first: Uint8Array, second: Uint8Array): Uint8Array => {
    const bytes = new Uint8Array(first.length + second.length);
    bytes.set(first);
    bytes.set(second, first.length);
    return bytes;
};

export const hmacSha256 = (key: Uint8Array, message: Uint8Array): Uint8Array => {
    const block = new Uint8Array(blockBytes);
    block.set(key.length > blockBytes ? sha256(key) : key);
    const inner = block.map((byte) => byte ^ 0x36);
    const outer = block.map((byte) => byte ^ 0x5c);
    return sha256(joined(outer, sha256(joined(inner, message))));
};

export const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
