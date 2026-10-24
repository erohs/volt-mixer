import { app, hooks } from "./app-state.ts";
import { setCondition } from "./notices.ts";
import { restartMixPause, takeMixWhenFree } from "./mix-pause.ts";
import * as volt from "./volt-connection.ts";

/* Only one tab or window of the site drives the Volt; any other stays read-only and waits its turn. */

const lockName = "volt-mixer-control";
const otherTabText = "Volt Mixer is open in another tab or window. Use that one; this one takes over when it closes.";

/**
 * This tab drives the Volt from now on. Taking over from another tab, it listens for another Volt
 * Mixer first (a tab without control hears nothing of one), then applies the saved mix.
 */
const takeControl = (): Promise<void> => {
    app.hasControl = true;
    setCondition("other-tab", null);
    restartMixPause(volt.connectedSpec() !== null);
    if (volt.connectedSpec() && app.isHardwareKnown) takeMixWhenFree();
    hooks.refresh();
    // Held until the tab closes.
    return new Promise<void>(() => {});
};

const waitForControl = (): void => {
    app.hasControl = false;
    setCondition("other-tab", otherTabText, { kind: "info" });
    hooks.refresh();
};

/**
 * Takes the lock, or waits for it; without Web Locks there's no telling, so this tab drives.
 * Resolves once it's known which: in control, or waiting.
 */
export const holdControlLock = (): Promise<void> =>
    new Promise((decided) => {
        const locks = navigator.locks as LockManager | undefined;
        if (!locks) return void (takeControl(), decided());
        void locks.request(lockName, { ifAvailable: true }, (lock) => {
            if (!lock) {
                waitForControl();
                void locks.request(lockName, takeControl);
            }
            decided();
            return lock ? takeControl() : undefined;
        });
    });
