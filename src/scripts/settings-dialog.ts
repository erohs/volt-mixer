import { isRouteKnown } from "../lib/commands.ts";
import type { CueName } from "../lib/mixer.ts";
import { encodeMix, toSavedMix } from "../lib/saved-mix.ts";
import { newestSpec } from "../lib/spec.ts";
import { app, commit, hooks, layout, notice } from "./app-state.ts";
import { initSliders, setSliderValue } from "./slider.ts";
import { loadTheme, saveTheme, saveView } from "./store.ts";
import { applyTheme, isTheme } from "./theme.ts";
import { wireDesktopSettings } from "./desktop-settings.ts";
import { isDesktopApp, refreshTraySettings, wireTraySettings } from "./tray-settings.ts";

/* The Settings dialog (SettingsDialog.astro): device options, cue routing, view and the mix. */

const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>("#settings-dialog")!;
const inputs = (setting: string): NodeListOf<HTMLInputElement | HTMLSelectElement> =>
    dialog().querySelectorAll(`[data-setting="${setting}"]`);
const cues: CueName[] = ["cue1", "cue2"];

const check = (setting: string, value: string | boolean): void => {
    for (const input of inputs(setting)) {
        if (input instanceof HTMLSelectElement) input.value = String(value);
        else input.checked = value === true;
    }
};

const mirroredCue = (): string => cues.find((cue) => app.state.cues[cue].isMirroredToLine34) ?? "none";

/** "Own mix" can only be chosen once that cue's route is captured (src/data/volt4-gen2.json). */
const markUncapturedRoutes = (): void => {
    for (const cue of cues) {
        const own = dialog().querySelector<HTMLOptionElement>(`[data-setting="${cue}-source"] option[value="own"]`);
        if (own) own.disabled = !isRouteKnown(newestSpec(), `${cue}Mix`);
    }
};

/** Settings that only change what this page shows, so they work without a Volt. */
const viewSettings: Record<string, keyof typeof app.view> = {
    "show-digital": "isDigitalShown",
    "show-loopback": "isLoopbackShown",
};

/** Updates the dialog's values from state; device settings need the Volt, the view doesn't. */
export const refreshSettings = (isLive: boolean): void => {
    const { device, cues: cueRouting, headphoneSource, isMixOwned } = app.state;
    check("clip", device.isClipProtected);
    check("digital", device.digitalFormat);
    check("headphone-source", headphoneSource);
    for (const cue of cues) check(`${cue}-source`, cueRouting[cue].isMix ? "mix" : "own");
    check("mirror", mirroredCue());
    check("show-digital", app.view.isDigitalShown);
    check("show-loopback", app.view.isLoopbackShown);
    check("theme", loadTheme());
    if (isDesktopApp()) refreshTraySettings();
    markUncapturedRoutes();
    const brightness = dialog().querySelector<HTMLElement>("[data-slider='brightness']")!;
    setSliderValue(brightness, device.brightness);
    brightness.setAttribute("aria-disabled", String(!isLive));
    for (const input of dialog().querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]")) {
        const setting = input.dataset["setting"] ?? "";
        const isRouting = /source|mirror/.test(setting);
        const isPageSetting = setting in viewSettings || setting === "theme";
        input.disabled = !isPageSetting && (!isLive || (isRouting && !isMixOwned));
    }
};

const settingChanges: Record<string, (input: HTMLInputElement | HTMLSelectElement) => void> = {
    clip: (input) => (app.state.device.isClipProtected = (input as HTMLInputElement).checked),
    digital: (input) => ((app.state.device.digitalFormat = input.value), layout()),
    "headphone-source": (input) => (app.state.headphoneSource = input.value === "cue2" ? "cue2" : "cue1"),
    "cue1-source": (input) => (app.state.cues.cue1.isMix = input.value === "mix"),
    "cue2-source": (input) => (app.state.cues.cue2.isMix = input.value === "mix"),
    mirror: (input) => cues.forEach((cue) => (app.state.cues[cue].isMirroredToLine34 = input.value === cue)),
};

const onChange = (input: HTMLInputElement | HTMLSelectElement): void => {
    const setting = input.dataset["setting"] ?? "";
    if (setting === "theme" && isTheme(input.value)) return (applyTheme(input.value), saveTheme(input.value));
    const view = viewSettings[setting];
    if (view) {
        app.view[view] = (input as HTMLInputElement).checked;
        saveView(app.view);
        layout();
        return hooks.refresh();
    }
    settingChanges[setting]?.(input);
    commit();
};

/** A link to this page that carries the mix, for opening on the other computer. */
export const mixLink = (): string => {
    const url = new URL(location.href);
    url.hash = `mix=${encodeMix(toSavedMix(app.state))}`;
    return url.href;
};

const copyMixLink = async (): Promise<void> => {
    try {
        await navigator.clipboard.writeText(mixLink());
        notice("Mix link copied. Open it on your other computer to use this mix there.");
    } catch {
        notice(`Copy this link to your other computer: ${mixLink()}`);
    }
};

export const settingsActions: Record<string, () => void> = {
    "open-settings": () => (dialog().showModal(), hooks.refresh()),
    "copy-mix-link": () => void copyMixLink(),
};

export const wireSettingsDialog = (): void => {
    initSliders(dialog());
    wireTraySettings();
    void wireDesktopSettings();
    dialog().addEventListener("change", (event) => {
        const input = (event.target as Element).closest<HTMLInputElement | HTMLSelectElement>("[data-setting]");
        if (input) onChange(input);
    });
    dialog().addEventListener("slider-input", (event) => {
        const { name, value } = (event as CustomEvent<{ name: string; value: number }>).detail;
        if (name !== "brightness") return;
        app.state.device.brightness = value;
        commit();
    });
};
