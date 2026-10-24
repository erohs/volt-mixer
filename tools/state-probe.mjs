// Maps the Volt's state dump (reply to F0 11) by changing one setting at a time and diffing the
// dumps taken just before and after. Settings change through UA's API, or over HID where the API
// doesn't reach the hardware. It runs like capture-run.js (lib/safe-run.js): MONITOR and HEADPHONE
// muted throughout, levels only ever turned down, and the full API snapshot and the state dump
// restored and checked at the end, also after an error or Ctrl+C. Needs UAD Console running.
//   node state-probe.mjs            run all probes, write ../reference/decoded/<fw>-state/state-map.json
//   node state-probe.mjs --dump     just print one dump (read-only)
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { monitorLevel } from "../src/lib/commands.ts";
import { closeVolt, openVolt, requestState, send } from "./lib/volt-hid.mjs";

const require = createRequire(import.meta.url);
const ua = require("./lib/ua-api");
const safe = require("./lib/safe-run");
const here = path.dirname(fileURLToPath(import.meta.url));
const snapshotFile = path.resolve(here, "../captures/snapshot-before-run.json");
const settleMs = 900;

const dumpBytes = async (volt) => [...(await requestState(volt)).subarray(2)]; // after "F0 11"
const changedBytes = (from, to) =>
    to
        .map((value, offset) => (value === from[offset] ? null : { offset, from: from[offset], to: value }))
        .filter(Boolean);
const log = (event) => {
    if (event.step !== "set" && event.step !== "reply") console.log(JSON.stringify(event));
};

/** A step down, or up if down would pass `floor` (allowed only because the outputs are muted). */
const stepAway = (value, step, floor = 0) => (value - step >= floor ? value - step : value + step);
const toggle = (value) => (value ? 0 : 1);

/** A probe that moves one API setting to `next(value now)`, by safe-run's rules, and back. */
const apiProbe = async (run, label, path, next) => {
    const original = await run.client.getValue(path);
    const { targets, end, isQuietNeeded } = safe.planSweep(run, path, [next(original)], original);
    return {
        label,
        isQuietNeeded,
        apply: () => safe.setValue(run, path, targets[0], label),
        restore: async () => {
            if (end !== null) await safe.setValue(run, path, end, `${label} (restore)`);
        },
    };
};

// The API doesn't reach the hardware monitor level, so this one goes over HID, down only.
const monitorLevelProbe = (volt, dump) => {
    const original = dump[volt.spec.stateLayout.monitorLevel] / volt.spec.monitorLevelPerUnit;
    return {
        label: "monitor level halved (HID)",
        isQuietNeeded: true,
        apply: () => send(volt, monitorLevel(volt.spec, Math.floor(original / 2))),
        restore: () => send(volt, monitorLevel(volt.spec, original)),
    };
};

// Linking copies the left side to the right; the final restore puts the right side back.
const linkProbe = async (run, label, pair, sides) => {
    const isLinked = await run.client.getValue(`${run.buses[pair]}/enabled`);
    const target = `${run.device.path}/link_channels`;
    const body = (stemFormat) => ({
        device_uid: ua.uidOf(run.device.path),
        channel_uid: sides.map((name) => ua.uidOf(run.buses[name])),
        stem_format: stemFormat,
    });
    return {
        label,
        isQuietNeeded: true,
        apply: () => safe.postCommand(run, target, body(isLinked ? "mono" : "stereo"), label),
        restore: () => safe.postCommand(run, target, body(isLinked ? "stereo" : "mono"), `${label} (restore)`),
    };
};

const nextTone = (tone) => (tone + 1) % 4;
const lowerGain = (db) => stepAway(db, 10.5);

/** Probes on Inputs 1-4: [label, input number, control under the input's bus, next value]. */
const inputSettings = [
    ...[1, 2, 3, 4].map((n) => [`tone In${n} next`, n, "/controls/preamp_tone", nextTone]),
    ...[1, 2].map((n) => [`gain In${n}`, n, "/controls/preamp_gain", lowerGain]),
    ...[1, 4].map((n) => [`direct In${n}`, n, "/outputs/main/controls/mute", toggle]),
];

// 48V only on inputs with nothing plugged into the XLR.
const phantomProbes = async (run) => {
    const probes = [];
    for (const n of [1, 2]) {
        const bus = run.buses[`ANALOG ${n}`];
        const jack = (await run.client.get(`${bus}/jack_detect`))?.properties;
        if (!jack?.jack_detect_mic?.value)
            probes.push(await apiProbe(run, `48V In${n}`, `${bus}/controls/preamp_48v`, toggle));
    }
    return probes;
};

