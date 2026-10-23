import type { Intent } from "../lib/intents.ts";
import type { ITrayRow } from "../lib/tray-rows.ts";
import { desktopApp } from "./desktop.ts";
import { loadTheme } from "./store.ts";
import { applyTheme } from "./theme.ts";
import { openChannel, type ITraySnapshot, type RemoteMessage } from "./remote.ts";
import { initSliders, setSliderValue } from "./slider.ts";

/*
 * The desktop app's tray mixer (src/pages/tray). It never touches the Volt: it draws the rows the
 * main window sends and asks for changes as intents, which the main window checks and applies.
 */

const channel = openChannel();
const list = (): HTMLElement => document.querySelector<HTMLElement>("[data-tray-rows]")!;
const note = (): HTMLElement => document.querySelector<HTMLElement>("[data-tray-note]")!;
let rows: ITrayRow[] = [];
let layoutKey = "";
/** A value just moved here wins over a snapshot that may predate it. */
const recentInputs = new Map<string, number>();
const inputHoldMs = 400;

const post = (message: RemoteMessage): void => channel?.postMessage(message);

const showNote = (text: string): void => {
    note().textContent = text;
    note().hidden = !text;
};

const template = (id: string): DocumentFragment => document.querySelector<HTMLTemplateElement>(`#${id}`)!.content;

/** The row's icon says what it is; its name is there for screen readers only. */
const buildRow = (row: ITrayRow): HTMLElement => {
    const item = template("tray-row-template").firstElementChild!.cloneNode(true) as HTMLElement;
    item.dataset["key"] = row.key;
    const icon = template("tray-icons").querySelector(`[data-icon-name="${row.icon}"]`)?.firstElementChild;
    if (icon) item.querySelector("[data-row-icon]")!.replaceChildren(icon.cloneNode(true));
    item.querySelector("[data-row-name]")!.textContent = row.name;
    item.querySelector("[data-row-action='mute']")!.setAttribute("aria-label", `Mute ${row.name}`);
    const slider = item.querySelector<HTMLElement>("[data-slider]")!;
    slider.dataset["kind"] = row.kind === "channel" ? "fader" : "level";
    slider.setAttribute("aria-label", `${row.name} level`);
    return item;
};

const updateRow = (item: HTMLElement, row: ITrayRow, snapshot: ITraySnapshot): void => {
    item.dataset["tone"] = row.tone;
    const slider = item.querySelector<HTMLElement>("[data-slider]")!;
    const movedAt = recentInputs.get(item.dataset["key"] ?? "");
    if (movedAt === undefined || performance.now() - movedAt > inputHoldMs) setSliderValue(slider, row.level);
    const isFaderLocked = row.kind === "channel" && !snapshot.isMixOwned;
    slider.setAttribute("aria-disabled", String(!snapshot.isLive || isFaderLocked));
    const mute = item.querySelector<HTMLButtonElement>("[data-row-action='mute']")!;
    mute.setAttribute("aria-pressed", String(row.isMuted));
    mute.disabled = !snapshot.isLive;
};

const render = (snapshot: ITraySnapshot): void => {
    document.querySelector("[data-tray-status]")!.textContent = snapshot.status;
    const key = snapshot.rows.map((row) => `${row.key}:${row.icon}:${row.name}`).join("|");
    if (key !== layoutKey) {
        list().replaceChildren(...snapshot.rows.map(buildRow));
        initSliders(list());
        layoutKey = key;
    }
    rows = snapshot.rows;
    const items = list().querySelectorAll<HTMLElement>("[data-tray-row]");
    snapshot.rows.forEach((row, i) => items[i] && updateRow(items[i], row, snapshot));
    if (!note().textContent?.startsWith("Set up")) showNote("");
};

const rowOf = (element: Element): ITrayRow | undefined => {
    const item = element.closest<HTMLElement>("[data-tray-row]");
    return rows[[...list().children].indexOf(item as HTMLElement)];
};

const levelIntent = (row: ITrayRow, value: number): Intent =>
    row.kind === "channel"
        ? { type: "fader", ids: row.ids, db: value }
        : { type: row.kind === "monitor" ? "monitorLevel" : "headphoneLevel", level: value };

const muteIntent = (row: ITrayRow): Intent =>
    row.kind === "channel" ? { type: "mute", ids: row.ids } : { type: `${row.kind}Mute` };

const onSlider = (event: Event): void => {
    const row = rowOf(event.target as Element);
    if (!row) return;
    recentInputs.set(row.key, performance.now());
    post({ kind: "intent", intent: levelIntent(row, (event as CustomEvent<{ value: number }>).detail.value) });
};

const onClick = (event: Event): void => {
    const button = (event.target as Element).closest("[data-row-action='mute']");
    const row = button && rowOf(button);
    if (row) post({ kind: "intent", intent: muteIntent(row) });
};

const onMessage = ({ data }: MessageEvent): void => {
    const message = data as Partial<RemoteMessage> | null;
    if (message?.kind === "snapshot" && message.snapshot) render(message.snapshot);
    if (message?.kind === "result" && message.result === "needsMix")
        showNote("Set up your mix in the main window first: the faders work once this computer has it.");
};

/** Hello while shown (the main window then sends rows), bye while hidden. */
const greet = (): void => post({ kind: document.visibilityState === "visible" ? "hello" : "bye" });

/** In a browser there's no app: Open is a plain link to the page, and there's nothing to close. */
const wireButtons = (): void => {
    const desktop = desktopApp();
    const close = document.querySelector<HTMLButtonElement>("[data-tray-close]")!;
    close.hidden = !desktop;
    close.addEventListener("click", () => desktop?.hideTray());
    document.querySelector("[data-tray-open]")!.addEventListener("click", (event) => {
        if (!desktop) return;
        event.preventDefault();
        desktop.openMainWindow();
    });
};

export const startTray = (): void => {
    list().addEventListener("slider-input", onSlider);
    list().addEventListener("click", onClick);
    channel?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", greet);
    window.addEventListener("pagehide", () => post({ kind: "bye" }));
    wireButtons();
    // The theme is chosen in the main window's Settings; follow it live.
    window.addEventListener("storage", (event) => event.key === "volt-mixer.theme" && applyTheme(loadTheme()));
    greet();
    window.setTimeout(() => {
        if (layoutKey === "" && rows.length === 0) showNote("Open Volt Mixer to connect to the Volt.");
    }, 1500);
};
