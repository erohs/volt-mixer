import { app, net } from "electron";

/*
 * Checks GitHub Releases for a newer version. Builds are unsigned, so there's no automatic
 * install: the page shows a notice with a link to the release.
 */

const latestRelease = "https://api.github.com/repos/erohs/volt-mixer/releases/latest";

export interface IUpdate {
    isNewer: boolean;
    version: string;
    url: string;
}

const parts = (version: string): number[] =>
    version
        .replace(/^v/, "")
        .split(".")
        .map((part) => Number.parseInt(part, 10) || 0);

const isNewer = (candidate: string, current: string): boolean => {
    const [a, b] = [parts(candidate), parts(current)];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
    }
    return false;
};

/** The latest release, or null when GitHub can't be reached. */
export const checkForUpdate = async (): Promise<IUpdate | null> => {
    try {
        const response = await net.fetch(latestRelease, { headers: { Accept: "application/vnd.github+json" } });
        if (!response.ok) return null;
        const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
        const version = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/, "") : "";
        const url =
            typeof release.html_url === "string" && release.html_url.startsWith("https://github.com/")
                ? release.html_url
                : "";
        return version && url ? { isNewer: isNewer(version, app.getVersion()), version, url } : null;
    } catch {
        return null;
    }
};
