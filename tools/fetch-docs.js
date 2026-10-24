// Re-downloads UA's Volt docs (Zendesk help-center API) as text into reference/, and reports
// when a doc's version stamp or text changed — new firmware features usually show up here.
//   node fetch-docs.js
"use strict";
const fs = require("fs");
const path = require("path");

const docs = {
    "volt4-gen2-hardware-manual": 54020996577684,
    "uad-console-for-volt-manual": 41288447947284,
    "volt-gen2-faq": 54106322653332,
};
const referenceDir = path.resolve(__dirname, "..", "reference");
const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const toText = (html) =>
    html
        .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/td)[^>]*>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&rsquo;/g, "'")
        .replace(/&[lr]dquo;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/(\r?\n\s*){3,}/g, "\n\n")
        .trim() + "\n";

// Normalise BOM / line endings so only real content changes count.
const normalise = (text) =>
    text
        .replace(/^﻿/, "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .trim();

const stamp = (text, fallback) => ((text && text.match(/\bv\d{6}\b/g)) || []).pop() || fallback;

const fetchArticle = async (id) => {
    const response = await fetch(`https://help.uaudio.com/api/v2/help_center/en-us/articles/${id}.json`, {
        headers: { "User-Agent": userAgent },
    });
    return response.ok ? { article: (await response.json()).article } : { status: response.status };
};

// Keeps the previous version alongside for diffing.
const keepPrevious = (file, old) => {
    const fallback = "previous-" + fs.statSync(file).mtime.toISOString().slice(0, 10);
    fs.writeFileSync(file.replace(/\.txt$/, `.${stamp(old, fallback)}.txt`), old);
};

const refresh = async (name, id) => {
    const { article, status } = await fetchArticle(id);
    if (!article) return console.log(`${name}: HTTP ${status}`);
    const text = toText(article.body);
    const file = path.join(referenceDir, name + ".txt");
    const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (old !== null && normalise(old) === normalise(text))
        return console.log(`${name}: unchanged (${stamp(text, "no version stamp")})`);
    if (old) keepPrevious(file, old);
    fs.writeFileSync(file, text);
    const change = old ? `CHANGED ${stamp(old)} -> ${stamp(text)}` : "saved";
    console.log(`${name}: ${change} (updated ${article.updated_at})`);
};

const main = async () => {
    for (const [name, id] of Object.entries(docs)) await refresh(name, id);
};

main();
