import { channelById } from "./mixer.ts";

/*
 * The icons a channel can show (on its strip and in the tray mixer), chosen in its settings like
 * its name. Each is a Lucide icon in src/icons; the label is what the picker says for it.
 */

export const channelIcons = {
    mic: "Microphone",
    "mic-vocal": "Vocal mic",
    headset: "Headset",
    headphones: "Headphones",
    speech: "Voice",
    podcast: "Podcast",
    megaphone: "Megaphone",
    "audio-lines": "Line input",
    "audio-waveform": "Waveform",
    cable: "Cable",
    guitar: "Guitar",
    piano: "Piano",
    "keyboard-music": "Keyboard",
    drum: "Drums",
    music: "Music",
    "music-2": "Note",
    "music-4": "Notes",
    "disc-3": "Record",
    "boom-box": "Boom box",
    radio: "Radio",
    "radio-receiver": "Receiver",
    speaker: "Speaker",
    laptop: "Laptop",
    monitor: "Computer",
    smartphone: "Phone",
    tablet: "Tablet",
    tv: "TV",
    "gamepad-2": "Game console",
    joystick: "Joystick",
    video: "Camera",
    webcam: "Webcam",
    film: "Film",
    clapperboard: "Video",
    "message-circle": "Chat",
    users: "Call",
    phone: "Telephone",
    globe: "Browser",
    cast: "Cast",
    bluetooth: "Bluetooth",
    usb: "USB",
} as const;

export type ChannelIcon = keyof typeof channelIcons;

export const isChannelIcon = (value: unknown): value is ChannelIcon =>
    typeof value === "string" && Object.hasOwn(channelIcons, value);

/** What a channel is, at a glance: a mic preamp, a line input, a digital input or the computer. */
export const defaultIcon = (id: string): ChannelIcon => {
    const info = channelById[id];
    if (info?.kind === "loopback") return "laptop";
    if (info?.kind === "digital") return "cable";
    return info?.preampIndex === undefined ? "audio-lines" : "mic";
};

/** A channel's chosen icon (a pair uses its first channel's, like its name), or its default. */
export const iconOf = (icons: Record<string, string>, id: string): ChannelIcon => {
    const icon = icons[id];
    return isChannelIcon(icon) ? icon : defaultIcon(id);
};
