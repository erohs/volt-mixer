import { brightness } from "./commands.ts";
import { dimmedBrightness } from "./display-fade.ts";
import { protocol as recorded, specFor, type IProtocol } from "./spec.ts";

/*
 * What the desktop app's main process needs from the protocol, written into its copy of the site
 * as desktop-hid.json (desktop/scripts/build-site.mjs, read by desktop/src/volt-hid.ts): which
 * Volts it may open, and the report that turns each one's display off at sleep and shutdown.
 * Main can't import src/lib, and never takes bytes from a page.
 */

export interface IDesktopHid {
    vendorId: number;
    controlUsagePage: number;
    /** Per product ID: the report ID, then the data. */
    dimReports: Record<string, number[]>;
}

/**
 * The file's contents. Main sends the same report whatever firmware the Volt has, so every
 * recorded firmware has to agree on it; if they don't, the build stops rather than guess.
 */
export const desktopHid = (protocol: IProtocol = recorded): IDesktopHid => {
    const reports = Object.keys(protocol.firmware).map((version) => {
        const report = brightness(specFor(version, protocol).spec, dimmedBrightness);
        return [report.reportId, ...report.data];
    });
    if (new Set(reports.map(String)).size !== 1) throw new Error("The recorded firmwares disagree on the dim report.");
    return {
        vendorId: protocol.vendorId,
        controlUsagePage: protocol.controlUsagePage,
        dimReports: { [protocol.productId]: reports[0]! },
    };
};
