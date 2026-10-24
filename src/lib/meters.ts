/** The meter's floor: anything quieter reads as empty. */
const meterFloorDb = -60;

/** Colour zones, like Console's meters: green, then yellow from −12 dBFS, red from −3 dBFS. */
const meterZones = { cautionDb: -12, dangerDb: -3 };

/** Peaks at or above this count as a clip and light the clip indicator. */
export const clipDb = -0.1;

/** dBFS to a 0–1 fill along the meter. */
export const meterFill = (db: number): number => {
    if (!Number.isFinite(db) || db <= meterFloorDb) return 0;
    return Math.min(1, (db - meterFloorDb) / -meterFloorDb);
};

/** Where each zone starts along the meter, for drawing its colour bands. */
export const zoneStops = { caution: meterFill(meterZones.cautionDb), danger: meterFill(meterZones.dangerDb) };

/** How fast a held peak falls, in dB per second, whatever the screen's frame rate. */
export const peakFallDbPerSecond = 25;
