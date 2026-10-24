import { defaultState } from "../lib/mixer.ts";
import { toSavedMix } from "../lib/saved-mix.ts";
import { stripGroups } from "../lib/strip-groups.ts";
import { trayRows } from "../lib/tray-rows.ts";
import { outputActions, refreshOutputs, wireMixerControls } from "./actions.ts";
import { app, currentSpec, hooks, isLive, setStatus } from "./app-state.ts";
import { carryMixLink, startCarryPanel } from "./carry-mix.ts";
import { followLayout, refreshChannelDialog, wireChannelDialog } from "./channel-dialog.ts";
import { connectionActions, wireConnectionView } from "./connection-view.ts";
import { holdControlLock } from "./control-lock.ts";
import { showHiddenSolos } from "./hidden-solo.ts";
import { initDialogs } from "./dialogs.ts";
import { reportVoltLive, wireDisplayFade } from "./display-fade.ts";
import { mixLink } from "./mix-link.ts";
import { wireMixPasteForms } from "./mix-link-form.ts";
import {
    forgetMix,
    pushMix,
    readMixFromAddress,
    receiveMixLink,
    saveMixNow,
    takeLinksFromOtherTabs,
    takeOwnership,
    takeSavedMix,
    type LinkReceiver,
} from "./mix-ownership.ts";
import { wireMixPause } from "./mix-pause.ts";
import { publish, wireRemote, type ITraySnapshot } from "./remote.ts";
import { runIntent } from "./run-intent.ts";
import { refreshSettings, settingsActions, wireSettingsDialog } from "./settings-dialog.ts";
import { resetMeters } from "./meters-view.ts";
import { isPageShown, onPageShown, wirePageVisibility } from "./page-visibility.ts";
import { initSliders } from "./slider.ts";
import { clearRetiredSettings } from "./store.ts";
import { refreshStrips, renderStrips } from "./strips.ts";
import { applyTheme } from "./theme.ts";
import * as volt from "./volt-connection.ts";
import { identifyVolt, rereadVolt, sendSoon, wireSession } from "./volt-session.ts";

/*
 * The mixer page: picks its mode (drive a Volt over WebHID, or carry a mix to a computer that can),
 * starts what that mode needs, and keeps the views in step with the state.
 */

const element = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

/**
 * A control that just became disabled loses focus. It goes to the open dialog's Close button, or
 * to Connect, or to the start of the page.
 */
const keepFocus = (focused: Element | null): void => {
    if (focused === document.body || document.activeElement !== document.body) return;
    const connect = element<HTMLButtonElement>("[data-action='connect']");
    const fallback = connect.hidden || connect.disabled ? element("#main") : connect;
    (document.querySelector<HTMLElement>("dialog[open] .head button") ?? fallback).focus();
};

/** Set while the page is unseen and the strips need rebuilding; they're rebuilt when it's shown. */
let isLayoutStale = false;

/**
 * Brings the views up to date. The tray, phones and the desktop app are told every time; the page's
 * own views only while someone can see them (they catch up on being shown, onShown).
 */
const refresh = (): void => {
    publish();
    reportVoltLive();
    if (!isPageShown()) return;
    const focused = document.activeElement;
    const live = isLive();
    refreshStrips(app.state, app.view, live);
    refreshOutputs(live);
    refreshChannelDialog(live);
    refreshSettings(live);
    const isMixMissing = app.isHardwareKnown && !app.state.isMixOwned && app.mixHold === null;
    element("[data-mix-setup]").hidden = !(volt.connectedSpec() && isMixMissing);
    element<HTMLButtonElement>("[data-action='push-mix']").disabled = !live || !app.state.isMixOwned;
    keepFocus(focused);
    showHiddenSolos();
};

const meterNames = (): Set<string> => new Set(Object.keys(currentSpec().reports.meters.offsets));

