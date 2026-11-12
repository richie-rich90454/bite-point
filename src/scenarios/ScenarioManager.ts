import type { VehicleSimulation, SimEvent } from "../simulation/vehicle/VehicleSimulation";
import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";

export interface ScenarioStart {
    x: number;
    y: number;
    heading: number;
    gear: number;
    engineRunning: boolean;
}

export interface ScenarioStats {
    elapsedS: number;
    startX: number;
    startY: number;
    maxSpeedMps: number;
    minX: number;
    minY: number;
    stalled: boolean;
    brakeStartX: number | null;
    reverseDistance: number;
}

export interface ScenarioUpdate {
    sim: VehicleSimulation;
    state: VehicleRenderState;
    events: SimEvent[];
    dt: number;
    stats: ScenarioStats;
}

export type ScenarioStatus = "running" | "success" | "failed";

export interface ScenarioResult {
    status: ScenarioStatus;
    message?: string;
    progress?: number;
}

export interface ScenarioDefinition {
    id: string;
    title: string;
    description: string;
    instructions: string[];
    world: "endless" | "legacy";
    routeMode?: "curved" | "straight";
    start: ScenarioStart;
    update: (context: ScenarioUpdate) => ScenarioResult;
}

const failOnStall = (context: ScenarioUpdate): ScenarioResult | null => {
    if (context.stats.stalled) {
        return {
            status: "failed",
            message: "The engine stalled. Restart the lesson and feed the clutch in more gently.",
        };
    }
    return null;
};

const endlessUpdate = (context: ScenarioUpdate): ScenarioResult => {
    const projected = context.sim.road.project(context.state.pose.x, context.state.pose.y);
    const distance = projected ? Math.abs(projected.s) : Math.max(0, context.state.pose.x);
    const speed = context.stats.maxSpeedMps * 3.6;
    return {
        status: "running",
        progress: Math.min(0.99, distance / 50_000),
        message:
            speed > 200
                ? `Top speed ${speed.toFixed(0)} km/h. The road is still going.`
                : undefined,
    };
};

