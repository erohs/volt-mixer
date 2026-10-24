// Automated capture driver: steps every Volt setting through UAMixerHelper's API (127.0.0.1:4720)
// while USBPcap records, logging a timestamp per step so USB traffic can be labelled. It runs with
// MONITOR and HEADPHONE muted and restores and checks a full snapshot at the end, also after an
// error or Ctrl+C (lib/safe-run.js). Exits 1 if anything isn't back as it was.
//
//   node capture-run.js --dry-run        read-only: resolve paths, print the plan
//   node capture-run.js                  run it (writes captures/run-log.jsonl, snapshot-before-run.json)
//   CAPTURE_PHASES=routing,autogain node capture-run.js     only those phases (names below)
"use strict";
const fs = require("fs");
const path = require("path");
const ua = require("./lib/ua-api");
const safe = require("./lib/safe-run");

const outDir = path.resolve(__dirname, "..", "captures");
const snapshotFile = path.join(outDir, "snapshot-before-run.json");
const isDryRun = process.argv.includes("--dry-run");

const mixBuses = ["ANALOG 1", "ANALOG 2", "ANALOG 3", "ANALOG 4", "ADAT 1", "LOOPBACK"];
const faderSteps = [-144, -48, -24, -12, -6, -3, 0, 3, 6, 12];
const panSteps = [-1, -0.5, 0, 0.5, 1];
const sendSteps = [-144, -24, -12, -6, 0, 6];

const createLog = (file) => {
    const fd = file ? fs.openSync(file, "a") : null;
    return (event) => {
        const line = JSON.stringify({ t: Date.now(), iso: new Date().toISOString(), ...event });
        console.log(line);
        if (fd !== null) fs.writeSync(fd, line + "\n");
    };
};

const sweepCue = async (run, name, bus, cue, isStereo) => {
    const controls = `${bus}/outputs/${cue}/controls`;
    await safe.sweep(run, `${name} ${cue} send`, `${controls}/gain`, sendSteps);
    await safe.sweep(run, `${name} ${cue} pan`, `${controls}/${isStereo ? "pan_left" : "pan"}`, [-1, 0, 1]);
    await safe.sweep(run, `${name} ${cue} mute`, `${controls}/mute`, [1, 0]);
};

const sweepChannel = async (run, name, bus) => {
    const main = `${bus}/outputs/main/controls`;
    const isStereo = (await ua.childNames(run.client, main)).includes("pan_left");
    await safe.sweep(run, `${name} fader`, `${main}/gain`, faderSteps);
    const pans = isStereo
        ? [
              ["pan L", "pan_left"],
              ["pan R", "pan_right"],
          ]
        : [["pan", "pan"]];
    for (const [label, control] of pans) await safe.sweep(run, `${name} ${label}`, `${main}/${control}`, panSteps);
    await safe.sweep(run, `${name} mute`, `${main}/mute`, [0, 1, 0, 1]);
    await safe.sweep(run, `${name} solo`, `${bus}/controls/solo`, [1, 0]);
    for (const cue of ["cue_0", "cue_1"]) await sweepCue(run, name, bus, cue, isStereo);
};

const mixPhase = async (run) => {
    for (const name of mixBuses) await sweepChannel(run, name, run.buses[name]);
};

const sweepPhantom = async (run, name, bus) => {
    const jack = (await run.client.get(`${bus}/jack_detect`))?.properties || {};
    if (jack.jack_detect_mic?.value) return run.log({ phase: "skip", label: `${name} 48V`, reason: "XLR plugged in" });
    await safe.sweep(run, `${name} 48V`, `${bus}/controls/preamp_48v`, [1, 0]);
};

const preampPhase = async (run) => {
    const control = (name, control) => `${run.buses[name]}/controls/${control}`;
    for (const name of ["ANALOG 1", "ANALOG 2"])
        await safe.sweep(run, `${name} preamp gain`, control(name, "preamp_gain"), [0, 10, 20, 30, 40, 50, 60, 0]);
    for (const name of ["ANALOG 1", "ANALOG 2", "ANALOG 3", "ANALOG 4"])
        await safe.sweep(run, `${name} tone`, control(name, "preamp_tone"), [0, 1, 2, 3, 0]);
    for (const name of ["ANALOG 1", "ANALOG 2"]) await sweepPhantom(run, name, run.buses[name]);
};

