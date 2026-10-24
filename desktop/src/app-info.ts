import { app } from "electron";
import fs from "fs";
import path from "path";

/*
 * Where Volt Mixer lives online, from package.json's homepage (the website) and repository (on
 * GitHub), which electron-builder reads too.
 */

interface IPackage {
    homepage?: unknown;
    repository?: { url?: unknown };
}

const packageJson = (): IPackage =>
    JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as IPackage;

const httpsUrl = (value: unknown): URL => {
    const url = new URL(typeof value === "string" ? value : "");
    if (url.protocol !== "https:") throw new Error(`package.json: ${url.href} isn't https`);
    return url;
};

const info = packageJson();

/** The website, ending in a slash. */
export const websiteUrl = httpsUrl(info.homepage).href;
/** The repository on GitHub, e.g. https://github.com/naovixen/volt-mixer. */
export const repositoryUrl = httpsUrl(info.repository?.url).href.replace(/\.git$/, "");
/** The repository's "owner/name", for GitHub's API. */
export const repositoryName = new URL(repositoryUrl).pathname.replace(/^\/|\/$/g, "");
