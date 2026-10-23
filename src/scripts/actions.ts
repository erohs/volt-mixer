import { channelById, pairOf, pairKey, setLinked } from "../lib/mixer.ts";
import { app, commit, layout, notice } from "./app-state.ts";
import { openChannelDialog } from "./channel-dialog.ts";
import { setSliderValue } from "./slider.ts";
import { stripIds } from "./strips.ts";

/* What the strip and output controls do to the page state. Each change ends with commit(). */

const isAnalog = (id: string): boolean => channelById[id]?.kind === "analog";

/** Solo and digital mutes are mix levels, so they need this computer to own the mix. */
const explainNeedsMix = (): void =>
    notice("That works once this computer has your mix. Set one up above, or open a mix link.");

const forChannels = (ids: string[], change: (id: string) => void): void => {
    ids.forEach(change);
    commit();
};

const onStripAction = (button: HTMLElement): void => {
    const ids = stripIds(button);
    const first = app.state.channels[ids[0] ?? ""];
    if (!first) return;
    const action = button.dataset["stripAction"];
    const needsMix = action === "solo" || (action === "mute" && !isAnalog(ids[0] ?? ""));
    if (needsMix && !app.state.isMixOwned) return explainNeedsMix();
    if (action === "settings") openChannelDialog(ids);
    // Read once: first is ids[0], so it changes during the loop.
    const isMuted = !first.isMuted;
    const isSoloed = !first.isSoloed;
    if (action === "mute") forChannels(ids, (id) => (app.state.channels[id]!.isMuted = isMuted));
    if (action === "solo") forChannels(ids, (id) => (app.state.channels[id]!.isSoloed = isSoloed));
    if (action === "link") toggleLink(ids[0] ?? "");
};

const toggleLink = (id: string): void => {
    const pair = pairOf(id);
    if (!pair) return;
    setLinked(app.state, pair, !app.state.linked[pairKey(pair)]);
    layout();
    commit();
};

const onFader = (event: Event): void => {
    const { name, value } = (event as CustomEvent<{ name: string; value: number }>).detail;
    if (name !== "fader") return;
    forChannels(stripIds(event.target as Element), (id) => (app.state.channels[id]!.fader = value));
};

const outputActions: Record<string, () => void> = {
    "monitor-mute": () => (app.state.monitor.isMuted = !app.state.monitor.isMuted),
    "monitor-mono": () => (app.state.monitor.isMono = !app.state.monitor.isMono),
    "headphone-mute": () => (app.state.headphone.isMuted = !app.state.headphone.isMuted),
};

const onOutputLevel = (event: Event): void => {
    const { name, value } = (event as CustomEvent<{ name: string; value: number }>).detail;
    if (name === "monitor-level") app.state.monitor.level = value;
    else if (name === "headphone-level") app.state.headphone.level = value;
    else return;
    commit();
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
        const run = outputActions[action];
        if (!run) return;
        run();
        commit();
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
