import { defaultState } from "../lib/mixer.ts";
import { toSavedMix } from "../lib/saved-mix.ts";
import { newestSpec } from "../lib/spec.ts";
import { stripGroups } from "../lib/strip-groups.ts";
import { trayRows } from "../lib/tray-rows.ts";
import { refreshOutputs, wireMixerControls } from "./actions.ts";
import { app, hooks, isLive, notice, setStatus } from "./app-state.ts";
import { refreshChannelDialog, wireChannelDialog } from "./channel-dialog.ts";
import { holdControlLock } from "./control-lock.ts";
import { initDialogs } from "./dialogs.ts";
import { resetMeters } from "./meters-view.ts";
import {
    forgetMix,
    pushMix,
    readMixFromAddress,
    receiveMixLink,
    saveMixNow,
    takeOwnership,
    takeLinksFromOtherTabs,
    takeSavedMix,
} from "./mix-ownership.ts";
import { restartMixPause, wireMixPause } from "./mix-pause.ts";
import { publish, wireRemote, type ITraySnapshot } from "./remote.ts";
import { runIntent } from "./run-intent.ts";
import { refreshSettings, settingsActions, wireSettingsDialog } from "./settings-dialog.ts";
import { initSliders } from "./slider.ts";
import { clearRetiredSettings, loadTheme, loadTrayHidden } from "./store.ts";
import { refreshStrips, renderStrips } from "./strips.ts";
import { applyTheme } from "./theme.ts";
import { clearFeedback, flashButton, setInvalid } from "./button-feedback.ts";
import { wireDisplayFade } from "./display-fade.ts";
import { clearMessage, showMessage } from "./messages.ts";
import * as volt from "./volt-connection.ts";
import type { IConnectionInfo } from "./volt-connection.ts";
import { commit, identifyVolt, rereadVolt, startAutoGain, startSession, wireSession } from "./volt-session.ts";

/* The mixer page: starts everything, keeps the views in step with the state, and its own buttons. */

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

const refresh = (): void => {
    const focused = document.activeElement;
    const live = isLive();
    refreshStrips(app.state, live);
    refreshOutputs(live);
    refreshChannelDialog(live);
    refreshSettings(live);
    const isMixMissing = app.isHardwareKnown && !app.state.isMixOwned && !app.isMixPaused;
    element("[data-mix-setup]").hidden = !(volt.connectedSpec() && isMixMissing);
    element<HTMLButtonElement>("[data-action='push-mix']").disabled = !live || !app.state.isMixOwned;
    keepFocus(focused);
    publish();
};

const meterNames = (): Set<string> => new Set(Object.keys(newestSpec().reports.meters.offsets));

const relayout = (): void => {
    renderStrips(stripGroups(app.state, app.view), meterNames());
    refresh();
};

/** What a tray window shows: the rows the viewer chose, and whether it can change anything. */
const traySnapshot = (): ITraySnapshot => ({
    rows: trayRows(app.state, app.view, loadTrayHidden()),
    maxDb: (volt.connectedSpec() ?? newestSpec()).faderMaxDb,
    isLive: isLive(),
    isMixOwned: app.state.isMixOwned,
    status: element("[data-status]").textContent?.trim() ?? "",
    statusKind: element("[data-status]").dataset["status"] ?? "off",
});

/** Firmware this page hasn't been checked against: shown, but changed only once the user says so. */
const warnUncheckedFirmware = (info: IConnectionInfo): void => {
    const unknown = info.isIdentified
        ? `firmware ${info.version}, which this page hasn't been checked against`
        : "unknown firmware";
    const run = (): void => {
        app.isSendAllowed = true;
        notice("");
        if (app.state.isMixOwned) pushMix();
        refresh();
    };
    notice(`This Volt has ${unknown}, so the page shows its settings but won't change anything.`, {
        action: { label: "Use anyway", run },
    });
};

const showConnection = (isConnected: boolean): void => {
    element("[data-action='connect']").hidden = isConnected;
    element("[data-action='disconnect']").hidden = !isConnected;
};

const onConnected = (info: IConnectionInfo): void => {
    Object.assign(app, { serial: info.serial, isHardwareKnown: false, isSendAllowed: info.isExact });
    app.state.isMixOwned = false;
    startSession();
    restartMixPause(true);
    setStatus(info.isIdentified ? `Connected · firmware ${info.version}` : "Connected · firmware unknown", "on");
    showConnection(true);
    element("[data-device-info]").textContent = info.isIdentified
        ? `Firmware ${info.version}, serial ${info.serial}. Checked against firmware ${info.specVersion}${info.isExact ? "" : " (closest match)"}.`
        : "The Volt didn't identify itself.";
    if (!info.isExact) warnUncheckedFirmware(info);
    window.setTimeout(() => {
        if (volt.connectedSpec() && !app.isHardwareKnown)
            notice("Connected, but the Volt didn't send its settings. Unplug it and plug it back in.", {
                kind: "error",
            });
    }, 2500);
};