const quieterSteps = (level) => [0.75, 0.5, 0.25, 0].map((share) => Math.round(level * share * 10) / 10);

// Levels only go down and stay down, mutes end muted: both come back in the final restore.
const outputsPhase = async (run) => {
    for (const name of ["MONITOR", "HEADPHONE"]) {
        const controls = `${run.buses[name]}/outputs/main/controls`;
        const level = await run.client.getValue(`${controls}/gain`);
        await safe.sweep(run, `${name} level (down only)`, `${controls}/gain`, quieterSteps(level));
        await safe.sweep(run, `${name} mute`, `${controls}/mute`, [0, 1]);
    }
    await safe.sweep(run, "MONITOR mono", `${run.buses.MONITOR}/outputs/main/controls/mix_to_mono`, [1, 0]);
};

// Cue routing with the real values (from Console's strings): cue MIX on = "mon", off = "";
// headphones follow "cue1" | "cue2"; mirror = "LINE 3-4" | "None". Each step is labelled.
const routingSteps = (outputs) => {
    const headphone = `${outputs["HP 1"]}/mix_in_source`;
    const mix = (n) => `${outputs[`CUE ${n}`]}/mix_in_source`;
    const mirror = (n) => `${outputs[`CUE ${n}`]}/flex_route`;
    return [
        ["CUE 2 MIX off", mix(2), ""],
        ["HP source cue2", headphone, "cue2"],
        ["CUE 2 mirror LINE 3-4", mirror(2), "LINE 3-4"],
        ["CUE 2 mirror None", mirror(2), "None"],
        ["HP source cue1", headphone, "cue1"],
        ["CUE 2 MIX on", mix(2), "mon"],
        ["CUE 1 MIX off", mix(1), ""],
        ["CUE 1 mirror LINE 3-4", mirror(1), "LINE 3-4"],
        ["CUE 1 mirror None", mirror(1), "None"],
        ["CUE 1 MIX on", mix(1), "mon"],
    ];
};

const routingPhase = async (run) => {
    await safe.assertQuiet(run, "cue routing");
    run.log({ phase: "param", label: "cue routing" });
    for (const [label, path, value] of routingSteps(run.outputs)) {
        await safe.setValue(run, path, value, label);
        await safe.pause(run, 1200);
    }
};

const watchAutoGain = async (run, bus, ms) => {
    if (run.isDryRun) return;
    for (let elapsed = 0; elapsed < ms; elapsed += 500) {
        const status = (await run.client.get("/auto_gain"))?.properties || {};
        const busProps = (await run.client.get(bus))?.properties || {};
        run.log({
            step: "autogain-status",
            status: status.status?.value,
            text: status.status_str?.value,
            countDown: status.count_down?.value,
            active: busProps.preamp_embedded_auto_gain_active?.value,
            gain: await run.client.getValue(`${bus}/controls/preamp_gain`),
        });
        await safe.pause(run, 500);
    }
};

// Auto-Gain on Input 2 (nothing plugged in, so it should end "Too Quiet"). Console starts the
// Volt's own Auto-Gain with trigger_auto_gain; the Volt reports progress itself.
const autoGainPhase = async (run) => {
    const bus = run.buses["ANALOG 2"];
    const start = (duration) => ({ device_uid: ua.uidOf(run.device.path), channels: [ua.uidOf(bus)], duration });
    await safe.assertQuiet(run, "auto-gain");
    run.log({ phase: "param", label: "auto-gain" });
    await safe.postCommand(run, "/auto_gain/trigger_auto_gain", start(5), "auto-gain run (5 s)");
    await watchAutoGain(run, bus, 9000);
    await safe.postCommand(run, "/auto_gain/trigger_auto_gain", start(10), "auto-gain cancel start");
    await watchAutoGain(run, bus, 1500);
    await safe.postCommand(run, "/auto_gain/stop_auto_gain", { all: true }, "auto-gain cancel stop");
    await watchAutoGain(run, bus, 3000);
};

