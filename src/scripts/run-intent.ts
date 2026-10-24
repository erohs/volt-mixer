import { applyIntent, changesLayout, type Intent, type IntentResult } from "../lib/intents.ts";
import { app, commit, currentSpec, hooks, layout } from "./app-state.ts";
import { heldText } from "./mix-pause.ts";
import { notice } from "./notices.ts";

/* Every change, from this page's controls, the tray window or a phone, goes through applyIntent here. */

/** Applies an intent from any view and commits it (sends what changed, saves, refreshes). */
export const runIntent = (intent: Intent): IntentResult => {
    const result = applyIntent(app.state, intent, currentSpec());
    if (result !== "ok") return result;
    if (changesLayout(intent)) layout();
    commit();
    return result;
};

/** Mix changes need this computer to own the mix. */
const explainNeedsMix = (): void => {
    const held = heldText();
    if (held) return notice(held, { kind: "info" });
    notice("That works once this computer has your mix: set one up below, or open a mix link.");
};

/**
 * For this page's own controls: runs the intent, and says why if it has to wait for the mix. The
 * views then show the state again, so a slider that was moved goes back.
 */
export const runPageIntent = (intent: Intent): void => {
    const result = runIntent(intent);
    if (result === "ok") return;
    if (result === "needsMix") explainNeedsMix();
    hooks.refresh();
};
