/* Release versions ("v0.2.1", "0.2.0"), compared part by part. No Electron here, so Vitest can test it. */

const parts = (version: string): number[] =>
    version
        .replace(/^v/, "")
        .split(".")
        .map((part) => Number.parseInt(part, 10) || 0);

export const isNewer = (candidate: string, current: string): boolean => {
    const [a, b] = [parts(candidate), parts(current)];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
    }
    return false;
};
