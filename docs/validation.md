# Validation

## Automated test matrix

Run:

```bash
pnpm test
pnpm test:e2e
```

The deterministic suite currently covers:

| Area | Checks |
| --- | --- |
| Math/curves | PCHIP interpolation, no artificial overshoot, clamping, angle wrapping |
| Engine | Cold start, idle stability, stall under load, fuel cut, ignition off |
| Clutch | Pedal mapping, open/slipping/locked modes, capacity limit, heat, cooling, wear derating |
| H-pattern | Neutral start, grab requirement, gate/corridor movement, first to second through neutral, reverse request |
| Gearbox | Ratios, reverse, reverse lockout, clutch requirement, synchronized and rev-matched shifts, torque ramp |
| Driveline | Wheel/engine speed relationships, reflected inertia, torque multiplication, FWD/RWD/AWD torque split |
| Catalog | Twelve validated cars, unique ids, tier and engine-type coverage, simulated 0-100 km/h times |
| Maps | Map catalog validation, deterministic generation, theme cycling, finite heights and normals, chunk continuity |
| Audio | Engine profile construction and safe sound-set switching without an AudioContext |
| Settings | Default car/map selection, valid selections, fallback on invalid values |
| Wheels/tires | Free roll, grip saturation, braking force and lock behavior, load sensitivity, wet μ, friction ellipse |
| Suspension/steering/brakes | Static compression, bump stop, damping, steering rate and speed sensitivity, handbrake split |
| Clock | Fixed steps, bounded catch-up, overload/dropped time, interpolation alpha, reset |
| Configuration | Valid reference, invalid mass/fields, ratio ordering, bite geometry, provenance |
| Telemetry | Ring buffer wrapping/order, sample rate, JSON export |
| Input | Defaults, duplicate detection, layout labels, calibration, pedal ramps, focus-loss safety, repeat timing, rebinding conflicts, recovery hold |
| Integration | Neutral idle, starter, gentle launch, clutch dump stall, hill rollback, handbrake hold, first-to-second shift, reverse lockout, reverse creep, braking, all six gear selections, clutch/wheel speed consistency, locked-clutch acceleration, launch control, FWD/RWD/AWD wheel drive, 0-100 km/h benchmark, physical top speed above 500 km/h, high-speed finite-state stability, endless-world streaming and guardrail contact |
| Numerical | Launches at 1/120, 1/250 and 1/500 s; finite state; bounded speed spread; friction limits; parked handbrake; brake lock recovery; determinism |

Latest local result after implementation: all 141 deterministic tests pass across 25 files. Six Playwright tests boot the production build, start sessions, engage gears, launch, steer, shift, change car and map, open pause, open the input test and settings, check telemetry export/replay, and verify there are no uncaught page errors.

## What is not yet validated

- Absolute acceleration, braking distance, cornering g and hill-start behaviour against a measured reference vehicle.
- Full six-degree-of-freedom chassis, suspension travel and vertical body dynamics.
- Tire temperature/wear and their effect on grip.
- Collision against arbitrary road meshes, kerbs or props.
- Long-duration thermal soak, repeated hill starts and clutch wear over many sessions.
- Controller/wheel hardware matrix and force feedback.
- 120 FPS on named target hardware; headless browser screenshots run on software rendering and are not a performance measurement.
- Accessibility audit beyond keyboard-only operation, remapping and input testing.

## Reference validation template

When measured data becomes available, each report should record:

1. Reference vehicle and configuration identifier.
2. Measurement conditions, tyres, mass, surface and ambient conditions.
3. Reference time series and simulation output.
4. Error metrics over the full time series (RMSE, peak error, phase error), not only final values.
5. Parameter changes and their provenance.
6. Remaining discrepancies and whether they are model or data limitations.
7. Pass/fail criteria.

Reports should be archived in `docs/validation/` and converted into permanent regression fixtures under `tests/numerical/`.

## Manual verification checklist

- `pnpm build` succeeds.
- `pnpm preview` serves the production build.
- Start screen accepts a scenario and audio starts after the click.
- `I`, then hold `K`, starts the engine; releasing in gear without clutch stalls it.
- H-pattern: Enter, Left, Up, Enter selects first; first-to-second requires two Down taps.
- Releasing the clutch with insufficient throttle stalls; a measured release moves off.
- The handbrake holds the car on the 9% hill; releasing it with the clutch down rolls back.
- Reverse is refused above walking pace.
- `Esc` cancels lever interaction when grabbed and pauses otherwise.
- `Tab` opens telemetry; replay and JSON export work.
- `F1` shows controls; `F2` toggles instructor messages.
- Window blur releases throttle/brake, depresses the clutch and applies the handbrake.
- `Tab` hidden pauses simulation and audio; returning requires an explicit resume.
- Rebinding a duplicate key is rejected; reset defaults restores the documented layout.
- Diagnostics report frame rate, physics cost, overload/dropped time and clutch state.

## Proving straight regression

`tests/integration/proving-run.test.ts` verifies a complete launch from rest past 200 km/h with clutch-operated shifts and enough remaining course length to stop. `tests/integration/endless.test.ts` verifies a 0-100 km/h benchmark, a top-speed run beyond 500 km/h on the endless straight, handbrake deceleration, streamed-world driving, surface classification and the guardrail soft barrier. `tests/unit/world-generator.test.ts` verifies deterministic route continuity, curvature bounds and projection round-trips. See the vehicle-data document for the estimated gearing and aerodynamic calibration.

## Graphics and browser checks

The production build is checked in Chromium at 1024 × 600 for H-pattern launch and shifting, focus/modal controls, input testing, settings, telemetry export/replay, proving-course selection and exterior instrument visibility. Two browser tests pass. A High-quality 1440 × 900 capture is included in `docs/images/proving-ground.png`.

Graphics use a bundled CC0 photographic HDR sky, scanned asphalt maps, preserved authored car textures, alpha-tested foliage, stabilized cascaded shadows where supported, High-quality MSAA and FXAA at every preset. Hardware performance varies; software-rendered headless Chromium is a functional check, not a GPU performance benchmark. Asset provenance is recorded in `src/assets/LICENSE-environment.md`.
