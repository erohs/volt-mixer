import { applyIntent, changesLayout, type Intent, type IntentResult } from "../lib/intents.ts";
import { newestSpec } from "../lib/spec.ts";
import { app, commit, layout } from "./app-state.ts";
import { toast } from "./toast.ts";
import { connectedSpec } from "./volt-connection.ts";

/* Every change, from this page's controls, the tray window or a phone, goes through applyIntent here. */

/** Applies an intent from any view and commits it (sends what changed, saves, refreshes). */
export const runIntent = (intent: Intent): IntentResult => {
    const result = applyIntent(app.state, intent, connectedSpec() ?? newestSpec());
    if (result !== "ok") return result;
    if (changesLayout(intent)) layout();
    commit();
    return result;
};

/** Mix changes need this computer to own the mix. */
const explainNeedsMix = (): void => {
    if (app.isMixPaused) return toast("The mix is with the other Volt Mixer on this computer until it closes.");
    toast("That works once this computer has your mix. Set one up above, or open a mix link.", { isInstruction: true });
};

/** For this page's own controls: runs the intent, and says why if it has to wait for the mix. */
export const runPageIntent = (intent: Intent): void => {
    if (runIntent(intent) === "needsMix") explainNeedsMix();
};
