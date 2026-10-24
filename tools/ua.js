// CLI for UAMixerHelper's JSON API. "{dev}" in a path expands to the connected Volt.
// Run from Git Bash with MSYS_NO_PATHCONV=1 so "/paths" aren't rewritten.
//
//   node ua.js info                       device, firmware, serial
//   node ua.js get <path>                 raw reply
//   node ua.js set <path> <value>         write <path>/value, then read it back
//   node ua.js tree <path> [depth] [out]  recursive dump to JSON (default depth 6)
//   node ua.js controls [bus names...]    control names per bus/output
//   node ua.js snapshot [out]             every setting the API can read (lib/ua-snapshot.js)
//   node ua.js diff <before> [after]      what differs between two snapshots (or the Volt now)
//   node ua.js restore [snapshot]         write back every setting that differs from a snapshot
//                                         (default: the one capture-run.js and state-probe.mjs save)
"use strict";
const fs = require("fs");
const path = require("path");
const ua = require("./lib/ua-api");
const { takeSnapshot, diffSnapshots, restoreSnapshot, formatDifference } = require("./lib/ua-snapshot");

const runSnapshotFile = path.resolve(__dirname, "..", "captures", "snapshot-before-run.json");
const [command, ...args] = process.argv.slice(2);
const print = (x) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 1));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

let connection = null;
const volt = async () => {
    if (!connection) {
        const client = await ua.connect();
        connection = { client, device: await ua.findVolt(client) };
    }
    return connection;
};

const parseValue = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const printDifferences = (differences) => {
    for (const difference of differences) console.log(formatDifference(difference));
    console.log(differences.length ? `${differences.length} difference(s)` : "identical");
    if (differences.length) process.exitCode = 1;
};

const tree = async (start = "{dev}", depth = "6", out) => {
    const { client, device } = await volt();
    const root = ua.expand(start, device);
    const nodes = {};
    const queue = [[root, 0]];
    while (queue.length) {
        const [node, level] = queue.shift();
        const data = (await client.get(node)) || {};
        const commands = (data.commands || []).map((x) => ({ path: x.path, params: x.properties?.parameters }));
        nodes[node] = { properties: data.properties, commands };
        if (level < +depth)
            for (const child of data.children || [])
                queue.push([`${node.replace(/\/$/, "")}/${child.path}`, level + 1]);
    }
    const file = out || `tree${root.replace(/[\/{}]/g, "_")}.json`;
    fs.writeFileSync(file, JSON.stringify(nodes, null, 1));
    console.log(`${Object.keys(nodes).length} nodes -> ${file}`);
};

const controls = async (...names) => {
    const { client, device } = await volt();
    for (const [name, busPath] of Object.entries(await ua.buses(client, device))) {
        if (names.length && !names.includes(name)) continue;
        console.log(`\n${name}\n  controls: ${(await ua.childNames(client, busPath + "/controls")).join(", ")}`);
        for (const output of await ua.childNames(client, busPath + "/outputs")) {
            const outputControls = await ua.childNames(client, `${busPath}/outputs/${output}/controls`);
            console.log(`  ${output}: ${outputControls.join(", ")}`);
        }
    }
};

const commands = {
    info: async () => print((await volt()).device),
    get: async (target) => {
        const { client, device } = await volt();
        print(await client.request("get", ua.expand(target, device)));
    },
    set: async (target, value) => {
        const { client, device } = await volt();
        const full = ua.expand(target, device);
        print(await client.set(full, parseValue(value)));
        print({ readBack: await client.getValue(full) });
    },
    tree,
    controls,
    snapshot: async (out) => {
        const { client, device } = await volt();
        const snapshot = await takeSnapshot(client, device);
        if (!out) return print(snapshot);
        fs.writeFileSync(out, JSON.stringify(snapshot, null, 1));
        console.log("->", out);
    },
    diff: async (beforeFile, afterFile) => {
        const now = async () => {
            const { client, device } = await volt();
            return takeSnapshot(client, device);
        };
        printDifferences(diffSnapshots(readJson(beforeFile), afterFile ? readJson(afterFile) : await now()));
    },
    restore: async (file = runSnapshotFile) => {
        const { client, device } = await volt();
        printDifferences(await restoreSnapshot(client, device, readJson(file), { log: print }));
    },
};

const usage = () =>
    fs
        .readFileSync(__filename, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("//"))
        .join("\n");

const main = async () => {
    if (!commands[command]) {
        console.log(usage());
        process.exit(2);
    }
    await commands[command](...args);
    connection?.client.close();
    process.exit(process.exitCode || 0);
};

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
