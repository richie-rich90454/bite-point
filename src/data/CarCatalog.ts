import carsJson from "./cars.json";
import type { CarDefinition } from "./CarTypes";
import { assertValidVehicleConfig } from "../simulation/config/VehicleConfig";

const rawCars = carsJson as unknown as CarDefinition[];

export const CARS: CarDefinition[] = rawCars.map((car) => ({
    ...car,
    config: assertValidVehicleConfig(car.config),
}));

export const DEFAULT_CAR_ID = "reference-performance-6mt";

export function getCar(id: string): CarDefinition | undefined {
    return CARS.find((car) => car.id === id);
}

export function carsByTier(): Map<number, CarDefinition[]> {
    const tiers = new Map<number, CarDefinition[]>();
    for (const car of CARS) {
        const tier = tiers.get(car.tier);
        if (tier) tier.push(car);
        else tiers.set(car.tier, [car]);
    }
    return tiers;
}
