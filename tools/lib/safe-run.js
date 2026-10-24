// A run that changes the Volt's settings through UA's API and always puts them back. It takes a
// full snapshot first (saved, so `node ua.js restore` can recover after a crash), keeps MONITOR and
// HEADPHONE muted for the whole run, and restores and re-checks the snapshot once, at the end.
// Ctrl+C stops the next change; the restore still runs.
//
// The rule for every change: an output level only ever moves down, never below 0 (the Volt jumps
// loud below 0); an output mute ends muted; anything else may be louder, so it is refused unless
// both outputs are muted at that moment.
"use strict";
const fs = require("fs");
const { dirname } = require("path");
const { setTimeout: sleep } = require("timers/promises");
const ua = require("./ua-api");
const { takeSnapshot, restoreSnapshot, formatDifference } = require("./ua-snapshot");

const masterNames = ["MONITOR", "HEADPHONE"];
const muted = 1;
const stepMs = 400;
const paramGapMs = 1200;

const masterControls = (buses) => {
    const controls = masterNames.map((name) => `${buses[name]}/outputs/main/controls`);
    return { levels: controls.map((base) => `${base}/gain`), mutes: controls.map((base) => `${base}/mute`) };
};

/** Takes the snapshot; nothing is changed yet. */
const startRun = async ({ client, device, log, isDryRun = false, snapshotFile }) => {
    const buses = await ua.buses(client, device);
    const missing = masterNames.filter((name) => !buses[name]);
    if (missing.length) throw new Error(`No ${missing.join(" or ")} bus, so the outputs can't be muted.`);
    const before = await takeSnapshot(client, device);
    if (!isDryRun) {
        fs.mkdirSync(dirname(snapshotFile), { recursive: true });
        fs.writeFileSync(snapshotFile, JSON.stringify(before, null, 1));
    }
    const controller = new AbortController();
    return {
        client,
        device,
        buses,
        log,
        isDryRun,
        before,
        masters: masterControls(buses),
        controller,
        isFinishing: false,
    };
};

const pause = (run, ms) => sleep(ms, undefined, { signal: run.controller.signal });
const stopIfAborted = (run) => run.controller.signal.throwIfAborted();

const stopOnInterrupt = (run) =>
    process.on("SIGINT", () => {
        if (run.isFinishing) console.error("Putting the Volt's settings back; please wait.");
        else run.controller.abort(new Error("Interrupted (Ctrl+C)"));
    });

const setValue = async (run, path, value, label, settleMs = stepMs) => {
    stopIfAborted(run);
    if (run.isDryRun) return run.log({ dry: true, label, path, value });
    run.log({ step: "set", label, path, value });
    await run.client.set(path, value);
    await pause(run, settleMs);
    const readBack = await run.client.getValue(path);
    if (JSON.stringify(readBack) !== JSON.stringify(value))
        run.log({ step: "readback-differs", label, path, wanted: value, got: readBack });
};

/** An API command (`post`). Its body isn't logged as a step value: it holds the device ID. */
const postCommand = async (run, path, body, label) => {
    stopIfAborted(run);
    if (run.isDryRun) return run.log({ dry: true, label, path });
    run.log({ step: "set", label, path });
    run.log({ step: "reply", label, reply: await run.client.post(path, body) });
};

const assertQuiet = async (run, label) => {
    if (run.isDryRun) return;
    for (const path of run.masters.mutes)
        if ((await run.client.getValue(path)) !== muted)
            throw new Error(`${path} isn't muted, so "${label}" was refused.`);
};

// Line Out 3/4 has no mute here, and a mirrored cue would carry the sweeps to it.
const refuseMirroredCues = (run) => {
    const mirrored = run.before.settings.filter(([path, value]) => path.endsWith("/flex_route") && value !== "None");
    if (mirrored.length)
        throw new Error("A cue is mirrored to Line Out 3/4. Set its Mirror to None in UAD Console for the run.");
};

/** Mutes MONITOR and HEADPHONE until the final restore; refuses to go on if they can't be muted. */
const muteOutputs = async (run) => {
    refuseMirroredCues(run);
    for (const [i, path] of run.masters.mutes.entries())
        await setValue(run, path, muted, `outputs muted for the run (${masterNames[i]})`);
    await assertQuiet(run, "the run");
};

/**
 * What a sweep sends, from its requested values and the setting's value now: the steps, the value
 * it ends on (null: leave it until the final restore) and whether the outputs must be muted.
 */
const planSweep = (run, path, values, original) => {
    if (run.masters.levels.includes(path)) {
        if (!(original >= 0)) throw new Error(`${path} reads ${original}, so it was left alone.`);
        return {
            targets: values.map((value) => Math.min(original, Math.max(0, value))),
            end: null,
            isQuietNeeded: false,
        };
    }
    if (run.masters.mutes.includes(path))
        return { targets: values, end: values.at(-1) === muted ? null : muted, isQuietNeeded: false };
    return { targets: values, end: original, isQuietNeeded: true };
};

/** Sets each value in turn, then the end value (see planSweep). `settleMs` is the wait per step. */
const sweep = async (run, label, path, values, settleMs = stepMs) => {
    const original = await run.client.getValue(path);
    const { targets, end, isQuietNeeded } = planSweep(run, path, values, original);
    if (isQuietNeeded) await assertQuiet(run, label);
    run.log({ phase: "param", label, path, original, values: targets });
    for (const value of targets) await setValue(run, path, value, label, settleMs);
    if (end !== null) await setValue(run, path, end, `${label} (restore)`, settleMs);
    await pause(run, paramGapMs);
};

const reportDifferences = (differences, snapshotFile) => {
    console.error(`\n*** NOT RESTORED: ${differences.length} setting(s) differ from before the run ***`);
    for (const difference of differences) console.error(`  ${formatDifference(difference)}`);
    console.error(`Run "node ua.js restore ${snapshotFile}" and check again.\n`);
};

/** Restores the snapshot and checks every setting; true when the Volt is exactly as it was. */
const finishRun = async (run, snapshotFile) => {
    run.isFinishing = true;
    if (run.isDryRun) return true;
    try {
        const differences = await restoreSnapshot(run.client, run.device, run.before, { log: run.log });
        run.log({ phase: "restore-verified", mismatches: differences });
        if (differences.length) reportDifferences(differences, snapshotFile);
        return differences.length === 0;
    } catch (error) {
        reportDifferences([{ path: "(restore failed)", before: "", after: error.message }], snapshotFile);
        return false;
    }
};

module.exports = {
    startRun,
    pause,
    stopOnInterrupt,
    setValue,
    postCommand,
    assertQuiet,
    muteOutputs,
    planSweep,
    sweep,
    finishRun,
};
