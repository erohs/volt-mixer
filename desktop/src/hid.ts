import type { Session } from "electron";
import { appOrigin } from "./protocol";

/*
 * WebHID in the app. The page's own code (src/scripts/volt-connection.ts) talks to the Volt as it
 * does in a browser; these handlers stand in for Chrome's permission prompts. The Volt is allowed
 * without asking, so it connects at startup. Main can't see HID collections, so the page still
 * checks for the Volt's control interface (usage page 0xff01) itself.
 */

/* Universal Audio, Volt 4 Gen 2 (src/data/volt4-gen2.json). Add product IDs with new models. */
export const voltVendorId = 0x2b5a;
export const voltProductIds = new Set([46]);
/** The vendor usage page of the Volt's control interface, the one that takes commands. */
export const voltControlUsagePage = 0xff01;

/* Serial devices report their IDs as strings; only HID devices (numbers) can be the Volt. */
const isVolt = (device: { vendorId?: number | string | undefined; productId?: number | string | undefined }): boolean =>
    device.vendorId === voltVendorId && typeof device.productId === "number" && voltProductIds.has(device.productId);

const isAppOrigin = (origin: string | undefined): boolean => origin === appOrigin;

/** Only HID (for the Volt) and writing to the clipboard (Copy link) are allowed, and only for the app. */
const allowedPermissions = new Set(["hid", "clipboard-sanitized-write"]);

export const allowVolt = (session: Session): void => {
    session.setPermissionCheckHandler(
        (_contents, permission, origin) => isAppOrigin(origin) && allowedPermissions.has(permission),
    );
    session.setPermissionRequestHandler((contents, permission, callback) =>
        // Not new URL(…).origin: for a custom scheme like app:// that's "null".
        callback(contents.getURL().startsWith(`${appOrigin}/`) && allowedPermissions.has(permission)),
    );
    session.setDevicePermissionHandler(
        (details) => details.deviceType === "hid" && isAppOrigin(details.origin) && isVolt(details.device),
    );
    // Connect Volt after a Disconnect: pick the Volt instead of showing a chooser.
    session.on("select-hid-device", (event, details, callback) => {
        event.preventDefault();
        callback(details.deviceList.find(isVolt)?.deviceId ?? "");
    });
};
