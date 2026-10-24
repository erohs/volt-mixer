// Finds what makes the Volt's display miss a brightness change. Each case sets the display bright,
// sends a run of F0 21 commands (and state requests, as the page's re-reads do), reads back what
// the Volt stored, and asks you what the display shows. Anything else the Volt sends back during
// a run is printed. Restores the starting brightness at the end. Quit Volt Mixer and UAD Console.
//   node brightness-probe.mjs
import readline from "readline/promises";
import { createRequire } from "module";
import { brightness, identify, stateRequest } from "../src/lib/commands.ts";
import { parseIdentify, parseState } from "../src/lib/reports.ts";
import { protocol, specFor } from "../src/lib/spec.ts";

const require = createRequire(import.meta.url);
const HID = require("node-hid");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const info = HID.devices().find(
    (d) => d.vendorId === protocol.vendorId && d.productId === protocol.productId && d.usagePage === 0xff01,
);
if (!info) {
    console.error("Volt control interface not found");
    process.exit(1);
}
const dev = new HID.HID(info.path);
let spec = specFor("").spec;
let onData = () => {};
let isLogging = false;
// node-hid includes the report ID as byte 0 on Windows.
const isState = (b) => b[0] === spec.reports.stateReply.id && b[1] === spec.reports.stateReply.cmd;
const isMeters = (b) => b[0] === spec.reports.meters.id;
dev.on("data", (buf) => {
    if (isLogging && !isMeters(buf) && !isState(buf)) console.log(`  Volt sent: ${buf.subarray(0, 8).toString("hex")}`);
    onData(buf);
});

const send = (report) => dev.write([report.reportId, ...report.data]);
const request = (report, match) =>
    new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 1500);
        onData = (buf) => match(buf) && (clearTimeout(timer), resolve(buf));
        send(report);
    });
const storedBrightness = async () => {
    const b = await request(stateRequest(spec), isState);
    return b ? parseState(spec, b.subarray(1)).brightness : null;
};

/* Steps are raw brightness levels, or "state" for a state request. All start from raw 145. */
const bright = 145;
const cases = [
    { label: "one jump straight to 0", steps: [0] },
    { label: "two big jumps, 16 ms apart", steps: [60, 0] },
    { label: "back and forth, 16 ms apart, ending at 0", steps: [100, 130, 60, 90, 20, 50, 0] },
    { label: "one jump to 0, state request 1 ms later", steps: [0, "state"], gapMs: 1 },
    { label: "two big jumps with a state request between", steps: [60, "state", 0], gapMs: 1 },
    { label: "state request, then a jump to 0 1 ms later", steps: ["state", 0], gapMs: 1 },
];

const runCase = async ({ steps, gapMs = 16 }) => {
    send(brightness(spec, bright));
    await sleep(1500);
    isLogging = true;
    for (const step of steps) {
        send(step === "state" ? stateRequest(spec) : brightness(spec, step));
        await sleep(gapMs);
    }
    await sleep(1000);
    isLogging = false;
    return storedBrightness();
};

const idReply = await request(identify(spec), (b) => b[0] === spec.reports.identifyReply.id);
spec = specFor(idReply ? parseIdentify(idReply.subarray(1)).version : "").spec;
const start = await storedBrightness();
console.log(`Starting brightness: raw ${start}. Each case starts bright and should end dark; watch the display.\n`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const results = [];
for (const [i, c] of cases.entries()) {
    await rl.question(`Case ${i + 1}/${cases.length} (${c.label}). Press Enter to run it.`);
    const stored = await runCase(c);
    const seen = await rl.question(`  Volt stored raw ${stored}. Is the display now dark (d) or still lit (l)? `);
    results.push({ case: c.label, stored, display: seen.trim().toLowerCase().startsWith("d") ? "dark" : "lit" });
}
rl.close();

send(brightness(spec, start ?? 217));
await sleep(300);
console.log(`\nRestored brightness to raw ${await storedBrightness()} (was ${start}).`);
console.table(results);
dev.close();
