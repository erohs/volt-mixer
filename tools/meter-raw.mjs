// Records raw meter reports (0xF1) for a few seconds and prints one meter's values, to look for spikes.
//   node meter-raw.mjs [offset] [seconds]
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const HID = require("node-hid");
const [offset = "3", seconds = "6"] = process.argv.slice(2);
const info = HID.devices().find((d) => d.vendorId === 0x2b5a && d.usagePage === 0xff01);
const dev = new HID.HID(info.path);
const rows = [];
dev.on("data", (b) => {
    if (b[0] === 0xf1)
        rows.push({ t: Date.now(), head: b.subarray(1, 3).toString("hex"), lo: b[+offset], hi: b[+offset + 1] });
});
setTimeout(() => {
    dev.close();
    const heads = [...new Set(rows.map((r) => r.head))];
    const values = rows.map((r) => r.lo | (r.hi << 8));
    const db = (v) => (v ? (20 * Math.log10(v / 32767)).toFixed(1) : "-inf");
    console.log(`reports ${rows.length}, sub-headers ${heads.join(",")}`);
    const jumps = values.map((v, i) => [i, v, values[i - 1] ?? 0]).filter(([, v, prev]) => v > 4 * Math.max(prev, 16));
    console.log("values (dBFS):", values.slice(0, 120).map(db).join(" "));
    console.log("high bytes seen:", [...new Set(rows.map((r) => r.hi))].join(","));
    console.log(
        "sudden jumps (x4 over previous):",
        jumps
            .slice(0, 15)
            .map(([i, v, p]) => `#${i} ${db(p)}->${db(v)} (raw ${p}->${v}, bytes ${rows[i].lo},${rows[i].hi})`)
            .join("  "),
    );
    process.exit(0);
}, +seconds * 1000);
