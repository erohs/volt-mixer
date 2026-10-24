// A full snapshot of the Volt's settings through UA's API, and the diff and restore built on it.
// `settings` can be written back; `readOnly` (firmware, which pairs are linked) can only be compared.
// MONITOR and HEADPHONE come last, so a restore brings the outputs back after everything else.
"use strict";
const { setTimeout: sleep } = require("timers/promises");
const ua = require("./ua-api");

const deviceSettings = ["sample_rate", "tos_link", "clock_source", "no_clip", "display_brightness"];
const busControls = ["preamp_gain", "preamp_48v", "preamp_tone", "solo"];
const sendNames = ["main", "cue_0", "cue_1"];
const sendControls = ["gain", "pan", "pan_left", "pan_right", "mute", "mix_to_mono"];
const routingNames = ["mix_in_source", "flex_route"];
const masterBuses = ["MONITOR", "HEADPHONE"];

const readControls = async (client, base, names, entries) => {
    const present = await ua.childNames(client, base);
    for (const name of names.filter((candidate) => present.includes(candidate)))
        entries.push([`${base}/${name}`, await client.getValue(`${base}/${name}`)]);
};

const readBus = async (client, busPath, entries) => {
    await readControls(client, `${busPath}/controls`, busControls, entries);
    const sends = await ua.childNames(client, `${busPath}/outputs`);
    for (const send of sendNames.filter((name) => sends.includes(name)))
        await readControls(client, `${busPath}/outputs/${send}/controls`, sendControls, entries);
};

const readRouting = async (client, device, entries) => {
    for (const outputPath of Object.values(await ua.outputs(client, device))) {
        const props = (await client.get(outputPath))?.properties || {};
        for (const name of routingNames.filter((candidate) => candidate in props))
            entries.push([`${outputPath}/${name}`, props[name].value]);
    }
};

const mastersLast = (buses) => {
    const isMaster = ([name]) => masterBuses.includes(name);
    return [...buses.filter((bus) => !isMaster(bus)), ...buses.filter(isMaster)];
};

const takeSnapshot = async (client, device) => {
    const buses = mastersLast(Object.entries(await ua.buses(client, device)));
    const settings = [];
    const readOnly = [[`${device.path}/firmware_version`, await client.getValue(`${device.path}/firmware_version`)]];
    for (const [, busPath] of buses) readOnly.push([`${busPath}/enabled`, await client.getValue(`${busPath}/enabled`)]);
    for (const [, busPath] of buses.filter(([name]) => !masterBuses.includes(name)))
        await readBus(client, busPath, settings);
    for (const name of deviceSettings)
        settings.push([`${device.path}/${name}`, await client.getValue(`${device.path}/${name}`)]);
    await readRouting(client, device, settings);
    for (const [, busPath] of buses.filter(([name]) => masterBuses.includes(name)))
        await readBus(client, busPath, settings);
    return { takenAt: new Date().toISOString(), device: device.path, settings, readOnly };
};

const isSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The entries that differ, in `before`'s order (then any only in `after`). */
const diffEntries = (before, after) => {
    const was = new Map(before);
    const now = new Map(after);
    const paths = [...new Set([...was.keys(), ...now.keys()])];
    return paths
        .filter((path) => !isSame(was.get(path), now.get(path)))
        .map((path) => ({ path, before: was.get(path), after: now.get(path) }));
};

const diffSnapshots = (before, after) => [
    ...diffEntries(before.settings, after.settings),
    ...diffEntries(before.readOnly, after.readOnly),
];

const formatDifference = ({ path, before, after }) =>
    `${path}: was ${JSON.stringify(before)}, now ${JSON.stringify(after)}`;

const writeBack = async (client, differences, log) => {
    for (const { path, before } of differences.filter((difference) => difference.before !== undefined)) {
        try {
            await client.set(path, before);
        } catch (error) {
            log({ phase: "restore-error", path, message: error.message });
        }
        await sleep(60);
    }
};

/**
 * Writes back every setting that differs from `before`, until none do (or `attempts` run out), and
 * returns what still differs, read-only values included. An empty list means the Volt is as it was.
 */
const restoreSnapshot = async (client, device, before, { log = () => {}, attempts = 3 } = {}) => {
    if (before.device !== device.path) throw new Error(`The snapshot is of ${before.device}, not this Volt.`);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const differences = diffEntries(before.settings, (await takeSnapshot(client, device)).settings);
        if (!differences.length) break;
        log({ phase: "restore", attempt, count: differences.length });
        await writeBack(client, differences, log);
        await sleep(1500);
    }
    return diffSnapshots(before, await takeSnapshot(client, device));
};

module.exports = { takeSnapshot, diffSnapshots, restoreSnapshot, formatDifference };
