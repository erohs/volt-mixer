import { channelIcons, defaultIcon, iconOf, isChannelIcon } from "../lib/channel-icons.ts";
import { isShownInTray } from "../lib/tray-rows.ts";
import { app, commit, hooks } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { loadTrayHidden, saveTrayHidden } from "./store.ts";

/*
 * The channel dialog's Icon section: the channel's icon on its strip and in the tray (part of the
 * mix, like its name), and in the desktop app whether it shows in the tray (this computer's choice).
 */

const section = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-channel-icon]");
const fields = (name: string): HTMLInputElement[] => [
    ...(section()?.querySelectorAll<HTMLInputElement>(`[data-channel-icon-field="${name}"]`) ?? []),
];

/** Ticks what the open channel has; Show in tray appears only in the desktop app. */
export const refreshChannelIcon = (ids: string[]): void => {
    const element = section();
    if (!element || ids.length === 0) return;
    element.querySelector<HTMLElement>("[data-channel-tray-show]")!.hidden = desktopApp() === null;
    const isShown = isShownInTray(ids, loadTrayHidden());
    const icon = iconOf(app.state.icons, ids[0] ?? "");
    for (const input of fields("show")) input.checked = isShown;
    for (const input of fields("icon")) input.checked = input.value === icon;
    // The folded section's header says what's chosen, so it reads without opening it.
    const summary = element.querySelector("[data-group-state='channel-icon']");
    const label = channelIcons[icon];
    if (summary) summary.textContent = isShown || !desktopApp() ? label : `${label}, not in tray`;
};

const setShown = (ids: string[], isShown: boolean): void => {
    const hidden = loadTrayHidden().filter((id) => !ids.includes(id));
    saveTrayHidden(isShown ? hidden : [...hidden, ...ids]);
    hooks.refresh();
};

/** A pair takes one icon for both sides; the default is stored as no choice at all. */
const setIcon = (ids: string[], icon: string): void => {
    if (!isChannelIcon(icon)) return;
    for (const id of ids) {
        if (icon === defaultIcon(id)) delete app.state.icons[id];
        else app.state.icons[id] = icon;
    }
    commit();
};

/** `openIds` reads the channels the dialog is open for. */
export const wireChannelIcon = (openIds: () => string[]): void =>
    section()?.addEventListener("change", (event) => {
        const input = (event.target as Element).closest<HTMLInputElement>("[data-channel-icon-field]");
        if (input?.dataset["channelIconField"] === "show") setShown(openIds(), input.checked);
        if (input?.dataset["channelIconField"] === "icon") setIcon(openIds(), input.value);
    });