const inputProbes = async (run) => {
    const probes = [];
    for (const [label, n, control, next] of inputSettings)
        probes.push(await apiProbe(run, label, `${run.buses[`ANALOG ${n}`]}${control}`, next));
    return [...probes, ...(await phantomProbes(run))];
};

const outputProbes = async (run, volt, dump) => {
    const master = (bus, control) => `${run.buses[bus]}/outputs/main/controls/${control}`;
    return [
        await apiProbe(run, "monitor unmute", master("MONITOR", "mute"), () => 0),
        await apiProbe(run, "monitor mono", master("MONITOR", "mix_to_mono"), toggle),
        await apiProbe(
            run,
            "headphone level halved",
            master("HEADPHONE", "gain"),
            (level) => Math.round(level * 5) / 10,
        ),
        await apiProbe(run, "headphone unmute", master("HEADPHONE", "mute"), () => 0),
        monitorLevelProbe(volt, dump),
    ];
};

const deviceProbes = async (run) => {
    const setting = (name) => `${run.device.path}/${name}`;
    return [
        await apiProbe(run, "clip protection toggled", setting("no_clip"), (isOn) => !isOn),
        await apiProbe(run, "brightness changed", setting("display_brightness"), (raw) => (raw === 100 ? 60 : 100)),
        await apiProbe(run, "digital input toggled", setting("tos_link"), (f) => (f === "S/PDIF" ? "ADAT" : "S/PDIF")),
        await linkProbe(run, "link 1-2", "ANALOG 1-2", ["ANALOG 1", "ANALOG 2"]),
        await linkProbe(run, "link 3-4", "ANALOG 3-4", ["ANALOG 3", "ANALOG 4"]),
    ];
};

const printResult = ({ label, changed }) => {
    const bytes = changed.map((c) => `[${c.offset}] ${c.from.toString(16)}→${c.to.toString(16)}`).join("  ");
    console.log(`${label.padEnd(26)} ${bytes || "(no change)"}`);
};

const runProbe = async (run, volt, probe) => {
    if (probe.isQuietNeeded) await safe.assertQuiet(run, probe.label);
    const before = await dumpBytes(volt);
    try {
        await probe.apply();
        await safe.pause(run, settleMs);
        return { label: probe.label, changed: changedBytes(before, await dumpBytes(volt)) };
    } finally {
        await probe.restore();
        await safe.pause(run, settleMs);
    }
};

const runProbes = async (run, volt, dump) => {
    await safe.muteOutputs(run);
    const probes = [
        ...(await inputProbes(run)),
        ...(await outputProbes(run, volt, dump)),
        ...(await deviceProbes(run)),
    ];
    const results = [];
    for (const probe of probes) {
        results.push(await runProbe(run, volt, probe));
        printResult(results.at(-1));
    }
    return results;
};

const isDumpRestored = async (volt, baseline) => {
    const drift = changedBytes(baseline, await dumpBytes(volt));
    if (drift.length)
        console.error(`*** NOT RESTORED: the state dump differs at offsets ${drift.map((d) => d.offset)} ***`);
    return drift.length === 0;
};

const writeMap = (firmware, baseline, results) => {
    const out = path.resolve(here, "../reference/decoded", `${firmware}-state`);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "state-map.json"), JSON.stringify({ firmware, baseline, results }, null, 1));
};

const mapState = async (volt) => {
    const client = await ua.connect();
    const run = await safe.startRun({ client, device: await ua.findVolt(client), log, snapshotFile });
    const baseline = await dumpBytes(volt);
    console.log("baseline", Buffer.from(baseline).toString("hex"));
    safe.stopOnInterrupt(run);
    let results = null;
    try {
        results = await runProbes(run, volt, baseline);
    } catch (error) {
        console.error(`Stopped: ${error.message}`);
    }
    const isRestored = (await safe.finishRun(run, snapshotFile)) && (await isDumpRestored(volt, baseline));
    if (results) writeMap(volt.version, baseline, results);
    client.close();
    return Boolean(results) && isRestored;
};

const main = async () => {
    const volt = await openVolt();
    try {
        if (process.argv.includes("--dump")) console.log(Buffer.from(await dumpBytes(volt)).toString("hex"));
        else process.exitCode = (await mapState(volt)) ? 0 : 1;
    } finally {
        closeVolt(volt);
    }
};

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => process.exit());
