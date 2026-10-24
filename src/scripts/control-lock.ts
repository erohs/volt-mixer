import { app, clearNotice, hooks, notice } from "./app-state.ts";
import { checkOtherProgram, takeMixWhenFree } from "./mix-pause.ts";
import * as volt from "./volt-connection.ts";

/* Only one tab or window of the site drives the Volt; any other stays read-only and waits its turn. */

const lockName = "volt-mixer-control";
const otherTabText = "Volt Mixer is open in another tab or window. Use that one; this one takes over when it closes.";

/** This tab drives the Volt from now on. Taking over from another tab, it applies the saved mix. */
const takeControl = (): Promise<void> => {
    const wasWaiting = !app.hasControl;
    app.hasControl = true;
    clearNotice(otherTabText);
    if (wasWaiting && volt.connectedSpec() && app.isHardwareKnown) takeMixWhenFree();
    checkOtherProgram();
    hooks.refresh();
    // Held until the tab closes.
    return new Promise<void>(() => {});
};

export const holdControlLock = (): void => {
    const locks = navigator.locks;
    void locks?.request(lockName, { ifAvailable: true }, (lock) => {
        if (lock) return takeControl();
        app.hasControl = false;
        notice(otherTabText, { kind: "info" });
        hooks.refresh();
        void locks.request(lockName, takeControl);
        return undefined;
    });
};
