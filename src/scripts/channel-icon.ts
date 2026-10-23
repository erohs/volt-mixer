import { channelIcons, defaultIcon, iconOf, isChannelIcon } from "../lib/channel-icons.ts";
import { isShownInTray } from "../lib/tray-rows.ts";
import { app, commit, hooks } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { cloneIcon } from "./icons.ts";
import { loadTrayHidden, saveTrayHidden } from "./store.ts";

/*
 * The channel dialog's card with the channel's icon and name, as its strip shows them. The icon
 * is a button that drops down the icon list (the choice is part of the mix, like the name); in
 * the desktop app the card also says whether it shows in the tray (this computer's choice).
 */

const section = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-channel-icon]");
const toggle = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>("[data-channel-icon-toggle]");
const list = (): HTMLElement | null => document.querySelector<HTMLElement>("#channel-icon-list");
const fields = (name: string): HTMLInputElement[] => [
    ...(section()?.querySelectorAll<HTMLInputElement>(`[data-channel-icon-field="${name}"]`) ?? []),
];

/** Opens or closes the icon list under the name. */
const showList = (isOpen: boolean): void => {
    const element = list();
    if (!element) return;
    element.hidden = !isOpen;
    toggle()?.setAttribute("aria-expanded", String(isOpen));
};

/** The dialog opens with the list closed. */
export const closeIconList = (): void => showList(false);

const showCurrentIcon = (icon: keyof typeof channelIcons): void => {
    const button = toggle();
    const slot = button?.querySelector<HTMLElement>("[data-channel-icon-current]");
    if (!button || !slot) return;
    button.setAttribute("aria-label", `Icon: ${channelIcons[icon]}. Change it`);
    if (slot.dataset["icon"] === icon) return;
    slot.dataset["icon"] = icon;
    slot.replaceChildren(...[cloneIcon(icon)].filter((element) => element !== null));
};

/** Shows the open channel's icon and ticks it; Show in tray appears only in the desktop app. */
export const refreshChannelIcon = (ids: string[]): void => {
    const element = section();
    if (!element || ids.length === 0) return;
    element.querySelector<HTMLElement>("[data-channel-tray-show]")!.hidden = desktopApp() === null;
    const icon = iconOf(app.state.icons, ids[0] ?? "");
    showCurrentIcon(icon);
    for (const input of fields("show")) input.checked = isShownInTray(ids, loadTrayHidden());
    for (const input of fields("icon")) input.checked = input.value === icon;
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
export const wireChannelIcon = (openIds: () => string[]): void => {
    toggle()?.addEventListener("click", () => showList(list()?.hidden === true));
    // Picked with a click, the list closes. Arrow keys also fire a click on a radio, but with a
    // count of 0; they move through the list and leave it open.
    list()?.addEventListener("click", (event) => {
        if (event.detail === 0 || !(event.target as Element).closest("input")) return;
        showList(false);
        toggle()?.focus();
    });
    section()?.addEventListener("change", (event) => {
        const input = (event.target as Element).closest<HTMLInputElement>("[data-channel-icon-field]");
        if (input?.dataset["channelIconField"] === "show") setShown(openIds(), input.checked);
        if (input?.dataset["channelIconField"] === "icon") setIcon(openIds(), input.value);
    });
};
