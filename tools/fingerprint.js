// Records everything that can change under us when UA ships an update, and diffs it against
// the previous fingerprint. Run after any UA Connect / Console / driver / firmware update.
//
//   node fingerprint.js            write reference/fingerprints/<date>.json and print changes
//   node fingerprint.js --check    print changes only (exit 1 if anything changed)
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ua = require("./lib/ua-api");

const DIR = path.resolve(__dirname, "..", "reference", "fingerprints");
const CHECK = process.argv.includes("--check");

const ps = (cmd) => execFileSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" }).trim();

function installedApps() {
    const json =
        ps(`Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' |
    Where-Object { $_.Publisher -match 'Universal Audio' -or $_.DisplayName -match 'UA Connect|UAD Console|Volt' } |
    Select-Object DisplayName,DisplayVersion | ConvertTo-Json`);
    const list = json ? [].concat(JSON.parse(json)) : [];
    return Object.fromEntries(list.map((a) => [a.DisplayName, a.DisplayVersion]));
}

function fileVersions() {
    const files = [
        "C:\\Program Files (x86)\\Universal Audio\\UAD Console\\UAD Console.exe",
        "C:\\Program Files (x86)\\Universal Audio\\UAD Console\\UAMixerHelper.exe",
        "C:\\Program Files\\Universal Audio\\Volt Driver\\x64\\UniversalAudioUsbAudio.sys",
    ];
    const out = {};
    for (const f of files) {
        if (!fs.existsSync(f)) {
            out[path.basename(f)] = null;
            continue;
        }
        out[path.basename(f)] = ps(`(Get-Item '${f}').VersionInfo.FileVersion`) || "unknown";
    }
    return out;
}

const hidCaps = () =>
    JSON.parse(ps(`& '${path.join(__dirname, "hid-caps.ps1")}'`) || "[]").map(({ instanceId, ...caps }) => caps); // instance IDs change per port; not a meaningful diff

async function apiInfo() {
    try {
        const c = await ua.connect();
        const dev = await ua.findVolt(c);
        const buses = Object.keys(await ua.buses(c, dev)).sort();
        const root = (await c.get("/"))?.properties || {};
        c.close();
        return { firmware: dev.firmware, deviceType: dev.type, pluginSdk: root.plugin_sdk_version?.value, buses };
    } catch (e) {
        return { error: String(e.message || e) };
    }
}

function diff(a, b, prefix = "") {
    const changes = [];
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
        const x = a?.[k],
            y = b?.[k],
            p = prefix + k;
        if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x))
            changes.push(...diff(x, y, p + "."));
        else if (JSON.stringify(x) !== JSON.stringify(y))
            changes.push(`${p}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
    }
    return changes;
}

(async () => {
    const now = { apps: installedApps(), files: fileVersions(), hid: hidCaps(), api: await apiInfo() };
    fs.mkdirSync(DIR, { recursive: true });
    const previous = fs
        .readdirSync(DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .pop();
    const prev = previous ? JSON.parse(fs.readFileSync(path.join(DIR, previous), "utf8")) : null;
    const changes = prev ? diff(prev.snapshot, now) : ["(no previous fingerprint)"];

    console.log(
        changes.length
            ? `Changes since ${previous || "nothing"}:\n  ` + changes.join("\n  ")
            : `No changes since ${previous}.`,
    );
    if (CHECK) process.exit(changes.length && prev ? 1 : 0);
    if (!prev || changes.length) {
        const file = path.join(
            DIR,
            new Date().toISOString().slice(0, 10) + (now.api.firmware ? `-fw${now.api.firmware}` : "") + ".json",
        );
        fs.writeFileSync(file, JSON.stringify({ taken: new Date().toISOString(), snapshot: now }, null, 1));
        console.log("wrote", path.relative(process.cwd(), file));
    }
})();
