// Builds the Astro site at the repository root into desktop/site, served from the root of the
// app's own app://volt scheme (so BASE_PATH is "/").
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const desktop = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(desktop, "..");
// Astro's own CLI through Node, so no shell is involved on any system.
execFileSync(
    process.execPath,
    [path.join(root, "node_modules", "astro", "bin", "astro.mjs"), "build", "--outDir", path.join(desktop, "site")],
    {
        cwd: root,
        stdio: "inherit",
        // The real site as the canonical address; the app itself is served from app://volt/.
        env: { ...process.env, BASE_PATH: "/", SITE_ORIGIN: "https://naovixen.github.io" },
    },
);
// The app opens the guide on the website (desktop/src/windows.ts), so it doesn't carry a copy:
// not its pages, nor their stylesheets and script (GuideLayout.astro).
const site = path.join(desktop, "site");
fs.rmSync(path.join(site, "guide"), { recursive: true, force: true });
for (const file of fs.readdirSync(path.join(site, "_astro"))) {
    if (/^(guide|GuideLayout)/.test(file)) fs.rmSync(path.join(site, "_astro", file));
}
