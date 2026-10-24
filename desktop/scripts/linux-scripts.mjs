// Writes the .deb's install scripts (electron-builder.yml, deb.afterInstall and afterRemove):
// electron-builder's own templates, from the installed version, with Volt Mixer's udev rule added.
// electron-builder can only replace them, not add to them, and a copy would fall behind.
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const desktop = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromBuilder = createRequire(createRequire(import.meta.url).resolve("electron-builder/package.json"));
const templates = path.join(path.dirname(fromBuilder.resolve("app-builder-lib/package.json")), "templates", "linux");
const protocol = JSON.parse(fs.readFileSync(path.join(desktop, "..", "src", "data", "volt4-gen2.json"), "utf8"));

const usbId = (id) => id.toString(16).padStart(4, "0");
const rulesFile = "/etc/udev/rules.d/70-volt-mixer.rules";
const rule = `SUBSYSTEM=="hidraw", ATTRS{idVendor}=="${usbId(protocol.vendorId)}", ATTRS{idProduct}=="${usbId(protocol.productId)}", TAG+="uaccess"`;

const install = [
    "# Volt Mixer: let the signed-in user reach the Volt's HID interface (WebHID needs hidraw access).",
    '# The rule\'s number has to sort before 73-seat-late.rules, which applies "uaccess".',
    `cat > ${rulesFile} <<'RULE'`,
    rule,
    "RULE",
    "udevadm control --reload-rules || true",
    "udevadm trigger --subsystem-match=hidraw || true",
];
const remove = [
    "# Volt Mixer's udev rule (see after-install.sh).",
    `rm -f ${rulesFile}`,
    "udevadm control --reload-rules || true",
];

const write = (name, lines) => {
    const template = fs
        .readFileSync(path.join(templates, `${name}.tpl`), "utf8")
        .replace(/\r\n/g, "\n")
        .trimEnd();
    fs.writeFileSync(path.join(desktop, "build", "linux", `${name}.sh`), `${template}\n\n${lines.join("\n")}\n`);
};

write("after-install", install);
write("after-remove", remove);
