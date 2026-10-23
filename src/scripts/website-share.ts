import { desktopApp } from "./desktop.ts";
import { acceptNewerMix } from "./shared-mix.ts";
import { loadMixEntry } from "./store.ts";

/**
 * Desktop app only: answers the website on this computer, which main passes on from
 * desktop/src/mix-share.ts. "get" returns this copy of a Volt's mix; "offer" takes the website's
 * if it's newer.
 */
export const answerWebsite = (): void =>
    desktopApp()?.onMixRequest((request) => {
        const { kind, serial, mix, changedAt } = (request ?? {}) as Record<string, unknown>;
        if (typeof serial !== "string") return null;
        if (kind === "get") return loadMixEntry(serial);
        if (kind === "offer" && typeof changedAt === "number")
            return { accepted: acceptNewerMix(serial, mix, changedAt) };
        return null;
    });
