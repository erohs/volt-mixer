import { minDb } from "../lib/gain.ts";
import type { Intent } from "../lib/intents.ts";
import { channelById } from "../lib/mixer.ts";
import type { ChannelId, CueName } from "../lib/mixer.ts";
import { formatDb } from "../lib/taper.ts";
import { app, hooks } from "./app-state.ts";
import { closeIconList, refreshChannelIcon, wireChannelIcon } from "./channel-icon.ts";
import { togglePhantom } from "./phantom.ts";
import { runPageIntent } from "./run-intent.ts";
import { initSliders, setSliderValue } from "./slider.ts";

/* The channel settings dialog (ChannelDialog.astro), for whichever strip opened it. */

/** The channels it's open for: one, or a linked pair (left, then right); none while closed. */
let openIds: ChannelId[] = [];
const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>("#channel-dialog")!;
const part = <T extends Element>(selector: string): T | null => dialog().querySelector<T>(selector);
const cues: CueName[] = ["cue1", "cue2"];

const preampIndexes = (): number[] =>
    openIds.map((id) => channelById[id].preampIndex).filter((index): index is number => index !== undefined);

const showSections = (first: ChannelId, isStereo: boolean): void => {
    const isAnalog = channelById[first].kind === "analog";
    const sections: Record<string, boolean> = {
        preamp: isAnalog,
        gain: preampIndexes().length > 0,
        phantom: preampIndexes().length > 0,
        "fixed-gain": isAnalog && preampIndexes().length === 0,
        stereo: isStereo,
    };
    for (const element of dialog().querySelectorAll<HTMLElement>("[data-channel-section]")) {
        element.hidden = !sections[element.dataset["channelSection"] ?? ""];
    }
    const relabel = (row: string, text: string): void => {
        const name = part(`[data-setting-name='${row}']`);
        if (name) name.textContent = text;
    };
    for (const row of ["pan-0", "cue1-pan-0", "cue2-pan-0"]) relabel(row, isStereo ? "Left pan" : "Pan");
};

/** Opens the dialog for a strip's channels (one, or a linked pair). */
export const openChannelDialog = (ids: readonly [ChannelId, ...ChannelId[]]): void => {
    openIds = [...ids];
    const name = document.querySelector(`[data-ids="${ids.join(",")}"] [data-strip-name]`)?.textContent ?? "";
    dialog().querySelector("[data-dialog-title]")!.textContent = `${name} settings`;
    part<HTMLInputElement>("[data-channel-field='name']")!.value = app.state.names[ids[0]] ?? "";
    part<HTMLInputElement>("[data-channel-field='name']")!.placeholder = name;
    showSections(ids[0], ids.length > 1);
    closeIconList();
    dialog().showModal();
    hooks.refresh();
};

const setSlider = (name: string, value: number, isLive: boolean): void => {
    const control = part<HTMLElement>(`[data-slider='${name}']`);
    if (!control) return;
    setSliderValue(control, value);
    control.setAttribute("aria-disabled", String(!isLive));
};

const refreshMix = (isLive: boolean): void => {
    const [first, second] = openIds.map((id) => app.state.channels[id]);
    const isMixLive = isLive && app.state.isMixOwned;
    if (!first) return;
    setSlider("pan-0", Math.round(first.pan * 100), isMixLive);
    if (second) setSlider("pan-1", Math.round(second.pan * 100), isMixLive);
    for (const cue of cues) {
        setSlider(`${cue}-level`, first[cue].db, isMixLive);
        setSlider(`${cue}-pan-0`, Math.round(first[cue].pan * 100), isMixLive);
        if (second) setSlider(`${cue}-pan-1`, Math.round(second[cue].pan * 100), isMixLive);
        const mute = part<HTMLInputElement>(`[data-channel-field='${cue}-mute']`);
        if (mute) mute.checked = first[cue].isMuted;
        // The folded cue's header shows its send, so it can be read without opening it.
        const send = first[cue];
        const state = send.isMuted ? "Muted" : send.db <= minDb ? "Off" : formatDb(send.db);
        const summary = part(`[data-group-state='${cue}']`);
        if (summary && summary.textContent !== state) summary.textContent = state;
    }
};

const refreshPreamp = (isLive: boolean): void => {
    const preamp = preampIndexes()[0];
    if (preamp !== undefined) setSlider("gain", app.state.preamp.gain[preamp] ?? 0, isLive);
    const isPhantomOn = preamp !== undefined && app.state.preamp.phantom[preamp] === true;
    part("[data-channel-action='phantom']")?.setAttribute("aria-pressed", String(isPhantomOn));
    const toneIndex = openIds[0] && channelById[openIds[0]].toneIndex;
    const tone = toneIndex === undefined ? 0 : (app.state.tone[toneIndex] ?? 0);
    for (const radio of dialog().querySelectorAll<HTMLInputElement>("input[name='tone']")) {
        radio.checked = Number(radio.value) === tone;
    }
};

