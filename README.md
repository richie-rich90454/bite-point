# Bite Point

A browser-based manual-transmission driving simulator built around a custom, testable vehicle simulation. The first release is one carefully modelled compact car, a training lot, two hill grades and a set of manual-driving lessons. Babylon.js renders the scene; TypeScript and Vite run the application; the powertrain, tires and chassis are simulated independently of the renderer.

## Requirements

- Node.js 20.19 or newer
- pnpm 12 (the repository uses a pnpm lockfile)

## Quick start

```bash
pnpm install
pnpm dev
```

Open the URL printed by Vite. Production and verification commands:

```bash
pnpm build       # type-check and production build
pnpm preview     # serve the production build
pnpm typecheck   # strict TypeScript check
pnpm test        # Vitest unit, integration and numerical tests
pnpm lint        # ESLint
pnpm test:e2e    # Playwright browser smoke test (install Chromium once)
pnpm exec playwright install chromium
```

## What is implemented

- Custom 250 Hz fixed-step vehicle simulation: engine, clutch, six-speed H-pattern gearbox, synchronizers, reverse lockout, final drive, open differential, wheels, brakes, tires, steering, quasi-static suspension loads and chassis motion.
- Engine torque from a shape-preserving torque curve, starter and ignition, idle control with anti-stall assistance, fuel cut, engine braking and stall transitions.
- Clutch capacity from pedal position, clamp force, temperature and wear; slip torque, bounded coupling, slip energy, heating and cooling.
- H-pattern shifter state machine driven by `Enter` and the arrow keys. No numpad and no simultaneous arrow combinations are required. Gears are not engaged until the lever is released.
- Keyboard bindings by physical key code, remapping screen, input tester, focus-loss safety, tab-hidden pause, gamepad/wheel support through the Gamepad API.
- Cockpit, hood and exterior cameras, mouse look with pointer lock, dashboard instruments, pedals, steering wheel, gear lever, wipers, headlights and a day-lit training environment.
- CC0 five-door hatchback exterior with animated wheel pivots, a detailed cockpit interior and a 200 km/h (124 mph) calibrated speed limiter.
- Web Audio engine, intake, wind, tire, starter, gearbox and stall sounds. Audio is synthesised; no unlicensed samples are bundled.
- Lessons for moving off, hill starts, upshifts, braking and reverse parking; an instructor that explains stalls, rollback, clutch slip, lugging and over-revving from measured simulation state.
- Telemetry recording at 20 Hz, a live graph, JSON export and replay of the last 20 seconds.
- Pause menu with lessons, settings, rebinding, input testing and diagnostics (frame rate, physics cost, catch-up, clutch state, wheel loads and surface).

## Default controls

| Key | Action |
| --- | --- |
| `W` / `S` | Accelerator / brake |
| `A` / `D` | Steer left / right |
| `Z` / `X` | Depress / release the clutch |
| `Enter` | Grab or release the gear lever |
| Arrow keys | Move the lever through the current gate / neutral corridor |
| `N` / `R` | Request neutral / reverse (reverse remains subject to lockout) |
| `Space` | Handbrake while held |
| `I` / `K` | Ignition toggle / starter while held |
| `C` / `Home` | Cycle camera / recenter view |
| `F` / `G` | Headlights / wipers |
| `Tab` / `F1` / `F2` | Telemetry / help / instructor |
| `Esc` | Cancel lever interaction, close a dialog or pause |
| Hold `Backspace` | Recover a stopped vehicle to the start of the session |
| `1`–`6` | Quick-select gears only when enabled in Settings |

All bindings can be changed in **Pause → Controls**. The H-pattern is the default because it teaches the actual gate layout: `1` is left-forward, `2` left-rear, `3` centre-forward, `4` centre-rear, `5` right-forward and `6` right-rear. Neutral is the horizontal corridor.

## Driving technique

1. Press `I` for ignition and hold `K` until the engine catches. Keep the clutch depressed with `Z`.
2. Press `Enter` to grab the lever, move left and up with the arrow keys, then `Enter` again to select first.
3. Release `X` slowly. At the bite point the car begins to creep; add a little `W`, hold the bite briefly, then release fully.
4. To upshift, press `Z`, move the lever through neutral to the next gate, release the lever, then release `X`.
5. On a hill, hold the foot brake or handbrake, bring the clutch to its bite point, and release the brake as the drivetrain takes the load. There is no hidden anti-rollback aid.

