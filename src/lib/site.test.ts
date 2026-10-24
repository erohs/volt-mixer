import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { site, websiteUrlOf } from "./site.ts";

/* The desktop app reads its addresses from its package.json (electron-builder does too). */
const desktopPackage = JSON.parse(readFileSync(new URL("../../desktop/package.json", import.meta.url), "utf8")) as {
    homepage: string;
    repository: { url: string };
};

describe("Using websiteUrlOf, when the build is the website's", () => {
    test("then it should give the page under the website's folder", () => {
        expect(websiteUrlOf("/volt-mixer/guide/channels/", "/volt-mixer/")).toBe(`${site.websiteUrl}guide/channels/`);
    });
});

describe("Using websiteUrlOf, when the build is served from its own root", () => {
    test("then it should still give the page on the website", () => {
        expect(websiteUrlOf("/privacy/", "/")).toBe(`${site.websiteUrl}privacy/`);
    });
});

describe("Using websiteUrlOf, when the page is the mixer", () => {
    test("then it should give the website itself", () => {
        expect(websiteUrlOf("/", "/")).toBe(site.websiteUrl);
    });
});

describe("Using the desktop app's package.json, when it names the website", () => {
    test("then it should name the same address as the site", () => {
        expect(desktopPackage.homepage).toBe(site.websiteUrl);
    });
});

describe("Using the desktop app's package.json, when it names the repository", () => {
    test("then it should name the same repository as the site", () => {
        expect(desktopPackage.repository.url.replace(/\.git$/, "")).toBe(site.repositoryUrl);
    });
});
