/*
 * Whether another program on this computer has the same Volt open: Volt Mixer's desktop app, or
 * the website in another browser. Every program with the Volt open receives every state reading,
 * so readings this page didn't ask for come from another one. Volt Mixer re-reads every 1.5 s, so
 * it takes two within a few seconds; one alone could be a second tab connecting once.
 */

export interface IOtherProgram {
    /** A state reading arrived that this page didn't ask for (`now` from performance.now()). */
    note: (now: number) => void;
    isOpen: (now: number) => boolean;
    forget: () => void;
}

export const otherProgramWindowMs = 4000;
const readingsNeeded = 2;

export const createOtherProgram = (): IOtherProgram => {
    let times: number[] = [];
    const recent = (now: number): number[] => times.filter((time) => now - time < otherProgramWindowMs);
    return {
        note: (now) => void (times = [...recent(now), now]),
        isOpen: (now) => recent(now).length >= readingsNeeded,
        forget: () => void (times = []),
    };
};
