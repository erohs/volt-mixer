# Maintaining the Volt controller

UA can change three things under us: **firmware** (the HID bytes), **UAD Console / UAMixerHelper** (the JSON API we use as the reference), and **docs** (new features). Everything here runs on the **home PC**, which has UA software, USBPcap and Wireshark. The work laptop never needs anything.

## Quick check after any UA update (2 minutes)

```bash
cd tools
node fingerprint.js        # versions: firmware, Console, helper, driver, HID report sizes; prints what changed
node fetch-docs.js         # re-downloads the manuals; prints CHANGED if UA edited them
```

- **Nothing changed:** stop here.
- **Only Console/UA Connect versions changed:** the page talks to the hardware directly, so it's probably unaffected. Open the page and spot-check a fader.
- **Firmware or HID report sizes changed:** do the full re-capture below.
- **A doc changed:** diff `reference/<doc>.txt` against the saved `reference/<doc>.<version>.txt` for new or removed features, then update the feature table in the plan or `PROTOCOL.md`.

## Full re-capture (about 15 minutes, mostly unattended)

1. Take headphones off, turn speakers down, and unplug ribbon mics. 48V only toggles on empty XLR inputs, but be safe. Unplug anything on Line Out 3/4 and set both cues' Mirror to None (Line Out 3/4 can't be muted, so a run refuses to start while a cue is mirrored).
2. Make sure UAD Console is running (it starts the helper on `127.0.0.1:4720`).
3. `node ua.js snapshot ../captures/snapshot-before.json`
4. `powershell -File run-capture.ps1` (accept the admin prompt, which is only for USBPcap). It:
    - starts USBPcap on the Volt's root hub, recording only the Volt's device address when USBPcap lists it,
    - runs `capture-run.js` as you, which saves a full snapshot to `captures/snapshot-before-run.json`, mutes MONITOR and HEADPHONE for the whole run, and steps every setting through the API with timestamps (output levels only ever down, never below 0),
    - restores the snapshot at the end (also after an error or Ctrl+C), compares every setting, and exits 1 with a list if anything differs.
      If anything is left wrong: `node ua.js restore`.
5. `node ua.js diff ../captures/snapshot-before.json` compares your own before snapshot with the Volt now. It should say `identical`.
6. Hardware-only controls (knob, buttons, display menu): `powershell -File run-capture.ps1 -Mode manual`, do the actions in the order listed in `PROTOCOL.md`, then press Enter.
7. Decode:
    ```bash
    node decode-capture.js ../captures/volt-<stamp>-hub1.pcap ../captures/run-log.jsonl
    ```
    This writes `reference/decoded/<firmware>/{steps,packets}.json` and `summary.md`: per parameter, which payload bytes change.
8. Compare with the previous firmware's folder in `reference/decoded/`. Usually only a few parameters move.
9. Add the new firmware to `src/data/volt4-gen2.json` (see "Protocol data" below), add the new decoded folder to the capture tests in `src/lib/commands.test.ts`, run `pnpm test`, and try the page on the home PC with Console closed.

## Protocol data

The page keeps the protocol as data in `src/data/volt4-gen2.json`, keyed by firmware version, so a firmware change means a new data file, not code edits. If the page sees a firmware version it hasn't been checked against, it uses the newest known spec in **read-only** mode: it shows the Volt's settings but sends nothing until the user presses "Use anyway".

## Tools

Run `pnpm test` in the repository root after any change. It runs the library tests (including re-encoding every decoded capture), and the colour-contrast check over `src/styles/tokens.css`.

| Tool                         | What it does                                                                                                                     | Writes to the Volt?       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `tools/ua.js`                | API CLI: `info`, `get`, `set`, `tree`, `controls`, `snapshot`, `diff`, `restore` (from a snapshot)                               | only `set` and `restore`  |
| `tools/lib/ua-api.js`        | shared API client; finds the Volt automatically; every request fails on an error or timeout                                      | —                         |
| `tools/lib/ua-snapshot.js`   | full snapshot of every API setting, diff, and restore (outputs last)                                                             | only restore              |
| `tools/lib/safe-run.js`      | a run's rules: snapshot first, outputs muted throughout, levels only down, one restore and check at the end                      | —                         |
| `tools/lib/volt-hid.mjs`     | opens the Volt's control interface by the ids in `src/data`, sends and awaits reports                                            | —                         |
| `tools/capture-run.js`       | automated sweep with step log, snapshot, restore and check (`--dry-run` is read-only)                                            | yes, restored afterwards  |
| `tools/run-capture.ps1`      | USBPcap capture around the sweep, `-Mode startup` (Console start-up) or `-Mode manual` (user-paced prompts, `-From N` to resume) | via capture-run           |
| `tools/usbpcap.ps1`          | the only elevated part: starts and stops USBPcapCMD for run-capture                                                              | no                        |
| `tools/manual-prompts.js`    | step-by-step front-panel prompts; waits for Enter after each                                                                     | no                        |
| `tools/decode-capture.js`    | pcap + step log → per-parameter HID bytes (serial redacted)                                                                      | no                        |
| `tools/state-probe.mjs`      | maps the state dump by changing one setting at a time, quieter where it can (`--dump` = read-only)                               | yes, restored and checked |
| `tools/meter-probe.mjs`      | summarises the meter stream for one labelled test; `--raw <offset>` prints one meter's raw values, to spot odd flags or spikes   | no                        |
| `tools/brightness-probe.mjs` | user-paced runs of brightness changes; asks what the display shows, restores the brightness after                                | yes, restored afterwards  |
| `tools/fingerprint.js`       | version/HID fingerprint and diff (`--check` exits 1 on change)                                                                   | no                        |
| `tools/fetch-docs.js`        | refresh UA manuals and flag changes                                                                                              | no                        |
| `tools/hid-caps.ps1`         | HID report sizes of the Volt's control interface                                                                                 | no                        |

## Kept local, not in git

`captures/` (raw pcaps and logs) and `reference/ua-api-*.json` contain the unit's serial number. UA's manual text is UA's copyright. `.gitignore` excludes all of these. Decoded output replaces device paths with `{dev}`.
