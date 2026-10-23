// Builds a Volt Mixer mix link from UAD Console's current mix (read-only), so the page's first
// push at home changes nothing. Needs UAD Console running.
//   node mix-link.mjs [page-url]      default page-url: http://localhost:4321/
import { createRequire } from "module";
import { channels, pairs } from "../src/lib/mixer.ts";
import { encodeMix } from "../src/lib/saved-mix.ts";

const require = createRequire(import.meta.url);
const ua = require("./lib/ua-api");
const pageUrl = process.argv[2] ?? "http://localhost:4321/";

/** Console's bus name for a channel ("in3" -> "ANALOG 3") or a linked pair ("ANALOG 3-4"). */
const busName = (id) => {
    const number = (id.match(/\d+$/) ?? [""])[0];
    if (id.startsWith("in")) return `ANALOG ${number}`;
    if (id.startsWith("adat")) return `ADAT ${number}`;
    if (id.startsWith("spdif")) return `S/PDIF ${id.endsWith("L") ? "L" : "R"}`;
    return `LOOPBACK ${id.endsWith("L") ? "L" : "R"}`;
};
const pairBusName = ([a, b]) => {
    if (a.startsWith("spdif")) return "S/PDIF";
    if (a.startsWith("loopback")) return "LOOPBACK";
    return `${busName(a)}-${(b.match(/\d+$/) ?? [""])[0]}`;
};

const readSend = async (api, bus, output, side) => {
    const base = `${bus}/outputs/${output}/controls`;
    const pan = side === undefined ? await api.getValue(`${base}/pan`) : await api.getValue(`${base}/pan_${side}`);
    return {
        db: await api.getValue(`${base}/gain`),
        pan: pan ?? 0,
        isMuted: (await api.getValue(`${base}/mute`)) === 1,
    };
};

/** One channel's mix, from its own bus (mono) or one side of the pair's stereo bus. */
const readChannel = async (api, bus, side) => {
    const main = await readSend(api, bus, "main", side);
    return {
        fader: main.db,
        pan: main.pan,
        isMuted: main.isMuted,
        cue1: await readSend(api, bus, "cue_0", side),
        cue2: await readSend(api, bus, "cue_1", side),
    };
};

const readPair = async (api, buses, pair, mix) => {
    const stereo = buses[pairBusName(pair)];
    const isLinked = Boolean(stereo && (await api.getValue(`${stereo}/enabled`)));
    mix.linked[pair.join("-")] = isLinked;
    for (const [i, id] of pair.entries()) {
        mix.channels[id] = isLinked
            ? await readChannel(api, stereo, i === 0 ? "left" : "right")
            : await readChannel(api, buses[busName(id)]);
    }
};

const readRouting = async (api, outputs) => {
    const source = async (name) => (await api.get(outputs[name]))?.properties ?? {};
    const cue = async (name) => {
        const props = await source(name);
        return {
            isMix: props.mix_in_source?.value !== "",
            isMirroredToLine34: /line 3-4/i.test(props.flex_route?.value ?? ""),
        };
    };
    const headphone = (await source("HP 1")).mix_in_source?.value === "cue2" ? "cue2" : "cue1";
    return { cues: { cue1: await cue("CUE 1"), cue2: await cue("CUE 2") }, headphoneSource: headphone };
};

const api = await ua.connect();
const device = await ua.findVolt(api);
const buses = await ua.buses(api, device);
const mix = {
    version: 1,
    channels: {},
    names: {},
    linked: {},
    ...(await readRouting(api, await ua.outputs(api, device))),
};
for (const pair of pairs) await readPair(api, buses, pair, mix);
api.close();

const link = new URL(pageUrl);
link.hash = `mix=${encodeMix(mix)}`;
console.log(`Console's mix for ${channels.length} channels, as a mix link:\n\n${link.href}\n`);
process.exit(0);
