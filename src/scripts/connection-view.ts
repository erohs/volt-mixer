import { app, currentSpec, hooks, setStatus } from "./app-state.ts";
import { pushMix, releaseMix } from "./mix-ownership.ts";
import { restartMixPause, takeMixWhenFree } from "./mix-pause.ts";
import { resetMeters } from "./meters-view.ts";
import { notice, setCondition } from "./notices.ts";
import { useSliderSpec } from "./slider.ts";
import { loadPendingMix } from "./store.ts";
import * as volt from "./volt-connection.ts";
import type { IConnectionInfo } from "./volt-connection.ts";
import { startSession } from "./volt-session.ts";

/* What the page shows about the connection: the status, the Connect buttons, and what's wrong with it. */

const settingsWaitMs = 2500;
let settingsTimer = 0;

const element = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

const showConnection = (isConnected: boolean): void => {
    element("[data-action='connect']").hidden = isConnected;
    element("[data-action='disconnect']").hidden = !isConnected;
};

/**
 * "Use anyway" on an unchecked firmware: the page may change the Volt from now on, starting with
 * the mix, once nothing holds it back (takeMixWhenFree).
 */
const allowSending = (): void => {
    app.isSendAllowed = true;
    setCondition("firmware", null);
    if (loadPendingMix() !== null) takeMixWhenFree();
    else pushMix();
    hooks.refresh();
};

/** Firmware this page hasn't been checked against: shown, but changed only once the user says so. */
const warnUncheckedFirmware = (info: IConnectionInfo): void => {
    const unknown = info.isIdentified
        ? `firmware ${info.version}, which this page hasn't been checked against`
        : "unknown firmware";
    setCondition("firmware", `This Volt has ${unknown}, so the page shows its settings but won't change anything.`, {
        action: { label: "Use anyway", run: allowSending },
    });
};

const deviceText = (info: IConnectionInfo): string =>
    info.isIdentified
        ? `Firmware ${info.version}, serial ${info.serial}. Checked against firmware ${info.specVersion}${info.isExact ? "" : " (closest match)"}.`
        : "The Volt didn't identify itself.";

/**
 * The Volt should send its settings straight away; if it doesn't, the page says so until it does
 * (volt-session.ts clears it when they come).
 */
const awaitSettings = (): void => {
    window.clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(() => {
        if (volt.connectedSpec() && !app.isHardwareKnown) {
            const text = "Connected, but the Volt didn't send its settings. Unplug it and plug it back in.";
            setCondition("no-settings", text, { kind: "error" });
        }
    }, settingsWaitMs);
};

export const onConnected = (info: IConnectionInfo): void => {
    releaseMix();
    Object.assign(app, { serial: info.serial, isHardwareKnown: false, isSendAllowed: info.isExact });
    useSliderSpec(currentSpec());
    startSession();
    restartMixPause(true);
    setStatus(info.isIdentified ? `Connected · firmware ${info.version}` : "Connected · firmware unknown", "on");
    showConnection(true);
    element("#about-volt-description").textContent = deviceText(info);
    if (!info.isExact) warnUncheckedFirmware(info);
    awaitSettings();
};

/** Nothing of the last connection carries over: the next Volt may be another one, on other firmware. */
export const onDisconnected = ({ isByUser }: { isByUser: boolean }): void => {
    releaseMix();
    Object.assign(app, { serial: "", isHardwareKnown: false, isSendAllowed: false });
    app.sync.forget();
    window.clearTimeout(settingsTimer);
    setCondition("no-settings", null);
    setCondition("firmware", null);
    restartMixPause(false);
    if (isByUser) setStatus("Disconnected", "off");
    else setStatus("Volt not connected · on the other computer?", "away");
    showConnection(false);
    resetMeters();
    hooks.refresh();
};

export const connectionActions: Record<string, () => void> = {
    connect: () =>
        void volt
            .pair()
            .then(
                (result) =>
                    result === "cancelled" &&
                    notice('No Volt was chosen. Click Connect Volt and pick "Volt 4 Gen 2".', { kind: "info" }),
            ),
    disconnect: () => void volt.disconnect(),
};

/** Follows the connection: connected, disconnected, and errors opening or talking to the Volt. */
export const wireConnectionView = (): void => {
    const on = <T>(type: string, handler: (detail: T) => void): void =>
        volt.connectionEvents.addEventListener(type, (event) => handler((event as CustomEvent<T>).detail));
    on("connected", onConnected);
    on("disconnected", onDisconnected);
    on<{ message: string }>("error", ({ message }) => notice(message, { kind: "error" }));
};
