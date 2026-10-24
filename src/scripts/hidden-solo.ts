import { channelById, channelIds } from "../lib/mixer.ts";
import { stripGroups } from "../lib/strip-groups.ts";
import { app } from "./app-state.ts";
import { setCondition } from "./notices.ts";
import { runPageIntent } from "./run-intent.ts";

/*
 * A solo silences every other channel in the monitor mix. One on a strip that isn't shown (hidden
 * in Settings › View, or an ADAT input while the Volt is on S/PDIF) would do that with no button in
 * sight, so the page says so. It never clears the solo itself: that would bring every other
 * channel back up, which only the user may do.
 */

/** Says which hidden channels are soloed, with a button to clear them; called on every refresh. */
export const showHiddenSolos = (): void => {
    const shown = new Set(stripGroups(app.state, app.view).flatMap((group) => group.ids));
    const hidden = channelIds.filter((id) => app.state.channels[id].isSoloed && !shown.has(id));
    const names = hidden.map((id) => app.state.names[id] ?? channelById[id].name).join(", ");
    const text =
        hidden.length > 0
            ? `Solo is on for ${names}, which isn't shown, so the rest of the monitor mix is silent.`
            : null;
    setCondition("hidden-solo", text, {
        kind: "info",
        action: { label: "Clear the solo", run: () => runPageIntent({ type: "solo", ids: hidden, to: false }) },
    });
};
