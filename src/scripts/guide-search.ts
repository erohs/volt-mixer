import { searchGuide, termPattern, termsOf, type IGuideResult, type IGuideSection } from "../lib/guide-search.ts";
import { initDialogs } from "./dialogs.ts";

/*
 * The guide's search (GuideSearch.astro): opened from the top bar, or with / or Ctrl+K. The index
 * (src/pages/guide/search.json.ts) is fetched the first time it opens.
 */

const part = <T extends Element>(selector: string): T => document.querySelector<T>(selector)!;
const dialog = (): HTMLDialogElement => part("#guide-search");
const input = (): HTMLInputElement => part("[data-guide-search-input]");
const list = (): HTMLElement => part("[data-guide-search-results]");
/** The index, or null when it couldn't be loaded. */
let index: Promise<IGuideSection[] | null> | null = null;

const fetchIndex = async (url: string): Promise<IGuideSection[]> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The search index answered ${response.status}.`);
    return (await response.json()) as IGuideSection[];
};

const loadIndex = (): Promise<IGuideSection[] | null> => {
    const url = part<HTMLElement>("[data-guide-search-form]").dataset["index"] ?? "";
    // A failure isn't kept, so the next search tries again.
    const forget = (): null => {
        index = null;
        return null;
    };
    index ??= fetchIndex(url).catch(forget);
    return index;
};

/** The text, with each term it contains in a <mark>. */
const highlighted = (text: string, terms: string[]): DocumentFragment => {
    const fragment = document.createDocumentFragment();
    text.split(termPattern(terms)).forEach((piece, i) => {
        fragment.append(i % 2 ? Object.assign(document.createElement("mark"), { textContent: piece }) : piece);
    });
    return fragment;
};

const resultItem = (result: IGuideResult, terms: string[]): HTMLLIElement => {
    const link = Object.assign(document.createElement("a"), { href: result.url, className: "guide-result" });
    const where = Object.assign(document.createElement("span"), { className: "guide-result-where" });
    where.textContent = result.heading === result.page ? result.page : `${result.page} › ${result.heading}`;
    const snippet = Object.assign(document.createElement("span"), { className: "guide-result-snippet" });
    snippet.append(highlighted(result.snippet, terms));
    link.append(where, snippet);
    const item = document.createElement("li");
    item.append(link);
    return item;
};

const statusText = (count: number | null, query: string): string => {
    if (!query.trim()) return "";
    if (count === null) return "Search isn't available right now. Check your connection, then try again.";
    if (count === 0) return `Nothing found for “${query.trim()}”. Try a shorter or different word.`;
    return count === 1 ? "1 result." : `${count} results.`;
};

/** Written only when it changes, so a screen reader isn't told the same thing at every key. */
const setStatus = (text: string): void => {
    const status = part("[data-guide-search-status]");
    if (status.textContent !== text) status.textContent = text;
};

const search = async (): Promise<void> => {
    const query = input().value;
    const sections = await loadIndex();
    if (input().value !== query) return;
    const results = sections ? searchGuide(sections, query) : [];
    const terms = termsOf(query);
    list().replaceChildren(...results.map((result) => resultItem(result, terms)));
    setStatus(statusText(sections && results.length, query));
};

const open = (): void => {
    if (dialog().open) return;
    dialog().showModal();
    input().select();
    void loadIndex();
};

const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));

const onShortcut = (event: KeyboardEvent): void => {
    const isSlash = event.key === "/" && !isTyping(event.target);
    const isCtrlK = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);
    if (!isSlash && !isCtrlK) return;
    event.preventDefault();
    open();
};

/** Up and Down move between the box and the results. */
const onArrow = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const stops = [input(), ...list().querySelectorAll<HTMLElement>("a")];
    const at = stops.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    event.preventDefault();
    stops[Math.max(0, Math.min(stops.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
};

export const wireGuideSearch = (): void => {
    initDialogs();
    const button = part<HTMLButtonElement>("[data-guide-search-open]");
    button.hidden = false;
    button.addEventListener("click", open);
    document.addEventListener("keydown", onShortcut);
    dialog().addEventListener("keydown", onArrow);
    input().addEventListener("input", () => void search());
    // Enter goes to the best result; choosing one closes the search, even on this page.
    part("[data-guide-search-form]").addEventListener("submit", (event) => {
        event.preventDefault();
        list().querySelector("a")?.click();
    });
    list().addEventListener("click", (event) => {
        if ((event.target as Element).closest("a")) dialog().close();
    });
};
