import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";
import type { SpeedUnits } from "../settings/SettingsRepository";

const AMBER = "#e8b04b";
const AMBER_BRIGHT = "#f2c56d";
const AMBER_DIM = "rgba(232, 176, 75, 0.28)";
const AMBER_FAINT = "rgba(232, 176, 75, 0.12)";
const TEXT = "#e9edef";
const TEXT_SECONDARY = "#c3cbd0";
const MUTED = "rgba(195, 203, 208, 0.58)";
const RED = "#e07a6a";
const SAGE = "#86b58a";
const FONT = "'Noto Sans'";
const DEFAULT_SPEEDOMETER_MAX_KPH = 260;

export interface DashboardPresenterOptions {
    speedometerMaxKph?: number;
    maxRpm?: number;
    units?: SpeedUnits;
}

export class DashboardPresenter {
    private readonly context: CanvasRenderingContext2D;
    private speedometerMaxKph: number;
    private maxRpm: number;
    private units: SpeedUnits;
    private width = 0;
    private height = 0;
    private dpr = 1;

    constructor(
        private readonly canvas: HTMLCanvasElement,
        options: DashboardPresenterOptions = {},
    ) {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The dashboard canvas could not be created.");
        this.context = context;
        const configured = options.speedometerMaxKph;
        this.speedometerMaxKph =
            typeof configured === "number" && Number.isFinite(configured) && configured > 0
                ? configured
                : DEFAULT_SPEEDOMETER_MAX_KPH;
        this.maxRpm = options.maxRpm ?? 9000;
        this.units = options.units ?? "metric";
        canvas.style.fontVariantNumeric = "tabular-nums";
    }

    setUnits(units: SpeedUnits): void {
        this.units = units;
    }

    setLimits(options: DashboardPresenterOptions): void {
        if (
            typeof options.speedometerMaxKph === "number" &&
            Number.isFinite(options.speedometerMaxKph) &&
            options.speedometerMaxKph > 0
        ) {
            this.speedometerMaxKph = options.speedometerMaxKph;
        }
        if (
            typeof options.maxRpm === "number" &&
            Number.isFinite(options.maxRpm) &&
            options.maxRpm > 0
        ) {
            this.maxRpm = options.maxRpm;
        }
    }

    draw(state: VehicleRenderState, shifterGrabbed: boolean): void {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (rect.width !== this.width || rect.height !== this.height || dpr !== this.dpr) {
            this.width = rect.width;
            this.height = rect.height;
            this.dpr = dpr;
            this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
            this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
        }
        const context = this.context;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, rect.width, rect.height);

        const scale = Math.min(rect.width / 560, rect.height / 200);
        context.save();
        context.translate((rect.width - 560 * scale) / 2, (rect.height - 200 * scale) / 2);
        context.scale(scale, scale);

        this.drawPlaque();
        this.drawShiftLights(state);
        this.drawTachometer(state, 122, 106);
        this.drawSpeedometer(state, 282, 101);
        this.drawGear(state, 426, 74, shifterGrabbed);
        this.drawPedals(state, 446, 128);
        this.drawShifter(state, 347, 160);

