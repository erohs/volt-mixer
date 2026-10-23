import { channelIcons, defaultIcon, isChannelIcon } from "../lib/channel-icons.ts";
import { isShownInTray } from "../lib/tray-rows.ts";
import { app, commit, hooks } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { loadTrayHidden, saveTrayHidden } from "./store.ts";

/*
 * The channel dialog's Tray section, in the desktop app only: whether the channel shows in the
 * tray mixer (this computer's choice) and its icon there (part of the mix, like its name).
 */

const section = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-channel-tray]");
const fields = (name: string): HTMLInputElement[] => [
    ...(section()?.querySelectorAll<HTMLInputElement>(`[data-channel-tray-field="${name}"]`) ?? []),
];

const currentIcon = (id: string): string => {
    const icon = app.state.icons[id];
    return isChannelIcon(icon) ? icon : defaultIcon(id);
};

/** Shows the section in the desktop app and ticks what the open channel has. */
export const refreshChannelTray = (ids: string[]): void => {
    const element = section();
    if (!element) return;
    element.hidden = desktopApp() === null;
    if (element.hidden || ids.length === 0) return;
    const isShown = isShownInTray(ids, loadTrayHidden());
    const icon = currentIcon(ids[0] ?? "");
    for (const input of fields("show")) input.checked = isShown;
    for (const input of fields("icon")) input.checked = input.value === icon;
    // The folded section's header says what's chosen, so it reads without opening it.
    const summary = element.querySelector("[data-group-state='tray-mixer']");
    const label = channelIcons[icon as keyof typeof channelIcons] ?? "";
    if (summary) summary.textContent = isShown ? label : "Hidden";
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
export const wireChannelTray = (openIds: () => string[]): void =>
    section()?.addEventListener("change", (event) => {
        const input = (event.target as Element).closest<HTMLInputElement>("[data-channel-tray-field]");
        if (input?.dataset["channelTrayField"] === "show") setShown(openIds(), input.checked);
        if (input?.dataset["channelTrayField"] === "icon") setIcon(openIds(), input.value);
    });
