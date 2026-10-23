import { channelById, trimName } from "../lib/mixer.ts";
import type { CueName } from "../lib/mixer.ts";
import { minDb } from "../lib/gain.ts";
import { formatDb } from "../lib/taper.ts";
import { app, commit, hooks, layout } from "./app-state.ts";
import { refreshChannelIcon, wireChannelIcon } from "./channel-icon.ts";
import { togglePhantom } from "./phantom.ts";
import { initSliders, setSliderValue } from "./slider.ts";

/* The channel settings dialog (ChannelDialog.astro), for whichever strip opened it. */

let openIds: string[] = [];
const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>("#channel-dialog")!;
const part = <T extends Element>(selector: string): T | null => dialog().querySelector<T>(selector);
const cues: CueName[] = ["cue1", "cue2"];

const preampIndexes = (): number[] =>
    openIds.map((id) => channelById[id]?.preampIndex).filter((index): index is number => index !== undefined);

const showSections = (isStereo: boolean): void => {
    const info = channelById[openIds[0] ?? ""];
    const isAnalog = info?.kind === "analog";
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
export const openChannelDialog = (ids: string[]): void => {
    openIds = ids;
    const name = document.querySelector(`[data-ids="${ids.join(",")}"] [data-strip-name]`)?.textContent ?? "";
    dialog().querySelector("[data-dialog-title]")!.textContent = `${name} settings`;
    part<HTMLInputElement>("[data-channel-field='name']")!.value = app.state.names[ids[0] ?? ""] ?? "";
    part<HTMLInputElement>("[data-channel-field='name']")!.placeholder = name;
    showSections(ids.length > 1);
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
    const tone = app.state.tone[channelById[openIds[0] ?? ""]?.toneIndex ?? 0] ?? 0;
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
};

/** Sets one entry of a per-input array, for channels that have that input (preamp, tone). */
const setAt = (values: number[], index: number | undefined, value: number): void => {
    if (index !== undefined) values[index] = value;
};

const forOpen = (change: (id: string, i: number) => void): void => {
    openIds.forEach(change);
    commit();
};

const sliderChanges: Record<string, (value: number) => void> = {
    gain: (db) => forOpen((id) => setAt(app.state.preamp.gain, channelById[id]?.preampIndex, db)),
    "pan-0": (pan) => forOpen((id, i) => i === 0 && (app.state.channels[id]!.pan = pan / 100)),
    "pan-1": (pan) => forOpen((id, i) => i === 1 && (app.state.channels[id]!.pan = pan / 100)),
    ...Object.fromEntries(
        cues.flatMap((cue) => [
            [`${cue}-level`, (db: number) => forOpen((id) => (app.state.channels[id]![cue].db = db))],
            [
                `${cue}-pan-0`,
                (pan: number) => forOpen((id, i) => i === 0 && (app.state.channels[id]![cue].pan = pan / 100)),
            ],
            [
                `${cue}-pan-1`,
                (pan: number) => forOpen((id, i) => i === 1 && (app.state.channels[id]![cue].pan = pan / 100)),
            ],
        ]),
    ),
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

/** Switches and dropdowns in the dialog, by their data-channel-field. */
const onFieldChange = (input: HTMLInputElement | HTMLSelectElement): void => {
    const field = input.dataset["channelField"] ?? "";
    if (field === "name") return onRename(input as HTMLInputElement);
    if (field === "tone")
        return forOpen((id) => setAt(app.state.tone, channelById[id]?.toneIndex, Number(input.value)));
    const cue = cues.find((name) => field === `${name}-mute`);
    if (cue) forOpen((id) => (app.state.channels[id]![cue].isMuted = (input as HTMLInputElement).checked));
};

const onRename = (input: HTMLInputElement): void => {
    const name = trimName(input.value);
    for (const id of openIds) {
        if (name) app.state.names[id] = name;
        else delete app.state.names[id];
    }
    layout();
    commit();
};

export const wireChannelDialog = (): void => {
    initSliders(dialog());
    wireChannelIcon(() => openIds);
    dialog().addEventListener("slider-input", (event) => {
        const { name, value } = (event as CustomEvent<{ name: string; value: number }>).detail;
        sliderChanges[name]?.(value);
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
        if (input) onFieldChange(input);
    });
    dialog().addEventListener("close", () => (openIds = []));
};