        context.restore();
    }

    private drawShiftLights(state: VehicleRenderState): void {
        const context = this.context;
        const count = 9;
        const width = 9;
        const gap = 3;
        const total = count * width + (count - 1) * gap;
        const startX = 280 - total / 2;
        const fraction = Math.min(1, Math.max(0, state.rpm / this.maxRpm));
        for (let index = 0; index < count; index += 1) {
            const threshold = 0.68 + (0.97 - 0.68) * (index / (count - 1));
            const lit = state.engineRunning && fraction >= threshold;
            const color = index < 3 ? SAGE : index < 7 ? AMBER : RED;
            context.fillStyle = lit ? color : "rgba(255,255,255,0.08)";
            if (lit) {
                context.shadowColor = color;
                context.shadowBlur = 10;
            }
            context.fillRect(startX + index * (width + gap), 36, width, 5);
            context.shadowBlur = 0;
        }
        if (state.fuelCut) {
            context.fillStyle = RED;
            context.font = `700 6px ${FONT}`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("Limiter", 280, 47);
        }
    }

    private drawPlaque(): void {
        const context = this.context;
        context.fillStyle = "rgba(16, 20, 23, 0.96)";
        context.fillRect(12, 4, 536, 192);
        context.strokeStyle = AMBER_DIM;
        context.lineWidth = 1;
        context.strokeRect(12.5, 4.5, 535, 191);
        context.strokeStyle = AMBER_FAINT;
        context.strokeRect(17.5, 9.5, 525, 181);

        context.strokeStyle = "rgba(232, 176, 75, 0.5)";
        context.lineWidth = 1;
        for (const [x, y, dx, dy] of [
            [23, 15, 10, 0],
            [23, 15, 0, 7],
            [517, 15, 10, 0],
            [527, 15, 0, 7],
            [23, 185, 10, 0],
            [23, 178, 0, 7],
            [517, 185, 10, 0],
            [527, 178, 0, 7],
        ] as Array<[number, number, number, number]>) {
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + dx, y + dy);
            context.stroke();
        }

        context.fillStyle = AMBER;
        context.font = `600 7px ${FONT}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("Bite Point", 280, 17);
        context.fillStyle = MUTED;
        context.font = `400 7px ${FONT}`;
        context.fillText("Instrument panel", 280, 27);
    }

    private drawTachometer(state: VehicleRenderState, cx: number, cy: number): void {
        const context = this.context;
        const radius = 72;
        const start = Math.PI * 0.75;
        const end = Math.PI * 2.25;
        const fraction = Math.min(1, state.rpm / this.maxRpm);
        const redlineFraction = 0.94;

        context.beginPath();
        context.arc(cx, cy, radius, start, end);
        context.lineWidth = 1;
        context.strokeStyle = "rgba(195, 203, 208, 0.22)";
        context.stroke();

        context.beginPath();
        context.arc(cx, cy, radius, start, start + (end - start) * 0.97);
        context.lineWidth = 2;
        context.strokeStyle = "rgba(168, 73, 66, 0.62)";
        context.stroke();

        context.beginPath();
        context.arc(cx, cy, radius, start, start + (end - start) * fraction);
        context.lineWidth = 2.4;
        context.strokeStyle = fraction > redlineFraction ? RED : AMBER;
        context.stroke();

        for (let index = 0; index <= 36; index += 1) {
            const angle = start + (end - start) * (index / 36);
            const major = index % 4 === 0;
            const inner = radius - (major ? 10 : 5);
            const outer = radius - 1;
            context.beginPath();
            context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            context.strokeStyle =
                index / 36 >= redlineFraction
                    ? "rgba(168, 73, 66, 0.85)"
                    : major
                      ? TEXT_SECONDARY
                      : "rgba(195, 203, 208, 0.3)";
            context.lineWidth = major ? 1.2 : 0.7;
            context.stroke();
        }

        for (let index = 1; index <= 9; index += 1) {
            const angle = start + (end - start) * (index / 9);
            context.fillStyle = index / 9 >= redlineFraction ? RED : TEXT_SECONDARY;
            context.font = `400 11px ${FONT}`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(
                String(index),
                cx + Math.cos(angle) * (radius - 22),
                cy + Math.sin(angle) * (radius - 22),
            );
        }

        const needleAngle = start + (end - start) * fraction;
        context.beginPath();
        context.moveTo(cx - Math.cos(needleAngle) * 8, cy - Math.sin(needleAngle) * 8);
        context.lineTo(
            cx + Math.cos(needleAngle) * (radius - 15),
            cy + Math.sin(needleAngle) * (radius - 15),
        );
        context.strokeStyle = fraction > redlineFraction ? RED : AMBER_BRIGHT;
        context.lineWidth = 1.4;
        context.stroke();

        context.beginPath();
        context.moveTo(cx, cy - 4);
        context.lineTo(cx + 4, cy);
        context.lineTo(cx, cy + 4);
        context.lineTo(cx - 4, cy);
        context.closePath();
        context.fillStyle = AMBER;
        context.fill();

        context.fillStyle = TEXT;
        context.font = `400 17px ${FONT}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(`${Math.max(0, state.rpm).toFixed(0)}`, cx, cy + 32);
        context.fillStyle = MUTED;
        context.font = `600 7px ${FONT}`;
        context.fillText("rpm", cx, cy + 47);
    }

    private drawSpeedometer(state: VehicleRenderState, cx: number, cy: number): void {
        const context = this.context;
        const imperial = this.units === "imperial";
        const displayedSpeed = imperial ? state.speedKph * 0.621371 : state.speedKph;
        const displayedMax = imperial ? this.speedometerMaxKph * 0.621371 : this.speedometerMaxKph;
        const speedFraction = Math.min(1, Math.max(0, displayedSpeed) / displayedMax);
        context.beginPath();
        context.arc(cx, cy - 6, 52, Math.PI * 1.18, Math.PI * 1.82);
        context.strokeStyle = "rgba(195, 203, 208, 0.17)";
        context.lineWidth = 1;
        context.stroke();
        context.beginPath();
        context.arc(
            cx,
            cy - 6,
            52,
            Math.PI * 1.18,
            Math.PI * 1.18 + Math.PI * 0.64 * speedFraction,
        );
        context.strokeStyle = AMBER_DIM;
        context.lineWidth = 2;
        context.stroke();

        context.fillStyle = TEXT;
        context.font = `400 46px ${FONT}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(displayedSpeed.toFixed(0), cx, cy + 2);
        context.fillStyle = MUTED;
        context.font = `600 8px ${FONT}`;
        context.fillText(imperial ? "mph" : "km/h", cx, cy + 31);

        const surface = state.sessionSurfaceMu < 0.8 ? "Wet" : "Dry";
        context.font = `400 9px ${FONT}`;
        context.fillStyle = state.sessionSurfaceMu < 0.8 ? SAGE : MUTED;
        context.fillText(surface, cx, cy + 55);
    }

    private drawGear(state: VehicleRenderState, x: number, y: number, grabbed: boolean): void {
        const context = this.context;
        context.fillStyle = grabbed ? "rgba(232,176,75,0.10)" : "rgba(195,203,208,0.03)";
        context.fillRect(x - 27, y - 39, 54, 70);
        context.strokeStyle = grabbed ? AMBER : AMBER_DIM;
        context.lineWidth = 1;
        context.strokeRect(x - 26.5, y - 38.5, 53, 69);
        context.strokeStyle = AMBER_FAINT;
        context.strokeRect(x - 22.5, y - 34.5, 45, 61);

        context.fillStyle = grabbed ? AMBER_BRIGHT : TEXT;
        context.font = `400 40px ${FONT}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(state.gearLabel, x, y - 2);
        const phase = state.launchControlPhase ?? "idle";
        if (phase !== "idle") {
            context.fillStyle = phase === "launched" ? SAGE : AMBER_BRIGHT;
            context.font = `700 7px ${FONT}`;
            context.fillText(
                phase === "holding" ? "Armed" : phase === "releasing" ? "Launch" : "Go",
                x,
                y + 30,
            );
            return;
        }
        context.fillStyle = MUTED;
        context.font = `600 7px ${FONT}`;
        context.fillText(grabbed ? "Lever" : "Gear", x, y + 23);
    }

    private drawPedals(state: VehicleRenderState, x: number, y: number): void {
        const context = this.context;
        const bars: Array<[string, number, string]> = [
            ["C", state.clutchPedal, AMBER],
            ["B", state.brake, RED],
            ["T", state.throttle, SAGE],
        ];
        const low = state.clutchBitePedal - state.clutchEngagementWidth / 2;
        const high = state.clutchBitePedal + state.clutchEngagementWidth / 2;
        for (let index = 0; index < bars.length; index += 1) {
            const [label, value, color] = bars[index]!;
            const bx = x + index * 26;
            context.fillStyle = "rgba(195,203,208,0.05)";
            context.fillRect(bx, y, 13, 50);
            context.strokeStyle = AMBER_FAINT;
            context.lineWidth = 1;
            context.strokeRect(bx + 0.5, y + 0.5, 12, 49);

            if (index === 0) {
                context.fillStyle = "rgba(232,176,75,0.11)";
                context.fillRect(bx + 1, y + 50 - high * 48, 11, (high - low) * 48);
                context.strokeStyle = AMBER_DIM;
                context.beginPath();
                context.moveTo(bx - 2, y + 50 - high * 48);
                context.lineTo(bx + 15, y + 50 - high * 48);
                context.stroke();
            }

            const height = Math.max(0, Math.min(1, value)) * 48;
            context.fillStyle = color;
            context.fillRect(bx + 2, y + 50 - height, 9, height);
            context.fillStyle = label === "C" && value > low && value < high ? AMBER_BRIGHT : MUTED;
            context.font = `600 7px ${FONT}`;
            context.textAlign = "center";
            context.fillText(label, bx + 6.5, y + 61);
        }
    }

    private drawShifter(state: VehicleRenderState, x: number, y: number): void {
        const context = this.context;
        const gateSpacing = 16;
        const slotHeight = 10;
        const positions: Array<[number, number, string, number]> = [
            [0, -1, "1", 1],
            [0, 1, "2", 2],
            [1, -1, "3", 3],
            [1, 1, "4", 4],
            [2, -1, "5", 5],
            [2, 1, "6", 6],
            [3, -1, "R", -1],
        ];
        context.strokeStyle = "rgba(195,203,208,0.22)";
        context.lineWidth = 1;
        for (let gate = 0; gate < 4; gate += 1) {
            const gx = x + (gate - 1) * gateSpacing;
            context.beginPath();
            context.moveTo(gx, y - slotHeight);
            context.lineTo(gx, y + slotHeight);
            context.stroke();
        }
        context.beginPath();
        context.moveTo(x - gateSpacing, y);
        context.lineTo(x + gateSpacing * 2, y);
        context.stroke();

        for (const [gate, slot, label, gear] of positions) {
            const gx = x + (gate - 1) * gateSpacing;
            const gy = y + slot * slotHeight;
            context.fillStyle = state.gear === gear ? AMBER_BRIGHT : MUTED;
            context.font = `400 10px ${FONT}`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(label, gx + 7, gy);
        }

        const leverX = x + (state.shifterGate - 1) * gateSpacing;
        const leverY = y + state.shifterSlot * slotHeight;
        context.beginPath();
        context.moveTo(leverX, leverY - 3.4);
        context.lineTo(leverX + 3.4, leverY);
        context.lineTo(leverX, leverY + 3.4);
        context.lineTo(leverX - 3.4, leverY);
        context.closePath();
        context.fillStyle = state.shifterGrabbed ? AMBER_BRIGHT : TEXT_SECONDARY;
        context.fill();
    }
}