const onDisconnected = ({ isByUser }: { isByUser: boolean }): void => {
    saveMixNow();
    app.isHardwareKnown = false;
    app.state.isMixOwned = false;
    restartMixPause(false);
    if (isByUser) setStatus("Disconnected", "off");
    else setStatus("Volt not connected · on the other computer?", "away");
    showConnection(false);
    resetMeters();
    refresh();
};

const confirmThen = (question: string, run: () => void): void => {
    if (window.confirm(question)) run();
};

const pageActions: Record<string, () => void> = {
    connect: () =>
        void volt
            .pair()
            .then(
                (result) =>
                    result === "cancelled" &&
                    notice('No Volt was chosen. Click Connect Volt and pick "Volt 4 Gen 2".', { kind: "info" }),
            ),
    disconnect: () => void volt.disconnect(),
    identify: identifyVolt,
    "mix-defaults": () =>
        confirmThen("Set every channel to 0 dB, like a new UAD Console session?", () =>
            takeOwnership(toSavedMix(defaultState())),
        ),
    "push-mix": () => confirmThen("Apply this computer's mix to the Volt?", pushMix),
    "forget-mix": () => confirmThen("Forget this computer's mix? The Volt keeps playing what it has.", forgetMix),
    ...settingsActions,
};

/**
 * A link pasted into Settings or the setup panel. Applied or refused, the Use button answers with
 * a tick or a cross (a refused link turns the box red until it's edited); kept for later, it says
 * so under the box. Replacing a mix this computer has asks first.
 */
const usePastedLink = (form: HTMLFormElement): void => {
    const input = form.querySelector<HTMLInputElement>("[data-mix-link-input]")!;
    const question = "Replace this computer's mix with the one in the link?";
    if (app.state.isMixOwned && !window.confirm(question)) return;
    const { kind, text } = receiveMixLink(input.value);
    const isError = kind === "error";
    setInvalid(input, isError);
    if (!isError) input.value = "";
    const button = form.querySelector<HTMLElement>(".button--feedback");
    if (kind === "info") clearFeedback(button);
    else flashButton(button, isError ? "error" : "success");
    showMessage(form.querySelector<HTMLElement>("[data-message]"), kind, text, { isQuiet: kind !== "info" });
};

/** Editing a refused link takes the red off, and what was said about it. */
const onPasteEdited = (form: HTMLFormElement): void => {
    setInvalid(form.querySelector<HTMLInputElement>("[data-mix-link-input]")!, false);
    const message = form.querySelector<HTMLElement>("[data-message]");
    if (message) clearMessage(message);
};

const wirePage = (): void => {
    document.addEventListener("click", (event) => {
        const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset["action"] ?? "";
        pageActions[action]?.();
    });
    for (const form of document.querySelectorAll<HTMLFormElement>("[data-mix-paste]"))
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            usePastedLink(form);
        });
    for (const form of document.querySelectorAll<HTMLFormElement>("[data-mix-paste]"))
        form.addEventListener("input", () => onPasteEdited(form));
    window.addEventListener("hashchange", readMixFromAddress);
    takeLinksFromOtherTabs();
    window.addEventListener("pagehide", saveMixNow);
};

const wireConnection = (): void => {
    const on = <T>(type: string, handler: (detail: T) => void): void =>
        volt.connectionEvents.addEventListener(type, (event) => handler((event as CustomEvent<T>).detail));
    on("connected", onConnected);
    on("disconnected", onDisconnected);
    on<{ message: string }>("error", ({ message }) => notice(message, { kind: "error" }));
    wireSession();
};

/** The desktop app's tray window sends intents here; only a page that can drive the Volt applies them. */
const answerOthers = (): void => {
    wireRemote({
        isActive: () => app.hasControl,
        snapshot: traySnapshot,
        run: (intent) => (isLive() ? runIntent(intent) : "ignored"),
        onViewOpened: rereadVolt,
    });
};

const wireViews = (): void => {
    Object.assign(hooks, { commit, layout: relayout, refresh, autoGain: startAutoGain });
    wireMixPause(takeSavedMix);
    clearRetiredSettings();
    applyTheme(loadTheme());
    initSliders(document);
    initDialogs();
    wireMixerControls();
    wireChannelDialog();
    wireSettingsDialog();
    wirePage();
    relayout();
};

export const start = (): void => {
    wireViews();
    if (!volt.isWebHidSupported()) {
        notice(
            "This browser can't talk to USB devices. Open this page in Microsoft Edge or Google Chrome; Firefox and Safari don't support WebHID.",
            { kind: "error" },
        );
        element<HTMLButtonElement>("[data-action='connect']").disabled = true;
        return;
    }
    readMixFromAddress();
    holdControlLock();
    answerOthers();
    wireDisplayFade();
    wireConnection();
    volt.watchDevices();
    void volt.reconnect().then((isConnected) => isConnected || setStatus("Not connected", "off"));
};
