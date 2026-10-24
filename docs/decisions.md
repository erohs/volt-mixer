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

A click on a slider never jumps its value; it moves only as far as the pointer travels. End and a
double-click go to 0 dB on faders and cue sends, from anywhere (kept on purpose, like a console's
reset), and do nothing louder on level controls. This prevents sudden loud jumps without ramping
levels in code.

## A link takes the quieter side

Console copies the left channel to the right when a pair links, which can turn the right side up.
Here a link, from the page or the Volt's INPUT button, gives both sides the quieter side's
settings instead: the lower fader and sends, muted if either is, and on Inputs 1/2 the lower
preamp gain (`matchQuieterMix`, `matchQuieterGain` in `src/lib/mixer.ts`). A saved mix whose
linked sides differ is evened out the same way. So a link can only turn things down.

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

## The desktop app is Electron, and the page drives the Volt there too

`desktop/` wraps the same site in Electron for home computers that want it without a browser,
with a tray mixer. Electron ships Chromium, so WebHID works the same on Windows, macOS and Linux
and the page's own connection code (`src/scripts/volt-connection.ts`) runs unchanged; main only
grants the permission Chrome would ask for. A smaller shell (Tauri) uses the system web view, which
has no WebHID on macOS or Linux, so the USB part would have to be rewritten natively.

- The site is served from `app://volt/`, a secure origin where its root-absolute URLs resolve, with
  a strict CSP (`script-src 'self'`; `public/theme.js` is a file for that reason).
- The main window keeps the only connection to the Volt, so it's hidden rather than closed while
  the app is in the tray (`backgroundThrottling: false`, and `commit()` doesn't rely on animation
  frames). The tray window (`src/pages/tray`) only draws rows and sends intents
  (`src/lib/intents.ts`) over a `BroadcastChannel`; the main window checks and applies them.
- Builds are unsigned (GitHub Releases): no paid certificates. macOS builds are signed ad hoc so
  Apple silicon opens them. Updates are a check and a link, not an automatic install.
- Electron, electron-builder and the main process's TypeScript live in `desktop/` with their own
  `package.json`, so the site's toolchain stays Astro, TypeScript, Vitest and Prettier.

## Other devices without a server

Nothing is hosted, so nothing needs an account and the work laptop reaches nothing new
(`docs/remote-sync.md`). A mix travels as a short `#m=` link or QR code: a compact binary form
that rounds levels down, so a link can never make anything louder. The phone remote is the tray
page served by the app on the home network, behind a token from a QR code. Phones send
switches as target states (`to`) and every change with a rising sequence number, so a message
that arrives twice or late can't undo a newer one. It's plain HTTP on the home network, which the
setting says plainly.

## No mix sync between the app and the website

Version 0.2.0 kept the website's mix in step with the desktop app on the same computer, over
`127.0.0.1`. It was dropped in 0.2.1. Both drive the same Volt, so taking the other side's mix
meant re-sending it, which could land after a newer change and briefly play an older, louder
level; a new connection pushed its own mix before it heard from the other; and Forget didn't
stick. It only helped on a computer that has the app, where the website isn't needed. The Volt's
own settings (levels, mutes, 48V, gain, tone, links) need no sync: every page re-reads them from
the Volt.

Two Volt Mixers on one computer would still fight over the mix, and the website's faders would
show levels the Volt isn't playing. They can't talk, but every program with the Volt open
receives every state reading, and each re-reads every 1.5 s, so readings a page didn't ask for
mean another one is open (`src/lib/other-program.ts`). The desktop app keeps its mix and says the
browser is open; the website pauses its mix until the other one closes, and listens for 3.5 s
after connecting before it applies its own (`src/scripts/mix-pause.ts`). Two browsers both pause
and say so. UAD Console doesn't re-read, so it isn't noticed.

## Every change is an intent

Each change a user makes, from the page's controls, the tray window or a phone, is an intent
(`src/lib/intents.ts`) applied by `applyIntent` and committed by `src/scripts/run-intent.ts`, so
clamping, "this needs the mix first" and the linked-pair rules live in one place and the views
never write page state. Another window or a phone may only send the remote intents
(`isRemoteIntent`): levels, mutes, solo and links, not 48V, routing or names.

## The app turns the display off itself at shutdown

With its computer off, the Volt shows its Host screen at the stored display brightness (its
button lights flash whatever we do, `docs/protocol.md`), so the desktop app can turn the display
off at sleep and shutdown (Settings › Desktop app). Windows goes on with a shutdown as soon as the
window answers `WM_QUERYENDSESSION`, too soon for a report sent from the page, and holding main
doesn't help because the request to the page waits too. So main writes the report itself with
node-hid (`desktop/src/display-fade.ts`), synchronously, before it answers: about 20 ms. The page
hands main the report for its firmware, so the protocol stays in `src/data`. Off is raw 1, which
nothing else sets, so whichever page connects next, on either computer, fades it back up. A
Windows service or a shutdown script would also get time, but each needs installing per computer.
