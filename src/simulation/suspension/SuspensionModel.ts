import { clamp } from "../core/MathUtils";

export interface SuspensionParameters {
    springRateNm: number;
    damperNsm: number;
    rideHeightM: number;
    maxCompressionM: number;
    bumpStopRateNm: number;
}

export class SuspensionModel {
    constructor(readonly params: SuspensionParameters) {}

    staticCompression(loadN: number): number {
        return Math.max(0, loadN) / this.params.springRateNm;
    }

    force(compressionM: number, compressionRateMps: number): number {
        const compression = clamp(compressionM, 0, this.params.maxCompressionM * 1.4);
        const spring = this.params.springRateNm * compression;
        const damper = this.params.damperNsm * compressionRateMps;
        const bumpTravel = compression - this.params.maxCompressionM;
        const bumpStop = bumpTravel > 0 ? this.params.bumpStopRateNm * bumpTravel : 0;
        return Math.max(0, spring + damper + bumpStop);
    }

    compressionForLoad(loadN: number): number {
        const springCompression = this.staticCompression(loadN);
        if (springCompression <= this.params.maxCompressionM) return springCompression;
        const bumpTravel =
            (loadN - this.params.springRateNm * this.params.maxCompressionM) /
            this.params.bumpStopRateNm;
        return Math.min(
            this.params.maxCompressionM * 1.4,
            this.params.maxCompressionM + Math.max(0, bumpTravel),
        );
    }

    get rideHeight(): number {
        return this.params.rideHeightM;
    }
}
