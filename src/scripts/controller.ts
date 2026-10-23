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
import { watchInputs } from "./input-activity.ts";
import { resetMeters } from "./meters-view.ts";
import {
    forgetMix,
    pushMix,
    readMixFromAddress,
    receiveMixLink,
    saveMixNow,
    takeOwnership,
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
import { toast, wireToast } from "./toast.ts";
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
    notice(`This Volt has ${unknown}, so the page shows its settings but won't change anything.`, {
        label: "Use anyway",
        run: () => {
            app.isSendAllowed = true;
            notice("");
            if (app.state.isMixOwned) pushMix();
            refresh();
        },
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
            notice("Connected, but the Volt didn't send its settings. Unplug it and plug it back in.");
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
                    toast('No Volt was chosen. Click Connect Volt and pick "Volt 4 Gen 2".', { isInstruction: true }),
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

const wirePage = (): void => {
    document.addEventListener("click", (event) => {
        const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset["action"] ?? "";
        pageActions[action]?.();
    });
    element("[data-mix-paste]").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = element<HTMLInputElement>("[data-mix-link-input]");
        if (receiveMixLink(input.value)) input.value = "";
    });
    window.addEventListener("hashchange", readMixFromAddress);
    window.addEventListener("pagehide", saveMixNow);
};

const wireConnection = (): void => {
    const on = <T>(type: string, handler: (detail: T) => void): void =>
        volt.connectionEvents.addEventListener(type, (event) => handler((event as CustomEvent<T>).detail));
    on("connected", onConnected);
    on("disconnected", onDisconnected);
    on<{ message: string }>("error", ({ message }) => notice(message));
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
    wireToast();
    applyTheme(loadTheme());
    initSliders(document);
    initDialogs();
    watchInputs();
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
        );
        element<HTMLButtonElement>("[data-action='connect']").disabled = true;
        return;
    }
    readMixFromAddress();
    holdControlLock();
    answerOthers();
    wireConnection();
    volt.watchDevices();
    void volt.reconnect().then((isConnected) => isConnected || setStatus("Not connected", "off"));
};
