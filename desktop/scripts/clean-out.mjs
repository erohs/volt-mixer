// Empties out/ before tsc, which never deletes a file whose source is gone (electron-builder packs all of out/).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

fs.rmSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "out"), { recursive: true, force: true });
