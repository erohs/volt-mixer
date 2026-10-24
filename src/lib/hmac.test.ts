import crypto from "crypto";
import { describe, expect, test } from "vitest";
import { hmacSha256, sha256, toHex } from "./hmac.ts";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const repeated = (byte: number, length: number): Uint8Array => new Uint8Array(length).fill(byte);
const hmacHex = (key: Uint8Array, message: Uint8Array): string => toHex(hmacSha256(key, message));

describe("Using sha256, when the message is empty (NIST)", () => {
    test("then it should give the empty message's digest", () => {
        expect(toHex(sha256(new Uint8Array()))).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
    });
});

describe('Using sha256, when the message is "abc" (NIST, one block)', () => {
    test("then it should give its digest", () => {
        expect(toHex(sha256(text("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    });
});

describe("Using sha256, when the message is 448 bits (NIST, two blocks)", () => {
    test("then it should give its digest", () => {
        expect(toHex(sha256(text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
        );
    });
});

describe('Using sha256, when the message is a million "a"s (NIST)', () => {
    test("then it should give its digest", () => {
        expect(toHex(sha256(repeated(0x61, 1_000_000)))).toBe(
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
        );
    });
});

describe("Using sha256, when the message is any length up to three blocks", () => {
    test("then it should agree with Node's", () => {
        const lengths = Array.from({ length: 200 }, (_, length) => length);
        const disagreeing = lengths.filter((length) => {
            const message = crypto.randomBytes(length);
            return toHex(sha256(message)) !== crypto.createHash("sha256").update(message).digest("hex");
        });
        expect(disagreeing).toEqual([]);
    });
});

describe("Using hmacSha256, when the key is 20 bytes of 0x0b (RFC 4231, case 1)", () => {
    test("then it should give the case's MAC", () => {
        expect(hmacHex(repeated(0x0b, 20), text("Hi There"))).toBe(
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
        );
    });
});

describe('Using hmacSha256, when the key is "Jefe" (RFC 4231, case 2)', () => {
    test("then it should give the case's MAC", () => {
        expect(hmacHex(text("Jefe"), text("what do ya want for nothing?"))).toBe(
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
        );
    });
});

describe("Using hmacSha256, when the data is 50 bytes of 0xdd (RFC 4231, case 3)", () => {
    test("then it should give the case's MAC", () => {
        expect(hmacHex(repeated(0xaa, 20), repeated(0xdd, 50))).toBe(
            "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
        );
    });
});

describe("Using hmacSha256, when the key is 25 counting bytes (RFC 4231, case 4)", () => {
    test("then it should give the case's MAC", () => {
        const key = Uint8Array.from({ length: 25 }, (_, i) => i + 1);
        expect(hmacHex(key, repeated(0xcd, 50))).toBe(
            "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b",
        );
    });
});

describe("Using hmacSha256, when the key is longer than a block (RFC 4231, case 6)", () => {
    test("then it should hash the key first", () => {
        const message = text("Test Using Larger Than Block-Size Key - Hash Key First");
        expect(hmacHex(repeated(0xaa, 131), message)).toBe(
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
        );
    });
});

describe("Using hmacSha256, when the key and the data are longer than a block (RFC 4231, case 7)", () => {
    test("then it should give the case's MAC", () => {
        const message = text(
            "This is a test using a larger than block-size key and a larger than block-size data. The key needs to " +
                "be hashed before being used by the HMAC algorithm.",
        );
        expect(hmacHex(repeated(0xaa, 131), message)).toBe(
            "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
        );
    });
});