const devicePhase = async (run) => {
    const setting = (name) => `${run.device.path}/${name}`;
    await safe.sweep(run, "display brightness", setting("display_brightness"), [255, 128, 64, 0]);
    await safe.sweep(run, "clip protection", setting("no_clip"), [false, true]);
    await safe.sweep(run, "digital input format", setting("tos_link"), ["S/PDIF", "ADAT"]);
    await safe.sweep(run, "clock source", setting("clock_source"), ["ADAT", "Internal"]);
    await safe.sweep(run, "sample rate", setting("sample_rate"), [48000, 96000, 192000], 3000);
};

// Console's link command (verified in the 1.0.3.0 sweep). Linking copies the left side to the
// right; the final restore puts the right side back.
const linkPairs = [
    ["ANALOG 1-2", "ANALOG 1", "ANALOG 2"],
    ["ANALOG 3-4", "ANALOG 3", "ANALOG 4"],
];

const postLink = async (run, sides, stemFormat, label) => {
    const body = { device_uid: ua.uidOf(run.device.path), channel_uid: sides.map(ua.uidOf), stem_format: stemFormat };
    await safe.postCommand(run, `${run.device.path}/link_channels`, body, label);
    await safe.pause(run, 2000);
};

const linkPhase = async (run) => {
    for (const [pair, left, right] of linkPairs) {
        const sides = [run.buses[left], run.buses[right]];
        const isLinked = await run.client.getValue(`${run.buses[pair]}/enabled`);
        await safe.assertQuiet(run, `${pair} link`);
        run.log({ phase: "param", label: `${pair} link`, wasLinked: isLinked });
        await postLink(run, sides, isLinked ? "mono" : "stereo", `${pair} link`);
        await postLink(run, sides, isLinked ? "stereo" : "mono", `${pair} link (restore)`);
    }
};

const phaseRunners = {
    mix: mixPhase,
    preamp: preampPhase,
    outputs: outputsPhase,
    routing: routingPhase,
    autogain: autoGainPhase,
    device: devicePhase,
    link: linkPhase,
};

const chosenPhases = () => {
    const names = (process.env.CAPTURE_PHASES || "mix,preamp,outputs,device,link").split(",").map((x) => x.trim());
    const unknown = names.filter((name) => !phaseRunners[name]);
    if (unknown.length) throw new Error(`Unknown phase ${unknown.join(", ")}. Phases: ${Object.keys(phaseRunners)}`);
    return names;
};

const idle = async (run) => {
    if (run.isDryRun) return;
    run.log({ phase: "idle", seconds: 15 });
    await safe.pause(run, 15000);
};

/** Runs the phases with the outputs muted; false if one stopped (an error or Ctrl+C). */
const runPhases = async (run, names) => {
    try {
        await safe.muteOutputs(run);
        await idle(run);
        for (const name of names) await phaseRunners[name](run);
        await idle(run);
        return true;
    } catch (error) {
        run.log({ phase: "error", message: String(error?.stack || error) });
        return false;
    }
};

/** Connects and takes the snapshot; nothing is changed yet. */
const prepare = async (names) => {
    const client = await ua.connect();
    const device = await ua.findVolt(client);
    fs.mkdirSync(outDir, { recursive: true });
    const log = createLog(isDryRun ? null : path.join(outDir, "run-log.jsonl"));
    const run = await safe.startRun({ client, device, log, isDryRun, snapshotFile });
    run.outputs = await ua.outputs(client, device);
    const [buses, outputs] = [Object.keys(run.buses), Object.keys(run.outputs)];
    log({ phase: "start", dry: isDryRun, firmware: device.firmware, phases: names, buses, outputs });
    return run;
};

const main = async () => {
    const names = chosenPhases();
    const run = await prepare(names);
    safe.stopOnInterrupt(run);
    const isComplete = await runPhases(run, names);
    const isRestored = await safe.finishRun(run, snapshotFile);
    run.log({ phase: "done", isComplete, isRestored });
    process.exit(isComplete && isRestored ? 0 : 1);
};

main().catch((error) => {
    console.error(`${error.message}\nNothing was changed.`);
    process.exit(1);
});
