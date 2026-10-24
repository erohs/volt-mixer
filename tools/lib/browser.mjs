// The installed Edge or Chrome, for the tools that render images headless; CHROME_PATH picks another.
import fs from "fs";

const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
];

export const findBrowser = () => {
    const browser = [process.env.CHROME_PATH, ...candidates].find((candidate) => candidate && fs.existsSync(candidate));
    if (!browser) {
        console.error("No Edge or Chrome found. Set CHROME_PATH.");
        process.exit(1);
    }
    return browser;
};
