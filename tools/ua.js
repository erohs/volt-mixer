// CLI for UAMixerHelper's JSON API. "{dev}" in a path expands to the connected Volt.
// Run from Git Bash with MSYS_NO_PATHCONV=1 so "/paths" aren't rewritten.
//
//   node ua.js info                       device, firmware, serial
//   node ua.js get <path>                 raw reply
//   node ua.js set <path> <value>         write <path>/value, then read it back
//   node ua.js tree <path> [depth] [out]  recursive dump to JSON (default depth 6)
//   node ua.js controls [bus names...]    control names per bus/output
//   node ua.js snapshot [out]             readable state of every bus
//   node ua.js restore [state.json]       re-apply values cached by capture-run.js
"use strict";
const fs = require("fs");
const path = require("path");
const ua = require("./lib/ua-api");

const [cmd, ...args] = process.argv.slice(2);
const print = (x) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const commands = {
    async info(c, dev) {
        print(dev);
    },

    async get(c, dev, p) {
        print(await c.request("get", ua.expand(p, dev)));
    },

    async set(c, dev, p, value) {
        const full = ua.expand(p, dev);
        let v = value;
        try {
            v = JSON.parse(value);
        } catch {
            /* plain string */
        }
        print(await c.set(full, v));
        print({ readBack: await c.getValue(full) });
    },

    async tree(c, dev, p = "{dev}", depth = "6", out) {
        const root = ua.expand(p, dev),
            tree = {},
            queue = [[root, 0]];
        while (queue.length) {
            const [node, d] = queue.shift();
            const data = (await c.get(node)) || {};
            tree[node] = {
                properties: data.properties,
                commands: (data.commands || []).map((x) => ({ path: x.path, params: x.properties?.parameters })),
            };
            if (d < +depth)
                for (const ch of data.children || []) queue.push([node.replace(/\/$/, "") + "/" + ch.path, d + 1]);
        }
        const file = out || `tree${root.replace(/[\/{}]/g, "_")}.json`;
        fs.writeFileSync(file, JSON.stringify(tree, null, 1));
        console.log(`${Object.keys(tree).length} nodes -> ${file}`);
    },

    async controls(c, dev, ...names) {
        const buses = await ua.buses(c, dev);
        for (const [name, bp] of Object.entries(buses)) {
            if (names.length && !names.includes(name)) continue;
            console.log(`\n${name}\n  controls: ${(await ua.childNames(c, bp + "/controls")).join(", ")}`);
            for (const o of await ua.childNames(c, bp + "/outputs"))
                console.log(`  ${o}: ${(await ua.childNames(c, bp + "/outputs/" + o + "/controls")).join(", ")}`);
        }
    },

    async snapshot(c, dev, out) {
        const v = (props, k) => props?.[k]?.value;
        const rows = [];
        for (const [name, bp] of Object.entries(await ua.buses(c, dev))) {
            const pr = (await c.get(bp))?.properties;
            const row = {
                name,
                type: v(pr, "bus_type"),
                ch: v(pr, "channel_id"),
                enabled: v(pr, "enabled"),
                stereo: v(pr, "stem_format"),
                io: v(pr, "io_type"),
                uid: bp.split("/").pop(),
            };
            const ctl = await ua.childNames(c, bp + "/controls");
            for (const k of ["preamp_gain", "preamp_48v", "preamp_tone", "solo"])
                if (ctl.includes(k)) row[k] = await c.getValue(`${bp}/controls/${k}`);
            for (const o of ["main", "cue_0", "cue_1"]) {
                const oc = await ua.childNames(c, `${bp}/outputs/${o}/controls`);
                if (!oc.length) continue;
                row[o] = {};
                for (const k of ["gain", "pan", "pan_left", "pan_right", "mute", "mix_to_mono"])
                    if (oc.includes(k)) row[o][k] = await c.getValue(`${bp}/outputs/${o}/controls/${k}`);
            }
            rows.push(row);
        }
        const devProps = {};
        for (const k of [
            "sample_rate",
            "clock_source",
            "tos_link",
            "no_clip",
            "display_brightness",
            "firmware_version",
        ])
            devProps[k] = await c.getValue(`${dev.path}/${k}`);
        const outs = {};
        for (const [name, op] of Object.entries(await ua.outputs(c, dev))) {
            const pr = (await c.get(op))?.properties || {};
            outs[name] = { mix_in_source: pr.mix_in_source?.value, flex_route: pr.flex_route?.value };
        }
        const snap = { device: devProps, outputs: outs, buses: rows };
        if (out) {
            fs.writeFileSync(out, JSON.stringify(snap, null, 1));
            console.log("->", out);
        } else print(snap);
    },

    async restore(c, dev, file = path.resolve(__dirname, "..", "captures", "pre-run-state.json")) {
        const entries = JSON.parse(fs.readFileSync(file, "utf8"));
        for (let pass = 0; pass < 2; pass++) {
            for (const [p, v] of entries) {
                await c.set(p, v);
                await sleep(60);
            }
            await sleep(1500);
        }
        let bad = 0;
        for (const [p, v] of entries) {
            const now = await c.getValue(p);
            if (JSON.stringify(now) !== JSON.stringify(v)) {
                bad++;
                console.log("MISMATCH", p, "wanted", v, "got", now);
            }
        }
        console.log(`restored ${entries.length} values, ${bad} mismatches`);
        if (bad) process.exitCode = 1;
    },
};

(async () => {
    if (!commands[cmd]) {
        console.log(
            fs
                .readFileSync(__filename, "utf8")
                .split("\n")
                .filter((l) => l.startsWith("//"))
                .join("\n"),
        );
        process.exit(2);
    }
    const c = await ua.connect();
    const dev = await ua.findVolt(c);
    await commands[cmd](c, dev, ...args);
    c.close();
    process.exit(process.exitCode || 0);
})().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
