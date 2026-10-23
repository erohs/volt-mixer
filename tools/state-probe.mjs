// Maps the Volt's state dump (reply to F0 11) by changing one setting at a time and diffing dumps.
// Settings are changed through UA's API (or HID where the API doesn't reach the hardware) and
// every one is restored afterwards. Needs UAD Console running.
//   node state-probe.mjs            run all probes, write ../reference/decoded/<fw>-state/state-map.json
//   node state-probe.mjs --dump     just print one dump
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { identify, monitorLevel, stateRequest } from "../src/lib/commands.ts";
import { parseIdentify } from "../src/lib/reports.ts";
import { protocol, specFor } from "../src/lib/spec.ts";

const require = createRequire(import.meta.url);
const HID = require("node-hid");
const ua = require("./lib/ua-api");
const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- HID ----------
const info = HID.devices().find(
    (d) => d.vendorId === protocol.vendorId && d.productId === protocol.productId && d.usagePage === 0xff01,
);
if (!info) {
    console.error("Volt control interface not found");
    process.exit(1);
}
const dev = new HID.HID(info.path);
let spec = specFor("").spec;
const listeners = new Set();
dev.on("data", (buf) => {
    for (const l of listeners) l(buf);
});
dev.on("error", (e) => console.error("HID error", e.message));

const send = (report) => dev.write([report.reportId, ...report.data]);
function request(report, match, timeoutMs = 1500) {
    return new Promise((resolve) => {
        const l = (buf) => {
            if (match(buf)) {
                listeners.delete(l);
                clearTimeout(t);
                resolve(buf);
            }
        };
        const t = setTimeout(() => {
            listeners.delete(l);
            resolve(null);
        }, timeoutMs);
        listeners.add(l);
        send(report);
    });
}
// node-hid includes the report ID as byte 0 on Windows.
const isState = (b) => b[0] === spec.reports.stateReply.id && b[1] === spec.reports.stateReply.cmd;
async function dump() {
    const b = await request(stateRequest(spec), isState);
    return b ? [...b.subarray(2)] : null; // bytes after "F0 11"
}

// ---------- probes ----------
const API = await ua.connect();
const volt = await ua.findVolt(API);
const buses = await ua.buses(API, volt);
const idReply = await request(identify(spec), (b) => b[0] === spec.reports.identifyReply.id);
const id = idReply ? parseIdentify(idReply.subarray(1)) : { version: "unknown" };
spec = specFor(id.version).spec;

if (process.argv.includes("--dump")) {
    console.log(Buffer.from(await dump()).toString("hex"));
    process.exit(0);
}

const ctl = (bus, rest) => buses[bus] + rest;
const apiProbe = (label, p, value) => ({ label, apply: () => API.set(p, value), path: p });
const jack = async (bus) => (await API.get(buses[bus] + "/jack_detect"))?.properties?.jack_detect_mic?.value;

