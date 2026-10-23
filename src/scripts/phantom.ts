import { channelById } from "../lib/mixer.ts";
import { app, commit } from "./app-state.ts";

/**
 * 48V for the preamps among `ids` (the strip's tag and the channel dialog's button). Turning it
 * on asks first, like Console's warning; turning it off doesn't.
 */
export const togglePhantom = (ids: string[]): void => {
    const indexes = ids
        .map((id) => channelById[id]?.preampIndex)
        .filter((index): index is number => index !== undefined);
    if (indexes.length === 0) return;
    const isOn = indexes.every((index) => app.state.preamp.phantom[index]);
    const question = "Turn on 48V phantom power? Only for condenser mics; it can damage ribbon mics.";
    if (!isOn && !window.confirm(question)) return;
    for (const index of indexes) app.state.preamp.phantom[index] = !isOn;
    commit();
};
