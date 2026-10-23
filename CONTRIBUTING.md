# Contributing

Issues and pull requests are welcome. For anything bigger than a fix, open an issue first so we can
agree on the approach.

## Adding another Volt model

This is the most useful contribution. It needs the model itself and a Windows computer with UAD
Console installed. `docs/maintaining.md` walks through the capture session with the kit in
`tools/`.

- Commit only the decoded output in `reference/decoded/` and the new `src/data/<model>.json`.
  Raw captures (`captures/`) and UA's API dumps contain your unit's serial number, so `.gitignore`
  keeps them out.
- The page only sends commands that have been captured from UAD Console and checked against the
  hardware. Please don't add commands found by guessing or by probing the device.

## Ground rules

- **Hardware safety.** Nothing may raise a level the user didn't move. Monitor level never goes
  below 0 on the wire, because the Volt jumps loud.
- **Lean.** Astro, TypeScript, Vitest and Prettier only. Ask in an issue before adding a
  dependency.
- **Accessible.** WCAG 2.2 AA, including reflow at 320 CSS px.
- **Conventions.** Naming, style and test wording are summarised in `CLAUDE.md`. The reasoning
  behind the design is in `docs/decisions.md`.

## Before opening a pull request

```sh
pnpm lint
pnpm test
pnpm build
```

If your change affects what the page sends to the Volt, also try it by hand in Edge or Chrome with
a Volt connected, and say in the pull request what you checked.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

By contributing you agree that your work is licensed under the [MIT licence](LICENSE).
