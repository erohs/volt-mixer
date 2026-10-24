/*
 * The Volts the app may open, and the report that turns each one's display off, from the site's
 * desktop-hid.json. scripts/build-site.mjs writes it from src/data and src/lib/commands.ts, so
 * the protocol stays there and main never takes bytes from a page. It's checked all the same,
 * since main writes these bytes to the Volt. No Electron here, so Vitest can test it.
 *
 *   { "vendorId": 11098, "controlUsagePage": 65281, "dimReports": { "46": [240, 33, 1, …] } }
 */

export interface IVoltHid {
    vendorId: number;
    /** The vendor usage page of the HID interface that takes commands. */
    controlUsagePage: number;
    /** Each supported product ID, with its dimming report: the report ID, then the data. */
    dimReports: Map<number, number[]>;
}

const isWord = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) > 0 && Number(value) <= 0xffff;
const isByte = (value: unknown): boolean => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xff;
/** A report ID and up to 64 bytes of data, the most a full-speed USB HID report carries. */
const isReport = (value: unknown): value is number[] =>
    Array.isArray(value) && value.length > 1 && value.length <= 65 && value.every(isByte);

const objectOf = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** The file's contents, or null if anything in it is off (then no Volt is opened or dimmed by main). */
export const parseVoltHid = (value: unknown): IVoltHid | null => {
    const { vendorId, controlUsagePage, dimReports } = objectOf(value);
    if (!isWord(vendorId) || !isWord(controlUsagePage)) return null;
    const reports = Object.entries(objectOf(dimReports)).map(([id, report]) => [Number(id), report] as const);
    if (reports.length === 0 || !reports.every(([id, report]) => isWord(id) && isReport(report))) return null;
    return { vendorId, controlUsagePage, dimReports: new Map(reports as [number, number[]][]) };
};
