import protocolData from "../data/volt4-gen2.json" with { type: "json" };

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
    commands: Record<string, number>;
    gainUnity: number;
    faderMaxDb: number;
    preampGainStepsPerDb: number;
    preampGainMaxDb: number;
    headphoneLevelScale: number;
    headphoneLevelMax: number;
    monitorLevelMax: number;
    monitorLevelPerUnit: number;
    autoGainSeconds: { min: number; max: number; default: number };
    sources: Record<string, number>;
    mixBuses: Record<string, [number, number]>;
    routeDestinations: Record<string, [number, number]>;
    routeSources: Record<string, [number, number]>;
    muteWordFields: Record<string, number>;
    muteWordOffsets: Record<string, number>;
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

/** The spec for a firmware version, or the newest known one when the version isn't recorded. */
export const specFor = (version: string, source: IProtocol = protocol): ISpecChoice => {
    const known = Object.keys(source.firmware).sort(compareVersions);
    const exact = source.firmware[version];
    const chosen = exact ? version : (known.at(-1) ?? "");
    return { version: chosen, isExact: Boolean(exact), spec: source.firmware[chosen] as ISpec };
};

export const newestSpec = (): ISpec => specFor("").spec;
