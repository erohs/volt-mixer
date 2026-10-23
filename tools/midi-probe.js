// Sends a SysEx message to the Volt's USB MIDI port and prints anything it sends back.
//   node midi-probe.js f011f7 [listenMs]
"use strict";
const midi = require("@julusian/midi");
const [hex = "f011f7", ms = "2500"] = process.argv.slice(2);
const find = (port, name) => {
    for (let k = 0; k < port.getPortCount(); k++) if (port.getPortName(k).includes(name)) return k;
    return -1;
};
const input = new midi.Input(),
    output = new midi.Output();
const ii = find(input, "Volt"),
    oi = find(output, "Volt");
if (ii < 0 || oi < 0) {
    console.error("Volt MIDI ports not found");
    process.exit(1);
}
input.ignoreTypes(false, true, true); // keep SysEx, drop timing/active sensing
let got = 0;
input.on("message", (dt, msg) => {
    got++;
    console.log("IN ", Buffer.from(msg).toString("hex"));
});
input.openPort(ii);
output.openPort(oi);
const bytes = [...Buffer.from(hex, "hex")];
console.log("OUT", hex);
output.sendMessage(bytes);
setTimeout(() => {
    console.log(got ? `${got} message(s) received` : "no reply");
    input.closePort();
    output.closePort();
    process.exit(0);
}, +ms);
