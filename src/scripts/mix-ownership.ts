import { isMixHash, parseMixLink } from "../lib/mix-links.ts";
import { adoptSavedMix, toSavedMix } from "../lib/saved-mix.ts";
import { app, canApplyMix, currentSpec, layout } from "./app-state.ts";
import type { MessageKind } from "./messages.ts";
import { notice } from "./notices.ts";
import { isPendingMixChange, loadMix, loadPendingMix, saveMix, savePendingMix } from "./store.ts";
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
    saveTimer = 0;
    if (app.state.isMixOwned && app.serial && app.hasControl) saveMix(app.serial, toSavedMix(app.state));
};

/**
 * Saves the mix within a moment, so a drag writes storage a few times a second rather than every
 * frame, and the saved copy is never more than that moment behind, even mid-drag.
 */
export const saveMixSoon = (): void => {
    saveTimer ||= window.setTimeout(saveMixNow, saveDelayMs);
};

/**
 * Gives up the mix (disconnecting, pausing for another Volt Mixer, a new connection). The latest
 * changes are saved first: a save still waiting would be lost, and the older, louder mix would
 * come back when the mix is taken again.
 */
export const releaseMix = (): void => {
    saveMixNow();
    app.state.isMixOwned = false;
};

/** Applies the whole page mix to the Volt, like Console does when it starts. */
export const pushMix = (): void => {
    const spec = volt.connectedSpec();
    if (spec && canApplyMix()) volt.send(app.sync.diff(app.state, spec, { isFull: true, kind: "mix" }));
};

/**
 * Makes a mix this computer's own and puts it on the Volt. While the mix is held back for another
 * Volt Mixer it's kept for later instead (mix-pause.ts takes it), so owning the mix always means
 * nothing holds it back, and nothing the page sends can fight the other one.
 */
export const takeOwnership = (savedMix: unknown): void => {
    if (app.mixHold) return void savePendingMix(savedMix);
    adoptSavedMix(app.state, savedMix, currentSpec().faderMaxDb);
    saveMixNow();
    pushMix();
    layout();
};

/**
 * This computer's mix (a link opened before the Volt connected, or the saved one), applied to the
 * Volt. Only by the tab in control: another would use up a kept link it can't send.
 */
export const takeSavedMix = (): void => {
    if (!app.hasControl) return layout();
    const pendingMix = loadPendingMix();
    const savedMix = pendingMix ?? loadMix(app.serial);
    savePendingMix(null);
    if (pendingMix) notice("Mix applied from the link.", { kind: "success" });
    if (savedMix) takeOwnership(savedMix);
    else layout();
};

/** Forgets this computer's mix; the Volt keeps playing what it has. */
export const forgetMix = (): void => {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    saveMix(app.serial, null);
    app.state.isMixOwned = false;
    layout();
};

/** What became of a mix link, to show where it was given (a paste box, or the notice bar). */
export interface ILinkOutcome {
    kind: MessageKind;
    text: string;
}

/** Takes a mix link in; the controller picks one for the page's mode (this, or carryMixLink). */
export type LinkReceiver = (link: string) => ILinkOutcome;

export const notMixLink: ILinkOutcome = { kind: "error", text: "That isn't a Volt Mixer mix link." };

/** Where a kept link goes next. */
const pendingWhen = (): string => {
    if (!app.hasControl) return "Mix sent to the Volt Mixer tab that's in use.";
    if (app.mixHold === "other") return "Mix received. It will be applied when the other Volt Mixer closes.";
    return volt.connectedSpec()
        ? "Mix received. It will be applied in a moment."
        : "Mix received. It will be applied when the Volt connects.";
};

/**
 * A mix link (`#m=`, or an older `#mix=`): applied now if this tab can put it on the Volt,
 * otherwise kept, for when it can or for the tab that drives it (takeLinksFromOtherTabs).
 */
export const receiveMixLink: LinkReceiver = (link) => {
    const mix = parseMixLink(link, location.href);
    if (!mix) return notMixLink;
    if (canApplyMix()) {
        takeOwnership(mix);
        return { kind: "success", text: "Mix applied from the link." };
    }
    savePendingMix(mix);
    return { kind: "info", text: pendingWhen() };
};

/**
 * A link opened in another tab, while this one drives the Volt: that tab keeps it for when the
 * Volt connects (receiveMixLink), and this one, already connected, takes it now.
 */
export const takeLinksFromOtherTabs = (): void =>
    window.addEventListener("storage", (event) => {
        if (isPendingMixChange(event) && canApplyMix()) takeSavedMix();
    });

/** A mix link the page was opened with (or navigated to), handed to `receive` and taken out of the address. */
export const readMixFromAddress = (receive: LinkReceiver): void => {
    if (!isMixHash(location.hash)) return;
    const { kind, text } = receive(location.href);
    notice(text, { kind });
    history.replaceState(null, "", location.pathname + location.search);
};