export const SCENARIOS: ScenarioDefinition[] = [
    {
        id: "endless",
        title: "Endless curves",
        description:
            "An endless procedural highway with sweeping curves, changing terrain and no artificial speed ceiling. Build speed, hold a gear and keep driving.",
        instructions: [
            "The car starts in first gear on an open road.",
            "Shift with the clutch and the H-pattern as usual.",
            "Pick a gear that fits the corner ahead. The road keeps going.",
            "There is no finish line and no artificial speed cap.",
        ],
        world: "endless",
        routeMode: "curved",
        start: { x: 0, y: 0, heading: 0, gear: 1, engineRunning: true },
        update: endlessUpdate,
    },
    {
        id: "endless-straight",
        title: "Endless straight",
        description:
            "An endless straight highway for top-speed runs, gearing checks and long manual-transmission drives. No finish line and no speed cap.",
        instructions: [
            "The car starts in first gear on an open straight.",
            "Shift through the gearbox and hold top gear.",
            "The road never ends and the speed limit is physical.",
            "Use the curved mode when you want corners.",
        ],
        world: "endless",
        routeMode: "straight",
        start: { x: 0, y: 0, heading: 0, gear: 1, engineRunning: true },
        update: endlessUpdate,
    },
    {
        id: "sprint-100",
        title: "0-100 sprint",
        description:
            "A standing-start acceleration run on the endless straight. Launch cleanly, use every gear and stop the clock at 100 km/h.",
        instructions: [
            "The car starts in first gear on the endless straight.",
            "Feed the clutch in and use full throttle.",
            "Shift at the redline and keep the car straight.",
            "The clock stops when the car reaches 100 km/h.",
        ],
        world: "endless",
        routeMode: "straight",
        start: { x: 0, y: 0, heading: 0, gear: 1, engineRunning: true },
        update: (context) => {
            const speed = context.stats.maxSpeedMps * 3.6;
            if (speed >= 100) {
                return {
                    status: "success",
                    message: `0-100 km/h in ${context.stats.elapsedS.toFixed(2)} s.`,
                };
            }
            return { status: "running", progress: Math.min(0.98, speed / 100) };
        },
    },
    {
        id: "launch-control",
        title: "Launch control tutorial",
        description:
            "A guided standing start with launch control: arm it on the brake, let it hold the launch RPM with the clutch open, release the brake to launch and shift out of first.",
        instructions: [
            "The car starts in first gear on the endless straight, engine running.",
            "Hold S (brake) and W (throttle) together. Launch control arms and holds the launch RPM.",
            "Keep W down and release S. The clutch engages automatically and the car launches.",
            "After the launch, shift at the redline and keep the car straight.",
        ],
        world: "endless",
        routeMode: "straight",
        start: { x: 0, y: 0, heading: 0, gear: 1, engineRunning: true },
        update: (context) => {
            const phase = context.state.launchControlPhase ?? "idle";
            const speed = context.stats.maxSpeedMps * 3.6;
            if (context.stats.stalled) {
                return {
                    status: "failed",
                    message: "The engine stalled. Restart the lesson and keep the throttle down.",
                };
            }
            if (speed >= 100) {
                return {
                    status: "success",
                    message: `Launch complete. 0-100 km/h in ${context.stats.elapsedS.toFixed(2)} s.`,
                };
            }
            if (phase === "holding") {
                return {
                    status: "running",
                    progress: 0.2,
                    message:
                        "Armed. The clutch is open and the launch RPM is held. Release the brake.",
                };
            }
            if (phase === "releasing") {
                return {
                    status: "running",
                    progress: 0.45,
                    message: "Launching. Keep the throttle down while the clutch engages.",
                };
            }
            if (phase === "launched" || context.state.speedKph > 10) {
                return {
                    status: "running",
                    progress: Math.min(0.95, 0.5 + speed / 200),
                    message:
                        context.state.gear === 1 &&
                        context.state.rpm > context.sim.config.engine.redlineRpm * 0.9
                            ? "Shift to second: clutch in, select second, clutch out."
                            : "Keep the throttle down and shift at the redline.",
                };
            }
            return {
                status: "running",
                progress: 0,
                message: "Step 1: hold S (brake) and W (throttle) together until armed.",
            };
        },
    },
    {
        id: "free-drive",
        title: "Free drive",
        description:
            "The complete training lot with no objectives. Mechanical consequences stay enabled.",
        instructions: [
            "I + K to start if the engine is off.",
            "Clutch: Z to press, X to release.",
            "Enter grabs the lever, arrows move it.",
        ],
        world: "legacy",
        start: { x: -14, y: -12, heading: 0, gear: 0, engineRunning: true },
        update: (context) => {
            if (context.stats.stalled) {
                return {
                    status: "running",
                    message: "Engine stalled. Clutch in and hold K to restart.",
                };
            }
            return { status: "running", progress: 1 };
        },
    },
    {
        id: "proving-run",
        title: "Six gears, 200 km/h",
        description:
            "A 6 km closed proving straight. Launch, shift through all six gears, reach 200 km/h, then brake to a stop.",
        instructions: [
            "First gear is selected. Add throttle and feed the clutch in with X.",
            "Shift up near the redline, around 8,500 rpm; lift W and depress Z before each shift.",
            "Keep straight. Reach 200 km/h, then brake with S and depress the clutch before stopping.",
            "The distance boards mark the braking space. This is a closed course.",
        ],
        world: "legacy",
        start: { x: -200, y: -114.5, heading: 0, gear: 1, engineRunning: true },
        update: (context) => {
            const failed = failOnStall(context);
            if (failed) return failed;
            if (context.state.pose.x > 5950 && context.state.speedKph > 5) {
                return {
                    status: "failed",
                    message: "End of the proving straight. Brake earlier and leave room to stop.",
                };
            }
            if (
                context.stats.maxSpeedMps * 3.6 >= 199.5 &&
                context.state.speedKph < 0.5 &&
                context.state.gear === 0
            ) {
                return {
                    status: "success",
                    message: "200 km/h reached. Stopped and secured in neutral.",
                };
            }
            return {
                status: "running",
                progress: Math.min(0.9, ((context.stats.maxSpeedMps * 3.6) / 200) * 0.9),
                message:
                    context.stats.maxSpeedMps * 3.6 >= 199.5
                        ? "Target reached. Lift, brake progressively, clutch in and stop in neutral."
                        : undefined,
            };
        },
    },
    {
        id: "move-off",
        title: "Move off smoothly",
        description:
            "Find the bite point and pull away in first gear without stalling or slipping excessively.",
        instructions: [
            "Engine is idling in neutral. Clutch is depressed.",
            "Press Enter, move the lever left then up, press Enter to select 1st.",
            "Release the clutch slowly with X while adding a little throttle with W.",
            "Reach 20 km/h without stalling.",
        ],
        world: "legacy",
        start: { x: -18, y: -8, heading: 0, gear: 0, engineRunning: true },
        update: (context) => {
            const failed = failOnStall(context);
            if (failed) return failed;
            if (context.state.speedKph >= 20 && !context.state.wheelLocked) {
                return { status: "success", message: "Smooth move-off. That is the bite point." };
            }
            return { status: "running", progress: Math.min(0.95, context.state.speedKph / 20) };
        },
    },
    {
        id: "hill-start",
        title: "Hill start",
        description:
            "Pulling away uphill without rolling back. Gravity is real; the handbrake or foot brake is your friend.",
        instructions: [
            "Start on the 9% gentle hill in first gear with the clutch depressed.",
            "Hold the brake with S, or the handbrake with Space.",
            "Find the bite point, then release the brake as the car begins to pull.",
            "Reach the top without rolling back more than 1 metre.",
        ],
        world: "legacy",
        start: { x: 30, y: -9.5, heading: 0, gear: 1, engineRunning: true },
        update: (context) => {
            const failed = failOnStall(context);
            if (failed) return failed;
            const rollback = context.stats.startX - context.state.pose.x;
            if (rollback > 2.5) {
                return {
                    status: "failed",
                    message: "Rolled back more than 2.5 m. Use more clutch bite or hold the brake.",
                };
            }
            if (context.state.pose.x > 50) {
                return {
                    status: "success",
                    message: "Hill start complete without excessive rollback.",
                };
            }
            const distanceProgress = Math.min(
                1,
                Math.max(0, (context.state.pose.x - context.stats.startX) / 20),
            );
            return { status: "running", progress: distanceProgress * 0.9 };
        },
    },
    {
        id: "shift-through",
        title: "Shift through the gears",
        description:
            "Use the clutch and the H-pattern on the proving straight to reach fifth gear without stalling.",
        instructions: [
            "Start in first gear with the clutch depressed.",
            "For each upshift: press Z, Enter, move the lever, Enter, release X.",
            "Remember the neutral corridor between gears.",
            "Reach 5th gear and 60 km/h without stalling.",
        ],
        world: "legacy",
        start: { x: -200, y: -114.5, heading: 0, gear: 1, engineRunning: true },
        update: (context) => {
            const failed = failOnStall(context);
            if (failed) return failed;
            if (context.state.gear >= 5 && context.state.speedKph >= 60) {
                return { status: "success", message: "All upshifts completed cleanly." };
            }
            return {
                status: "running",
                progress: Math.min(
                    0.95,
                    (context.state.gear / 5) * 0.5 + context.state.speedKph / 120,
                ),
            };
        },
    },
    {
        id: "brake-stop",
        title: "Brake and stop",
        description: "Build speed, then stop smoothly under control and secure the car.",
        instructions: [
            "Accelerate to at least 30 km/h.",
            "Brake with S until stopped; hold the clutch before the engine labours.",
            "Do not stall.",
            "Come to a full stop and select neutral.",
        ],
        world: "legacy",
        start: { x: -30, y: -2, heading: 0, gear: 1, engineRunning: true },
        update: (context) => {
            const failed = failOnStall(context);
            if (failed) return failed;
            if (context.state.speedKph > 30) {
                if (context.stats.brakeStartX === null)
                    context.stats.brakeStartX = context.state.pose.x;
                if (context.state.brake > 0.05)
                    context.stats.brakeStartX = Math.min(
                        context.stats.brakeStartX,
                        context.state.pose.x,
                    );
            }
            if (
                context.stats.brakeStartX !== null &&
                context.state.speedKph < 0.5 &&
                context.state.gear === 0
            ) {
                return { status: "success", message: "Stopped cleanly and selected neutral." };
            }
            return { status: "running", progress: Math.min(0.95, context.state.speedKph / 30) };
        },
    },
    {
        id: "reverse-park",
        title: "Reverse and park",
        description:
            "Select reverse through the gate, back into the marked bay and stop without stalling.",
        instructions: [
            "Press R while the clutch is depressed to request reverse.",
            "Ease the clutch out and reverse straight into the marked bay.",
            "Stop inside the bay and select neutral.",
        ],
        world: "legacy",
        start: { x: 0, y: 30, heading: 0, gear: 0, engineRunning: true },
        update: (context) => {
            const failed = failOnStall(context);
            if (failed) return failed;
            const reverseDistance = context.stats.startX - context.state.pose.x;
            if (reverseDistance > 7)
                context.stats.reverseDistance = Math.max(
                    context.stats.reverseDistance,
                    reverseDistance,
                );
            const inBay =
                context.state.pose.x <= -5 &&
                context.state.pose.x >= -10 &&
                Math.abs(context.state.pose.y - 30) < 2.2;
            if (inBay && context.state.speedKph < 0.5 && context.state.gear === 0) {
                return {
                    status: "success",
                    message:
                        "Parked in the bay. Reverse gear selection and clutch control verified.",
                };
            }
            return {
                status: "running",
                progress: Math.min(0.95, Math.max(0, reverseDistance / 7)),
            };
        },
    },
];

