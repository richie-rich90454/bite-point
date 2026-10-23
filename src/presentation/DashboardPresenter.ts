import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";

const ACCENT = "#e8b04b";
const ACCENT_DIM = "rgba(232, 176, 75, 0.28)";
const TEXT = "#e8e6df";
const MUTED = "rgba(232, 230, 223, 0.45)";
const RED = "#e05b4b";

export class DashboardPresenter {
  private readonly context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The dashboard canvas could not be created.");
    this.context = context;
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

    this.drawTachometer(state, 128, 104);
    this.drawSpeedometer(state, 288, 98);
    this.drawGear(state, 430, 76, shifterGrabbed);
    this.drawPedals(state, 450, 130);
    this.drawShifter(state, 350, 156);

    context.restore();
  }

  private drawTachometer(state: VehicleRenderState, cx: number, cy: number): void {
    const context = this.context;
    const radius = 78;
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const fraction = Math.min(1, state.rpm / 7000);

    context.beginPath();
    context.arc(cx, cy, radius, start, end);
    context.lineWidth = 6;
    context.strokeStyle = "rgba(255,255,255,0.1)";
    context.stroke();

    context.beginPath();
    context.arc(cx, cy, radius, start + (end - start) * 0.93, end);
    context.lineWidth = 6;
    context.strokeStyle = "rgba(224, 91, 75, 0.75)";
    context.stroke();

    context.beginPath();
    context.arc(cx, cy, radius, start, start + (end - start) * fraction);
    context.lineWidth = 6;
    context.strokeStyle = state.rpm > 6500 ? RED : ACCENT;
    context.stroke();

    for (let index = 0; index <= 7; index += 1) {
      const angle = start + (end - start) * (index / 7);
      const inner = radius - 15;
      const outer = radius - 7;
      context.beginPath();
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      context.strokeStyle = index >= 6.5 ? RED : MUTED;
      context.lineWidth = index % 1 === 0 ? 2 : 1;
      context.stroke();
      context.fillStyle = MUTED;
      context.font = "10px ui-monospace, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index), cx + Math.cos(angle) * (radius - 25), cy + Math.sin(angle) * (radius - 25));
    }

    const needleAngle = start + (end - start) * fraction;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(needleAngle) * (radius - 16), cy + Math.sin(needleAngle) * (radius - 16));
    context.strokeStyle = state.rpm > 6500 ? RED : ACCENT;
    context.lineWidth = 2.4;
    context.stroke();
    context.beginPath();
    context.arc(cx, cy, 4.5, 0, Math.PI * 2);
    context.fillStyle = ACCENT;
    context.fill();

    context.fillStyle = TEXT;
    context.font = "600 15px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText(`${Math.max(0, state.rpm).toFixed(0)}`, cx, cy + 34);
    context.fillStyle = MUTED;
    context.font = "9px ui-sans-serif, sans-serif";
    context.fillText("RPM", cx, cy + 48);
  }

  private drawSpeedometer(state: VehicleRenderState, cx: number, cy: number): void {
    const context = this.context;
    context.beginPath();
    context.arc(cx, cy, 55, Math.PI * 1.2, Math.PI * 1.8);
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 3;
    context.stroke();
    const speedFraction = Math.min(1, state.speedKph / 220);
    context.beginPath();
    context.arc(cx, cy, 55, Math.PI * 1.2, Math.PI * 1.2 + Math.PI * 0.6 * speedFraction);
    context.strokeStyle = ACCENT_DIM;
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = TEXT;
    context.font = "700 34px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(state.speedKph.toFixed(0), cx, cy - 4);
    context.fillStyle = MUTED;
    context.font = "10px ui-sans-serif, sans-serif";
    context.fillText("km/h", cx, cy + 24);

    context.font = "11px ui-monospace, monospace";
    context.textAlign = "center";
    const surface = state.sessionSurfaceMu < 0.8 ? "WET" : "DRY";
    context.fillStyle = state.sessionSurfaceMu < 0.8 ? "#6fa8d6" : MUTED;
    context.fillText(surface, cx, cy + 45);
  }

  private drawGear(state: VehicleRenderState, x: number, y: number, grabbed: boolean): void {
    const context = this.context;
    context.fillStyle = grabbed ? "rgba(232,176,75,0.14)" : "rgba(255,255,255,0.04)";
    this.roundRect(x - 28, y - 42, 56, 74, 10);
    context.fill();
    if (grabbed) {
      context.strokeStyle = ACCENT_DIM;
      context.lineWidth = 1.5;
      context.stroke();
    }
    context.fillStyle = grabbed ? ACCENT : TEXT;
    context.font = "700 34px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(state.gearLabel, x, y - 4);
    context.fillStyle = MUTED;
    context.font = "8px ui-sans-serif, sans-serif";
    context.fillText(grabbed ? "LEVER" : "GEAR", x, y + 22);
  }

  private drawPedals(state: VehicleRenderState, x: number, y: number): void {
    const context = this.context;
    const bars: Array<[string, number, string]> = [
      ["C", state.clutchPedal, ACCENT],
      ["B", state.brake, RED],
      ["T", state.throttle, "#7fbf8a"],
    ];
    for (let index = 0; index < bars.length; index += 1) {
      const [label, value, color] = bars[index]!;
      const bx = x + index * 24;
      context.fillStyle = "rgba(255,255,255,0.06)";
      this.roundRect(bx, y, 14, 52, 4);
      context.fill();
      if (index === 0) {
        const low = state.clutchBitePedal - state.clutchEngagementWidth / 2;
        const high = state.clutchBitePedal + state.clutchEngagementWidth / 2;
        context.fillStyle = "rgba(232,176,75,0.14)";
        this.roundRect(bx, y + 52 - high * 48, 14, (high - low) * 48, 3);
        context.fill();
        context.strokeStyle = "rgba(232,176,75,0.5)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(bx - 2, y + 52 - high * 48);
        context.lineTo(bx + 16, y + 52 - high * 48);
        context.stroke();
      }
      context.fillStyle = color;
      const height = Math.max(0, Math.min(1, value)) * 48;
      this.roundRect(bx, y + 52 - height, 14, height, 4);
      context.fill();
      context.fillStyle = index === 0 && value > state.clutchBitePedal - state.clutchEngagementWidth / 2 && value < state.clutchBitePedal + state.clutchEngagementWidth / 2 ? ACCENT : MUTED;
      context.font = "8px ui-sans-serif, sans-serif";
      context.textAlign = "center";
      context.fillText(label, bx + 7, y + 64);
    }
  }

  private drawShifter(state: VehicleRenderState, x: number, y: number): void {
    const context = this.context;
    const gateSpacing = 17;
    const slotHeight = 11;
    const positions: Array<[number, number, string, number]> = [
      [0, -1, "1", 1],
      [0, 1, "2", 2],
      [1, -1, "3", 3],
      [1, 1, "4", 4],
      [2, -1, "5", 5],
      [2, 1, "6", 6],
      [3, -1, "R", -1],
    ];
    context.strokeStyle = "rgba(255,255,255,0.18)";
    context.lineWidth = 1.4;
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
      context.fillStyle = state.gear === gear ? ACCENT : MUTED;
      context.font = "8px ui-monospace, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, gx + 8, gy);
    }

    const leverX = x + (state.shifterGate - 1) * gateSpacing;
    const leverY = y + state.shifterSlot * slotHeight;
    context.beginPath();
    context.arc(leverX, leverY, 4.2, 0, Math.PI * 2);
    context.fillStyle = state.shifterGrabbed ? ACCENT : TEXT;
    context.fill();
    context.strokeStyle = "rgba(0,0,0,0.5)";
    context.lineWidth = 1;
    context.stroke();
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    const context = this.context;
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }
}
