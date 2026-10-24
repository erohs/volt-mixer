// Records the Volt's meter stream for a few seconds. Read-only: sends nothing to the Volt.
//   node meter-probe.mjs <label> [seconds]         which payload bytes carry signal; appends a
//                                                  summary to ../reference/decoded/meters.jsonl
//   node meter-probe.mjs --raw [offset] [seconds]  one meter's values (u16 LE at offset, default 3):
//                                                  dBFS, high bytes seen and sudden jumps
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { closeVolt, onReport, openVolt } from "./lib/volt-hid.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const metersFile = path.resolve(here, "../reference/decoded/meters.jsonl");

const record = (volt, seconds) =>
    new Promise((resolve) => {
        const reports = [];
        const stop = onReport(volt, (buffer) => {
            if (buffer[0] === volt.spec.reports.meters.id) reports.push(Buffer.from(buffer));
        });
        setTimeout(() => {
            stop();
            resolve(reports);
        }, seconds * 1000);
    });

const activeBytes = (reports) => {
    const length = Math.max(0, ...reports.map((report) => report.length));
    const active = [];
    for (let offset = 3; offset < length - 1; offset += 1) {
        const values = reports.map((report) => report[offset] ?? 0);
        const max = Math.max(...values);
        if (!max) continue;
        const average = values.reduce((sum, value) => sum + value, 0) / reports.length;
        const nonzero = values.filter(Boolean).length / reports.length;
        active.push({ offset, max, avg: +average.toFixed(1), nonzero: +nonzero.toFixed(2) });
    }
    return active;
};

const summarise = (label, reports) => {
    const active = activeBytes(reports);
    const summary = { label, at: new Date().toISOString(), reports: reports.length, active };
    fs.appendFileSync(metersFile, JSON.stringify(summary) + "\n");
    console.log(`${label}: ${reports.length} reports`);
    for (const a of active) console.log(`  [${a.offset}] max ${a.max} avg ${a.avg} nonzero ${a.nonzero}`);
    if (!active.length) console.log("  (all silent)");
};

const printRaw = (volt, offset, reports) => {
    const rows = reports.map((r) => ({ head: r.subarray(1, 3).toString("hex"), lo: r[offset], hi: r[offset + 1] }));
    const values = rows.map((row) => row.lo | (row.hi << 8));
    const db = (v) => (v ? (20 * Math.log10(v / volt.spec.reports.meters.fullScale)).toFixed(1) : "-inf");
    const jumps = values
        .map((value, i) => [i, value, values[i - 1] ?? 0])
        .filter(([, value, previous]) => value > 4 * Math.max(previous, 16));
    const describeJump = ([i, value, previous]) =>
        `#${i} ${db(previous)}->${db(value)} (raw ${previous}->${value}, bytes ${rows[i].lo},${rows[i].hi})`;
    console.log(`reports ${rows.length}, sub-headers ${[...new Set(rows.map((row) => row.head))].join(",")}`);
    console.log("values (dBFS):", values.slice(0, 120).map(db).join(" "));
    console.log("high bytes seen:", [...new Set(rows.map((row) => row.hi))].join(","));
    console.log("sudden jumps (x4 over previous):", jumps.slice(0, 15).map(describeJump).join("  "));
};

const main = async () => {
    const args = process.argv.slice(2);
    const isRaw = args[0] === "--raw";
    const [first = isRaw ? "3" : "unlabelled", seconds = "6"] = isRaw ? args.slice(1) : args;
    const volt = await openVolt({ isIdentified: false });
    try {
        const reports = await record(volt, +seconds);
        if (isRaw) printRaw(volt, +first, reports);
        else summarise(first, reports);
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
