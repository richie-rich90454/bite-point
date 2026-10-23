import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";

const GOLD = "#c6a15b";
const GOLD_BRIGHT = "#e0bd7c";
const GOLD_DIM = "rgba(198, 161, 91, 0.28)";
const GOLD_FAINT = "rgba(198, 161, 91, 0.12)";
const IVORY = "#efe6d4";
const PARCHMENT = "#d8cab0";
const MUTED = "rgba(216, 202, 176, 0.46)";
const RED = "#a84942";
const SAGE = "#849b7d";
const DISPLAY = "'Bodoni MT', 'Bodoni 72', Didot, Baskerville, Georgia, serif";
const UI = "Bahnschrift, 'Aptos Narrow', 'Segoe UI', sans-serif";
const MONO = "'Cascadia Mono', Consolas, monospace";

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

    this.drawPlaque();
    this.drawTachometer(state, 122, 106);
    this.drawSpeedometer(state, 282, 101);
    this.drawGear(state, 426, 74, shifterGrabbed);
    this.drawPedals(state, 446, 128);
    this.drawShifter(state, 347, 160);

    context.restore();
  }

  private drawPlaque(): void {
    const context = this.context;
    context.fillStyle = "rgba(8, 7, 5, 0.92)";
    context.fillRect(12, 4, 536, 192);
    context.strokeStyle = GOLD_DIM;
    context.lineWidth = 1;
    context.strokeRect(12.5, 4.5, 535, 191);
    context.strokeStyle = GOLD_FAINT;
    context.strokeRect(17.5, 9.5, 525, 181);

    context.strokeStyle = "rgba(198, 161, 91, 0.5)";
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

    context.fillStyle = GOLD;
    context.font = `600 7px ${UI}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("BITE POINT", 280, 17);
    context.fillStyle = MUTED;
    context.font = `400 7px ${UI}`;
    context.fillText("INSTRUMENTS", 280, 27);
  }

  private drawTachometer(state: VehicleRenderState, cx: number, cy: number): void {
    const context = this.context;
    const radius = 72;
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const fraction = Math.min(1, state.rpm / 7000);

    context.beginPath();
    context.arc(cx, cy, radius, start, end);
    context.lineWidth = 1;
    context.strokeStyle = "rgba(216, 202, 176, 0.22)";
    context.stroke();

    context.beginPath();
    context.arc(cx, cy, radius, start, start + (end - start) * 0.93);
    context.lineWidth = 2;
    context.strokeStyle = "rgba(168, 73, 66, 0.62)";
    context.stroke();

    context.beginPath();
    context.arc(cx, cy, radius, start, start + (end - start) * fraction);
    context.lineWidth = 2.4;
    context.strokeStyle = state.rpm > 6500 ? RED : GOLD;
    context.stroke();

    for (let index = 0; index <= 28; index += 1) {
      const angle = start + (end - start) * (index / 28);
      const major = index % 4 === 0;
      const inner = radius - (major ? 10 : 5);
      const outer = radius - 1;
      context.beginPath();
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      context.strokeStyle = index / 4 >= 6.5 ? "rgba(168, 73, 66, 0.85)" : major ? PARCHMENT : "rgba(216, 202, 176, 0.3)";
      context.lineWidth = major ? 1.2 : 0.7;
      context.stroke();
    }

    for (let index = 0; index <= 7; index += 1) {
      const angle = start + (end - start) * (index / 7);
      context.fillStyle = index >= 7 ? RED : PARCHMENT;
      context.font = `400 11px ${DISPLAY}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index), cx + Math.cos(angle) * (radius - 22), cy + Math.sin(angle) * (radius - 22));
    }

    const needleAngle = start + (end - start) * fraction;
    context.beginPath();
    context.moveTo(cx - Math.cos(needleAngle) * 8, cy - Math.sin(needleAngle) * 8);
    context.lineTo(cx + Math.cos(needleAngle) * (radius - 15), cy + Math.sin(needleAngle) * (radius - 15));
    context.strokeStyle = state.rpm > 6500 ? RED : GOLD_BRIGHT;
    context.lineWidth = 1.4;
    context.stroke();

    context.beginPath();
    context.moveTo(cx, cy - 4);
    context.lineTo(cx + 4, cy);
    context.lineTo(cx, cy + 4);
    context.lineTo(cx - 4, cy);
    context.closePath();
    context.fillStyle = GOLD;
    context.fill();

    context.fillStyle = IVORY;
    context.font = `400 17px ${DISPLAY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${Math.max(0, state.rpm).toFixed(0)}`, cx, cy + 32);
    context.fillStyle = MUTED;
    context.font = `600 7px ${UI}`;
    context.fillText("RPM", cx, cy + 47);
  }

  private drawSpeedometer(state: VehicleRenderState, cx: number, cy: number): void {
    const context = this.context;
    const speedFraction = Math.min(1, state.speedKph / 200);
    context.beginPath();
    context.arc(cx, cy - 6, 52, Math.PI * 1.18, Math.PI * 1.82);
    context.strokeStyle = "rgba(216, 202, 176, 0.17)";
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.arc(cx, cy - 6, 52, Math.PI * 1.18, Math.PI * 1.18 + Math.PI * 0.64 * speedFraction);
    context.strokeStyle = GOLD_DIM;
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = IVORY;
    context.font = `400 46px ${DISPLAY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(state.speedKph.toFixed(0), cx, cy + 2);
    context.fillStyle = MUTED;
    context.font = `600 8px ${UI}`;
    context.fillText("KM/H", cx, cy + 31);

    const surface = state.sessionSurfaceMu < 0.8 ? "WET" : "DRY";
    context.font = `400 9px ${MONO}`;
    context.fillStyle = state.sessionSurfaceMu < 0.8 ? "#8ab6cb" : MUTED;
    context.fillText(surface, cx, cy + 55);
  }

  private drawGear(state: VehicleRenderState, x: number, y: number, grabbed: boolean): void {
    const context = this.context;
    context.fillStyle = grabbed ? "rgba(198,161,91,0.10)" : "rgba(216,202,176,0.025)";
    context.fillRect(x - 27, y - 39, 54, 70);
    context.strokeStyle = grabbed ? GOLD : GOLD_DIM;
    context.lineWidth = 1;
    context.strokeRect(x - 26.5, y - 38.5, 53, 69);
    context.strokeStyle = GOLD_FAINT;
    context.strokeRect(x - 22.5, y - 34.5, 45, 61);

    context.fillStyle = grabbed ? GOLD_BRIGHT : IVORY;
    context.font = `400 40px ${DISPLAY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(state.gearLabel, x, y - 2);
    context.fillStyle = MUTED;
    context.font = `600 7px ${UI}`;
    context.fillText(grabbed ? "LEVER" : "GEAR", x, y + 23);
  }

  private drawPedals(state: VehicleRenderState, x: number, y: number): void {
    const context = this.context;
    const bars: Array<[string, number, string]> = [
      ["C", state.clutchPedal, GOLD],
      ["B", state.brake, RED],
      ["T", state.throttle, SAGE],
    ];
    const low = state.clutchBitePedal - state.clutchEngagementWidth / 2;
    const high = state.clutchBitePedal + state.clutchEngagementWidth / 2;
    for (let index = 0; index < bars.length; index += 1) {
      const [label, value, color] = bars[index]!;
      const bx = x + index * 26;
      context.fillStyle = "rgba(216,202,176,0.05)";
      context.fillRect(bx, y, 13, 50);
      context.strokeStyle = GOLD_FAINT;
      context.lineWidth = 1;
      context.strokeRect(bx + 0.5, y + 0.5, 12, 49);

      if (index === 0) {
        context.fillStyle = "rgba(198,161,91,0.11)";
        context.fillRect(bx + 1, y + 50 - high * 48, 11, (high - low) * 48);
        context.strokeStyle = GOLD_DIM;
        context.beginPath();
        context.moveTo(bx - 2, y + 50 - high * 48);
        context.lineTo(bx + 15, y + 50 - high * 48);
        context.stroke();
      }

      const height = Math.max(0, Math.min(1, value)) * 48;
      context.fillStyle = color;
      context.fillRect(bx + 2, y + 50 - height, 9, height);
      context.fillStyle = label === "C" && value > low && value < high ? GOLD_BRIGHT : MUTED;
      context.font = `600 7px ${UI}`;
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
    context.strokeStyle = "rgba(216,202,176,0.22)";
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
      context.fillStyle = state.gear === gear ? GOLD_BRIGHT : MUTED;
      context.font = `400 10px ${DISPLAY}`;
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
    context.fillStyle = state.shifterGrabbed ? GOLD_BRIGHT : PARCHMENT;
    context.fill();
  }
}
