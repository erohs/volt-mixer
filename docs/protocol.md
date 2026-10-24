# Volt 4 Gen 2 control protocol notes

Status (firmware 1.0.3.0): **decoded and verified**: commands, front-panel notifications and the state dump. `node tools/verify-protocol.mjs <decoded-dir>` re-checks the encoder against any capture.

## Layer 2: USB HID (what the web page speaks)

- Interface: `VID_2B5A&PID_002E&MI_06`, usage page `0xFF01`. Interrupt OUT endpoint `0x01` carries 39-byte output reports; interrupt IN endpoint `0x84` carries 74-byte input reports.
- **Numbered HID reports.** Commands are output report `0xF0` with 38 data bytes `<cmd> <payload…> F7`, zero-padded (on the wire this looks like SysEx: `F0 <cmd> … F7`). In WebHID: `sendReport(0xF0, data)`. Other reports: `0xE8` out (identify request), `0x0E` in (identify reply), `0xF0` in (state reply and front-panel notifications), `0xF1` in (meters).
- Evidence: `reference/decoded/1.0.3.0/` (automated sweep) and `reference/decoded/1.0.3.0-startup/` (Console start-up). Re-generate them with `tools/decode-capture.js`.

### Host → device

| Cmd              | Payload                        | Meaning                                                                                                                                             | Notes                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F0 01`          | `<src> <dst> <u32 LE>`         | mixer crosspoint gain                                                                                                                               | value = 10^(dB/20) × panLaw × 2^29. Equal-power pan: L = cos((p+1)π/4), R = sin((p+1)π/4); centre = 0x16A09E60. 0 = off. Fader range −∞…+12 dB                                                                                                                                                                          |
| `F0 02`          | `<dst> <src> 00`               | output routing                                                                                                                                      | dst: `00/01` Monitor L/R, `02/03` Line Out 3/4, `1a/1b` Headphone L/R. src: `3e/3f` Monitor mix, `40/41` Cue 1 mix, `42/43` Cue 2 mix, `1c/1d` computer playback 3/4 (the default)                                                                                                                                      |
| `F0 03`          | `<mask>`                       | per-input preamp flag (sent with each preamp block; likely polarity)                                                                                | always 0 on Volt 4 Gen 2                                                                                                                                                                                                                                                                                                |
| `F0 04`          | `<mask>`                       | 48V: bit0 = In1, bit1 = In2                                                                                                                         | absolute mask                                                                                                                                                                                                                                                                                                           |
| `F0 06`          | `<mask>`                       | per-input preamp flag (likely Max compressor)                                                                                                       | always 0 on Volt 4 Gen 2                                                                                                                                                                                                                                                                                                |
| `F0 08`          | `<0/1>`                        | digital input format: 0 = ADAT, 1 = S/PDIF                                                                                                          | Console then zeroes digital crosspoints                                                                                                                                                                                                                                                                                 |
| `F0 11`          | —                              | request state dump (reply `F0 11 …` on IN)                                                                                                          | sent at start-up                                                                                                                                                                                                                                                                                                        |
| `F0 12`          | `02 <0x10 \| mask>`            | stereo-link state: bit0 = pair 1-2, bit1 = pair 3-4 (`11` link 1-2, `12` link 3-4, `10` none)                                                       | Console then re-sends the pair's preamp block and crosspoints (hard L/R)                                                                                                                                                                                                                                                |
| `F0 13`          | `00`                           | start-up setup (unknown)                                                                                                                            |                                                                                                                                                                                                                                                                                                                         |
| `F0 15`          | `<a> 00 <b> 00 <c> 00 <field>` | mute word: field `01` → `a` = mask of inputs with Direct on (bit0 = In1 … bit3 = In4); field `04` → `b` = monitor mute; `08`, `10` seen at start-up | absolute values                                                                                                                                                                                                                                                                                                         |
| `F0 16`          | `<ch> <u16 LE>`                | preamp gain, 0.1 dB steps (0…600)                                                                                                                   | ch 0 = In1, 1 = In2                                                                                                                                                                                                                                                                                                     |
| `F0 18`          | `00 <0/1>`                     | monitor mono                                                                                                                                        |                                                                                                                                                                                                                                                                                                                         |
| `F0 1D`          | `<mask> <seconds>`             | start the Volt's own Auto-Gain on the preamps in `mask` (bit0 In1, bit1 In2) for 5–90 s                                                             | confirmed on hardware: the display shows "AUTO-GAIN" and a "Listening" countdown bar, then returns to its normal view with no result message (seen with an empty input, and with a mic signal, where it kept the gain). No progress over USB; no cancel command seen                                                    |
| `F0 1C`          | `<u16 LE> <mute>`              | headphone level (×10; 79.6 → 0x031C) and mute                                                                                                       | monitor level TBD                                                                                                                                                                                                                                                                                                       |
| `F0 1F`          | `<0/1>`                        | Clip Protection                                                                                                                                     |                                                                                                                                                                                                                                                                                                                         |
| `F0 21`          | `<u8>`                         | display brightness (raw; Console uses 217)                                                                                                          | the display eases to a new level, and a change that arrives mid-way can leave it stuck short of the stored value (the state dump still reads the new one); sending the same value again unsticks it. The page sends brightness at most every 50 ms and repeats the last one 500 ms later (`tools/brightness-probe.mjs`) |
| `F0 22`          | `<b0> <b1> 00 00`              | Tone per input as nibbles: b0 = In1 (low), In2 (high); b1 = In3 (low), In4 (high). 0 Off, 1 Warmth, 2 Focus, 3 Shine                                | absolute values                                                                                                                                                                                                                                                                                                         |
| `E8 00 00 74 FF` | —                              | first packet at Console start-up (not F0-framed)                                                                                                    | handshake/meter enable?                                                                                                                                                                                                                                                                                                 |

Mixer `src` IDs: `00–03` In1–4, `08/09` S/PDIF L/R, `0a–11` ADAT 1–8, `1e` talkback (unused), `1f/20` Loopback L/R.
Mixer `dst` IDs: `00/01` Monitor mix L/R, `02/03` Cue 1 L/R, `04/05` Cue 2 L/R.

**Done on the host, not in firmware:** pan (folded into the crosspoint gains), solo (Console rewrites all crosspoints), mute for digital/loopback channels (crosspoint = 0), and stereo link (paired crosspoints). The page has to reproduce this logic.

**Not over USB MIDI (tested 2026-10-23):** sending `F0 11 F7` and `F0 17 F7` as SysEx to the Volt's USB MIDI port (`tools/midi-probe.js`) got no reply and no light flash, while the same Identify over HID flashed the lights. The MIDI port appears to pass through to the MIDI jacks only, so Web MIDI (and therefore Firefox) can't control the mixer.

**Not over HID:** sample rate and clock source go as USB Audio Class control requests through the driver. The page can't set them; they're shown read-only or left out.


### Monitor level (field `10` of the `F0 15` mute word)

- The Volt reports monitor level as `F0 15 00 00 00 00 <lvl> 00 10` on the IN endpoint whenever the knob turns, in steps of 10 (0x0a). 0 = minimum. Fast turns accelerate.
- Range: one byte. Console's knob sent 0…196 (`reference/decoded/1.0.3.0-manual`); the true maximum isn't confirmed, so the encoder clamps to 0…255.
- Console _sets_ it with the same layout on OUT (it sends `…00 10` = level 0 at start-up).
- **Quirk:** turning the knob below 0 makes the level jump up to 50 or 100 (loud). Seen twice in `reference/decoded/1.0.3.0-knob`. The page must clamp to ≥ 0 and never step below the minimum.

### Device → host

- **Front-panel changes come back in the same format as the commands** (from `reference/decoded/1.0.3.0-manual`). One parser handles both directions, and the page can follow the hardware live:
    - knob press (mute) → `F0 15 … 04` (monitor) / `F0 1C <lvl> <mute>` (headphones)
    - headphone knob → `F0 1C <u16 LE>`, steps of 10 raw (1.0) per click
    - monitor knob → `F0 15 00 00 00 00 <lvl> 00 10` (see above); Console sets it in finer steps
    - TONE → `F0 22 …`, DIRECT → `F0 15 <mask> … 01`, 48V → `F0 04 <mask>`, gain knob → `F0 16 <ch> <u16 LE>` (0.1 dB per slow click)
    - hold INPUT (link/unlink) → `F0 12 02 <mask>` (same mask as above, without `0x10`). Console answers by rewriting the pair's crosspoints (≈218 commands: hard L/R pan, cue sends). Pressing INPUT also emits `F0 12 01 00` / `F0 12 02 00` (field 1 not decoded)
    - Meter View and the Smart Display menu: no USB traffic (display-only)
- Host → device extras: `F0 17` = Identify (flash the lights).
- `F1 0C …` (74 B): meter stream, continuous even with no software running.
- `F0 11 …`: state-dump reply (send `F0 11 F7` to request it). Mapped by `tools/state-probe.mjs` (one setting at a time, restored after; evidence in `reference/decoded/1.0.3-state/state-map.json`). Byte offsets after `F0 11`:

    | Offset | Field                          | Encoding                                    |
    | ------ | ------------------------------ | ------------------------------------------- |
    | 1      | 48V                            | mask: bit0 In1, bit1 In2                    |
    | 6      | digital input format           | 0 ADAT, 1 S/PDIF                            |
    | 11     | stereo links                   | mask: bit0 pair 1-2, bit1 pair 3-4          |
    | 14     | Direct (unmuted analog inputs) | mask: bit0 In1 … bit3 In4                   |
    | 16     | monitor mute                   | 0/1                                         |
    | 18     | monitor level                  | u8 (0 = minimum)                            |
    | 20, 22 | preamp gain In1, In2           | u16 LE, 0.1 dB                              |
    | 36     | monitor mono                   | 0/1                                         |
    | 42     | headphone level                | u16 LE (raw; 796 = 79.6)                    |
    | 44     | Clip Protection                | 0/1                                         |
    | 45     | display brightness             | u8                                          |
    | 46, 47 | Tone                           | nibbles: In1 low/In2 high, In3 low/In4 high |
    | 56     | headphone mute                 | 0/1                                         |

    Unmapped bytes with non-zero baseline values: 10 (`02`), 37–38 (`01 a0`), 51 (`04`). They're probably sample rate or clock; not needed by the page.

- **Not in the dump:** crosspoint gains (fader and pan positions). UA's software keeps them on the host too, so the page remembers them per computer.

## Layer 1 — UAMixerHelper JSON API (reference for names and ranges)

UA's mixer helper listens on `127.0.0.1:4720`. Send `get <path>\0` and it replies with JSON `{"path":…,"data":{"properties":…,"children":[…],"commands":[…]}}\0`.
Tools: `tools/uaget.js`, `tools/crawl.js`, `tools/snapshot.js` (read-only). Run them with `MSYS_NO_PATHCONV=1` in Git Bash.
Raw dumps: `reference/ua-api-tree-devices.json`, `reference/ua-api-snapshot.json`.

Device: `/devices/<id>`, where `<id>` is the unit's serial number in ASCII hex, zero-padded to 16 bytes. `tools/lib/ua-api.js` `findVolt()` looks it up, so nothing is hard-coded.

### Device properties (global)

| Property             | Values seen                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `sample_rate`        | 44100, 48000, 88200, 96000, 176400, 192000                                                                                              |
| `clock_source`       | Internal, ADAT (S/PDIF appears when `tos_link` = S/PDIF)                                                                                |
| `tos_link`           | ADAT / S/PDIF (digital input format)                                                                                                    |
| `no_clip`            | true = Clip Protection on                                                                                                               |
| `display_brightness` | 217 (raw light level. It looks off below about raw 8 and close to full by about 145, so the page's slider spreads raw 8–145 over 1–90%) |
| `firmware_version`   | 1.0.3.0                                                                                                                                 |
| commands             | `clear_solos`, `link_channels`, `undo`, `redo`                                                                                          |

### Buses (`…/buses/<uid>`, `channel_id` is stable)

Mono buses are odd/even pairs. The paired stereo bus is `enabled=true` only while the pair is linked.

| ch           | Bus                | Kind                                  | Preamp controls   |
| ------------ | ------------------ | ------------------------------------- | ----------------- |
| 3 / 5 / 7    | ANALOG 1 / 2 / 1-2 | MicLineHiZ                            | gain, tone        |
| 9 / 11 / 13  | ANALOG 3 / 4 / 3-4 | Line                                  | tone (gain fixed) |
| 15 / 17 / 19 | S/PDIF / L / R     | digital                               | —                 |
| 21–43        | ADAT 1…8 and pairs | digital                               | —                 |
| 45 / 47 / 49 | LOOPBACK / L / R   | loopback (stereo by default)          | —                 |
| 51           | TALKBACK           | n/a on Volt 4 Gen 2                   | —                 |
| 53           | MONITOR            | master: gain = monitor level, mute    | —                 |
| 55           | HEADPHONE          | headphone: gain (raw 79.6 seen), mute | —                 |
| 57 / 59      | CUE 1 / CUE 2      | cue bus                               | —                 |

### Per-input controls

- `controls/preamp_gain`, `controls/preamp_tone` (4 steps: Off/Warmth/Focus/Shine), `controls/solo`
- `outputs/main/controls/{gain, pan | pan_left+pan_right, mute}`: monitor-mix fader (dB, 0 = unity, −144 = −∞), pan −1…1, mute 1 = muted
- `outputs/cue_0|cue_1/controls/{gain, pan…, mute, pre_fader}`: cue sends (pre-fader by default)
- `jack_detect/*`: plug detection (read-only)
- Read-only bus flags: `linking_allowed`, `preamp_enabled`, `preamp_embedded_auto_gain_active`

### Present in the model but not on Volt 4 Gen 2 (keep hidden)

`preamp_compressor` (Max), `preamp_invert` (876), talkback, `alt_monitor`, `dim_on`, inserts/effects.

### Meters (report `F1`, 74 bytes, 50 per second)

Mapped with `tools/meter-probe.mjs` using known signals (`reference/decoded/meters.jsonl`): silence, computer audio only, PS5 only, and a −30 dBFS test tone left only / right only.

- Values are **u16 little-endian, linear peak**, the level in the low 15 bits (bit 15 is a flag, seen set now and then on Input 1's preamp meter at noise-floor levels; meaning unknown), full scale 32767: dBFS = 20·log10(v / 32767). The −30 dBFS tone read ≈1,040.
- Offsets (from the report-ID byte): **Line 3 = 7, Line 4 = 9** (inputs, measured before the monitor mute) and **monitor out L = 55, R = 57**, all confirmed with signals, plus **In 1 = 3** (mic test). **In 2 = 5** is inferred from the pattern.
- Monitor out L/R is the monitor mix output. The PS5 and mic also showed there because those inputs had Direct monitoring on at the time (confirmed via UA's API), so they really were in the mix.
- The bytes in between (11–53, 59–71) stayed zero in every test. They're probably S/PDIF/ADAT, loopback and cue buses, unconfirmed.
- Bytes 1–2 are always `0C 23` (meter sub-type and length?).

### Cue routing (verified, `reference/decoded/1.0.3.0-routing`)

Console's model: each cue has MIX on (`mix_in_source = "mon"`: its outputs carry the monitor mix) or off (`""`: the cue's own mix). The headphones follow one cue (`HP 1.mix_in_source = cue1 | cue2`), and a cue can be mirrored to Line Out 3/4 (`flex_route = "LINE 3-4" | "None"`). On the wire these are only `F0 02` routes for the headphone (`1a/1b`) and Line Out 3/4 (`02/03`) destinations. When the headphones switch, Console first resets them to the monitor mix, then sets the new source.
