// Automated capture driver: steps every Volt setting through UAMixerHelper's API (127.0.0.1:4720)
// while USBPcap records, logging a timestamp per step so USB traffic can be labelled.
// Every value touched is cached first and restored at the end (also on error / Ctrl+C).
//
//   node capture-run.js --dry-run        read-only: resolve paths, print the plan
//   node capture-run.js                  run it (writes captures/run-log.jsonl + pre-run-state.json)
const fs = require("fs");
const path = require("path");
const ua = require("./lib/ua-api");

const OUT = path.resolve(__dirname, "..", "captures");
const DRY = process.argv.includes("--dry-run");
const STEP_MS = 400,
    PARAM_GAP_MS = 1200;

// ---------- API client (lib/ua-api.js); D = the Volt's device path, found at start-up ----------
let api, D;
const request = (verb, p, arg) => api.request(verb, p, arg);
const get = (p) => api.get(p);
const getVal = (p) => api.getValue(p);
const fmt = (v) => (typeof v === "string" ? v : JSON.stringify(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- logging ----------
let logFd = null;
function log(event) {
    const line = JSON.stringify({ t: Date.now(), iso: new Date().toISOString(), ...event });
    console.log(line);
    if (logFd !== null) fs.writeSync(logFd, line + "\n");
}

// ---------- cache / restore ----------
const cache = new Map(); // path -> original value
const CACHE_FILE = path.join(OUT, "pre-run-state.json");
async function remember(p) {
    if (!cache.has(p)) {
        cache.set(p, await getVal(p));
        // Persist on every new entry so tools/restore.js can recover even after a hard crash.
        if (!DRY) fs.writeFileSync(CACHE_FILE, JSON.stringify([...cache], null, 1));
    }
    return cache.get(p);
}
async function setVal(p, v, label) {
    await remember(p);
    if (DRY) {
        log({ dry: true, label, path: p, value: v });
        return;
    }
    log({ step: "set", label, path: p, value: v });
    await request("set", p + "/value", fmt(v));
    await sleep(STEP_MS);
    const back = await getVal(p);
    if (JSON.stringify(back) !== JSON.stringify(v))
        log({ step: "readback-differs", label, path: p, wanted: v, got: back });
}
async function restoreAll(reason) {
    if (DRY || !cache.size) return;
    log({ phase: "restore", reason, count: cache.size });
    for (let pass = 0; pass < 2; pass++) {
        for (const [p, v] of cache) {
            await request("set", p + "/value", fmt(v));
            await sleep(60);
        }
        await sleep(1500);
    }
    const diffs = [];
    for (const [p, v] of cache) {
        const now = await getVal(p);
        if (JSON.stringify(now) !== JSON.stringify(v)) diffs.push({ path: p, wanted: v, got: now });
    }
    log({ phase: "restore-verified", mismatches: diffs });
}

// A sweep: set each value in turn, then put the original back.
async function sweep(label, p, values) {
    const orig = await remember(p);
    log({ phase: "param", label, path: p, original: orig, values });
    for (const v of values) await setVal(p, v, label);
    await setVal(p, orig, label + " (restore)");
    await sleep(PARAM_GAP_MS);
}

// ---------- discovery ----------
async function discover() {
    const buses = {};
    for (const c of (await get(D + "/buses")).children) {
        const props = (await get(D + "/buses/" + c.path)).properties;
        buses[props.name.value] = D + "/buses/" + c.path;
    }
    const outputs = {};
    for (const c of (await get(D + "/outputs")).children) {
        const props = (await get(D + "/outputs/" + c.path)).properties;
        outputs[props.name.value] = D + "/outputs/" + c.path;
    }
    return { buses, outputs };
}
const hasChild = async (p, name) => ((await get(p))?.children || []).some((c) => c.path === name);

// Phases to run: CAPTURE_PHASES=routing,autogain (default: the original full sweep).
const phases = new Set(
    (process.env.CAPTURE_PHASES || "mix,preamp,outputs,cues,device,link").split(",").map((x) => x.trim()),
);

// Cue routing with the real values (from Console's strings): cue MIX on = "mon", off = "";
// headphones follow "cue1" | "cue2"; mirror = "LINE 3-4" | "None". Each step is labelled.
async function routingPhase(outputs) {
    const hp = outputs["HP 1"] + "/mix_in_source";
    const mix = (n) => outputs[`CUE ${n}`] + "/mix_in_source";
    const mirror = (n) => outputs[`CUE ${n}`] + "/flex_route";
    for (const p of [hp, mix(1), mix(2), mirror(1), mirror(2)]) await remember(p);
    log({ phase: "param", label: "cue routing" });
    const steps = [
        ["CUE 2 MIX off", mix(2), ""],
        ["HP source cue2", hp, "cue2"],
        ["CUE 2 mirror LINE 3-4", mirror(2), "LINE 3-4"],
        ["CUE 2 mirror None", mirror(2), "None"],
        ["HP source cue1", hp, "cue1"],
        ["CUE 2 MIX on", mix(2), "mon"],
        ["CUE 1 MIX off", mix(1), ""],
        ["CUE 1 mirror LINE 3-4", mirror(1), "LINE 3-4"],
        ["CUE 1 mirror None", mirror(1), "None"],
        ["CUE 1 MIX on", mix(1), "mon"],
    ];
    for (const [label, p, v] of steps) {
        await setVal(p, v, label);
        await sleep(PARAM_GAP_MS);
    }
}

// Auto-Gain on Input 2 (nothing plugged in, so it should end "Too Quiet"); gain restored after.
// Console starts the Volt's own Auto-Gain with trigger_auto_gain; the Volt reports progress itself.
async function autoGainPhase(buses) {
    const bus = buses["ANALOG 2"];
    const gainPath = bus + "/controls/preamp_gain";
    await remember(gainPath);
    const body = (duration) =>
        JSON.stringify({ device_uid: D.split("/").pop(), channels: [bus.split("/").pop()], duration });
    const watch = async (ms) => {
        for (let t = 0; t < ms; t += 500) {
            const st = (await get("/auto_gain"))?.properties || {};
            const active = (await get(bus))?.properties?.preamp_embedded_auto_gain_active?.value;
            log({
                step: "autogain-status",
                status: st.status?.value,
                text: st.status_str?.value,
                countDown: st.count_down?.value,
                active,
                gain: await getVal(gainPath),
            });
            await sleep(500);
        }
    };
    log({ phase: "param", label: "auto-gain" });
    if (DRY) return;
    log({ step: "set", label: "auto-gain run (5 s)", path: "/auto_gain/trigger_auto_gain" });
    log({ step: "reply", reply: await request("post", "/auto_gain/trigger_auto_gain", body(5)) });
    await watch(9000);
    log({ step: "set", label: "auto-gain cancel start", path: "/auto_gain/trigger_auto_gain" });
    log({ step: "reply", reply: await request("post", "/auto_gain/trigger_auto_gain", body(10)) });
    await watch(1500);
    log({ step: "set", label: "auto-gain cancel stop", path: "/auto_gain/stop_auto_gain" });
    log({ step: "reply", reply: await request("post", "/auto_gain/stop_auto_gain", JSON.stringify({ all: true })) });
    await watch(3000);
}

// ---------- main ----------
(async () => {
    api = await ua.connect();
    D = (await ua.findVolt(api)).path;
    fs.mkdirSync(OUT, { recursive: true });
    if (!DRY) logFd = fs.openSync(path.join(OUT, "run-log.jsonl"), "a");
    const { buses, outputs } = await discover();
    log({
        phase: "start",
        dry: DRY,
        firmware: await getVal(D + "/firmware_version"),
        buses: Object.keys(buses),
        outputs: Object.keys(outputs),
    });

    const onAbort = async () => {
        await restoreAll("interrupted");
        process.exit(1);
    };
    process.on("SIGINT", onAbort);

    try {
        if (!DRY) {
            log({ phase: "idle", seconds: 15 });
            await sleep(15000);
        }

        const mixBuses = ["ANALOG 1", "ANALOG 2", "ANALOG 3", "ANALOG 4", "ADAT 1", "LOOPBACK"];
        // --- mix channels: fader, pan, mute, solo, cue sends ---
        if (phases.has("mix"))
            for (const name of mixBuses) {
                const b = buses[name];
                const main = b + "/outputs/main/controls";
                const stereo = await hasChild(main, "pan_left");
                await sweep(`${name} fader`, main + "/gain", [-144, -48, -24, -12, -6, -3, 0, 3, 6, 12]);
                if (stereo) {
                    await sweep(`${name} pan L`, main + "/pan_left", [-1, -0.5, 0, 0.5, 1]);
                    await sweep(`${name} pan R`, main + "/pan_right", [-1, -0.5, 0, 0.5, 1]);
                } else {
                    await sweep(`${name} pan`, main + "/pan", [-1, -0.5, 0, 0.5, 1]);
                }
                await sweep(`${name} mute`, main + "/mute", [0, 1, 0, 1]);
                await sweep(`${name} solo`, b + "/controls/solo", [1, 0]);
                for (const cue of ["cue_0", "cue_1"]) {
                    const c = b + `/outputs/${cue}/controls`;
                    await sweep(`${name} ${cue} send`, c + "/gain", [-144, -24, -12, -6, 0, 6]);
                    await sweep(`${name} ${cue} pan`, c + (stereo ? "/pan_left" : "/pan"), [-1, 0, 1]);
                    await sweep(`${name} ${cue} mute`, c + "/mute", [1, 0]);
                }
            }

        // --- preamps ---
        if (phases.has("preamp")) {
            for (const name of ["ANALOG 1", "ANALOG 2"]) {
                await sweep(
                    `${name} preamp gain`,
                    buses[name] + "/controls/preamp_gain",
                    [0, 10, 20, 30, 40, 50, 60, 0],
                );
            }
            for (const name of ["ANALOG 1", "ANALOG 2", "ANALOG 3", "ANALOG 4"]) {
                await sweep(`${name} tone`, buses[name] + "/controls/preamp_tone", [0, 1, 2, 3, 0]);
            }
            for (const name of ["ANALOG 1", "ANALOG 2"]) {
                const jd = (await get(buses[name] + "/jack_detect"))?.properties || {};
                if (jd.jack_detect_mic?.value) {
                    log({ phase: "skip", label: `${name} 48V`, reason: "XLR plugged in" });
                    continue;
                }
                await sweep(`${name} 48V`, buses[name] + "/controls/preamp_48v", [1, 0]);
            }
        }

        // --- monitor / headphone (only ever lower than current) ---
        if (phases.has("outputs")) {
            for (const [name, ctl] of [
                ["MONITOR", buses.MONITOR + "/outputs/main/controls"],
                ["HEADPHONE", buses.HEADPHONE + "/outputs/main/controls"],
            ]) {
                const cur = await remember(ctl + "/gain");
                const lower = [cur - 3, cur - 10, cur - 20, cur - 40].map((v) => Math.round(v * 10) / 10);
                await sweep(`${name} level (down only)`, ctl + "/gain", lower);
                await sweep(`${name} mute`, ctl + "/mute", [1, 0]);
            }
            await sweep("MONITOR mono", buses.MONITOR + "/outputs/main/controls/mix_to_mono", [1, 0]);
        }

        // --- cue routing, first pass (values partly guessed; superseded by the 'routing' phase) ---
        if (phases.has("cues")) {
            await sweep("HP 1 source", outputs["HP 1"] + "/mix_in_source", ["cue2", "mon", "cue1"]);
            for (const cue of ["CUE 1", "CUE 2"]) {
                await sweep(`${cue} MIX source`, outputs[cue] + "/mix_in_source", ["", "mon"]);
                await sweep(`${cue} mirror`, outputs[cue] + "/flex_route", ["Line 3-4", "LINE 3-4", "line34", "None"]);
            }
        }

        if (phases.has("routing")) await routingPhase(outputs);
        if (phases.has("autogain")) await autoGainPhase(buses);

        // --- device globals ---
        const dev = (p) => D + "/" + p;
        if (phases.has("device")) {
            await sweep("display brightness", dev("display_brightness"), [255, 128, 64, 0]);
            await sweep("clip protection", dev("no_clip"), [false, true]);
            await sweep("digital input format", dev("tos_link"), ["S/PDIF", "ADAT"]);
            await sweep("clock source", dev("clock_source"), ["ADAT", "Internal"]);
            log({ phase: "param", label: "sample rate (slow)" });
            for (const sr of [48000, 96000, 192000]) {
                await setVal(dev("sample_rate"), sr, "sample rate");
                await sleep(3000);
            }
            await setVal(dev("sample_rate"), cache.get(dev("sample_rate")), "sample rate (restore)");
            await sleep(3000);
        }

        // --- stereo link: try command syntaxes, verify via the pair bus's `enabled` ---
        if (phases.has("link"))
            for (const [pair, a, b] of [
                ["ANALOG 1-2", "ANALOG 1", "ANALOG 2"],
                ["ANALOG 3-4", "ANALOG 3", "ANALOG 4"],
            ]) {
                const pairBus = buses[pair];
                const wasLinked = await getVal(pairBus + "/enabled");
                const uids = [a, b].map((n) => buses[n].split("/").pop());
                const body = (st) =>
                    JSON.stringify({ device_uid: D.split("/").pop(), channel_uid: uids, stem_format: st });
                log({ phase: "param", label: `${pair} link`, wasLinked });
                if (DRY) continue;
                let syntax = null;
                for (const verb of ["post", "run", "call"]) {
                    for (const target of [D + "/link_channels", "/link_channels"]) {
                        log({ step: "link-try", verb, target });
                        await request(verb, target, body(wasLinked ? "mono" : "stereo"));
                        await sleep(1500);
                        if ((await getVal(pairBus + "/enabled")) !== wasLinked) {
                            syntax = { verb, target };
                            break;
                        }
                    }
                    if (syntax) break;
                }
                log({ step: "link-result", pair, syntax });
                if (syntax) {
                    await sleep(2000);
                    log({ step: "link-restore", pair });
                    await request(syntax.verb, syntax.target, body(wasLinked ? "stereo" : "mono"));
                    await sleep(2000);
                }
            }

        if (!DRY) {
            log({ phase: "idle", seconds: 15 });
            await sleep(15000);
        }
    } catch (e) {
        log({ phase: "error", message: String((e && e.stack) || e) });
    } finally {
        await restoreAll("end of run");
        log({ phase: "done" });
        process.exit(0);
    }
})();
