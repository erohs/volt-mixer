// Renders the link-preview card and the PNG icons into public/, and the desktop app's icons into
// desktop/build/, with the installed Edge or Chrome (headless), so no image tooling is needed.
// Re-run after changing og-card.html or icon.svg.
//   node make-images.mjs            CHROME_PATH=<browser> to pick the browser
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const card = pathToFileURL(path.join(here, "og-card.html")).href;

const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
];
const browser = candidates.find((candidate) => candidate && fs.existsSync(candidate));
if (!browser) {
    console.error("No Edge or Chrome found. Set CHROME_PATH.");
    process.exit(1);
}

const shoot = (file, width, height, query = "", dir = publicDir) => {
    const out = path.join(dir, file);
    execFileSync(browser, [
        "--headless",
        "--default-background-color=00000000",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--allow-file-access-from-files",
        `--window-size=${width},${height}`,
        `--screenshot=${out}`,
        card + query,
    ]);
    console.log(`${file} ${width}×${height}`);
};

shoot("og-image.png", 1200, 630);
for (const [file, size] of [
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
]) {
    shoot(file, size, size, `?icon=${size}`);
}

// The desktop app: installer icon, the tray icon (Windows, Linux) and the macOS menu bar glyph.
const desktopBuild = path.join(here, "..", "desktop", "build");
fs.mkdirSync(desktopBuild, { recursive: true });
shoot("icon.png", 512, 512, "?icon=512", desktopBuild);
shoot("tray.png", 32, 32, "?icon=32", desktopBuild);
shoot("trayTemplate.png", 16, 16, "?glyph=16", desktopBuild);
shoot("trayTemplate@2x.png", 32, 32, "?glyph=32", desktopBuild);
