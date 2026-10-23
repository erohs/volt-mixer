# Decoded capture

Capture: `volt-20261023-133402-hub1.pcap`, Volt bus address 6, 60432 non-audio transfers, 35 steps.

| Parameter | Steps | Commands per step | Payload bytes that vary | Example (first value) | Device reports |
|---|---|---|---|---|---|
| idle | 18 | 0 | — | `` | 0 |
| monitor mute (knob press) | 1 | 0 | — | `` | 2 |
| select headphones | 1 | 0 | — | `` | 0 |
| headphone knob | 1 | 0 | — | `` | 4 |
| headphone mute (knob press) | 1 | 0 | — | `` | 2 |
| select monitor | 1 | 0 | — | `` | 0 |
| console monitor knob | 1 | 155 | — | `f01500000000100010f700000000000000000000000000000000000000000000` | 0 |
| select input 1 | 1 | 0 | — | `` | 0 |
| tone button | 1 | 0 | — | `` | 4 |
| direct button | 1 | 0 | — | `` | 2 |
| 48v button | 1 | 0 | — | `` | 2 |
| gain knob | 1 | 0 | — | `` | 4 |
| select line 3 | 1 | 0 | — | `` | 2 |
| link 3-4 (hold input) | 1 | 218 | — | `f0010200609ea016f70000000000000000000000000000000000000000000000` | 4 |
| meter view | 1 | 0 | — | `` | 0 |
| console identify | 1 | 1 | — | `f017f70000000000000000000000000000000000000000000000000000000000` | 0 |
| console hp source | 1 | 8 | — | `f0011f0400000000f70000000000000000000000000000000000000000000000` | 0 |
| console cue2 mix | 1 | 0 | — | `` | 0 |
