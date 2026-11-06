# Contributing to Bite Point

Bite Point is a manual-transmission simulator with renderer-independent physics. Contributions that improve driving feel, accessibility, visual quality and measured accuracy are welcome.

## Get running

Use Node.js 24 and the pnpm version in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Before opening a pull request:

```sh
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Choose a useful first contribution

Reproduce a reported input issue, improve a confusing lesson instruction, add a focused regression test, or document a measured vehicle parameter. Open an issue before undertaking large architectural changes. Maintainers can identify small tasks with the `good first issue` and `help wanted` labels.

## Engineering expectations

- Keep physics deterministic and independent of Babylon.js and DOM state. Use SI units internally.
- Document the source and uncertainty of calibration changes in `docs/vehicle-data.md`. Do not hide handling shortcuts behind realism claims.
- Test meaningful behavior: launches, stalls, braking distance, shifting and stability across timesteps.
- Preserve keyboard remapping, focus-loss safety and analog input support.
- Use sans-serif interface and canvas fonts. Keep instruments readable at 1024 × 600 and respect reduced-motion preferences.
- Use local, licensed assets. Include source, license and attribution with every third-party asset.
- Keep pull requests focused. Include screenshots for visual changes and telemetry for physics changes.

## Reporting issues

Use the bug template with your browser, GPU, input device, lesson and exact reproduction steps. The pause menu exposes input testing and diagnostics. Telemetry exports help reproduce simulation issues.

Contributors retain copyright in their contributions. Submitted contributions are licensed under the repository's MIT license, except explicitly identified third-party assets under their own licenses. Follow [our community guidelines](CODE_OF_CONDUCT.md).
