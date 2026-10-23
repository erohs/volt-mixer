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

const TSHARK = process.env.TSHARK || "C:\\Program Files\\Wireshark\\tshark.exe";
const VOLT_VID = 0x2b5a;

const args = process.argv.slice(2);
const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
let address = opt("--address");
let outDir = opt("--out");
const [pcap, logFile] = args;
if (!pcap || !logFile) {
    console.error("usage: node decode-capture.js <capture.pcap> <run-log.jsonl> [--address N] [--out dir]");
    process.exit(2);
}

const FIELDS = [
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

function tshark(filter) {
    const out = execFileSync(
        TSHARK,
        [
            "-r",
            pcap,
            "-Y",
            filter,
            "-T",
            "fields",
            "-E",
            "separator=\t",
            "-E",
            "occurrence=f",
            ...FIELDS.flatMap((f) => ["-e", f]),
        ],
        { maxBuffer: 1 << 30, encoding: "utf8" },
    );
    return out
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const v = line.split("\t");
            const r = {};
            FIELDS.forEach((f, i) => {
                r[f] = v[i] || "";
            });
            return r;
        });
}

// 1. Which bus address is the Volt? Prefer a device descriptor with UA's vendor ID.
if (address === undefined) {
    const desc = tshark(`usb.idVendor == ${VOLT_VID}`);
    if (desc.length) address = desc[0]["usb.device_address"];
}
if (address === undefined) {
    // Fallback (capture started with the Volt already enumerated): the device sending interrupt-IN
    // reports of the Volt's HID input size (74 bytes, see tools/hid-caps.ps1).
    const counts = {};
    for (const r of tshark("usb.transfer_type == 0x01 && usb.data_len == 74"))
        counts[r["usb.device_address"]] = (counts[r["usb.device_address"]] || 0) + 1;
    address = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map((e) => e[0])[0];
    console.error(
        `Volt address not found by descriptor; using ${address} (74-byte interrupt reports: ${JSON.stringify(counts)}). Override with --address.`,
    );
}

// 2. All non-audio transfers for that address.
const rows = tshark(`usb.device_address == ${address} && usb.transfer_type != 0x00`);
const packets = rows.map((r) => {
    const type =
        { "0x01": "interrupt", "0x02": "control", "0x03": "bulk" }[r["usb.transfer_type"]] || r["usb.transfer_type"];
    const ep = parseInt(r["usb.endpoint_address"] || "0", 16);
    const hostToDevice = parseInt(r["usb.irp_info.direction"] || "0", 16) === 0; // USBPcap: 0 = FDO->PDO (submit)
    const rawData = (r["usbhid.data"] || r["usb.capdata"] || r["usb.data_fragment"] || "").replace(/:/g, "");
    // The identify reply (report 0x0E) carries the unit's serial number and hardware UID: keep only
    // the VID/PID/version bytes so decoded output can be published.
    const data = rawData.startsWith("0e") ? rawData.slice(0, 14) + "…redacted" : rawData;
    const setup = r["usb.bmRequestType"]
        ? {
              bmRequestType: r["usb.bmRequestType"],
              bRequest: r["usb.setup.bRequest"],
              wValue: r["usb.setup.wValue"],
              wIndex: r["usb.setup.wIndex"],
              wLength: r["usb.setup.wLength"],
          }
        : null;
    return {
        frame: +r["frame.number"],
        t: Math.round(parseFloat(r["frame.time_epoch"]) * 1000),
        type,
        ep,
        hostToDevice,
        data,
        setup,
    };
});

// A packet "carries a command" if it is host->device with a payload (interrupt OUT / SET_REPORT / vendor OUT).
const isCommand = (p) => p.hostToDevice && p.data && (p.type !== "interrupt" || (p.ep & 0x80) === 0);

// 3. Align with the step log.
const log = fs
    .readFileSync(logFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const steps = log
    .filter(
        (e) =>
            e.step === "set" ||
            e.step === "link-try" ||
            e.step === "link-restore" ||
            ["idle", "console-launch", "settled"].includes(e.phase),
    )
    // Paths are written as {dev}/... so decoded output doesn't carry the unit's serial number.
    .map((e) => ({
        t: e.t,
        label: e.label || e.step || e.phase,
        path: e.path && e.path.replace(/^\/devices\/[0-9a-f]+/, "{dev}"),
        value: e.value,
        out: [],
        in: 0,
        inReports: [],
    }));
const SLACK_MS = 15; // pcap and log share the system clock; allow small ordering jitter
for (const p of packets) {
    let s = null;
    for (const st of steps) {
        if (st.t - SLACK_MS <= p.t) s = st;
        else break;
    }
    p.step = s ? steps.indexOf(s) : -1;
    if (!s) continue;
    if (isCommand(p)) s.out.push({ type: p.type, ep: p.ep, setup: p.setup, data: p.data });
    else {
        s.in++;
        // Device->host reports other than the continuous meter stream (report 0xF1) carry state
        // changes from the front panel (knob, buttons). Keep each distinct one per step.
        if (!p.hostToDevice && p.data && !p.data.startsWith("f1") && !s.inReports.includes(p.data))
            s.inReports.push(p.data);
    }
}

// 4. Per parameter: compare payloads across its values to find the bytes that change.
const byLabel = {};
for (const s of steps) {
    const key = (s.label || "").replace(/ \(restore\)$/, "");
    (byLabel[key] ||= []).push(s);
}
function varyingBytes(payloads) {
    const bufs = payloads.map((h) => Buffer.from(h, "hex"));
    const len = Math.max(0, ...bufs.map((b) => b.length));
    const vary = [];
    for (let i = 0; i < len; i++) if (new Set(bufs.map((b) => b[i])).size > 1) vary.push(i);
    return vary;
}
let md = `# Decoded capture\n\nCapture: \`${path.basename(pcap)}\`, Volt bus address ${address}, ${packets.length} non-audio transfers, ${steps.length} steps.\n\n`;
md +=
    "| Parameter | Steps | Commands per step | Payload bytes that vary | Example (first value) | Device reports |\n|---|---|---|---|---|---|\n";
for (const [label, ss] of Object.entries(byLabel)) {
    const firsts = ss.map((s) => s.out[0]?.data).filter(Boolean);
    const vary = varyingBytes(firsts);
    const counts = [...new Set(ss.map((s) => s.out.length))].join("/");
    const ins = new Set(ss.flatMap((s) => s.inReports));
    md += `| ${label} | ${ss.length} | ${counts} | ${vary.join(", ") || "—"} | \`${(firsts[0] || "").slice(0, 64)}\` | ${ins.size} |\n`;
}

// 5. Write outputs under the firmware version recorded in the log (if any).
const fw = (log.find((e) => e.firmware) || {}).firmware || "unknown-fw";
outDir = outDir || path.resolve(__dirname, "..", "reference", "decoded", fw);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "packets.json"), JSON.stringify(packets, null, 1));
fs.writeFileSync(path.join(outDir, "steps.json"), JSON.stringify(steps, null, 1));
fs.writeFileSync(path.join(outDir, "summary.md"), md);
console.log(
    `address ${address}: ${packets.length} transfers, ${packets.filter(isCommand).length} commands -> ${outDir}`,
);
