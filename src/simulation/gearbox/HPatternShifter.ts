import type { GateSlot, GearPosition } from "../config/VehicleConfig";

export interface ShifterParameters {
    positions: GearPosition[];
    shiftTimeS: number;
}

export interface ShifterMoveResult {
    moved: boolean;
    axis: "gate" | "slot";
}

export class HPatternShifter {
    grabbed = false;
    gate: number;
    slot: GateSlot = 0;
    visualGate: number;
    visualSlot = 0;
    private readonly positions: GearPosition[];
    private readonly neutralGate: number;

    constructor(params: ShifterParameters) {
        this.positions = params.positions;
        const neutral = params.positions.find((position) => position.gear === 0);
        this.neutralGate = neutral?.gate ?? 1;
        this.gate = this.neutralGate;
        this.visualGate = this.gate;
    }

    get selectedGear(): number {
        const position = this.positions.find(
            (item) => item.gate === this.gate && item.slot === this.slot,
        );
        return position?.gear ?? 0;
    }

    get canMove(): boolean {
        return this.grabbed;
    }

    grab(): void {
        this.grabbed = true;
    }

    cancel(): void {
        this.grabbed = false;
    }

    release(): number {
        this.grabbed = false;
        return this.selectedGear;
    }

    moveLeft(): ShifterMoveResult {
        return this.moveGate(-1);
    }

    moveRight(): ShifterMoveResult {
        return this.moveGate(1);
    }

    moveUp(): ShifterMoveResult {
        return this.moveSlot(-1);
    }

    moveDown(): ShifterMoveResult {
        return this.moveSlot(1);
    }

    requestNeutral(): void {
        const neutral = this.positions.find((position) => position.gear === 0);
        this.gate = neutral?.gate ?? this.neutralGate;
        this.slot = 0;
        this.grabbed = false;
    }

    requestReverse(): boolean {
        const reverse = this.positions.find((position) => position.gear === -1);
        if (!reverse) return false;
        this.gate = reverse.gate;
        this.slot = reverse.slot;
        this.grabbed = false;
        return true;
    }

    setPositionForGear(gear: number): void {
        const position = this.positions.find((item) => item.gear === gear);
        if (position) {
            this.gate = position.gate;
            this.slot = position.slot;
        } else {
            this.requestNeutral();
        }
    }

    update(dt: number): void {
        const gateSpeed = 9;
        const slotSpeed = 7;
        this.visualGate += (this.gate - this.visualGate) * Math.min(1, gateSpeed * dt);
        this.visualSlot += (this.slot - this.visualSlot) * Math.min(1, slotSpeed * dt);
        if (Math.abs(this.gate - this.visualGate) < 0.001) this.visualGate = this.gate;
        if (Math.abs(this.slot - this.visualSlot) < 0.001) this.visualSlot = this.slot;
    }

    gearsInGate(gate: number): number[] {
        return this.positions
            .filter((position) => position.gate === gate)
            .map((position) => position.gear);
    }

    gateBounds(gate: number): { min: number; max: number } | null {
        const slots = this.positions
            .filter((position) => position.gate === gate)
            .map((position) => position.slot);
        if (slots.length === 0) return null;
        return { min: Math.min(...slots), max: Math.max(...slots) };
    }

    allPositions(): ReadonlyArray<GearPosition> {
        return this.positions;
    }

    reset(gear = 0): void {
        this.grabbed = false;
        this.setPositionForGear(gear);
        this.visualGate = this.gate;
        this.visualSlot = this.slot;
    }

    private moveGate(direction: -1 | 1): ShifterMoveResult {
        if (!this.grabbed || this.slot !== 0) return { moved: false, axis: "gate" };
        const gates = [...new Set(this.positions.map((position) => position.gate))].sort(
            (a, b) => a - b,
        );
        const index = gates.indexOf(this.gate);
        const next = gates[index + direction];
        if (next === undefined) return { moved: false, axis: "gate" };
        this.gate = next;
        return { moved: true, axis: "gate" };
    }

    private moveSlot(direction: -1 | 1): ShifterMoveResult {
        if (!this.grabbed) return { moved: false, axis: "slot" };
        if (this.slot !== 0) {
            if (direction !== (this.slot > 0 ? -1 : 1)) return { moved: false, axis: "slot" };
            this.slot = 0;
            return { moved: true, axis: "slot" };
        }
        const bounds = this.gateBounds(this.gate);
        if (!bounds) return { moved: false, axis: "slot" };
        if (direction < 0 && bounds.min > -1) return { moved: false, axis: "slot" };
        if (direction > 0 && bounds.max < 1) return { moved: false, axis: "slot" };
        this.slot = direction;
        return { moved: true, axis: "slot" };
    }
}
