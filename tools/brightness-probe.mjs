// Finds what makes the Volt's display miss a brightness change. Each case sets the display bright,
// sends a run of F0 21 commands (and state requests, as the page's re-reads do), reads back what
// the Volt stored, and asks you what the display shows. Anything else the Volt sends back during
// a run is printed. Restores the starting brightness at the end, also after an error. Quit Volt
// Mixer and UAD Console.
//   node brightness-probe.mjs
import readline from "readline/promises";
import { setTimeout as sleep } from "timers/promises";
import { brightness, stateRequest } from "../src/lib/commands.ts";
import { parseState } from "../src/lib/reports.ts";
import { closeVolt, isStateReply, onReport, openVolt, requestState, send } from "./lib/volt-hid.mjs";

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

const storedBrightness = async (volt) => parseState(volt.spec, (await requestState(volt)).subarray(1)).brightness;

/** Prints what else the Volt sends during a case (not meters or state replies). */
const logOtherReports = (volt) =>
    onReport(volt, (buffer) => {
        const isMeters = buffer[0] === volt.spec.reports.meters.id;
        if (!isMeters && !isStateReply(volt.spec, buffer))
            console.log(`  Volt sent: ${buffer.subarray(0, 8).toString("hex")}`);
    });

const runCase = async (volt, { steps, gapMs = 16 }) => {
    send(volt, brightness(volt.spec, bright));
    await sleep(1500);
    const stopLogging = logOtherReports(volt);
    for (const step of steps) {
        send(volt, step === "state" ? stateRequest(volt.spec) : brightness(volt.spec, step));
        await sleep(gapMs);
    }
    await sleep(1000);
    stopLogging();
    return storedBrightness(volt);
};

const askCases = async (volt, rl) => {
    const results = [];
    for (const [i, c] of cases.entries()) {
        await rl.question(`Case ${i + 1}/${cases.length} (${c.label}). Press Enter to run it.`);
        const stored = await runCase(volt, c);
        const seen = await rl.question(`  Volt stored raw ${stored}. Is the display now dark (d) or still lit (l)? `);
        results.push({ case: c.label, stored, display: seen.trim().toLowerCase().startsWith("d") ? "dark" : "lit" });
    }
    return results;
};

const main = async () => {
    const volt = await openVolt();
    const start = await storedBrightness(volt);
    console.log(`Starting brightness: raw ${start}. Each case starts bright and should end dark; watch the display.\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        console.table(await askCases(volt, rl));
    } finally {
        rl.close();
        send(volt, brightness(volt.spec, start));
        await sleep(300);
        console.log(`\nRestored brightness to raw ${await storedBrightness(volt)} (was ${start}).`);
        closeVolt(volt);
    }
};

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