## Project layout

```
src/
  app/            application lifecycle, frame loop, settings and UI wiring
  simulation/     engine, clutch, gearbox, driveline, tires, suspension, chassis, road, telemetry
  input/          physical-key bindings, keyboard and gamepad adapters, calibration
  presentation/   Babylon scene, car and cockpit, dashboard canvas, cameras
  audio/          Web Audio synthesis
  scenarios/      lesson definitions and progress checks
  instructor/     telemetry-driven coaching
  settings/       persisted user settings
  ui/             HUD, pause menu, help, telemetry and input tester
  data/           validated reference vehicle JSON
docs/             architecture, physics, vehicle data and validation notes
tests/            unit, integration, numerical and browser tests
```

Architecture and physics details are in [docs/architecture.md](docs/architecture.md), [docs/physics.md](docs/physics.md), [docs/vehicle-data.md](docs/vehicle-data.md) and [docs/validation.md](docs/validation.md).

## Vehicle data and realism

The bundled car is a Golf-class reference hatchback with a naturally aspirated four-cylinder, front-wheel drive, six-speed manual and open differential. The exterior is an original CC0 1990s five-door hatchback model from Grab3D (source and licence text are in `src/assets/LICENSE-hatchback.txt`), adapted with a metallic finish, animated wheel pivots and a full cockpit. It is not a licensed or exact replica of any production Volkswagen and contains no manufacturer logos or copyrighted assets. Every major parameter group carries a provenance tag in `src/data/reference-compact.json` (`measured`, `documented`, `estimated` or `unvalidated`). The configuration validator rejects invalid units, missing fields, non-monotonic ratios and impossible clamp geometry at startup with a readable error instead of starting a broken simulation.

The current tire, suspension and road-contact models are deliberately transparent approximations. They are calibratable and tested, but they are not a substitute for measured vehicle data. Known approximations and release gaps are listed in the physics and validation documents.

## Testing

The test suite covers torque-curve interpolation, idle and stall behavior, clutch slip and heat, H-pattern movement, synchronizers and reverse lockout, driveline ratios, tire limits, suspension and steering, simulation-clock catch-up, configuration validation, telemetry buffers, keyboard safety and rebinding, deterministic simulation, hill rollback, hill holding, launches, braking, reverse and wet-surface stopping. Numerical tests repeat launches at 1/120, 1/250 and 1/500 second steps and check for finite state and bounded spread. A Playwright smoke test boots the production build, starts a session, selects first, launches and shifts to second.

Run `pnpm test` for the 88 deterministic tests and `pnpm test:e2e` after installing Chromium. Validation results and current gaps are recorded in [docs/validation.md](docs/validation.md).

## Performance

The physics loop is fixed at 1/250 s with bounded catch-up (up to 120 steps per frame, with adaptive render quality when the frame rate falls). Rendering interpolation prevents render-frame timing from changing the model. Physics paths avoid per-step allocation; telemetry samples are allocated only at 20 Hz. The application bundle is about 1.15 MB minified (274 KB gzip) and streams a separate 1.16 MB CC0 car GLB only when the app boots. Babylon.js core is imported through granular modules and dedicated mesh builders rather than the monolithic entry point. The diagnostics panel reports frame rate, physics cost, catch-up and clutch state. Overload warnings appear only after sustained overload rather than for a single slow frame.

## Assets and licenses

All scene geometry, materials, textures, sounds and UI artwork are generated at runtime from code. No third-party models, textures or audio recordings are bundled. Runtime dependencies are open source: Babylon.js (Apache-2.0), Vite and Vitest (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0), ESLint (MIT), Prettier (MIT) and jsdom (MIT). Review their license files in `node_modules` when distributing a build.

## Current limitations

- Training-lot props and buildings are decorative and not collidable. The road contact is an analytic height field; a BVH-backed collision system, traffic, weather, nighttime lighting and additional vehicles are future work.
- Suspension is a quasi-static spring/damper load model used for wheel loads and ride presentation; the chassis is a planar rigid body with load transfer, not a full 6-DOF multibody model.
- Tire forces use a smooth tanh slip curve with a friction ellipse; tire temperature and wear are not yet modelled.
- Audio is parametric synthesis, not reference-vehicle recordings.
- Reference-vehicle calibration against measured time-series data is pending; treat aggressive handling and absolute acceleration claims as approximations until a measurement report replaces the estimated provenance tags.
