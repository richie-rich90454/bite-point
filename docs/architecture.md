# Architecture

## Boundaries

The simulation is a plain TypeScript library with no Babylon.js imports. Rendering reads `VehicleRenderState`; it never writes simulation state. Input produces `VehicleControls` and shifter commands; it does not calculate forces. Presentation, audio and telemetry are consumers.

```
Window input ──> InputService ──> VehicleControls + commands
                                      │
                                      ▼
                            VehicleSimulation (250 Hz)
              EngineModel, ClutchModel, ManualGearbox, HPatternShifter,
              DrivelineModel, OpenDifferential, WheelModel, TireModel,
              SteeringModel, BrakeModel, SuspensionModel, VehicleBodyModel
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                  ▼
             VehicleRenderState  TelemetryRecorder   DrivingInstructor
                    │                 │                  │
              VehicleRenderer     Replay / export    UI messages
```

`SimulatorApplication` constructs the graph, owns the frame loop, applies settings, coordinates scenarios and performs focus/visibility safety. `VehicleSimulation` coordinates the mechanical subsystems but delegates each equation to its own class.

## Coordinate conventions

Internally the simulation uses SI units and a vehicle frame with:

- `x` forward
- `y` right
- `z` up
- yaw positive to the right, measured from the +x axis
- wheel angular velocity positive for forward rolling
- engine angular velocity positive in the normal combustion direction; reverse output is represented by a negative gearbox ratio

Babylon uses a left-handed scene with +Z forward and +Y up. The boundary conversion is:

```text
simulation (x, y, z) -> Babylon (y, z, x)
```

All positions, wheel offsets, terrain heights and camera offsets go through this mapping in `EnvironmentBuilder`, `VehicleRenderer` and `CockpitController`. No simulation code imports Babylon.

## Fixed-step loop

`SimulationClock` accumulates real frame time and executes fixed 1/250 s steps. It caps catch-up at 120 steps, reports dropped time and an overload flag, and exposes an interpolation alpha. Rendering interpolates body pose between the previous and current snapshots; physics never consumes interpolated state. If the frame rate remains low, `VehicleRenderer` lowers hardware resolution and disables bloom/shadows before the user has to intervene.

`VehicleBodyModel.capturePrevious()` is called at the start of each step. `getRenderState(alpha)` interpolates position, heading, pitch, roll and velocities for presentation.

## Composition choices

- `EngineModel` owns combustion, friction, starter, rev limiting and stall; `IdleController` is composed into it.
- `ClutchModel` owns capacity, thermal state and wear. `VehicleSimulation` supplies the current pedal, engine speed and reflected driveline inertia.
- `ManualGearbox` owns ratio, torque ramp and engagement rules. `SynchronizerModel` centralises speed matching. `HPatternShifter` owns only lever geometry and movement.
- `DrivelineModel` handles final drive, efficiency and reflected inertia. `OpenDifferential` splits torque equally.
- `TireModel` is shared by four `WheelModel` instances and by axle lateral-force calculations.
- `SuspensionModel` converts loads to compression and provides a force helper; ride loads are quasi-static.
- `RoadContactProvider` provides an analytic height field and surface friction. The renderer builds the terrain from the same function, so visible and physical ramps agree.

## Input

`KeyboardInputAdapter` listens on `window`, uses `KeyboardEvent.code` for bindings, blocks page scrolling for driving keys, ignores key-repeat edges, and tracks physical pressed keys for the input tester. `InputService` owns the analog state and application-controlled repeat timers:

- throttle, brake and clutch pedals ramp at configured rates;
- the clutch pedal holds its position while neither `Z` nor `X` is held;
- the steering target is rate-limited again inside `SteeringModel`;
- arrow repeat uses a 340 ms delay and 120 ms rate, independent of OS key repeat;
- window blur and hidden tabs clear held keys, release throttle/brake, depress the clutch and apply the handbrake;
- the app pauses physics and audio on those safety transitions.

Gamepad support uses the Gamepad API. Standard controllers map steering, triggers, clutch button, ignition, starter, handbrake and D-pad lever movement. Devices identified as wheels use axes for steering, clutch, throttle and brake.

Bindings are stored by physical code, display layout labels when `navigator.keyboard.getLayoutMap()` is available, and reject duplicate assignments.

## Rendering

`VehicleRenderer` owns the Babylon engine, scene, car assembly, shadow caster registration, materials and animation synchronization. Babylon modules are imported through a small presentation barrel so only the used engine, material, camera, builder and post-process modules enter the bundle. `EnvironmentBuilder` creates the terrain, asphalt texture, markings, ramps, wet pad, barriers, cones, buildings, trees, signage and lighting. `CockpitController` creates the camera and implements cockpit, hood and exterior modes, including mouse look and recentering. A default rendering pipeline provides FXAA and subtle bloom on higher quality settings.

Exterior cabin geometry is disabled in cockpit mode so the interior shell can be shown without z-fighting. The 3D interior contains a dashboard, binnacle, gauges, steering wheel, seats, console, pedals, gear lever and wipers. HTML/CSS HUD panels supply the scenario card, warnings, instructor messages, gauge canvas, telemetry, pause menu and help.

## Audio

`AudioDirector` starts only after a user gesture. It synthesises engine firing harmonics, intake, wind, tire and starter layers with Web Audio oscillators, filters and noise, and plays short gearbox and stall transients. It reads simulation state; it never changes it.

## Telemetry and replay

`TelemetryRecorder` samples at 20 Hz into a fixed-capacity ring buffer. Samples include pose, speeds, RPM, torque, gear, pedals, clutch mode/slip/temperature/wear, wheel speeds and slip, steering, surface friction and slope. Export creates a versioned JSON document. Replay builds a synthetic `VehicleRenderState` by interpolating recorded samples; the physics loop is paused during replay.

## Failure handling

- Configuration is validated before construction; a readable stack/message is shown in `#boot-error`.
- Asset generation is procedural, so there are no network asset failures in the default build.
- Focus loss, visibility changes, controller disconnects and simulation overload are reported through the HUD/toasts.
- Settings and bindings are stored in localStorage and validated on load; unavailable storage degrades to session-only settings.
