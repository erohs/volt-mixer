// Re-downloads UA's Volt docs (Zendesk help-center API) as text into reference/, and reports
// when a doc's version stamp or text changed — new firmware features usually show up here.
//   node fetch-docs.js
"use strict";
const fs = require("fs");
const path = require("path");

const DOCS = {
    "volt4-gen2-hardware-manual": 54020996577684,
    "uad-console-for-volt-manual": 41288447947284,
    "volt-gen2-faq": 54106322653332,
};
const DIR = path.resolve(__dirname, "..", "reference");
const UA =
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

(async () => {
    for (const [name, id] of Object.entries(DOCS)) {
        const res = await fetch(`https://help.uaudio.com/api/v2/help_center/en-us/articles/${id}.json`, {
            headers: { "User-Agent": UA },
        });
        if (!res.ok) {
            console.log(`${name}: HTTP ${res.status}`);
            continue;
        }
        const { article } = await res.json();
        const text = toText(article.body);
        const file = path.join(DIR, name + ".txt");
        // Normalise BOM / line endings so only real content changes count.
        const norm = (t) =>
            t
                .replace(/^﻿/, "")
                .replace(/\r\n/g, "\n")
                .replace(/[ \t]+\n/g, "\n")
                .trim();
        const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
        const stamp = (t, fallback) => ((t && t.match(/\bv\d{6}\b/g)) || []).pop() || fallback;
        if (old !== null && norm(old) === norm(text)) {
            console.log(`${name}: unchanged (${stamp(text, "no version stamp")})`);
            continue;
        }
        // Keep the previous version alongside for diffing.
        if (old)
            fs.writeFileSync(
                file.replace(
                    /\.txt$/,
                    `.${stamp(old, "previous-" + fs.statSync(file).mtime.toISOString().slice(0, 10))}.txt`,
                ),
                old,
            );
        fs.writeFileSync(file, text);
        console.log(
            `${name}: ${old ? `CHANGED ${stamp(old)} -> ${stamp(text)}` : "saved"} (updated ${article.updated_at})`,
        );
    }
})();
