import { powerMonitor, type BrowserWindow } from "electron";
import { devices, HID } from "node-hid";
import { voltControlUsagePage, voltProductIds, voltVendorId } from "./hid";
import { askPage } from "./page-requests";
import { loadSettings } from "./settings";

/*
 * Turns the Volt's display off as this computer sleeps or shuts down, if chosen in Settings, so it
 * isn't lit all night (src/scripts/display-fade.ts). Windows reports a shutdown only to windows
 * (query-session-end), and goes on as soon as the handler returns: too soon for the page to send
 * anything. So main writes the report itself, synchronously, before returning; the page is told
 * too, to note that its Volt is dimmed. Waking asks the page to bring the display back, whether or
 * not the setting is still on.
 */

/** The report that dims the Volt, from the page, which knows its firmware's protocol. */
let dimReport: number[] | null = null;

const isByte = (value: unknown): value is number =>
    Number.isInteger(value) && (value as number) <= 255 && (value as number) >= 0;

export const setDimReport = (report: unknown): void => {
    const isReport = Array.isArray(report) && report.length > 1 && report.length <= 65 && report.every(isByte);
    dimReport = isReport ? report : null;
};

const writeDimReport = (report: number[]): void => {
    for (const productId of voltProductIds) {
        const info = devices(voltVendorId, productId).find((device) => device.usagePage === voltControlUsagePage);
        if (!info?.path) continue;
        try {
            const volt = new HID(info.path, { nonExclusive: true });
            volt.write(report);
            volt.close();
        } catch {
            /* Gone already (the KVM switched away): nothing to dim. */
        }
    }
};

const dim = (): void => {
    if (!loadSettings().dimOnSleep) return;
    if (dimReport) writeDimReport(dimReport);
    void askPage("display-fade", "dim");
};

export const watchPower = (window: BrowserWindow): void => {
    powerMonitor.on("suspend", dim);
    // macOS and Linux; Windows tells the window instead.
    powerMonitor.on("shutdown", dim);
    window.on("query-session-end", dim);
    powerMonitor.on("resume", () => void askPage("display-fade", "undim"));
};
