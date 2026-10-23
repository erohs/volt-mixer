/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
    // The desktop app's Electron-free modules are tested here too (desktop/ has no test runner).
    test: { include: ["src/**/*.test.ts", "desktop/src/**/*.test.ts"] },
});