const probes = [
    apiProbe("tone In1 = Warmth", ctl("ANALOG 1", "/controls/preamp_tone"), 1),
    apiProbe("tone In2 = Focus", ctl("ANALOG 2", "/controls/preamp_tone"), 2),
    apiProbe("tone In3 = Shine", ctl("ANALOG 3", "/controls/preamp_tone"), 3),
    apiProbe("tone In4 = Warmth", ctl("ANALOG 4", "/controls/preamp_tone"), 1),
    apiProbe("gain In1 = 30 dB", ctl("ANALOG 1", "/controls/preamp_gain"), 30),
    apiProbe("gain In2 = 45.5 dB", ctl("ANALOG 2", "/controls/preamp_gain"), 45.5),
    apiProbe("direct In1 (unmute)", ctl("ANALOG 1", "/outputs/main/controls/mute"), 0),
    apiProbe("direct In4 (unmute)", ctl("ANALOG 4", "/outputs/main/controls/mute"), 0),
    apiProbe("monitor mute", ctl("MONITOR", "/outputs/main/controls/mute"), 1),
    apiProbe("monitor mono", ctl("MONITOR", "/outputs/main/controls/mix_to_mono"), 1),
    apiProbe("headphone level -10", ctl("HEADPHONE", "/outputs/main/controls/gain"), null), // value filled in below
    apiProbe("headphone mute", ctl("HEADPHONE", "/outputs/main/controls/mute"), 1),
    apiProbe("clip protection off", volt.path + "/no_clip", false),
    apiProbe("brightness 100", volt.path + "/display_brightness", 100),
    apiProbe("digital input S/PDIF", volt.path + "/tos_link", "S/PDIF"),
    // The API doesn't reach the hardware monitor level, so this one goes over HID (quiet: 10).
    // `original` is read from the baseline dump below, so this restores the real level, not 0.
    {
        label: "monitor level 10 (HID)",
        hid: true,
        apply: () => send(monitorLevel(spec, 5)),
        restore: () => send(monitorLevel(spec, monitorOriginal / spec.monitorLevelPerUnit)),
    },
];
if (!(await jack("ANALOG 1"))) probes.push(apiProbe("48V In1", ctl("ANALOG 1", "/controls/preamp_48v"), 1));
if (!(await jack("ANALOG 2"))) probes.push(apiProbe("48V In2", ctl("ANALOG 2", "/controls/preamp_48v"), 1));

const hp = probes.find((p) => p.label.startsWith("headphone level"));
hp.value = (await API.getValue(hp.path)) - 10;
hp.apply = () => API.set(hp.path, hp.value);

// Link probes use the API command (restored by unlinking).
const linkProbe = (label, a, b) => {
    const body = (st) =>
        JSON.stringify({
            device_uid: volt.path.split("/").pop(),
            channel_uid: [a, b].map((n) => buses[n].split("/").pop()),
            stem_format: st,
        });
    return {
        label,
        apply: () => API.request("post", volt.path + "/link_channels", body("stereo")),
        restore: () => API.request("post", volt.path + "/link_channels", body("mono")),
    };
};
probes.push(linkProbe("link 1-2", "ANALOG 1", "ANALOG 2"), linkProbe("link 3-4", "ANALOG 3", "ANALOG 4"));

const baseline = await dump();
if (!baseline) {
    console.error("No state dump from the Volt; nothing was changed.");
    process.exit(1);
}
console.log("baseline", Buffer.from(baseline).toString("hex"));
const monitorOriginal = baseline[spec.stateLayout?.monitorLevel ?? 18];
const results = [];
for (const p of probes) {
    const original = p.path ? await API.getValue(p.path) : undefined;
    try {
        await p.apply();
        await sleep(900);
        const d = await dump();
        if (!d) {
            console.log(`${p.label.padEnd(26)} (no dump; skipped)`);
            continue;
        }
        const changed = d
            .map((v, i) => (v !== baseline[i] ? { offset: i, from: baseline[i], to: v } : null))
            .filter(Boolean);
        results.push({ label: p.label, changed });
        console.log(
            `${p.label.padEnd(26)} ${changed.map((c) => `[${c.offset}] ${c.from.toString(16)}→${c.to.toString(16)}`).join("  ") || "(no change)"}`,
        );
    } finally {
        // Always put the setting back, even if the dump failed.
        if (p.restore) await p.restore();
        else await API.set(p.path, original);
        await sleep(900);
    }
}
const after = await dump();
const drift = after.map((v, i) => (v !== baseline[i] ? i : null)).filter((i) => i !== null);
console.log(
    drift.length
        ? `WARNING: dump differs from baseline at offsets ${drift.join(", ")}`
        : "restored: final dump equals baseline",
);

const out = path.resolve(here, "../reference/decoded", `${id.version}-state`);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
    path.join(out, "state-map.json"),
    JSON.stringify({ firmware: id.version, baseline, results }, null, 1),
);
API.close();
dev.close();
process.exit(0);