/** Updates the open dialog's values from state. */
export const refreshChannelDialog = (isLive: boolean): void => {
    if (openIds.length === 0) return;
    refreshChannelIcon(openIds);
    refreshPreamp(isLive);
    refreshMix(isLive);
    const controls = dialog().querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        "button[data-channel-action], [data-channel-field]:not([data-channel-field='name'])",
    );
    for (const control of controls) control.disabled = !isLive;
    // Cue mutes are part of the mix, like the sliders beside them.
    for (const cue of cues) {
        const mute = part<HTMLInputElement>(`[data-channel-field='${cue}-mute']`);
        if (mute) mute.disabled = !isLive || !app.state.isMixOwned;
    }
};

/** A pan slider for one side (0 left, 1 right) of the mix or a cue; −100…100 on the slider. */
const panIntent =
    (side: 0 | 1, cue?: CueName) =>
    (value: number): Intent | null => {
        const id = openIds[side];
        if (!id) return null;
        return cue ? { type: "cuePan", id, cue, pan: value / 100 } : { type: "pan", id, pan: value / 100 };
    };

const sliderIntents: Record<string, (value: number) => Intent | null> = {
    gain: (db) => ({ type: "preampGain", ids: openIds, db }),
    "pan-0": panIntent(0),
    "pan-1": panIntent(1),
    "cue1-level": (db) => ({ type: "cueSend", ids: openIds, cue: "cue1", db }),
    "cue2-level": (db) => ({ type: "cueSend", ids: openIds, cue: "cue2", db }),
    "cue1-pan-0": panIntent(0, "cue1"),
    "cue1-pan-1": panIntent(1, "cue1"),
    "cue2-pan-0": panIntent(0, "cue2"),
    "cue2-pan-1": panIntent(1, "cue2"),
};

let autoGainTimer = 0;

/** Starts Auto-Gain on the open preamps and counts down in the dialog's status line. */
const startAutoGain = (): void => {
    const status = part<HTMLElement>("[data-auto-gain-status]")!;
    const seconds = Number(part<HTMLSelectElement>("[data-channel-field='auto-gain-seconds']")?.value ?? 10);
    const mask = preampIndexes().reduce((bits, index) => bits | (1 << index), 0);
    if (!hooks.autoGain(mask, seconds)) return;
    let left = seconds;
    window.clearInterval(autoGainTimer);
    status.textContent = `Listening for ${left} seconds. Play your loudest part.`;
    autoGainTimer = window.setInterval(() => {
        left -= 5;
        if (left > 0) status.textContent = `Listening: ${left} seconds left.`;
        else {
            window.clearInterval(autoGainTimer);
            status.textContent = "Done. The gain shows what the Volt set; if it didn't change, it heard too little.";
        }
    }, 5000);
};

/** Switches, dropdowns and the name field, by their data-channel-field. */
const fieldIntent = (input: HTMLInputElement | HTMLSelectElement): Intent | null => {
    const field = input.dataset["channelField"] ?? "";
    if (field === "name") return { type: "rename", ids: openIds, name: input.value };
    if (field === "tone") return { type: "tone", ids: openIds, tone: Number(input.value) };
    const cue = cues.find((name) => field === `${name}-mute`);
    return cue ? { type: "cueMute", ids: openIds, cue, to: (input as HTMLInputElement).checked } : null;
};

const run = (intent: Intent | null | undefined): void => {
    if (intent) runPageIntent(intent);
};

export const wireChannelDialog = (): void => {
    initSliders(dialog());
    wireChannelIcon(() => openIds);
    dialog().addEventListener("slider-input", (event) => {
        const { name, value } = (event as CustomEvent<{ name: string; value: number }>).detail;
        run(sliderIntents[name]?.(value));
    });
    dialog().addEventListener("click", (event) => {
        const action = (event.target as Element).closest<HTMLElement>("[data-channel-action]")?.dataset[
            "channelAction"
        ];
        if (action === "auto-gain") startAutoGain();
        if (action === "phantom") togglePhantom(openIds);
    });
    dialog().addEventListener("change", (event) => {
        const input = (event.target as Element).closest<HTMLInputElement | HTMLSelectElement>("[data-channel-field]");
        if (input) run(fieldIntent(input));
    });
    dialog().addEventListener("close", () => (openIds = []));
};
