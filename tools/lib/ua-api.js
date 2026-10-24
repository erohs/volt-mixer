// Client for UAMixerHelper's local JSON API (installed with UAD Console).
// Protocol: send "<verb> <path>[ <arg>]\0"; replies are JSON objects terminated by "\0":
//   {"path": "...", "data": {...}}  or  {"path": "...", "error": "..."}
// Verbs seen so far: get, set, post. Paths are case-sensitive and start with "/".
// Every request rejects on an error reply, a timeout or a closed connection, so a value that
// couldn't be read is never mistaken for one that was.
"use strict";
const net = require("net");

const defaultPort = 4720;

const parseReplies = (buffer) => {
    const parts = buffer.split("\0");
    const rest = parts.pop();
    const replies = parts.flatMap((text) => {
        try {
            return [JSON.parse(text)];
        } catch {
            return [];
        }
    });
    return { replies, rest };
};

// Replies echo the request path, sometimes without the leading slash.
const isReplyTo = (waiter, reply) =>
    typeof reply.path === "string" && (waiter.path === reply.path || waiter.path.endsWith(reply.path));

const createWaiters = () => {
    const waiters = [];
    const settle = (waiter) => {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
    };
    const onReply = (reply) => {
        const waiter = waiters.find((candidate) => isReplyTo(candidate, reply));
        if (!waiter) return;
        settle(waiter);
        if (reply.error) waiter.reject(new Error(`${waiter.verb} ${waiter.path}: ${reply.error}`));
        else waiter.resolve(reply);
    };
    const failAll = (error) => {
        for (const waiter of [...waiters]) {
            settle(waiter);
            waiter.reject(error);
        }
    };
    return { waiters, settle, onReply, failAll };
};

const createRequest = (socket, timeoutMs) => {
    const { waiters, settle, onReply, failAll } = createWaiters();
    let buffer = "";
    socket.on("data", (chunk) => {
        const { replies, rest } = parseReplies(buffer + chunk.toString("utf8"));
        buffer = rest;
        replies.forEach(onReply);
    });
    socket.on("error", failAll);
    socket.on("close", () => failAll(new Error("UA's API closed the connection")));
    return (verb, path, arg) =>
        new Promise((resolve, reject) => {
            const waiter = { verb, path, resolve, reject };
            waiter.timer = setTimeout(() => {
                settle(waiter);
                reject(new Error(`${verb} ${path}: no reply within ${timeoutMs} ms`));
            }, timeoutMs);
            waiters.push(waiter);
            socket.write(`${verb} ${path}${arg === undefined ? "" : " " + arg}\0`);
        });
};

const unwrapValue = (path, data) => {
    const value = data && typeof data === "object" && "value" in data ? data.value : data;
    if (value === undefined || value === null) throw new Error(`get ${path}: no value`);
    return value;
};

const createClient = (socket, timeoutMs) => {
    const request = createRequest(socket, timeoutMs);
    return {
        request,
        get: async (path) => (await request("get", path)).data,
        getValue: async (path) => unwrapValue(path, (await request("get", path + "/value")).data),
        set: (path, value) =>
            request("set", path + "/value", typeof value === "string" ? value : JSON.stringify(value)),
        post: (path, body) => request("post", path, JSON.stringify(body)),
        close: () => socket.end(),
    };
};

const connect = ({ port = defaultPort, host = "127.0.0.1", timeoutMs = 3000 } = {}) =>
    new Promise((resolve, reject) => {
        const socket = net.connect(port, host);
        socket.once("error", reject);
        socket.once("connect", () => {
            socket.removeListener("error", reject);
            resolve(createClient(socket, timeoutMs));
        });
    });

const deviceInfo = (path, props) => ({
    path,
    type: props.device_type?.value || "",
    serial: props.serial_number?.value,
    firmware: props.firmware_version?.value,
    online: props.online?.value,
});

// Finds the connected Volt in /devices (UA's engine also lists a host "device" that isn't hardware).
const findVolt = async (client) => {
    for (const child of (await client.get("/devices"))?.children || []) {
        const path = "/devices/" + child.path;
        const device = deviceInfo(path, (await client.get(path))?.properties || {});
        if (device.type.startsWith("volt")) return device;
    }
    throw new Error("No Volt found in /devices. Is the Volt connected and UAD Console running?");
};

const childNames = async (client, path) => ((await client.get(path))?.children || []).map((child) => child.path);

// Map of display name -> path for the device's buses (mixer channels) and outputs.
const namedChildren = async (client, path) => {
    const named = {};
    for (const name of await childNames(client, path)) {
        const props = (await client.get(path + "/" + name))?.properties || {};
        named[props.name?.value || name] = path + "/" + name;
    }
    return named;
};

const buses = (client, device) => namedChildren(client, device.path + "/buses");
const outputs = (client, device) => namedChildren(client, device.path + "/outputs");
const uidOf = (path) => path.split("/").pop();

// Replace "{dev}" in a user-supplied path with the Volt's device path.
const expand = (path, device) => path.replace("{dev}", device.path);

module.exports = { connect, findVolt, childNames, buses, outputs, uidOf, expand, defaultPort };
