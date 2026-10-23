# Decisions

Choices the code cannot explain, and where this project differs from naovixen's conventions.

## WebHID, so Edge and Chrome only

The Volt's mixer is controlled with HID output reports (`docs/protocol.md`). Only Chromium
browsers ship WebHID. Its USB MIDI port doesn't reach the mixer (tested: SysEx is ignored), so Web
MIDI isn't an alternative. Firefox and Safari get a clear "open this in Edge or Chrome" message.
This departs from naovixen's "every current browser gets the same experience", because no
cross-browser way exists.

## Script is required

Talking to USB needs script, so the page can't work without it (naovixen's "works with JavaScript
off"). With script off it explains what it is and what it needs.

## The page owns the mix, like UAD Console

The Volt reports everything except crosspoint gains (fader, pan and cue-send positions) and cue
routing. Console doesn't read them either: it pushes its own saved mix every time it starts.
The page does the same: on connect it reads the state dump, then applies this computer's saved mix
(per Volt serial, in localStorage). Readable settings (mutes, 48V, gain, tone, links, levels) always
come from the Volt. Each computer keeps its own copy; a `#mix=` link carries it to the other one.
Until a computer has a mix, no level is sent. `docs/remote-sync.md` looks at keeping that copy in
step over the network, and at phone control.

## Relative sliders instead of ramps

A click on a slider never jumps its value; it moves only as far as the pointer travels. End goes to
0 dB on faders and does nothing on level controls. This prevents sudden loud jumps without ramping
levels in code.

## Lean toolchain

Astro, TypeScript, Vitest and Prettier. No ESLint, Stylelint, Playwright or axe packages: browser
and accessibility checks are done by hand with the Claude in Chrome extension. The 25-line function
and 400-line file limits are followed by hand.

## Tools stay JavaScript

`tools/` is the home-PC capture kit (USBPcap, node-hid, UA's local API). It isn't deployed, runs
against real hardware, and changes slowly, so it stays plain Node scripts. It imports `src/lib`
directly (Node 24 runs TypeScript), so there's one protocol implementation.

## Panels scroll their body, never their header

A dialog (or any panel with a title bar) is a column: the header stays put and only the body
scrolls, so the scrollbar starts below the header line rather than running beside it.
`src/components/ui/Dialog.astro` does this for every dialog; new panels follow the same pattern
instead of a sticky header inside a scrolling box.
