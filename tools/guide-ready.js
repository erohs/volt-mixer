// Runs in each page before the page's own scripts, for guide-images.mjs: guideReady() resolves once
// the page has settled, instead of a fixed wait. Settled: fonts and images loaded, every short timer
// the page set has run (a notice fills in 50 ms after it's shown) and every transition has ended.
(() => {
    const shortMs = 500;
    const limitMs = 10000;
    const pending = new Set();
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);

    window.setTimeout = (callback, delay = 0, ...args) => {
        if (typeof callback !== "function" || delay > shortMs) return nativeSetTimeout(callback, delay, ...args);
        const id = nativeSetTimeout(() => {
            pending.delete(id);
            callback(...args);
        }, delay);
        pending.add(id);
        return id;
    };
    window.clearTimeout = (id) => {
        pending.delete(id);
        nativeClearTimeout(id);
    };

    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const isFinite = (animation) => animation.effect?.getTiming().iterations !== Infinity;

    const timersDone = async () => {
        const deadline = performance.now() + limitMs;
        while (pending.size) {
            if (performance.now() > deadline) throw new Error("The page keeps setting short timers; it never settles.");
            await frame();
        }
    };

    window.guideReady = async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
        await timersDone();
        await Promise.all(
            document
                .getAnimations()
                .filter(isFinite)
                .map((animation) => animation.finished),
        );
        await frame();
        await frame();
    };
})();
