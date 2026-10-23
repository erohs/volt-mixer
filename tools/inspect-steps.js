// Print each step's value and its outbound payloads (trimmed at F7), for labels matching a regex.
//   node inspect-steps.js <decoded-dir> <label-regex> [--all-types]
"use strict";
const path = require("path");
const [dir, re] = process.argv.slice(2);
const steps = require(path.resolve(dir, "steps.json"));
const trim = (h) => {
    const i = h.indexOf("f7");
    let j = i;
    while (j >= 0 && j % 2) j = h.indexOf("f7", j + 1);
    return j >= 0 ? h.slice(0, j + 2) : h;
};
for (const s of steps.filter((s) => new RegExp(re).test(s.label || ""))) {
    const out = s.out.map((o) =>
        o.type === "interrupt" ? trim(o.data) : `[${o.type} ${JSON.stringify(o.setup)} ${o.data}]`,
    );
    console.log(`${(s.label || "").padEnd(32)} ${String(JSON.stringify(s.value) ?? "").padEnd(10)} ${out.join(" ")}`);
}
