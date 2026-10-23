import { isMixKey } from "../lib/mixer-sync.ts";
import { adoptSavedMix, mixFromHash, toSavedMix } from "../lib/saved-mix.ts";
import { newestSpec } from "../lib/spec.ts";
import { app, isLive, layout } from "./app-state.ts";
import { loadMix, loadPendingMix, saveMix, savePendingMix } from "./store.ts";
import { toast } from "./toast.ts";
import * as volt from "./volt-connection.ts";

/*
 * This computer's mix: the Volt can't report fader and pan positions, so the page keeps its own
 * copy (per Volt, in storage) and applies it on connecting, like UAD Console. A mix link replaces it.
 */

const saveDelayMs = 250;
let saveTimer = 0;

/** Saves the mix now (on leaving the page, or before giving it up). */
export const saveMixNow = (): void => {
    window.clearTimeout(saveTimer);
    if (app.state.isMixOwned && app.serial) saveMix(app.serial, toSavedMix(app.state));
};

/** Saves the mix shortly, so a drag writes storage a few times a second rather than every frame. */
export const saveMixSoon = (): void => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveMixNow, saveDelayMs);
};

/** Applies the whole page mix to the Volt, like Console does when it starts. */
export const pushMix = (): void => {
    const spec = volt.connectedSpec();
    if (spec && isLive()) volt.send(app.sync.diff(app.state, spec, { isFull: true, filter: isMixKey }));
};

export const takeOwnership = (savedMix: unknown): void => {
    const spec = volt.connectedSpec() ?? newestSpec();
    adoptSavedMix(app.state, savedMix, spec.faderMaxDb);
    saveMixNow();
    pushMix();
    layout();
};

/** This computer's mix (a link opened before the Volt connected, or the saved one), applied to the Volt. */
export const takeSavedMix = (): void => {
    const pendingMix = loadPendingMix();
    const savedMix = pendingMix ?? loadMix(app.serial);
    savePendingMix(null);
    if (pendingMix) toast("Mix applied from the link.");
    if (savedMix) takeOwnership(savedMix);
    else layout();
};

/** Forgets this computer's mix; the Volt keeps playing what it has. */
export const forgetMix = (): void => {
    window.clearTimeout(saveTimer);
    saveMix(app.serial, null);
    app.state.isMixOwned = false;
    layout();
};

/** A mix link (`#m=`, or an older `#mix=`): applied now if the Volt is ready, otherwise kept until it is. */
export const receiveMixLink = (link: string): boolean => {
    const mix = mixFromHash(new URL(link, location.href).hash);
    if (!mix) return (toast("That isn't a Volt Mixer mix link."), false);
    if (volt.connectedSpec() && app.isHardwareKnown && !app.isMixPaused) {
        takeOwnership(mix);
        toast("Mix applied from the link.");
        return true;
    }
    savePendingMix(mix);
    const when = app.isMixPaused ? "the other Volt Mixer closes" : "the Volt connects";
    toast(`Mix received. It will be applied when ${when}.`);
    return true;
};

export const readMixFromAddress = (): void => {
    if (!/^#mix?=/.test(location.hash)) return;
    receiveMixLink(location.href);
    history.replaceState(null, "", location.pathname + location.search);
};
