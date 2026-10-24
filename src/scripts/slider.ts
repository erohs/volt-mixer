import { sliderModels } from "../lib/slider-models.ts";
import type { ISliderModel } from "../lib/slider-models.ts";

/*
 * Behaviour for the Slider component (role="slider"). A press on the track sets the value there
 * and drags on from it; a press on the handle, or on the label, scale or value, drags from where it
 * is, as far as the pointer travels. Changes the user makes are announced with a bubbling
 * "slider-input" event carrying { name, value }.
 */

interface ISliderState {
    model: ISliderModel;
    value: number;
}

const states = new WeakMap<HTMLElement, ISliderState>();
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const stateOf = (control: HTMLElement): ISliderState => {
    let state = states.get(control);
    if (!state) {
        const model = (sliderModels[control.dataset["kind"] ?? ""] ?? sliderModels["level"])!();
        state = { model, value: model.min };
        states.set(control, state);
    }
    return state;
};

const render = (control: HTMLElement, state: ISliderState): void => {
    const { model, value } = state;
    control.parentElement?.style.setProperty("--slider-position", String(clamp01(model.toPosition(value))));
    control.setAttribute("aria-valuenow", String(value));
    control.setAttribute("aria-valuemin", String(model.min));
    control.setAttribute("aria-valuemax", String(model.max));
    control.setAttribute("aria-valuetext", model.speak(value));
    const readout = control.parentElement?.querySelector("[data-slider-value]");
    if (readout && readout.textContent !== model.format(value)) readout.textContent = model.format(value);
};

/** Shows a value that came from the page or the Volt; never announces it as a user change. */
export const setSliderValue = (control: HTMLElement, value: number): void => {
    const state = stateOf(control);
    if (state.value === value && control.hasAttribute("aria-valuetext")) return;
    state.value = value;
    render(control, state);
};

const change = (control: HTMLElement, value: number): void => {
    const state = stateOf(control);
    if (value === state.value || control.getAttribute("aria-disabled") === "true") return;
    setSliderValue(control, value);
    const detail = { name: control.dataset["slider"], value };
    control.dispatchEvent(new CustomEvent("slider-input", { bubbles: true, detail }));
};

const isVertical = (control: HTMLElement): boolean => control.getAttribute("aria-orientation") === "vertical";

/** Where the handle's centre is at 0, and how far it travels: the control less the handle (Slider.astro). */
const travelOf = (control: HTMLElement): { start: number; length: number } => {
    const rect = control.getBoundingClientRect();
    const thumb = control.querySelector(".thumb")?.getBoundingClientRect();
    if (isVertical(control)) {
        const size = thumb?.height ?? 0;
        return { start: rect.bottom - size / 2, length: rect.height - size || 1 };
    }
    const size = thumb?.width ?? 0;
    return { start: rect.left + size / 2, length: rect.width - size || 1 };
};

/** Where a press on the track lands, 0–1. */
const positionAt = (control: HTMLElement, event: PointerEvent): number => {
    const { start, length } = travelOf(control);
    return clamp01((isVertical(control) ? start - event.clientY : event.clientX - start) / length);
};

const isOnTrack = (control: HTMLElement, event: PointerEvent): boolean => {
    const target = event.target as Element;
    return control.contains(target) && !target.closest(".thumb");
};

/** Calls `onMove` for each move of the captured pointer until it's released. */
const followPointer = (control: HTMLElement, onMove: (move: PointerEvent) => void): void => {
    // For styling: a value readout can show only while the handle is held.
    control.toggleAttribute("data-dragging", true);
    const onUp = (): void => {
        control.removeAttribute("data-dragging");
        control.removeEventListener("pointermove", onMove);
        control.removeEventListener("pointerup", onUp);
        control.removeEventListener("pointercancel", onUp);
    };
    control.addEventListener("pointermove", onMove);
    control.addEventListener("pointerup", onUp);
    control.addEventListener("pointercancel", onUp);
};

/** Starts a drag of `control`, after setting it to the press if that's on the track. */
const startDrag = (control: HTMLElement, event: PointerEvent): void => {
    // Stops the browser starting a text selection or drag, which would cancel this one.
    event.preventDefault();
    const { model } = stateOf(control);
    if (isOnTrack(control, event)) change(control, model.fromPosition(positionAt(control, event)));
    const { length } = travelOf(control);
    const pointer = isVertical(control) ? event.clientY : event.clientX;
    const position = model.toPosition(stateOf(control).value);
    control.setPointerCapture(event.pointerId);
    control.focus();
    followPointer(control, (move) => {
        const travel = isVertical(control) ? pointer - move.clientY : move.clientX - pointer;
        change(control, model.fromPosition(clamp01(position + travel / length)));
    });
};

/** End goes to the rest point on faders (0 dB) and the end on pan; never to a loud maximum. */
const keyTarget = (key: string, control: HTMLElement): number | null => {
    const { model, value } = stateOf(control);
    const kind = control.dataset["kind"];
    const steps: Record<string, () => number | null> = {
        ArrowUp: () => model.step(value, 1, false),
        ArrowRight: () => model.step(value, 1, false),
        ArrowDown: () => model.step(value, -1, false),
        ArrowLeft: () => model.step(value, -1, false),
        PageUp: () => model.step(value, 1, true),
        PageDown: () => model.step(value, -1, true),
        Home: () => model.min,
        End: () => (kind === "fader" ? model.rest : kind === "pan" ? model.max : null),
    };
    return steps[key]?.() ?? null;
};

const onKeyDown = (event: KeyboardEvent): void => {
    const control = event.currentTarget as HTMLElement;
    const target = keyTarget(event.key, control);
    if (target === null) return;
    event.preventDefault();
    change(control, target);
};

/** The wheel only moves a focused slider, so scrolling the page can't change a level. */
const onWheel = (event: WheelEvent): void => {
    const control = event.currentTarget as HTMLElement;
    if (document.activeElement !== control) return;
    event.preventDefault();
    const { model, value } = stateOf(control);
    change(control, model.step(value, event.deltaY < 0 ? 1 : -1, false));
};

const bound = new WeakSet<HTMLElement>();

/** Wires up every slider under `root` (safe to call again after adding strips). */
export const initSliders = (root: ParentNode): void => {
    for (const control of root.querySelectorAll<HTMLElement>("[data-slider]")) {
        if (bound.has(control)) continue;
        bound.add(control);
        render(control, stateOf(control));
        const area = control.parentElement ?? control;
        area.addEventListener("pointerdown", (event) => startDrag(control, event));
        area.addEventListener("dragstart", (event) => event.preventDefault());
        control.addEventListener("keydown", onKeyDown);
        control.addEventListener("wheel", onWheel, { passive: false });
        control.addEventListener("dblclick", () => change(control, stateOf(control).model.rest));
    }
};
