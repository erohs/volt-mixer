import { devices, HID } from "node-hid";
import { voltHid } from "./hid";
import { askPage } from "./page-requests";
import { loadSettings } from "./settings";

/*
 * Turns the Volt's display off as this computer sleeps or shuts down, if chosen in Settings, so it
 * isn't lit all night (src/scripts/display-fade.ts). Windows reports a shutdown only to windows
 * (query-session-end), and goes on as soon as the handler returns: too soon for the page to send
 * anything. So main writes the report itself, synchronously, before returning; the report comes
 * from the build (volt-hid.ts), never from a page. It's sent only while the page says it's driving
 * a Volt: a Volt with firmware it doesn't know waits for the user's go-ahead, and so does this.
 * The page is told too, to note that its Volt is dimmed. Waking asks the page to bring the display
 * back, whether or not the setting is still on.
 */

let isVoltLive = false;

/** From the main window: whether it's driving a Volt, and may send to it. */
export const setVoltLive = (isLive: unknown): void => {
    isVoltLive = isLive === true;
};

const writeDimReports = (): void => {
    const volts = voltHid();
    if (!volts) return;
    for (const [productId, report] of volts.dimReports) {
        const info = devices(volts.vendorId, productId).find((device) => device.usagePage === volts.controlUsagePage);
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

/** Before sleep, shutdown or signing out (lifecycle.ts). */
export const dimDisplay = (): void => {
    if (!loadSettings().dimOnSleep) return;
    if (isVoltLive) writeDimReports();
    void askPage("display-fade", "dim");
};

/** On waking. */
export const undimDisplay = (): void => void askPage("display-fade", "undim");
