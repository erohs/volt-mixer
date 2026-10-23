// Client for UAMixerHelper's local JSON API (installed with UAD Console).
// Protocol: send "<verb> <path>[ <arg>]\0"; replies are JSON objects terminated by "\0":
//   {"path": "...", "data": {...}}  or  {"path": "...", "error": "..."}
// Verbs seen so far: get, set. Paths are case-sensitive and start with "/".
"use strict";
const net = require("net");

const DEFAULT_PORT = 4720;

function connect({ port = DEFAULT_PORT, host = "127.0.0.1", timeoutMs = 3000 } = {}) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(port, host);
        let buf = "";
        const waiters = [];
        sock.on("data", (chunk) => {
            buf += chunk.toString("utf8");
            let i;
            while ((i = buf.indexOf("\0")) >= 0) {
                const msg = buf.slice(0, i);
                buf = buf.slice(i + 1);
                let j;
                try {
                    j = JSON.parse(msg);
                } catch {
                    continue;
                }
                // Replies echo the request path (sometimes without the leading slash).
                const w = waiters.findIndex((w) => w.path === j.path || w.path.endsWith(j.path));
                if (w >= 0) waiters.splice(w, 1)[0].resolve(j);
            }
        });
        sock.once("error", reject);
        sock.once("connect", () => {
            sock.removeListener("error", reject);
            sock.on("error", () => {});

            const request = (verb, path, arg) =>
                new Promise((res) => {
                    const w = { path, resolve: res };
                    waiters.push(w);
                    sock.write(`${verb} ${path}${arg === undefined ? "" : " " + arg}\0`);
                    setTimeout(() => {
                        const k = waiters.indexOf(w);
                        if (k >= 0) {
                            waiters.splice(k, 1);
                            res({ path, error: "timeout" });
                        }
                    }, timeoutMs);
                });

            const client = {
                request,
                async get(path) {
                    return (await request("get", path)).data;
                },
                async getValue(path) {
                    const d = (await request("get", path + "/value")).data;
                    return d && typeof d === "object" && "value" in d ? d.value : d;
                },
                async set(path, value) {
                    const arg = typeof value === "string" ? value : JSON.stringify(value);
                    return request("set", path + "/value", arg);
                },
                close() {
                    sock.end();
                },
            };
            resolve(client);
        });
    });
}

// Finds the connected Volt in /devices (UA's engine also lists a host "device" that isn't hardware).
async function findVolt(client) {
    const devices = (await client.get("/devices"))?.children || [];
    for (const c of devices) {
        const p = "/devices/" + c.path;
        const props = (await client.get(p))?.properties || {};
        const type = props.device_type?.value || "";
        if (type.startsWith("volt")) {
            return {
                path: p,
                type,
                serial: props.serial_number?.value,
                firmware: props.firmware_version?.value,
                online: props.online?.value,
            };
        }
    }
    throw new Error("No Volt found in /devices. Is the Volt connected and UAD Console running?");
}

async function childNames(client, path) {
    return ((await client.get(path))?.children || []).map((c) => c.path);
}

// Map of display name -> path for the device's buses (mixer channels) and outputs.
async function namedChildren(client, path) {
    const out = {};
    for (const c of await childNames(client, path)) {
        const props = (await client.get(path + "/" + c))?.properties || {};
        out[props.name?.value || c] = path + "/" + c;
    }
    return out;
}

const buses = (client, dev) => namedChildren(client, dev.path + "/buses");
const outputs = (client, dev) => namedChildren(client, dev.path + "/outputs");

// Replace "{dev}" in a user-supplied path with the Volt's device path.
const expand = (path, dev) => path.replace("{dev}", dev.path);

module.exports = { connect, findVolt, childNames, buses, outputs, expand, DEFAULT_PORT };
