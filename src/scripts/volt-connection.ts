import { identify, stateRequest } from "../lib/commands.ts";
import type { IReport } from "../lib/commands.ts";
import { parseIdentify } from "../lib/reports.ts";
import { modelName, newestSpec, protocol, specFor } from "../lib/spec.ts";
import type { ISpec } from "../lib/spec.ts";

/*
 * The page's one link to the Volt over WebHID. Everything the controller needs is exported here,
 * so a desktop app could swap in a native HID bridge with the same functions and events.
 */

export interface IConnectionInfo {
    version: string;
    serial: string;
    specVersion: string;
    isExact: boolean;
    isIdentified: boolean;
}

/** "connected" (IConnectionInfo), "disconnected", "report" ({ reportId, data }), "error" and "sendfailed" ({ message }). */
export const connectionEvents = new EventTarget();

const vendorPage = 0xff01;
let device: HIDDevice | null = null;
let currentSpec: ISpec | null = null;
let adopting: Promise<boolean> | null = null;
/** Set by disconnect(): the page stays disconnected (no automatic reconnect) until pair(). */
let isHeldOff = false;
let queue = Promise.resolve();

const emit = (type: string, detail?: unknown): boolean =>
    connectionEvents.dispatchEvent(new CustomEvent(type, { detail }));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const bytesOf = (event: HIDInputReportEvent): Uint8Array =>
    new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);

export const isWebHidSupported = (): boolean => "hid" in navigator;
export const connectedSpec = (): ISpec | null => (device ? currentSpec : null);

const declaresCommandReport = (collection: HIDCollectionInfo): boolean =>
    (collection.outputReports ?? []).some((report) => report.reportId === newestSpec().reports.command.id) ||
    (collection.children ?? []).some(declaresCommandReport);

/** The Volt's control interface: its vendor usage page, declaring the command report we decoded. */
const isVoltControl = (candidate: HIDDevice): boolean =>
    candidate.vendorId === protocol.vendorId &&
    candidate.productId === protocol.productId &&
    candidate.collections.some((c) => c.usagePage === vendorPage && declaresCommandReport(c));

const onInput = (event: HIDInputReportEvent): void => {
    if (event.device === device) emit("report", { reportId: event.reportId, data: bytesOf(event) });
};

const sendNow = async (target: HIDDevice, reports: IReport[]): Promise<void> => {
    for (const [i, report] of reports.entries()) {
        if (device !== target) return;
        try {
            await target.sendReport(report.reportId, report.data as Uint8Array<ArrayBuffer>);
        } catch (error) {
            emit("sendfailed", {
                message: `Couldn't send to the Volt (${(error as Error).message}).`,
                unsent: reports.slice(i),
            });
            return;
        }
    }
};

/** Sends in order, bound to the device connected when queued, so nothing crosses a KVM switch. */
export const send = (reports: IReport[]): void => {
    const target = device;
    if (!target || reports.length === 0) return;
    queue = queue.then(() => sendNow(target, reports));
};

export const requestState = (): void => {
    if (currentSpec) send([stateRequest(currentSpec)]);
};

/** Sends one report and resolves with the first input report whose ID matches, or null. */
const request = (report: IReport, reportId: number, timeoutMs: number): Promise<Uint8Array | null> => {
    const target = device;
    if (!target) return Promise.resolve(null);
    return new Promise((resolve) => {
        const finish = (data: Uint8Array | null): void => {
            clearTimeout(timer);
            target.removeEventListener("inputreport", onReport);
            resolve(data);
        };
        const onReport = (event: HIDInputReportEvent): void =>
            void (event.reportId === reportId && finish(bytesOf(event)));
        const timer = setTimeout(() => finish(null), timeoutMs);
        target.addEventListener("inputreport", onReport);
        send([report]);
    });
};

const identifyDevice = async (): Promise<IConnectionInfo> => {
    const spec = newestSpec();
    const reply = await request(identify(spec), spec.reports.identifyReply.id, 1500);
    const identity = reply ? parseIdentify(reply) : null;
    const isIdentified = identity?.vendorId === protocol.vendorId && identity.productId === protocol.productId;
    const choice = specFor(isIdentified ? identity.version : "");
    currentSpec = choice.spec;
    return {
        version: isIdentified ? identity.version : "unknown",
        serial: isIdentified ? identity.serial : "",
        specVersion: choice.version,
        isExact: isIdentified && choice.isExact,
        isIdentified,
    };
};

/** Right after a KVM switch the device can be briefly not ready, so opening retries a few times. */
const openWithRetry = async (candidate: HIDDevice): Promise<Error | null> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 4 && !candidate.opened; attempt++) {
        try {
            await candidate.open();
        } catch (error) {
            lastError = error as Error;
            await sleep(400 * (attempt + 1));
        }
    }
    return candidate.opened ? null : (lastError ?? new Error("unknown error"));
};

const doAdopt = async (candidate: HIDDevice): Promise<boolean> => {
    const openError = await openWithRetry(candidate);
    if (openError) {
        emit("error", {
            message: `Couldn't open the Volt (${openError.message}). Unplug it and plug it back in, then try again.`,
        });
        return false;
    }
    if (device) return false;
    device = candidate;
    candidate.addEventListener("inputreport", onInput);
    const info = await identifyDevice();
    if (device !== candidate) return false;
    emit("connected", info);
    requestState();
    return true;
};

/** One adopt at a time, so connect events and reconnect() can't open the device twice. */
const adopt = (candidate: HIDDevice): Promise<boolean> => {
    if (device || isHeldOff || !isVoltControl(candidate)) return Promise.resolve(false);
    adopting ??= doAdopt(candidate).finally(() => (adopting = null));
    return adopting;
};

const drop = (): void => {
    device?.removeEventListener("inputreport", onInput);
    device = null;
    emit("disconnected", { isByUser: isHeldOff });
};

/** Reconnects to a Volt this site was given before, without a prompt (page load, KVM switch back). */
export const reconnect = async (): Promise<boolean> => {
    for (const candidate of (await navigator.hid.getDevices()).filter(isVoltControl)) {
        if (await adopt(candidate)) return true;
    }
    return false;
};

/** Another Volt model was picked: name it, since only the decoded one can be controlled. */
const explainUnsupported = (picked: HIDDevice[]): void => {
    const other = picked.find((candidate) => candidate.productId !== protocol.productId);
    if (!other) return;
    const name = modelName(other.productId);
    emit("error", {
        message: `${name} isn't supported yet: only the ${modelName(protocol.productId)} has been decoded.`,
    });
};

/** The browser's device picker; lists every UA device so another model can be named. Needs a user gesture. */
export const pair = async (): Promise<"ok" | "cancelled" | "failed"> => {
    isHeldOff = false;
    const picked = await navigator.hid.requestDevice({ filters: [{ vendorId: protocol.vendorId }] });
    if (picked.length === 0) return "cancelled";
    for (const candidate of picked) if (await adopt(candidate)) return "ok";
    explainUnsupported(picked);
    return "failed";
};

/** Closes the connection; the page stays disconnected until pair() is called again. */
export const disconnect = async (): Promise<void> => {
    const current = device;
    if (!current) return;
    isHeldOff = true;
    drop();
    await current.close().catch(() => undefined);
};

export const watchDevices = (): void => {
    navigator.hid.addEventListener("connect", (event) => void adopt(event.device));
    navigator.hid.addEventListener("disconnect", (event) => event.device === device && drop());
};
