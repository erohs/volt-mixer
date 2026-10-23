import { channelById, isChannelId, isLinked } from "../lib/mixer.ts";
import type { ChannelId, IMixerState } from "../lib/mixer.ts";
import { iconOf } from "../lib/channel-icons.ts";
import { toneOf, type IStripGroup, type StripIds } from "../lib/strip-groups.ts";
import { setText } from "./dom.ts";
import { cloneIcon } from "./icons.ts";
import { initSliders, setSliderValue } from "./slider.ts";

/*
 * Channel strips: cloned from #strip-template (StripTemplate.astro) when the layout changes, and
 * refreshed in place otherwise, so a drag or focus is never interrupted by a rebuild.
 */

const stripsList = (): HTMLElement => document.querySelector<HTMLElement>("[data-strips]")!;
const template = (): HTMLTemplateElement => document.querySelector<HTMLTemplateElement>("#strip-template")!;

/** The channels a strip controls (from an element inside it), or null outside a strip. */
export const stripIds = (element: Element): StripIds | null => {
    const ids = (element.closest<HTMLElement>("[data-strip]")?.dataset["ids"] ?? "").split(",").filter(isChannelId);
    return ids.length === 1 || ids.length === 2 ? (ids as StripIds) : null;
};

const focusKey = (element: Element | null): string | null => {
    const strip = element?.closest<HTMLElement>("[data-strip]");
    const part = element?.getAttribute("data-strip-action") ?? (element?.hasAttribute("data-slider") ? "fader" : null);
    return strip && part ? `${strip.dataset["ids"]}:${part}` : null;
};

const restoreFocus = (key: string | null): void => {
    if (!key) return;
    const [ids, part] = key.split(":");
    const strip = stripsList().querySelector(`[data-ids="${ids}"]`);
    const target =
        part === "fader"
            ? strip?.querySelector("[data-slider]")
            : strip?.querySelector(`[data-strip-action="${part}"]`);
    (target as HTMLElement | null)?.focus();
};

const label = (strip: HTMLElement, selector: string, text: string): void => {
    strip.querySelector(selector)?.setAttribute("aria-label", text);
};

const isAnalog = (id: ChannelId): boolean => channelById[id].kind === "analog";
const hasPreamp = (ids: readonly ChannelId[]): boolean => ids.some((id) => channelById[id].preampIndex !== undefined);

/** Analog inputs show what they are (MIC or LINE) and their 48V. */
const buildInputTags = (strip: HTMLElement, group: IStripGroup): void => {
    strip.querySelector<HTMLElement>("[data-strip-tags]")!.hidden = !isAnalog(group.ids[0]);
    const input = strip.querySelector<HTMLElement>("[data-strip-input]")!;
    input.dataset["input"] = hasPreamp(group.ids) ? "mic" : "line";
    input.textContent = hasPreamp(group.ids) ? "Mic" : "Line";
    label(strip, '[data-strip-action="phantom"]', `48V phantom power, ${group.name}`);
};

const buildStrip = (group: IStripGroup, meterNames: Set<string>): HTMLElement => {
    const strip = (template().content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
    strip.dataset["ids"] = group.ids.join(",");
    strip.querySelector("[data-strip-name]")!.textContent = group.name;
    strip.querySelector("[data-strip-settings-label]")!.textContent = `${group.name} settings`;
    label(strip, "[data-slider]", `${group.name} level`);
    label(strip, '[data-strip-action="mute"]', `Mute ${group.name}`);
    label(strip, '[data-strip-action="solo"]', `Solo ${group.name}`);
    buildInputTags(strip, group);
    const meters = [...strip.querySelectorAll<HTMLElement>("[data-meter]")];
    group.ids.forEach((id: ChannelId, i) => meters[i] && meterNames.has(id) && (meters[i].dataset["meter"] = id));
    const link = strip.querySelector<HTMLElement>('[data-strip-action="link"]')!;
    link.hidden = !group.linkPair;
    if (group.linkLabel) link.setAttribute("aria-label", group.linkLabel);
    return strip;
};

/** Rebuilds the strips for a new layout, keeping keyboard focus on the same control. */
export const renderStrips = (groups: IStripGroup[], meterNames: Set<string>): void => {
    const key = focusKey(document.activeElement);
    const list = stripsList();
    list.replaceChildren(...groups.map((group) => buildStrip(group, meterNames)));
    initSliders(list);
    restoreFocus(key);
};

const press = (strip: Element, action: string, isPressed: boolean): void => {
    const button = strip.querySelector(`[data-strip-action="${action}"]`);
    if (button && button.getAttribute("aria-pressed") !== String(isPressed))
        button.setAttribute("aria-pressed", String(isPressed));
};

/** The channel's icon, swapped only when it changes. */
const refreshIcon = (strip: HTMLElement, state: IMixerState, ids: StripIds): void => {
    const slot = strip.querySelector<HTMLElement>("[data-strip-icon]")!;
    const name = iconOf(state.icons, ids[0]);
    if (slot.dataset["icon"] === name) return;
    slot.dataset["icon"] = name;
    slot.replaceChildren(...[cloneIcon(name)].filter((icon) => icon !== null));
};

/** 48V and the TONE-coloured fader: what the Volt lights for these channels. */
const refreshIndicators = (strip: HTMLElement, state: IMixerState, ids: StripIds): void => {
    const preamps = ids.map((id) => channelById[id].preampIndex);
    const isPhantomOn = preamps.some((index) => index !== undefined && state.preamp.phantom[index]);
    press(strip, "phantom", isPhantomOn);
    refreshIcon(strip, state, ids);
    const tone = toneOf(state, ids);
    if (strip.dataset["tone"] !== tone) strip.dataset["tone"] = tone;
    const toneName = tone.charAt(0).toUpperCase() + tone.slice(1);
    setText(strip.querySelector("[data-strip-tone-name]"), tone === "off" ? "" : `, ${toneName} tone`);
};

/** Updates every strip's values from state. `isLive` false makes the controls read-only. */
export const refreshStrips = (state: IMixerState, isLive: boolean): void => {
    for (const strip of stripsList().querySelectorAll<HTMLElement>("[data-strip]")) {
        const ids = stripIds(strip);
        if (!ids) continue;
        const channel = state.channels[ids[0]];
        const fader = strip.querySelector<HTMLElement>("[data-slider]")!;
        setSliderValue(fader, channel.fader);
        fader.setAttribute("aria-disabled", String(!isLive || !state.isMixOwned));
        press(strip, "mute", channel.isMuted);
        press(strip, "solo", channel.isSoloed);
        press(strip, "link", isLinked(state, ids[0]));
        refreshIndicators(strip, state, ids);
        for (const button of strip.querySelectorAll<HTMLButtonElement>("button:not([data-strip-action='settings'])")) {
            button.disabled = !isLive;
        }
        // Line inputs have no 48V.
        if (!hasPreamp(ids)) strip.querySelector<HTMLButtonElement>('[data-strip-action="phantom"]')!.disabled = true;
    }
};
