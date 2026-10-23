import { applyIntent, type Intent, type IntentResult } from "../lib/intents.ts";
import { newestSpec } from "../lib/spec.ts";
import { app, commit, layout } from "./app-state.ts";
import { openChannelDialog } from "./channel-dialog.ts";
import { togglePhantom } from "./phantom.ts";
import { toast } from "./toast.ts";
import { setSliderValue } from "./slider.ts";
import { stripIds } from "./strips.ts";

/* What the strip and output controls do to the page state, through the same intents as the tray. */

/** Solo, digital mutes and faders are mix levels, so they need this computer to own the mix. */
const explainNeedsMix = (): void => {
    if (app.isMixPaused) return toast("The mix is with the other Volt Mixer on this computer until it closes.");
    toast("That works once this computer has your mix. Set one up above, or open a mix link.", { isInstruction: true });
};

/** Applies an intent from any view (this page's controls or the tray window) and commits it. */
export const runIntent = (intent: Intent): IntentResult => {
    const result = applyIntent(app.state, intent, newestSpec().faderMaxDb);
    if (result !== "ok") return result;
    if (intent.type === "link") layout();
    commit();
    return result;
};

const stripIntents: Record<string, (ids: string[]) => Intent> = {
    mute: (ids) => ({ type: "mute", ids }),
    solo: (ids) => ({ type: "solo", ids }),
    link: (ids) => ({ type: "link", id: ids[0] ?? "" }),
};

const onStripAction = (button: HTMLElement): void => {
    const ids = stripIds(button);
    const action = button.dataset["stripAction"] ?? "";
    if (action === "settings") return openChannelDialog(ids);
    if (action === "phantom") return togglePhantom(ids);
    const intent = stripIntents[action]?.(ids);
    if (intent && runIntent(intent) === "needsMix") explainNeedsMix();
};

const onFader = (event: Event): void => {
    const { name, value } = (event as CustomEvent<{ name: string; value: number }>).detail;
    if (name === "fader") runIntent({ type: "fader", ids: stripIds(event.target as Element), db: value });
};

const outputActions: Record<string, Intent> = {
    "monitor-mute": { type: "monitorMute" },
    "monitor-mono": { type: "monitorMono" },
    "headphone-mute": { type: "headphoneMute" },
};

const onOutputLevel = (event: Event): void => {
    const { name, value } = (event as CustomEvent<{ name: string; value: number }>).detail;
    if (name === "monitor-level") runIntent({ type: "monitorLevel", level: value });
    if (name === "headphone-level") runIntent({ type: "headphoneLevel", level: value });
};

/** Wires the strips and the outputs panel. */
export const wireMixerControls = (): void => {
    const strips = document.querySelector<HTMLElement>("[data-strips]")!;
    strips.addEventListener("slider-input", onFader);
    strips.addEventListener("click", (event) => {
        const button = (event.target as Element).closest<HTMLElement>("[data-strip-action]");
        if (button) onStripAction(button);
    });
    document.addEventListener("slider-input", onOutputLevel);
    document.addEventListener("click", (event) => {
        const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset["action"] ?? "";
        const intent = outputActions[action];
        if (intent) runIntent(intent);
    });
};

/** Refreshes the outputs panel. */
export const refreshOutputs = (isLive: boolean): void => {
    const { monitor, headphone } = app.state;
    const pressed = (action: string, isOn: boolean): void =>
        document.querySelector(`[data-action="${action}"]`)?.setAttribute("aria-pressed", String(isOn));
    pressed("monitor-mute", monitor.isMuted);
    pressed("monitor-mono", monitor.isMono);
    pressed("headphone-mute", headphone.isMuted);
    for (const [name, value] of [
        ["monitor-level", monitor.level],
        ["headphone-level", headphone.level],
    ] as const) {
        const control = document.querySelector<HTMLElement>(`[data-slider="${name}"]`);
        if (!control) continue;
        setSliderValue(control, value);
        control.setAttribute("aria-disabled", String(!isLive));
    }
    for (const action of Object.keys(outputActions)) {
        const button = document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
        if (button) button.disabled = !isLive;
    }
};
