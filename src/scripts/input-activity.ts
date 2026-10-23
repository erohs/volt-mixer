/*
 * Whether anything is coming in on each analog input, judged from its meter: the Volt can't say
 * whether a jack is plugged in. An empty input reads digital silence; a connected mic at least
 * its noise. The MIC/LINE tag greys out after a few seconds with nothing.
 */

const heardDb = -90;
const quietMs = 3000;
const lastHeard = new Map<string, number>();

/** Called with each meter report's levels (dBFS by meter name). */
export const noteInputLevels = (levels: Record<string, number>): void => {
    const now = performance.now();
    for (const [name, db] of Object.entries(levels)) if (db > heardDb) lastHeard.set(name, now);
};

const isHearing = (ids: string[]): boolean =>
    ids.some((id) => performance.now() - (lastHeard.get(id) ?? -Infinity) < quietMs);

const updateTags = (): void => {
    for (const tag of document.querySelectorAll<HTMLElement>("[data-strip-input]")) {
        const ids = (tag.closest<HTMLElement>("[data-strip]")?.dataset["ids"] ?? "").split(",");
        const isIdle = String(!isHearing(ids));
        if (tag.dataset["idle"] !== isIdle) tag.dataset["idle"] = isIdle;
    }
};

/** Keeps the tags current, twice a second. */
export const watchInputs = (): void => void window.setInterval(updateTags, 500);
