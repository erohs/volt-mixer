// Builds the Astro site at the repository root into desktop/site, served from the root of the
// app's own app://volt scheme (so BASE_PATH is "/").
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const desktop = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(desktop, "..");
execFileSync("pnpm", ["exec", "astro", "build", "--outDir", path.join(desktop, "site")], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    // The real site as the canonical address; the app itself is served from app://volt/.
    env: { ...process.env, BASE_PATH: "/", SITE_ORIGIN: "https://erohs.github.io" },
});
