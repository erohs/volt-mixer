import { isMixKey } from "../lib/mixer-sync.ts";
import { adoptSavedMix, isMixHash, mixFromHash, toSavedMix } from "../lib/saved-mix.ts";
import { newestSpec } from "../lib/spec.ts";
import { app, isLive, layout } from "./app-state.ts";
import { isPendingMixChange, loadMix, loadPendingMix, saveMix, savePendingMix } from "./store.ts";
import { toast } from "./toast.ts";
import * as volt from "./volt-connection.ts";

/*
 * This computer's mix: the Volt can't report fader and pan positions, so the page keeps its own
 * copy (per Volt, in storage) and applies it on connecting, like UAD Console. A mix link replaces it.
 */

const saveDelayMs = 250;
let saveTimer = 0;

/**
 * Saves the mix now (on leaving the page, or before giving it up). Only the tab that drives the
 * Volt saves: a read-only second tab's copy may be older, and would overwrite a newer one.
 */
export const saveMixNow = (): void => {
    window.clearTimeout(saveTimer);
    if (app.state.isMixOwned && app.serial && app.hasControl) saveMix(app.serial, toSavedMix(app.state));
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

/** Where a kept link goes next, as the toast says it. */
const pendingWhen = (): string => {
    if (!app.hasControl) return "Mix sent to the Volt Mixer tab that's in use.";
    const when = app.isMixPaused ? "the other Volt Mixer closes" : "the Volt connects";
    return `Mix received. It will be applied when ${when}.`;
};

/**
 * A mix link (`#m=`, or an older `#mix=`): applied now if this tab drives a connected Volt,
 * otherwise kept, for when it connects or for the tab that drives it (takeLinksFromOtherTabs).
 */
export const receiveMixLink = (link: string): boolean => {
    const mix = mixFromHash(new URL(link, location.href).hash);
    if (!mix) return (toast("That isn't a Volt Mixer mix link."), false);
    if (volt.connectedSpec() && app.isHardwareKnown && app.hasControl && !app.isMixPaused) {
        takeOwnership(mix);
        toast("Mix applied from the link.");
        return true;
    }
    savePendingMix(mix);
    toast(pendingWhen());
    return true;
};

/**
 * A link opened in another tab, while this one drives the Volt: that tab keeps it for when the
 * Volt connects (receiveMixLink), and this one, already connected, takes it now.
 */
export const takeLinksFromOtherTabs = (): void =>
    window.addEventListener("storage", (event) => {
        if (!isPendingMixChange(event) || !app.hasControl) return;
        if (volt.connectedSpec() && app.isHardwareKnown && !app.isMixPaused) takeSavedMix();
    });

export const readMixFromAddress = (): void => {
    if (!isMixHash(location.hash)) return;
    receiveMixLink(location.href);
    history.replaceState(null, "", location.pathname + location.search);
};
