import { setDirectMask, setPhantomMask } from "./mixer.ts";
import type { IMixerState } from "./mixer.ts";
import type { DeviceReport } from "./reports.ts";

const appliers: {
    [Type in DeviceReport["type"]]?: (state: IMixerState, report: Extract<DeviceReport, { type: Type }>) => void;
} = {
    direct: (state, { mask }) => setDirectMask(state, mask),
    monitorMute: (state, { isMuted }) => void (state.monitor.isMuted = isMuted),
    monitorLevel: (state, { level }) => void (state.monitor.level = level),
    headphone: (state, { level, isMuted }) => void (state.headphone = { level, isMuted }),
    tone: (state, { tones }) => void (state.tone = [...tones]),
    phantom: (state, { mask }) => setPhantomMask(state, mask),
    preampGain: (state, { channel, db }) => void (channel < 2 && (state.preamp.gain[channel] = db)),
    mono: (state, { isOn }) => void (state.monitor.isMono = isOn),
    clipProtection: (state, { isOn }) => void (state.device.isClipProtected = isOn),
    brightness: (state, { raw }) => void (state.device.brightness = raw),
    digitalFormat: (state, { format }) => void (state.device.digitalFormat = format),
};

/**
 * Adopts a front-panel change the Volt reported. Returns false for reports that need more than
 * this (state dumps, links and INPUT presses re-read the state dump instead).
 */
export const applyDeviceReport = (state: IMixerState, report: DeviceReport): boolean => {
    const apply = appliers[report.type] as ((state: IMixerState, report: DeviceReport) => void) | undefined;
    if (!apply) return false;
    apply(state, report);
    return true;
};
