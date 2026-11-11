import type { Drivetrain, VehicleConfig } from "../simulation/config/VehicleConfig";

export type EngineType = "NA" | "Turbo" | "Hybrid" | "Electric";

export interface CarDefinition {
    id: string;
    name: string;
    tier: number;
    engineType: EngineType;
    drivetrain: Drivetrain;
    modelId: string;
    paintColor: string;
    soundSet: string;
    config: VehicleConfig;
}
