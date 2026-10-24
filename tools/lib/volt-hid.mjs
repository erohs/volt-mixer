// Opens the Volt's control interface with node-hid: the vendor ID, product ID and usage page in
// src/data (protocol), and the spec for the firmware it reports. node-hid puts the report ID in
// byte 0 of each incoming report on Windows.
import { createRequire } from "module";
import { identify, stateRequest } from "../../src/lib/commands.ts";
import { parseIdentify } from "../../src/lib/reports.ts";
import { protocol, specFor } from "../../src/lib/spec.ts";

const require = createRequire(import.meta.url);
const HID = require("node-hid");

const isControlInterface = (info) =>
    info.vendorId === protocol.vendorId &&
    info.productId === protocol.productId &&
    info.usagePage === protocol.controlUsagePage;

const findControlInterface = () => {
    const info = HID.devices().find(isControlInterface);
    if (!info) throw new Error(`The ${protocol.device}'s control interface wasn't found. Is it plugged in?`);
    return info;
};

export const send = (volt, report) => volt.device.write([report.reportId, ...report.data]);

/** Calls `listener` with every report the Volt sends; returns a function that stops it. */
export const onReport = (volt, listener) => {
    volt.listeners.add(listener);
    return () => volt.listeners.delete(listener);
};

/** Sends `report` and resolves with the first report `isReply` accepts; rejects after `timeoutMs`. */
export const request = (volt, report, isReply, timeoutMs = 1500) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            stop();
            reject(new Error(`No reply from the Volt within ${timeoutMs} ms`));
        }, timeoutMs);
        const stop = onReport(volt, (buffer) => {
            if (!isReply(buffer)) return;
            clearTimeout(timer);
            stop();
            resolve(buffer);
        });
        send(volt, report);
    });

export const isStateReply = (spec, buffer) =>
    buffer[0] === spec.reports.stateReply.id && buffer[1] === spec.reports.stateReply.cmd;

/** The state dump, from the report ID on. */
export const requestState = (volt) =>
    request(volt, stateRequest(volt.spec), (buffer) => isStateReply(volt.spec, buffer));

const identifyVolt = async (volt) => {
    const isIdentifyReply = (buffer) => buffer[0] === volt.spec.reports.identifyReply.id;
    const { version } = parseIdentify((await request(volt, identify(volt.spec), isIdentifyReply)).subarray(1));
    const { spec, isExact } = specFor(version);
    if (!isExact) console.warn(`Firmware ${version} hasn't been checked; using the closest known spec.`);
    return { version, spec };
};

/** Opens the Volt. `isIdentified: false` sends nothing and uses the newest spec (for listening only). */
export const openVolt = async ({ isIdentified = true } = {}) => {
    const volt = { device: new HID.HID(findControlInterface().path), spec: specFor("").spec, version: "unknown" };
    volt.listeners = new Set();
    volt.device.on("data", (buffer) => volt.listeners.forEach((listener) => listener(buffer)));
    volt.device.on("error", (error) => console.error("HID error:", error.message));
    if (!isIdentified) return volt;
    try {
        return Object.assign(volt, await identifyVolt(volt));
    } catch (error) {
        volt.device.close();
        throw error;
    }
};

export const closeVolt = (volt) => volt.device.close();
