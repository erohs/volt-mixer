import protocolData from "../data/volt4-gen2.json" with { type: "json" };

/** Every command the page sends. A firmware's spec must name them all before anything is sent. */
export const commandNames = [
    "crosspoint",
    "route",
    "phantomMask",
    "digitalFormat",
    "stateRequest",
    "muteWord",
    "preampGain",
    "monitorMono",
    "headphone",
    "clipProtection",
    "brightness",
    "tone",
    "identifyLights",
    "panelState",
    "autoGain",
] as const;
export type CommandName = (typeof commandNames)[number];

/** The fields of the mute word (command `muteWord`) the page reads and writes. */
export const muteFields = ["direct", "monitorMute", "monitorLevel"] as const;
export type MuteField = (typeof muteFields)[number];

/** The stereo buses each channel feeds. */
export const busNames = ["monitor", "cue1", "cue2"] as const;
export type BusName = (typeof busNames)[number];

export interface IReportIds {
    command: { id: number; bytes: number };
    identify: { id: number; bytes: number; payload: number[] };
    identifyReply: { id: number };
    stateReply: { id: number; cmd: number };
    meters: { id: number; fullScale: number; offsets: Record<string, number> };
}

export interface IStateLayout {
    phantomMask: number;
    digitalFormat: number;
    linkMask: number;
    directMask: number;
    monitorMute: number;
    monitorLevel: number;
    preampGainU16: number[];
    monitorMono: number;
    headphoneLevelU16: number;
    clipProtection: number;
    brightness: number;
    toneNibbles: number[];
    headphoneMute: number;
}

/** One firmware's protocol, as recorded in src/data/volt4-gen2.json. */
export interface ISpec {
    reports: IReportIds;
    end: number;
    commands: Record<CommandName, number>;
    gainUnity: number;
    faderMaxDb: number;
    preampGainStepsPerDb: number;
    preampGainMaxDb: number;
    headphoneLevelScale: number;
    headphoneLevelMax: number;
    monitorLevelMax: number;
    monitorLevelPerUnit: number;
    autoGainSeconds: { min: number; max: number; default: number };
    /** Mixer source per channel (src/lib/mixer.ts channel IDs). */
    sources: Partial<Record<string, number>>;
    mixBuses: Record<BusName, [number, number]>;
    routeDestinations: Record<string, [number, number]>;
    routeSources: Record<string, [number, number]>;
    muteWordFields: Record<MuteField, number>;
    muteWordOffsets: Record<MuteField, number>;
    linkState: { field: number; hostFlag: number };
    stateLayout: IStateLayout;
    tone: string[];
    digitalFormat: string[];
}

export interface IProtocol {
    device: string;
    vendorId: number;
    productId: number;
    /** Every Volt's name by decimal USB product ID, so an unsupported one can be named. */
    models: Record<string, string>;
    firmware: Record<string, ISpec>;
}

/** The model name for a UA USB product ID ("Volt 2 Max"), or a generic name. */
export const modelName = (productId: number, source: IProtocol = protocol): string =>
    source.models[String(productId)] ?? "This Volt";

export interface ISpecChoice {
    version: string;
    isExact: boolean;
    spec: ISpec;
}

export const protocol = protocolData as unknown as IProtocol;

export const compareVersions = (a: string, b: string): number => {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] ?? 0) - (right[i] ?? 0);
        if (difference) return difference;
    }
    return 0;
};

const isNumber = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value);
const isPair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(isNumber);

/** What a firmware's spec lacks of what the page needs ("commands.tone", …); empty when it's complete. */
export const missingFromSpec = (spec: ISpec): string[] => {
    const lacking = <T extends string>(group: string, names: readonly T[], record: unknown, check = isNumber) =>
        names
            .filter((name) => !check((record as Record<string, unknown> | undefined)?.[name]))
            .map((name) => `${group}.${name}`);
    return [
        ...lacking("commands", commandNames, spec.commands),
        ...lacking("muteWordFields", muteFields, spec.muteWordFields),
        ...lacking("muteWordOffsets", muteFields, spec.muteWordOffsets),
        ...lacking("mixBuses", busNames, spec.mixBuses, isPair),
    ];
};

/**
 * The spec for a firmware version, or the newest known one when the version isn't recorded. A
 * spec missing anything the page sends is never chosen, so no command goes out with a guessed byte.
 */
export const specFor = (version: string, source: IProtocol = protocol): ISpecChoice => {
    const complete = Object.keys(source.firmware)
        .filter((known) => missingFromSpec(source.firmware[known] as ISpec).length === 0)
        .sort(compareVersions);
    const isExact = complete.includes(version);
    const chosen = isExact ? version : (complete.at(-1) ?? "");
    return { version: chosen, isExact, spec: source.firmware[chosen] as ISpec };
};

export const newestSpec = (): ISpec => specFor("").spec;
