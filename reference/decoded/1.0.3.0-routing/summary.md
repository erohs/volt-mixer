# Decoded capture

Capture: `volt-20261023-160808-hub1.pcap`, Volt bus address 6, 8178 non-audio transfers, 16 steps.

| Parameter | Steps | Commands per step | Payload bytes that vary | Example (first value) | Device reports |
|---|---|---|---|---|---|
| idle | 2 | 0 | — | `` | 0 |
| CUE 2 MIX off | 1 | 0 | — | `` | 0 |
| HP source cue2 | 1 | 4 | — | `f0021a3e00f70000000000000000000000000000000000000000000000000000` | 0 |
| CUE 2 mirror LINE 3-4 | 1 | 2 | — | `f002024200f70000000000000000000000000000000000000000000000000000` | 0 |
| CUE 2 mirror None | 1 | 2 | — | `f002021c00f70000000000000000000000000000000000000000000000000000` | 0 |
| HP source cue1 | 1 | 2 | — | `f0021a3e00f70000000000000000000000000000000000000000000000000000` | 0 |
| CUE 2 MIX on | 1 | 0 | — | `` | 0 |
| CUE 1 MIX off | 1 | 2 | — | `f0021a4000f70000000000000000000000000000000000000000000000000000` | 0 |
| CUE 1 mirror LINE 3-4 | 1 | 2 | — | `f002024000f70000000000000000000000000000000000000000000000000000` | 0 |
| CUE 1 mirror None | 1 | 2 | — | `f002021c00f70000000000000000000000000000000000000000000000000000` | 0 |
| CUE 1 MIX on | 1 | 4 | — | `f0021a3e00f70000000000000000000000000000000000000000000000000000` | 0 |
| auto-gain run (5 s) start | 1 | 0 | — | `` | 0 |
| auto-gain run (5 s) stop | 1 | 0 | — | `` | 0 |
| auto-gain cancel start | 1 | 0 | — | `` | 0 |
| auto-gain cancel stop | 1 | 0 | — | `` | 0 |
