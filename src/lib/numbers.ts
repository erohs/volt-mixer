export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

export const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