const relayout = (): void => {
    isLayoutStale = !isPageShown();
    if (!isLayoutStale) {
        renderStrips(stripGroups(app.state, app.view), meterNames());
        followLayout();
    }
    refresh();
};

/** Shown again: the views catch up, and the meters start from empty rather than old peaks. */
const onShown = (): void => {
    resetMeters();
    if (isLayoutStale) relayout();
    else refresh();
};

/** What a tray window or a phone shows: the rows the viewer chose, and whether it can change anything. */
const traySnapshot = (isForPhone: boolean): ITraySnapshot => ({
    rows: trayRows(app.state, app.view, app.view.trayHidden),
    maxDb: currentSpec().faderMaxDb,
    isLive: isLive(),
    isMixOwned: app.state.isMixOwned,
    status: element("[data-status]").textContent?.trim() ?? "",
    statusKind: element("[data-status]").dataset["status"] ?? "off",
    mixLink: isForPhone && app.state.isMixOwned ? mixLink() : null,
});

const confirmThen = (question: string, run: () => void): void => {
    if (window.confirm(question)) run();
};

const pageActions: Record<string, () => void> = {
    ...connectionActions,
    ...outputActions,
    ...settingsActions,
    identify: identifyVolt,
    "mix-defaults": () =>
        confirmThen("Set every channel to 0 dB, like a new UAD Console session?", () =>
            takeOwnership(toSavedMix(defaultState())),
        ),
    "push-mix": () => confirmThen("Apply this computer's mix to the Volt?", pushMix),
    "forget-mix": () => confirmThen("Forget this computer's mix? The Volt keeps playing what it has.", forgetMix),
};

/** Mix links, from the address (also when it changes) or a paste box, go to `receive`. */
const wireLinkIntake = (receive: LinkReceiver): void => {
    wireMixPasteForms(receive);
    window.addEventListener("hashchange", () => readMixFromAddress(receive));
};

/** The views every mode has; they show the state, read-only until a Volt can be changed. */
const wireViews = (): void => {
    Object.assign(hooks, { sendSoon, layout: relayout, refresh });
    wirePageVisibility();
    onPageShown(onShown);
    clearRetiredSettings();
    applyTheme(app.view.theme);
    initSliders(document);
    initDialogs();
    wireMixerControls();
    wireChannelDialog();
    wireSettingsDialog();
    document.addEventListener("click", (event) => {
        const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset["action"] ?? "";
        pageActions[action]?.();
    });
    relayout();
};

/** A browser without WebHID (a phone, Firefox, Safari): it says why, and carries mix links. */
const startCarrying = (): void => {
    element<HTMLButtonElement>("[data-action='connect']").disabled = true;
    startCarryPanel();
    wireLinkIntake(carryMixLink);
    readMixFromAddress(carryMixLink);
};

/** The tray window and phones (desktop app only) send intents; only a page that can drive the Volt applies them. */
const answerOthers = (): void =>
    wireRemote({
        isActive: () => app.hasControl,
        snapshot: traySnapshot,
        run: (intent) => (isLive() ? runIntent(intent) : "ignored"),
        onViewOpened: rereadVolt,
    });

/** A browser with WebHID drives the Volt, once this tab has control. */
const startDriving = (): void => {
    wireMixPause(takeSavedMix);
    wireLinkIntake(receiveMixLink);
    takeLinksFromOtherTabs();
    window.addEventListener("pagehide", saveMixNow);
    // A link the page opened with is applied, kept, or sent to the tab in use: known once the lock is.
    void holdControlLock().then(() => readMixFromAddress(receiveMixLink));
    answerOthers();
    wireDisplayFade();
    wireConnectionView();
    wireSession();
    volt.watchDevices();
    void volt.reconnect().then((isConnected) => isConnected || setStatus("Not connected", "off"));
};

export const start = (): void => {
    wireViews();
    if (volt.isWebHidSupported()) startDriving();
    else startCarrying();
};