export class ScenarioManager {
    current: ScenarioDefinition;
    status: ScenarioStatus = "running";
    message = "";
    progress = 0;
    stats: ScenarioStats;

    constructor(scenarios: ScenarioDefinition[] = SCENARIOS) {
        this.scenarios = scenarios;
        this.current = scenarios[0]!;
        this.stats = this.freshStats(this.current);
    }

    private readonly scenarios: ScenarioDefinition[];
    private startOverride: Partial<ScenarioStart> | undefined;

    get all(): ReadonlyArray<ScenarioDefinition> {
        return this.scenarios;
    }

    start(
        id: string,
        sim: VehicleSimulation,
        startOverride?: Partial<ScenarioStart>,
    ): ScenarioDefinition {
        const scenario = this.scenarios.find((item) => item.id === id) ?? this.scenarios[0]!;
        const start = { ...scenario.start, ...startOverride };
        this.current = scenario;
        this.status = "running";
        this.message = "";
        this.progress = 0;
        this.stats = this.freshStats({ ...scenario, start });
        this.startOverride = startOverride;
        sim.reset({
            x: start.x,
            y: start.y,
            heading: start.heading,
            gear: start.gear,
            engineRunning: start.engineRunning,
            ignition: true,
            clutchPedal: 1,
        });
        return scenario;
    }

