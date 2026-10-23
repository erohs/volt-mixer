# Decoded capture

Capture: `volt-20261023-161130-hub1.pcap`, Volt bus address 6, 5978 non-audio transfers, 5 steps.

| Parameter | Steps | Commands per step | Payload bytes that vary | Example (first value) | Device reports |
|---|---|---|---|---|---|
| idle | 2 | 0 | — | `` | 0 |
| auto-gain run (5 s) | 1 | 1 | — | `f01d0205f7000000000000000000000000000000000000000000000000000000` | 0 |
| auto-gain cancel start | 1 | 1 | — | `f01d020af7000000000000000000000000000000000000000000000000000000` | 0 |
| auto-gain cancel stop | 1 | 0 | — | `` | 0 |
