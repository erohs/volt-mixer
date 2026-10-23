import { trayChoices } from "../lib/tray-rows.ts";
import { app, hooks } from "./app-state.ts";
import { desktopApp } from "./desktop.ts";
import { loadTrayHidden, saveTrayHidden } from "./store.ts";

/* Settings › Tray mixer: one switch per row the desktop app's tray window can show. */

/** The website has no tray. */
export const isDesktopApp = (): boolean => desktopApp() !== null;

const group = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-group="tray"]');
const list = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-tray-choices]");
let shownKeys = "";

const buildChoice = (key: string, name: string): HTMLElement => {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const text = document.createElement("span");
    const input = document.createElement("input");
    text.textContent = name;
    Object.assign(input, { type: "checkbox" });
    input.setAttribute("role", "switch");
    input.dataset["trayChoice"] = key;
    label.append(text, input);
    item.append(label);
    return item;
};

/** Lists the rows the tray can show now (it follows Settings › View) and ticks the shown ones. */
export const refreshTraySettings = (): void => {
    const choices = trayChoices(app.state, app.view);
    const keys = choices.map((choice) => `${choice.key}:${choice.name}`).join("|");
    if (keys !== shownKeys) {
        list()?.replaceChildren(...choices.map((choice) => buildChoice(choice.key, choice.name)));
        shownKeys = keys;
    }
    const hidden = loadTrayHidden();
    for (const input of list()?.querySelectorAll<HTMLInputElement>("[data-tray-choice]") ?? [])
        input.checked = !hidden.includes(input.dataset["trayChoice"] ?? "");
};

const onChange = (event: Event): void => {
    const input = (event.target as Element).closest<HTMLInputElement>("[data-tray-choice]");
    const key = input?.dataset["trayChoice"];
    if (!input || !key) return;
    const hidden = loadTrayHidden().filter((hiddenKey) => hiddenKey !== key);
    saveTrayHidden(input.checked ? hidden : [...hidden, key]);
    hooks.refresh();
};

export const wireTraySettings = (): void => {
    const element = group();
    if (element) element.hidden = !isDesktopApp();
    list()?.addEventListener("change", onChange);
};