    update(
        sim: VehicleSimulation,
        state: VehicleRenderState,
        events: SimEvent[],
        dt: number,
    ): void {
        if (this.status !== "running") return;
        this.stats.elapsedS += dt;
        this.stats.maxSpeedMps = Math.max(this.stats.maxSpeedMps, state.speedMps);
        this.stats.minX = Math.min(this.stats.minX, state.pose.x);
        this.stats.minY = Math.min(this.stats.minY, state.pose.y);
        if (events.some((event) => event.type === "stall")) this.stats.stalled = true;
        const result = this.current.update({
            sim,
            state,
            events,
            dt,
            stats: this.stats,
        });
        if (result.status !== "running") {
            this.status = result.status;
            this.message = result.message ?? "";
            this.progress = result.progress ?? 1;
        } else {
            this.progress = result.progress ?? 0;
            if (result.message) this.message = result.message;
        }
    }

    restart(sim: VehicleSimulation): void {
        this.start(this.current.id, sim, this.startOverride);
    }

    private freshStats(scenario: ScenarioDefinition): ScenarioStats {
        return {
            elapsedS: 0,
            startX: scenario.start.x,
            startY: scenario.start.y,
            maxSpeedMps: 0,
            minX: scenario.start.x,
            minY: scenario.start.y,
            stalled: false,
            brakeStartX: null,
            reverseDistance: 0,
        };
    }
}
