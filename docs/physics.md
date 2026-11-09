# Physics

The model is designed to be explainable. Every observable behaviour should come from a mechanical equation or a documented approximation, not a scripted exception. All internal quantities use SI units.

## Engine

The engine integrates angular velocity from torque balance:

```text
J_e * dω_e/dt = T_combustion + T_starter - T_loss - T_clutch
```

- `T_combustion = torqueCurve(rpm) * effectiveThrottle` when running and not fuel-cut.
- The torque curve is interpolated with a shape-preserving cubic Hermite (PCHIP) curve so it does not overshoot measured points.
- `T_loss` combines a constant friction term, a speed-proportional friction term and a pumping term proportional to `(1 - effectiveThrottle)`.
- `effectiveThrottle` is the larger of the driver throttle and the idle controller command. The idle controller provides anti-stall assistance below target idle speed; it does not supply hidden torque to the driver.
- The starter applies torque while cranking. The engine transitions to running when cranking speed exceeds `startRpm`; it stalls below `stallRpm`. Fuel is cut above the redline with hysteresis.
- Engine RPM is never assigned from throttle; it emerges from integration. In a locked-clutch gear, the engine speed is synchronised to the wheel-derived input-shaft speed to enforce the rigid connection.

## Clutch

Capacity:

```text
T_max = μ * F_N * n * R_eff * engagement(pedal) * thermalFactor * wearFactor
```

The configured maximum capacity represents the clamping/friction product; `clampForceN` is derived for diagnostics. Pedal engagement uses a smoothstep over `bitePoint ± engagementWidth/2`.

Slip torque is solved with a bounded impulse-style coupling:

```text
J_eff = (J_engine * J_driveline) / (J_engine + J_driveline)
T_desired = (ω_engine - ω_input) / dt * J_eff
T_clutch = clamp(T_desired, -T_max, T_max)
```

`J_driveline` is the vehicle and wheel inertia reflected through the selected gear and final drive. The clutch is reported as `open`, `slipping` or `locked`. Only sliding operation generates heat:

```text
P_slip = |T_clutch * Δω|
```

Heat raises clutch temperature with a configured thermal mass; cooling is proportional to the temperature difference from ambient. Slip energy increases wear. Both temperature and wear derate capacity toward a floor rather than discontinuously failing.

When the clutch is open, the gearbox input shaft in neutral coasts down; when the clutch is engaged in neutral, it follows engine speed. A shift to a gear connects the input shaft to the wheel-derived synchronised speed.

## Gearbox and driveline

- Six forward ratios and one reverse ratio from configuration. Reverse uses a negative ratio so the output direction reverses.
- Gear engagement is not instantaneous. `ManualGearbox.tryEngage()` checks synchronization and reverse lockout, then ramps torque transmission over `shiftTimeS`.
- Synchronization requires either a disengaged clutch or a speed mismatch within `syncSpeedThresholdRadPerSec`. Reverse also requires the clutch to be disengaged and vehicle speed below `reverseMaxSpeedMps`.
- H-pattern geometry comes from the configuration. The lever must pass through the neutral corridor to change gates. Gear selection is committed only when the lever is released.
- Driveline torque at the wheels:

```text
T_wheel_total = T_clutch * gearRatio * finalDrive * efficiency * torqueFactor
```

- The open differential splits total drive torque equally. Wheel speeds are free to differ.

## Wheels and tires

Longitudinal slip ratio:

```text
κ = (R * ω_wheel - V_x) / max(|V_x|, |R * ω_wheel|, 1.0)
```

The 1.0 m/s denominator floor is a documented low-speed stabilisation approximation. Force uses a smooth saturating curve:

```text
F_x = μ_eff(F_z) * F_z * tanh(κ / peakSlip)
```

Lateral force uses the same form with slip angle and `peakSlipAngleRad`. Load sensitivity reduces effective μ as normal load rises. Surface μ scales both directions. Combined forces are limited by a friction ellipse.

At very low drive and brake torque, the wheel model uses a free-rolling branch: wheel speed follows `V_x / R` and longitudinal force is zero. This avoids artificial low-speed stiction and allows a car on a hill to roll. Braking, engine braking and driven conditions use the slip model.

