/** The meter's floor: anything quieter reads as empty. */
export const meterFloorDb = -60;

/** Colour zones, like Console's meters: green, then yellow from −12 dBFS, red from −3 dBFS. */
export const meterZones = { cautionDb: -12, dangerDb: -3 };

/** Peaks at or above this count as a clip and light the clip indicator. */
export const clipDb = -0.1;

/** dBFS to a 0–1 fill along the meter. */
export const meterFill = (db: number): number => {
    if (!Number.isFinite(db) || db <= meterFloorDb) return 0;
    return Math.min(1, (db - meterFloorDb) / -meterFloorDb);
};

/** Where each zone starts along the meter, for drawing its colour bands. */
export const zoneStops = { caution: meterFill(meterZones.cautionDb), danger: meterFill(meterZones.dangerDb) };

/** How far a held peak falls per animation frame, in dB (about 30 dB per second at 60 fps). */
export const peakFallDb = 0.5;

export const meterTicks = [0, -3, -12, -24, -40, -60].map((db) => ({
    label: db === 0 ? "0" : `${db}`.replace("-", "−"),
    position: meterFill(db),
}));
