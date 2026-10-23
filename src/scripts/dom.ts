/*
 * Small DOM helpers. Text is written only when it changes: rewriting a live region with the same
 * words makes screen readers announce it again, and any write costs a style and layout pass.
 */

export const setText = (element: Element | null, text: string): void => {
    if (element && element.textContent !== text) element.textContent = text;
};