The wheel update is solved with a bracketed bisection over the wheel angular velocity. The longitudinal tire force is monotonic in wheel speed, so the root is unique; 42 bounded iterations provide a stable solution even during wheelspin, lockup and reverse motion. Brake torque is smoothed through zero so a braked wheel cannot oscillate across the direction change. When the clutch is locked, the transmitted torque is the engine's net torque rather than the slip-coupling impulse, so engine torque continues to accelerate the car instead of the drivetrain coasting. That torque is limited by the same capacity and gearing constraints. There is no default speed clamp. Top speed emerges from engine torque, aerodynamic drag, gearing, rolling resistance and the 9,000 rpm redline. Optional aerodynamic downforce and lift coefficients load the axles at speed, and an optional 500 km/h limiter remains available for players who enable it in settings.

## Brakes

Service brake torque is progressive with pedal travel and split front/rear by the configured maximum torques. The handbrake applies only to the rear axle. Brake torque opposes rotation and is limited so it cannot reverse a wheel's direction when drive torque is low. There is no ABS model; locked wheels remain locked and slide, which is reported in telemetry and instructor messages.

## Suspension and loads

`SuspensionModel` provides a spring/damper/bump-stop force and converts load to compression. The vehicle uses a quasi-static load model:

- static front/rear loads from mass distribution;
- longitudinal transfer from previous-step acceleration and centre-of-gravity height;
- lateral transfer by axle with a front/rear roll-share;
- wheel lift is represented by clamping each wheel load at zero;
- slope reduces the normal component of weight.

This is not a full vertical multibody simulation. Body pitch and roll are derived from wheel contact heights, and suspension compression is used for presentation and diagnostics. A future revision should integrate vertical wheel/body states and replace load transfer with the resulting suspension forces.

## Chassis

The chassis is a planar rigid body with forward/lateral velocity and yaw rate:

```text
m * a_x = Σ F_x - F_drag - F_rolling - m*g*sin(slope_forward)
m * a_y = Σ F_y - m*g*sin(slope_lateral)
I_z * dω_yaw/dt = Σ M_z
```

A bicycle-model lateral force calculation uses front and rear axle slip angles. At low speed, a kinematic yaw assist blends toward the geometric steering relationship so parking and hill maneuvers remain controllable. The body pose is updated with world-frame velocity, then sampled against the terrain at each wheel to set height, pitch and roll.

Drag is `0.5 * ρ * CdA * v * |v|`. Rolling resistance is proportional to normal weight and always opposes motion.

## Road contact

`RoadContactProvider` is an analytic height field. The training lot is flat; two ramps have constant gradients and plateaus. A wet rectangle scales tire μ. The renderer evaluates the same function when deforming the terrain mesh, so visual and physical ramps agree. There is no BVH mesh collision, contact-point manifold or dynamic obstacle collision yet.

## Numerical safeguards

- Fixed step with bounded catch-up; overload is reported.
- Double-precision state throughout the simulation.
- NaN/infinity guards are exercised by numerical tests.
- Tire forces are limited by the friction model.
- Clutch coupling is capacity-bounded.
- Wheel solves have bounded iterations.
- Physics hot paths avoid per-step allocation; telemetry allocates only on its 20 Hz sample.
- Deterministic inputs produce identical trajectories in tests.

## Known approximations

- Quasi-static load transfer instead of vertical body dynamics.
- Low-speed slip denominator floor of 1.0 m/s.
- Smooth tanh tire curve rather than a measured Magic Formula or brush model.
- No tire thermal/wear state.
- No aerodynamics beyond longitudinal drag, no yaw/roll aero.
- No ABS, traction control or stability control (the reference car is treated as having none modelled).
- No road mesh collision or closed-loop validation against measured vehicle data yet.

## Paved and off-road surfaces

The training lot, access apron and proving straight share boundaries defined in `simulation/road/RoadLayout.ts`. Outside those bounds the analytic surface uses a 0.62 grip scale and 3.2× rolling resistance, both estimated. These are surface approximations, not deformable terrain or a grass tire model. Wet training areas retain their existing friction reduction.

Reverse engagement is blocked above the gearbox lockout threshold. That threshold does not cap backwards driving speed: reverse road speed follows gearing, engine limits and road forces. Rolling resistance always opposes motion.
