// Turns a USBPcap capture + capture-run.js step log into a per-parameter table of the
// host->device control traffic, so each API "set" can be matched to the bytes it produced.
//
//   node decode-capture.js <capture.pcap> <run-log.jsonl> [--address N] [--out dir]
//
// Output (default: ../reference/decoded/<firmware>/):
//   packets.json   every non-audio transfer to/from the Volt, with the step it belongs to
//   steps.json     per step: label, path, value, outbound payloads (hex)
//   summary.md     per parameter: which payload bytes change with the value
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { protocol } = require("../src/lib/spec.ts");

const tsharkPath = process.env.TSHARK || "C:\\Program Files\\Wireshark\\tshark.exe";
const slackMs = 15; // pcap and log share the system clock; allow small ordering jitter
const fields = [
    "frame.number",
    "frame.time_epoch",
    "usb.device_address",
    "usb.endpoint_address",
    "usb.transfer_type",
    "usb.irp_info.direction",
    "usb.urb_status",
    "usb.data_len",
    "usb.bInterfaceNumber",
    "usb.bmRequestType",
    "usb.setup.bRequest",
    "usb.setup.wValue",
    "usb.setup.wIndex",
    "usb.setup.wLength",
    "usb.capdata",
    "usb.data_fragment",
    "usbhid.data",
    "usb.idVendor",
];

const parseArgs = (argv) => {
    const args = [...argv];
    const option = (name) => {
        const i = args.indexOf(name);
        return i >= 0 ? args.splice(i, 2)[1] : undefined;
    };
    const address = option("--address");
    const outDir = option("--out");
    const [pcap, logFile] = args;
    if (!pcap || !logFile) {
        console.error("usage: node decode-capture.js <capture.pcap> <run-log.jsonl> [--address N] [--out dir]");
        process.exit(2);
    }
    return { pcap, logFile, address, outDir };
};

const tsharkArgs = (pcap, filter) => [
    ...["-r", pcap, "-Y", filter, "-T", "fields"],
    ...["-E", "separator=\t", "-E", "occurrence=f"],
    ...fields.flatMap((field) => ["-e", field]),
];

const tshark = (pcap, filter) =>
    execFileSync(tsharkPath, tsharkArgs(pcap, filter), { maxBuffer: 1 << 30, encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const values = line.split("\t");
            return Object.fromEntries(fields.map((field, i) => [field, values[i] || ""]));
        });

// Fallback (capture started with the Volt already enumerated): the device sending interrupt-IN
// reports of the Volt's HID input size (74 bytes, see tools/hid-caps.ps1).
const addressFromReports = (pcap) => {
    const counts = {};
    for (const row of tshark(pcap, "usb.transfer_type == 0x01 && usb.data_len == 74"))
        counts[row["usb.device_address"]] = (counts[row["usb.device_address"]] || 0) + 1;
    const address = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    console.error(
        `Volt address not found by descriptor; using ${address} (74-byte interrupt reports: ${JSON.stringify(counts)}). Override with --address.`,
    );
    return address;
};

/** The Volt's bus address: a device descriptor with UA's vendor ID, else the busiest 74-byte sender. */
const findAddress = (pcap) =>
    tshark(pcap, `usb.idVendor == ${protocol.vendorId}`)[0]?.["usb.device_address"] ?? addressFromReports(pcap);

const transferTypes = { "0x01": "interrupt", "0x02": "control", "0x03": "bulk" };

const setupOf = (row) =>
    row["usb.bmRequestType"]
        ? {
              bmRequestType: row["usb.bmRequestType"],
              bRequest: row["usb.setup.bRequest"],
              wValue: row["usb.setup.wValue"],
              wIndex: row["usb.setup.wIndex"],
              wLength: row["usb.setup.wLength"],
          }
        : null;

// The identify reply (report 0x0E) carries the unit's serial number and hardware UID: keep only
// the VID/PID/version bytes so decoded output can be published.
const redact = (data) => (data.startsWith("0e") ? data.slice(0, 14) + "…redacted" : data);

const toPacket = (row) => ({
    frame: +row["frame.number"],
    t: Math.round(parseFloat(row["frame.time_epoch"]) * 1000),
    type: transferTypes[row["usb.transfer_type"]] || row["usb.transfer_type"],
    ep: parseInt(row["usb.endpoint_address"] || "0", 16),
    hostToDevice: parseInt(row["usb.irp_info.direction"] || "0", 16) === 0, // USBPcap: 0 = FDO->PDO (submit)
    data: redact((row["usbhid.data"] || row["usb.capdata"] || row["usb.data_fragment"] || "").replace(/:/g, "")),
    setup: setupOf(row),
});

