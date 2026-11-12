import { hashSeed, mulberry32 } from "./SeededNoise";

export const CITY_BLOCK_M = 120;
export const CITY_ROAD_HALF_M = 16;
export const CITY_MEDIAN_HALF_M = 1.6;
export const CITY_SIDEWALK_M = 5;

export interface CityBuilding {
    x: number;
    y: number;
    width: number;
    depth: number;
    height: number;
    style: number;
    tower: boolean;
    rooftop: boolean;
}

export interface CityBlock {
    gx: number;
    gy: number;
    plaza: boolean;
    buildings: CityBuilding[];
}

const BLOCK_CACHE = new Map<string, CityBlock>();
const MAX_CACHED_BLOCKS = 1024;

export function cityBlock(seed: number, gx: number, gy: number): CityBlock {
    const key = `${seed}:${gx}:${gy}`;
    const cached = BLOCK_CACHE.get(key);
    if (cached) return cached;
    const block = generateBlock(seed, gx, gy);
    if (BLOCK_CACHE.size >= MAX_CACHED_BLOCKS) {
        const oldest = BLOCK_CACHE.keys().next().value;
        if (oldest !== undefined) BLOCK_CACHE.delete(oldest);
    }
    BLOCK_CACHE.set(key, block);
    return block;
}

function generateBlock(seed: number, gx: number, gy: number): CityBlock {
    const random = mulberry32(hashSeed(seed, gx, gy));
    const x0 = gx * CITY_BLOCK_M;
    const y0 = gy * CITY_BLOCK_M;
    const plaza = random() < 0.07;
    if (plaza) return { gx, gy, plaza: true, buildings: [] };

    const inner = CITY_ROAD_HALF_M + CITY_SIDEWALK_M;
    const usable = CITY_BLOCK_M - inner * 2;
    const alley = 4.5;
    const lot = (usable - alley) / 2;
    const centers = [inner + lot / 2, inner + lot + alley + lot / 2];
    const buildings: CityBuilding[] = [];

    for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 2; column += 1) {
            const tower = random() < 0.22;
            const width = lot - 2.5 - random() * 3;
            const depth = lot - 2.5 - random() * 3;
            const baseFloors = 3 + Math.floor(random() * 6);
            const floors = tower
                ? baseFloors + 12 + Math.floor(random() * 22)
                : baseFloors + Math.floor(random() * 6);
            buildings.push({
                x: x0 + centers[column]! + (random() - 0.5) * 1.6,
                y: y0 + centers[row]! + (random() - 0.5) * 1.6,
                width,
                depth,
                height: floors * 3.3,
                style: Math.floor(random() * 4),
                tower,
                rooftop: random() < 0.7,
            });
        }
    }
    return { gx, gy, plaza, buildings };
}

export interface CitySurface {
    mu: number;
    rollingResistance: number;
    onRoad: boolean;
    onSidewalk: boolean;
}

const surfaceCache = new Map<string, CitySurface>();

export function citySurfaceAt(x: number, y: number): CitySurface {
    const nearestX = Math.round(x / CITY_BLOCK_M) * CITY_BLOCK_M;
    const nearestY = Math.round(y / CITY_BLOCK_M) * CITY_BLOCK_M;
    const dx = Math.abs(x - nearestX);
    const dy = Math.abs(y - nearestY);
    const key = `${Math.round(dx * 4)}:${Math.round(dy * 4)}`;
    const cached = surfaceCache.get(key);
    if (cached) return cached;
    let surface: CitySurface;
    if (dx <= CITY_ROAD_HALF_M || dy <= CITY_ROAD_HALF_M) {
        surface = {
            mu: dx <= CITY_MEDIAN_HALF_M || dy <= CITY_MEDIAN_HALF_M ? 0.92 : 1,
            rollingResistance: 1,
            onRoad: true,
            onSidewalk: false,
        };
    } else if (
        dx <= CITY_ROAD_HALF_M + CITY_SIDEWALK_M ||
        dy <= CITY_ROAD_HALF_M + CITY_SIDEWALK_M
    ) {
        surface = { mu: 0.7, rollingResistance: 1.8, onRoad: false, onSidewalk: true };
    } else {
        surface = { mu: 0.48, rollingResistance: 4.4, onRoad: false, onSidewalk: false };
    }
    if (surfaceCache.size > 256) surfaceCache.clear();
    surfaceCache.set(key, surface);
    return surface;
}

export interface CityPush {
    x: number;
    y: number;
}

/** Circle versus building footprints around a point. Returns the push out of the walls. */
export function cityCollision(seed: number, x: number, y: number, radius: number): CityPush | null {
    const gx = Math.floor(x / CITY_BLOCK_M);
    const gy = Math.floor(y / CITY_BLOCK_M);
    let pushX = 0;
    let pushY = 0;
    let best = 0;
    for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
            const block = cityBlock(seed, gx + ox, gy + oy);
            for (const building of block.buildings) {
                const halfW = building.width * 0.5 + 0.25;
                const halfD = building.depth * 0.5 + 0.25;
                const nearestX = Math.max(building.x - halfW, Math.min(x, building.x + halfW));
                const nearestY = Math.max(building.y - halfD, Math.min(y, building.y + halfD));
                let dx = x - nearestX;
                let dy = y - nearestY;
                let distance = Math.hypot(dx, dy);
                if (distance >= radius) continue;
                if (distance < 1e-4) {
                    const left = x - (building.x - halfW);
                    const right = building.x + halfW - x;
                    const bottom = y - (building.y - halfD);
                    const top = building.y + halfD - y;
                    const minimum = Math.min(left, right, bottom, top);
                    dx = minimum === left ? -1 : minimum === right ? 1 : 0;
                    dy = minimum === bottom ? -1 : minimum === top ? 1 : 0;
                    distance = 0;
                } else {
                    dx /= distance;
                    dy /= distance;
                }
                const overlap = radius - distance;
                if (overlap > best) {
                    best = overlap;
                    pushX = dx * overlap;
                    pushY = dy * overlap;
                }
            }
        }
    }
    return best > 0 ? { x: pushX, y: pushY } : null;
}
