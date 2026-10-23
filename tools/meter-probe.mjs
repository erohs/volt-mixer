// Records the Volt's meter stream (HID report 0xF1) and reports which payload bytes carry signal.
// Read-only: sends nothing to the Volt.
//   node meter-probe.mjs <label> [seconds]   appends a summary to ../reference/decoded/meters.jsonl
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const HID = require("node-hid");
const here = path.dirname(fileURLToPath(import.meta.url));
const [label = "unlabelled", seconds = "6"] = process.argv.slice(2);

const info = HID.devices().find((d) => d.vendorId === 0x2b5a && d.usagePage === 0xff01);
if (!info) {
    console.error("Volt control interface not found");
    process.exit(1);
}
const dev = new HID.HID(info.path);
const max = [],
    sum = [],
    seen = [];
let n = 0;
dev.on("data", (buf) => {
    if (buf[0] !== 0xf1) return;
    n++;
    for (let i = 0; i < buf.length; i++) {
        max[i] = Math.max(max[i] || 0, buf[i]);
        sum[i] = (sum[i] || 0) + buf[i];
        seen[i] = (seen[i] || 0) + (buf[i] ? 1 : 0);
    }
});
setTimeout(() => {
    dev.close();
    const active = [];
    for (let i = 3; i < max.length - 1; i++)
        if (max[i])
            active.push({ offset: i, max: max[i], avg: +(sum[i] / n).toFixed(1), nonzero: +(seen[i] / n).toFixed(2) });
    const out = { label, at: new Date().toISOString(), reports: n, active };
    fs.appendFileSync(path.resolve(here, "../reference/decoded/meters.jsonl"), JSON.stringify(out) + "\n");
    console.log(`${label}: ${n} reports`);
    for (const a of active) console.log(`  [${a.offset}] max ${a.max} avg ${a.avg} nonzero ${a.nonzero}`);
    if (!active.length) console.log("  (all silent)");
    process.exit(0);
}, +seconds * 1000);
