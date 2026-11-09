import { describe, expect, it } from "vitest";
import { ClutchModel } from "../../src/simulation/clutch/ClutchModel";
import config from "../../src/data/reference-compact.json";

const makeClutch = (): ClutchModel => new ClutchModel(config.clutch);

describe("ClutchModel", () => {
    it("maps pedal travel from engaged to disengaged", () => {
        const clutch = makeClutch();
        expect(clutch.engagementForPedal(0)).toBeCloseTo(1, 5);
        expect(clutch.engagementForPedal(1)).toBeCloseTo(0, 5);
        const bite = clutch.engagementForPedal(config.clutch.bitePoint);
        expect(bite).toBeGreaterThan(0.4);
        expect(bite).toBeLessThan(0.6);
    });

    it("transmits no torque when fully disengaged", () => {
        const clutch = makeClutch();
        const result = clutch.computeTorque(1, 90, 0, 1 / 250, 0.19, 23000);
        expect(result.mode).toBe("open");
        expect(result.torqueNm).toBe(0);
        expect(result.temperatureC).toBe(config.clutch.ambientTempC);
    });

    it("slips at bounded capacity and heats up", () => {
        const clutch = makeClutch();
        const result = clutch.computeTorque(0, 90, 0, 1 / 250, 0.19, 23000);
        expect(result.mode).toBe("slipping");
        expect(Math.abs(result.torqueNm)).toBeLessThanOrEqual(config.clutch.maxCapacityNm + 1e-6);
        expect(result.slipPowerW).toBeGreaterThan(0);
        expect(result.temperatureC).toBeGreaterThan(config.clutch.ambientTempC);
        expect(result.wear).toBeGreaterThan(0);
    });

    it("locks without frictional heat when speeds match", () => {
        const clutch = makeClutch();
        clutch.temperatureC = 100;
        const result = clutch.computeTorque(0, 90, 90, 1 / 250, 0.19, 23000);
        expect(result.mode).toBe("locked");
        expect(result.heatAddedJ).toBe(0);
        expect(result.temperatureC).toBeLessThan(100);
    });

    it("loses capacity when overheated", () => {
        const clutch = makeClutch();
        const cool = clutch.capacityForPedal(0);
        clutch.temperatureC = 400;
        const hot = clutch.capacityForPedal(0);
        expect(hot).toBeLessThan(cool);
        clutch.wear = 0.9;
        expect(clutch.capacityForPedal(0)).toBeLessThan(hot);
    });
});
