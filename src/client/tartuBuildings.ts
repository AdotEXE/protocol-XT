/**
 * Tartu Buildings - Система размещения зданий вдоль улиц Тарту
 * 
 * Генерирует размещение зданий вдоль дорог с учетом типа дороги
 */

import { Vector3 } from "@babylonjs/core";
import { getTartuRoadsInChunk, TartuRoadSegment } from "./tartuRoads";

// Seeded random для детерминированной генерации
class SeededRandom {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    range(min: number, max: number): number { return min + this.next() * (max - min); }
    int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
    chance(p: number): boolean { return this.next() < p; }
}

export interface BuildingPlacement {
    position: Vector3;
    rotation: number;
    width: number;
    depth: number;
    height: number;
    type: "residential" | "commercial" | "industrial" | "office";
}

/**
 * Генерирует размещение зданий вдоль дорог Тарту
 * 
 * @param chunkX Координата X чанка
 * @param chunkZ Координата Z чанка
 * @param chunkSize Размер чанка
 * @param seed Seed для детерминированной генерации
 * @returns Массив размещений зданий
 */
export function generateBuildingsAlongRoads(
    chunkX: number,
    chunkZ: number,
    chunkSize: number,
    seed: number
): BuildingPlacement[] {
    const buildings: BuildingPlacement[] = [];
    const random = new SeededRandom(seed);
    
    const worldX = chunkX * chunkSize;
    const worldZ = chunkZ * chunkSize;
    
    // Получаем дороги в этом чанке
    const roadsInChunk = getTartuRoadsInChunk(chunkX, chunkZ, chunkSize);
    
    for (const road of roadsInChunk) {
        // Определяем тип зданий по типу дороги
        let buildingType: "residential" | "commercial" | "industrial" | "office";
        let buildingSpacing = 15; // Расстояние между зданиями
        let buildingWidth = 8;
        let buildingDepth = 10;
        
        if (road.type === "highway") {
            // Вдоль магистралей - коммерческие здания
            buildingType = "commercial";
            buildingSpacing = 20;
            buildingWidth = 12;
            buildingDepth = 15;
        } else if (road.type === "street") {
            // Вдоль улиц - смешанные
            buildingType = random.chance(0.6) ? "residential" : "commercial";
            buildingSpacing = 12;
        } else {
            // Вдоль тропинок - жилые
            buildingType = "residential";
            buildingSpacing = 10;
        }
        
        // Вычисляем длину дороги
        const dx = road.end.x - road.start.x;
        const dz = road.end.z - road.start.z;
        const roadLength = Math.sqrt(dx * dx + dz * dz);
        
        // Пропускаем слишком короткие дороги
        if (roadLength < buildingSpacing) {
            continue;
        }
        
        const roadAngle = Math.atan2(dz, dx);
        
        // Перпендикулярный вектор для размещения зданий по обе стороны
        const perpX = -Math.sin(roadAngle);
        const perpZ = Math.cos(roadAngle);
        const offsetFromRoad = road.width / 2 + buildingDepth / 2 + 2; // 2 единицы от края дороги
        
        // Генерируем здания вдоль дороги
        const numBuildings = Math.floor(roadLength / buildingSpacing);
        
        for (let i = 0; i < numBuildings; i++) {
            const t = (i + 0.5) / numBuildings; // Позиция вдоль дороги (0..1)
            
            // Позиция на дороге
            const roadX = road.start.x + t * dx;
            const roadZ = road.start.z + t * dz;
            
            // Проверяем, находится ли в пределах чанка
            if (roadX < worldX || roadX > worldX + chunkSize ||
                roadZ < worldZ || roadZ > worldZ + chunkSize) {
                continue;
            }
            
            // Размещаем здание с одной стороны дороги (случайно лево/право)
            const side = random.chance(0.5) ? 1 : -1;
            const buildingX = roadX + perpX * offsetFromRoad * side;
            const buildingZ = roadZ + perpZ * offsetFromRoad * side;
            
            // Высота здания зависит от типа
            let buildingHeight = 6;
            if (buildingType === "commercial") {
                buildingHeight = random.int(8, 15);
            } else {
                buildingHeight = random.int(4, 8);
            }
            
            buildings.push({
                position: new Vector3(buildingX, 0, buildingZ),
                rotation: roadAngle + Math.PI / 2, // Перпендикулярно дороге
                width: buildingWidth + random.range(-2, 2),
                depth: buildingDepth + random.range(-2, 2),
                height: buildingHeight,
                type: buildingType as "residential" | "commercial" | "industrial" | "office"
            });
        }
    }
    
    return buildings;
}