// A packet "carries a command" if it is host->device with a payload (interrupt OUT / SET_REPORT / vendor OUT).
const isCommand = (p) => p.hostToDevice && p.data && (p.type !== "interrupt" || (p.ep & 0x80) === 0);

const isStepEvent = (e) =>
    e.step === "set" ||
    e.step === "link-try" ||
    e.step === "link-restore" ||
    ["idle", "console-launch", "settled"].includes(e.phase);

// Paths are written as {dev}/... so decoded output doesn't carry the unit's serial number.
const toStep = (e) => ({
    t: e.t,
    label: e.label || e.step || e.phase,
    path: e.path && e.path.replace(/^\/devices\/[0-9a-f]+/, "{dev}"),
    value: e.value,
    out: [],
    in: 0,
    inReports: [],
});

const readLog = (logFile) =>
    fs
        .readFileSync(logFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));

const stepAt = (steps, t) => {
    let found = -1;
    for (const [i, step] of steps.entries()) {
        if (step.t - slackMs <= t) found = i;
        else break;
    }
    return found;
};

// Device->host reports other than the continuous meter stream (report 0xF1) carry state changes
// from the front panel (knob, buttons). Keep each distinct one per step.
const assignToSteps = (packets, steps) => {
    for (const p of packets) {
        p.step = stepAt(steps, p.t);
        const step = steps[p.step];
        if (!step) continue;
        if (isCommand(p)) step.out.push({ type: p.type, ep: p.ep, setup: p.setup, data: p.data });
        else {
            step.in++;
            if (!p.hostToDevice && p.data && !p.data.startsWith("f1") && !step.inReports.includes(p.data))
                step.inReports.push(p.data);
        }
    }
};

const varyingBytes = (payloads) => {
    const buffers = payloads.map((hex) => Buffer.from(hex, "hex"));
    const length = Math.max(0, ...buffers.map((b) => b.length));
    const vary = [];
    for (let i = 0; i < length; i++) if (new Set(buffers.map((b) => b[i])).size > 1) vary.push(i);
    return vary;
};

const summaryRow = (label, steps) => {
    const firsts = steps.map((s) => s.out[0]?.data).filter(Boolean);
    const counts = [...new Set(steps.map((s) => s.out.length))].join("/");
    const reports = new Set(steps.flatMap((s) => s.inReports));
    const example = (firsts[0] || "").slice(0, 64);
    return `| ${label} | ${steps.length} | ${counts} | ${varyingBytes(firsts).join(", ") || "—"} | \`${example}\` | ${reports.size} |\n`;
};

/** Per parameter: compare payloads across its values to find the bytes that change. */
const summary = (pcap, address, packets, steps) => {
    const byLabel = {};
    for (const s of steps) (byLabel[(s.label || "").replace(/ \(restore\)$/, "")] ||= []).push(s);
    const header =
        `# Decoded capture\n\nCapture: \`${path.basename(pcap)}\`, Volt bus address ${address}, ${packets.length} non-audio transfers, ${steps.length} steps.\n\n` +
        "| Parameter | Steps | Commands per step | Payload bytes that vary | Example (first value) | Device reports |\n|---|---|---|---|---|---|\n";
    return (
        header +
        Object.entries(byLabel)
            .map(([label, labelled]) => summaryRow(label, labelled))
            .join("")
    );
};

const main = () => {
    const { pcap, logFile, address: given, outDir: givenOut } = parseArgs(process.argv.slice(2));
    const address = given ?? findAddress(pcap);
    const packets = tshark(pcap, `usb.device_address == ${address} && usb.transfer_type != 0x00`).map(toPacket);
    const log = readLog(logFile);
    const steps = log.filter(isStepEvent).map(toStep);
    assignToSteps(packets, steps);
    const firmware = log.find((e) => e.firmware)?.firmware || "unknown-fw";
    const outDir = givenOut || path.resolve(__dirname, "..", "reference", "decoded", firmware);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "packets.json"), JSON.stringify(packets, null, 1));
    fs.writeFileSync(path.join(outDir, "steps.json"), JSON.stringify(steps, null, 1));
    fs.writeFileSync(path.join(outDir, "summary.md"), summary(pcap, address, packets, steps));
    const commandCount = packets.filter(isCommand).length;
    console.log(`address ${address}: ${packets.length} transfers, ${commandCount} commands -> ${outDir}`);
};

main();
