import type { Intent } from "../lib/intents.ts";
import type { ITrayRow } from "../lib/tray-rows.ts";
import { desktopApp } from "./desktop.ts";
import { cloneIcon } from "./icons.ts";
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

const rowTemplate = (): Element =>
    document.querySelector<HTMLTemplateElement>("#tray-row-template")!.content.firstElementChild!;

/** An analog input's button is Direct monitoring (an ear); anything else has a speaker mute. */
const buildButton = (item: HTMLElement, row: ITrayRow): void => {
    const mute = item.querySelector<HTMLElement>("[data-row-action='mute']")!;
    const direct = item.querySelector<HTMLElement>("[data-row-action='direct']")!;
    mute.hidden = row.isDirect;
    direct.hidden = !row.isDirect;
    mute.setAttribute("aria-label", `Mute ${row.name}`);
    direct.setAttribute("aria-label", `Direct monitoring, ${row.name}`);
};

/** The row's icon says what it is; its name is there for screen readers only. */
const buildRow = (row: ITrayRow): HTMLElement => {
    const item = rowTemplate().cloneNode(true) as HTMLElement;
    item.dataset["key"] = row.key;
    const icon = cloneIcon(row.icon);
    if (icon) item.querySelector("[data-row-icon]")!.replaceChildren(icon);
    item.querySelector("[data-row-name]")!.textContent = row.name;
    buildButton(item, row);
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
    const direct = item.querySelector<HTMLButtonElement>("[data-row-action='direct']")!;
    mute.setAttribute("aria-pressed", String(row.isMuted));
    direct.setAttribute("aria-pressed", String(!row.isMuted));
    mute.disabled = direct.disabled = !snapshot.isLive;
};

const render = (snapshot: ITraySnapshot): void => {
    const status = document.querySelector<HTMLElement>("[data-tray-status]")!;
    status.textContent = snapshot.status;
    status.dataset["status"] = snapshot.statusKind;
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
    const button = (event.target as Element).closest("[data-row-action]");
    const row = button && rowOf(button);
    if (row) post({ kind: "intent", intent: muteIntent(row) });
};

const onMessage = ({ data }: MessageEvent): void => {
    const message = data as Partial<RemoteMessage> | null;
    if (message?.kind === "snapshot" && message.snapshot) render(message.snapshot);
    if (message?.kind === "result" && message.result === "needsMix")
        showNote("Set up your mix in the main window first: the faders work once this computer has it.");
};

/**
 * The window's height for its content: the app sizes the tray to fit, up to the screen. The rows'
 * value bubbles live in the body's top padding, so that's counted too.
 */
const neededHeight = (): number => {
    const part = (selector: string): number => document.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0;
    const body = getComputedStyle(document.querySelector(".body")!);
    const padding = parseFloat(body.paddingBlockStart) + parseFloat(body.paddingBlockEnd);
    return part(".head") + part("[data-tray-content]") + padding + part(".foot");
};

const fitWindow = (): void => desktopApp()?.fitTray(Math.ceil(neededHeight()));

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
    window.addEventListener("pagehide", () => post({ kind: "bye" }));
    wireButtons();
    new ResizeObserver(fitWindow).observe(document.querySelector("[data-tray-content]")!);
    // The theme is chosen in the main window's Settings; follow it live.
    window.addEventListener("storage", (event) => event.key === "volt-mixer.theme" && applyTheme(loadTheme()));
    // The app keeps this window ready while hidden, so it opens at the right size straight away.
    post({ kind: "hello" });
    window.setTimeout(() => {
        if (layoutKey === "" && rows.length === 0) showNote("Open Volt Mixer to connect to the Volt.");
    }, 1500);
};
