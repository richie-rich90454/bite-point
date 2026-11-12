import type { VehicleSimulation, SimEvent } from "../simulation/vehicle/VehicleSimulation";
import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";

export interface InstructorMessage {
    text: string;
    timeS: number;
    kind: "info" | "warning" | "success";
}

export class DrivingInstructor {
    enabled: boolean;
    redlineRpm = 9000;
    readonly messages: InstructorMessage[] = [];
    private cooldowns = new Map<string, number>();
    private ridingClutchTime = 0;
    private timeS = 0;

    constructor(enabled = true) {
        this.enabled = enabled;
    }

    update(
        sim: VehicleSimulation,
        state: VehicleRenderState,
        events: SimEvent[],
        dt: number,
    ): void {
        this.timeS += dt;
        if (!this.enabled) return;

        for (const event of events) {
            if (event.type === "stall") {
                this.push(
                    "Stall: the engine could not overcome the load. Clutch in earlier, or add a little throttle at the bite point.",
                    "warning",
                    event.timeS,
                    0,
                );
            } else if (event.type === "gear-rejected") {
                this.push(event.message, "warning", event.timeS, 0);
            } else if (event.type === "reverse-blocked") {
                this.push(event.message, "warning", event.timeS, 0);
            } else if (event.type === "wheel-lock") {
                this.push(
                    "A wheel is locked and sliding. Ease brake pressure so the tire can steer.",
                    "warning",
                    event.timeS,
                    0,
                );
            } else if (event.type === "clutch-overheat") {
                this.push(
                    `Clutch at ${state.clutchTemperatureC.toFixed(0)} °C. Less slip and more cooling time will protect it.`,
                    "warning",
                    event.timeS,
                    0,
                );
            }
        }

        if (!state.engineRunning) {
            if (!state.ignition) {
                this.push(
                    "Ignition is off. Press I to switch it on, then hold K to crank the starter.",
                    "info",
                    this.timeS,
                    6,
                    "ignition",
                );
            } else if (!state.starter && !state.cranking) {
                this.push(
                    "Hold K to crank the engine. Keep the clutch pressed so the car does not lurch.",
                    "info",
                    this.timeS,
                    6,
                    "starter",
                );
            }
        }

        if (state.slopeForward > 0.02 && state.pose.vx < -0.15) {
            const grade = (Math.tan(state.slopeForward) * 100).toFixed(0);
            this.push(
                `Rolling back at ${(Math.abs(state.pose.vx) * 3.6).toFixed(1)} km/h on a ${grade}% grade. Gravity is winning: add clutch bite or hold the brake.`,
                "warning",
                this.timeS,
                3,
                "rollback",
            );
        }

        if (
            state.clutchMode === "slipping" &&
            state.speedMps < 3 &&
            state.rpm > 2200 &&
            state.throttle > 0.35
        ) {
            this.push(
                `Clutch slipping at ${state.rpm.toFixed(0)} rpm with ${state.clutchCapacityNm.toFixed(0)} Nm capacity. Too much throttle makes heat, not progress.`,
                "warning",
                this.timeS,
                5,
                "slip",
            );
        }

        if (
            state.clutchMode === "slipping" &&
            state.speedMps > 4 &&
            state.clutchEngagement > 0.15 &&
            state.clutchEngagement < 0.95
        ) {
            this.ridingClutchTime += dt;
            if (this.ridingClutchTime > 1.5) {
                this.push(
                    "You are riding the clutch. Once moving, release X fully and let the clutch lock.",
                    "warning",
                    this.timeS,
                    5,
                    "riding",
                );
                this.ridingClutchTime = 0;
            }
        } else {
            this.ridingClutchTime = Math.max(0, this.ridingClutchTime - dt * 2);
        }

        if (
            state.gear > 0 &&
            state.engineRunning &&
            state.rpm < 900 &&
            state.throttle > 0.25 &&
            state.speedMps > 0.5
        ) {
            this.push(
                `The engine is lugging at ${state.rpm.toFixed(0)} rpm in ${state.gearLabel}. Downshift or add clutch slip carefully.`,
                "warning",
                this.timeS,
                4,
                "lugging",
            );
        }

        if (state.rpm > this.redlineRpm * 0.92 && state.gear > 0 && state.gear < 6) {
            this.push(
                `Approaching the redline at ${state.rpm.toFixed(0)} rpm. Shift up.`,
                "info",
                this.timeS,
                4,
                "revs",
            );
        }

        if (state.launchControlPhase === "holding") {
            this.push(
                "Launch control is holding the launch RPM with the clutch open. Keep the throttle down and release the brake to launch.",
                "info",
                this.timeS,
                6,
                "launch-armed",
            );
        } else if (state.launchControlPhase === "releasing") {
            this.push(
                "Launching. Keep the throttle down while the clutch engages.",
                "info",
                this.timeS,
                4,
                "launch-release",
            );
        } else if (state.launchControlPhase === "launched") {
            this.push(
                "Launched. Keep the clutch engaged and shift at the redline.",
                "info",
                this.timeS,
                5,
                "launch-done",
            );
        }

        if (
            state.clutchMode === "slipping" &&
            state.gear === 1 &&
            state.speedMps < 0.6 &&
            state.clutchPedal > 0.35 &&
            state.clutchPedal < 0.75
        ) {
            this.push(
                "This is the bite point: hold it here, add a little throttle, then release slowly.",
                "info",
                this.timeS,
                5,
                "bite",
            );
        }

        if (
            state.speedMps < 0.05 &&
            state.engineRunning &&
            state.gear === 1 &&
            state.clutchEngagement > 0.9 &&
            !state.handbrake
        ) {
            this.push(
                "First gear is engaged with the clutch out. Expect a stall or a lurch unless you press Z.",
                "info",
                this.timeS,
                6,
                "creep",
            );
        }

        if (
            state.gear === 0 &&
            state.engineRunning &&
            state.clutchPedal < 0.2 &&
            state.speedMps < 0.1
        ) {
            this.push(
                "In neutral. Press Enter to grab the lever, then use the arrow keys to select a gate.",
                "info",
                this.timeS,
                8,
                "neutralhint",
            );
        }

        void sim;
    }

    toggle(): void {
        this.enabled = !this.enabled;
    }

    clear(): void {
        this.messages.length = 0;
        this.cooldowns.clear();
        this.ridingClutchTime = 0;
    }

    private push(
        text: string,
        kind: InstructorMessage["kind"],
        timeS: number,
        cooldownS: number,
        key?: string,
    ): void {
        const keyName = key ?? text;
        const nextAllowed = this.cooldowns.get(keyName) ?? 0;
        if (timeS < nextAllowed) return;
        if (cooldownS > 0) this.cooldowns.set(keyName, timeS + cooldownS);
        if (this.messages.length > 0 && this.messages[this.messages.length - 1]!.text === text)
            return;
        this.messages.push({ text, timeS, kind });
        while (this.messages.length > 4) this.messages.shift();
    }
}
