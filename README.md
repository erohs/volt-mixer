# Volt Mixer

Control a Universal Audio **Volt 4 Gen 2**'s built-in mixer from a web page: per-channel monitor
levels, pan, mute, solo, stereo links, cue mixes, preamp gain, 48V, tone, monitor and headphone
levels, and live meters. Nothing to install: it runs in **Microsoft Edge or Google Chrome** and
talks to the Volt over WebHID. Firefox and Safari don't support WebHID.

Built for using the Volt on a computer where UAD Console can't be installed, such as a locked-down
work laptop.

## Supported models

Only the **Volt 4 Gen 2** (firmware 1.0.3), the one this was decoded and tested on. The Monitor
output's level, mute and mono are decoded from captures but haven't been tried by ear yet. If you connect
another Volt, the page names it and says it isn't supported yet.

- **Volt 2 Gen 2, Volt 2 Max, Volt 4 Max, Volt 4P Max, Volt 876:** UAD Console controls these
  too, so they can very likely be added. Each needs one capture session on that model with the
  tools in `tools/` (see `docs/maintaining.md`). The page never sends commands that haven't been
  captured.
- **Volt 1 Gen 2 and the first-generation Volts:** UAD Console can't control them, so there's
  nothing for the page to control.

## Using it

1. Open the page in Edge or Chrome with the Volt plugged in, and choose **Connect Volt**.
2. The first time on each computer, give the page your mix: open a mix link (from your other
   computer, or from `tools/mix-link.mjs` at home), or start from Console's defaults. The Volt
   can't report its fader positions, so the page keeps its own mix and applies it when it connects,
   as UAD Console does.
3. In Edge, **Apps → Install this site as an app** gives it its own window.

Close UAD Console on the same computer: both would control the Volt and disagree.

## Developing

```sh
pnpm install
pnpm dev       # http://localhost:4321
pnpm test      # library tests, capture re-encoding, colour contrast
pnpm lint      # astro check + prettier
```

`docs/protocol.md` is the reverse-engineered HID protocol, `docs/maintaining.md` the update loop
when UA ships new firmware or software, and `docs/decisions.md` the reasoning behind the design.
`tools/` is the capture kit used on a computer with UAD Console installed.

Contributions are welcome, especially support for other Volt models: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). Not affiliated with Universal Audio. Volt, UAD and Universal Audio are their
trademarks.
