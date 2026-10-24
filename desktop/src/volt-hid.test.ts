import { describe, expect, test } from "vitest";
import { parseVoltHid } from "./volt-hid";

const dimReport = [240, 33, 1, 241, ...new Array<number>(34).fill(0)];
const file = { vendorId: 11098, controlUsagePage: 65281, dimReports: { "46": dimReport } };

describe("Using parseVoltHid, when the build wrote a Volt 4 Gen 2", () => {
    test("then it should give its dimming report by product ID", () => {
        expect(parseVoltHid(file)?.dimReports.get(46)).toEqual(dimReport);
    });
});

describe("Using parseVoltHid, when a report holds something that isn't a byte", () => {
    test("then it should take nothing from the file", () => {
        expect(parseVoltHid({ ...file, dimReports: { "46": [240, 256] } })).toBeNull();
    });
});

describe("Using parseVoltHid, when a report is longer than a HID report", () => {
    test("then it should take nothing from the file", () => {
        expect(parseVoltHid({ ...file, dimReports: { "46": new Array<number>(66).fill(0) } })).toBeNull();
    });
});

describe("Using parseVoltHid, when a product ID isn't a number", () => {
    test("then it should take nothing from the file", () => {
        expect(parseVoltHid({ ...file, dimReports: { volt: dimReport } })).toBeNull();
    });
});

describe("Using parseVoltHid, when the vendor ID is missing", () => {
    test("then it should take nothing from the file", () => {
        expect(parseVoltHid({ ...file, vendorId: undefined })).toBeNull();
    });
});
