# Vehicle data

## Reference vehicle

The initial vehicle is a generic reference-based compact car, not a replica of a particular production model:

- front-engine, front-wheel drive;
- naturally aspirated four-cylinder gasoline engine;
- six-speed H-pattern manual transmission;
- open differential;
- power-assisted rack-and-pinion steering;
- independent front suspension with a reference-based rear suspension;
- no modelled electronic driver aids.

The rendered car is an original CC0 1990s five-door hatchback from Grab3D, adapted with a metallic finish, animated wheel pivots and a custom cockpit. No Volkswagen logos, model files or copyrighted assets are included. The licence and source URL are recorded in `src/assets/LICENSE-hatchback.txt`.

The configuration lives in `src/data/reference-compact.json` and is loaded and validated at application start. A future calibration should select a real reference vehicle and replace estimates with measured data, then record the measurement conditions.

## Schema

The schema is versioned with `schemaVersion: 1`. Major sections:

- `massKg`, `wheelbaseM`, `trackM`, `cgHeightM`, `frontWeightBias`, `wheelRadiusM`, `wheelInertiaKgM2`
- `finalDriveRatio`, `drivetrainEfficiency`, `gearRatios[6]`, `reverseRatio`
- `engine`: idle, redline, stall and start speeds; inertia; starter, friction and pumping losses; monotonically ordered torque curve
- `clutch`: capacity, friction coefficient, effective radius, friction surfaces, bite point, engagement width, thermal mass, ambient/max temperatures, cooling and wear rates
- `gearbox`: shift time, synchronization threshold, reverse speed limit and gate positions
- `tires`: μ, peak slip, peak slip angle, load sensitivity, rolling resistance, lateral stiffness factor
- `steering`: maximum angle, rate, return rate, high-speed factor and speed sensitivity
- `brakes`: front/rear service torque and handbrake torque
- `suspension`: front/rear spring rates, damping, ride height, maximum compression and bump-stop rate
- `aero`: drag area (`CdA`) and air density
- `provenance`: dotted-path tags for parameter groups

Each gate entry defines `gear`, `gate` and `slot`, where slot `-1` is the forward/up position, `0` the neutral corridor and `1` the rear/down position. Gear `0` is neutral, gears `1`–`6` are forward, and gear `-1` is reverse.

## Provenance

Tags describe the evidence behind a value:

| Tag           | Meaning                                                               |
| ------------- | --------------------------------------------------------------------- |
| `measured`    | Derived from direct measurement on the reference vehicle or component |
| `documented`  | Obtained from a reliable technical source                             |
| `estimated`   | Approximated from related information                                 |
| `unvalidated` | Awaiting evidence                                                     |

Anything missing from the provenance map defaults to `unvalidated`. The validator warns when required key parameters have no explicit tag. The current reference car uses mostly `estimated` and `documented` values; no claim of production-car accuracy is made.

## Validation rules

`validateVehicleConfig()` rejects:

- missing or non-finite numeric values;
- mass outside 300–5000 kg or negative dimensions;
- wrong number of gear ratios, ratios outside 0.4–8, or non-decreasing ratios;
- missing engine/clutch/gearbox/tire/steering/brake/suspension/aero sections;
- torque curves with fewer than three points, duplicate rpm values, unsorted rpm or values outside the permitted range;
- stall rpm at or above idle, idle at or above redline, or a torque curve that does not span idle to redline;
- invalid clutch bite geometry (`bitePoint + engagementWidth > 1`);
- missing neutral, forward or reverse gate assignments, duplicate gears, invalid gates or slots;
- malformed provenance tags.

Errors are returned as a readable list and thrown before the application constructs the simulation. The UI displays them in the boot error panel.

## Calibration plan

To move beyond an estimated reference car:

1. Select a roadworthy reference vehicle and record VIN-level specification, modifications, tyre make/size and test mass.
2. Measure or obtain engine torque, idle behavior, drivetrain ratios, final drive, wheel radius/inertia and clutch capacity.
3. Record acceleration, braking, coast-down and steady-state cornering time series on a closed course.
4. Fit tire and drag parameters against the time series, not just final values.
5. Run the scenario suite at multiple timesteps and record error metrics.
6. Replace provenance tags with the evidence source and archive the measurement report in `docs/validation/`.

Until that work is complete, the bundled values are a playable, internally consistent approximation.

## Proving-straight calibration

The reference configuration uses a 0.84 sixth-gear ratio and an estimated 0.58 m² drag area. These are gameplay calibration estimates, not measurements from a production car. The shorter sixth keeps the engine nearer its useful power band at high speed. Optional downforce and lift coefficients are estimated and validated only for finite, bounded behaviour, not for production-car accuracy. Rolling resistance opposes velocity in both forward and reverse.

The closed-course regression launches from rest, uses clutch-operated upshifts near 5,800 rpm, exceeds 200 km/h in sixth, and brakes to rest before the end of the six-kilometre straight. A separate high-speed test forces 90 m/s and verifies finite loads and state. A neutral coast test verifies that rolling resistance removes speed in both directions. This checks internal consistency, not real-car accuracy.
