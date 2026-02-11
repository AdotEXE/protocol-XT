// ═══════════════════════════════════════════════════════════════════════════
// ROAD NETWORK - Система генерации дорожной сети
// ═══════════════════════════════════════════════════════════════════════════

import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    PhysicsAggregate,
    PhysicsShapeType
} from "@babylonjs/core";
import { TerrainGenerator, NoiseGenerator } from "./noiseGenerator";
// Прямой импорт модуля дорог Тарту
import * as tartuRoadsModule from "./tartuRoads";
import { debugLogger } from "./debugLogger";
import { logger } from "./utils/logger";
import { logger } from "./utils/logger";

// Seeded random for consistent generation
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

export interface RoadSegment {
    start: Vector3;
    end: Vector3;
    width: number;
    type: "highway" | "street" | "path";
}

export interface Intersection {
    position: Vector3;
    roads: RoadSegment[];
    type: "crossroad" | "t_junction" | "corner";
}

interface RoadNetworkConfig {
    worldSeed: number;
    chunkSize: number;
    highwaySpacing: number;  // Distance between main highways
    streetSpacing: number;   // Distance between streets
    terrainGenerator?: TerrainGenerator | null; // Optional terrain generator for following terrain
    mapType?: string; // Type of map (for real roads support)
}

export class RoadNetwork {
    private scene: Scene;
    private config: RoadNetworkConfig;
    private roads: Map<string, RoadSegment[]> = new Map();
    private intersections: Map<string, Intersection[]> = new Map();
    private materials: Map<string, StandardMaterial> = new Map();
    private noise: NoiseGenerator;
    private isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean;
    
    constructor(scene: Scene, config?: Partial<RoadNetworkConfig>, isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean) {
        this.scene = scene;
        this.config = {
            worldSeed: Date.now(),
            chunkSize: 80,
            highwaySpacing: 200,
            streetSpacing: 30, // Уменьшено с 40 до 30 для сложной дорожной сети
            terrainGenerator: null,
            mapType: undefined,
            ...config
        };
        this.createMaterials();
        // Create noise generator for curved road generation
        this.noise = new NoiseGenerator(this.config.worldSeed + 54321);
        
        // Сохраняем callback для проверки зон гаражей
        this.isPositionInGarageArea = isPositionInGarageArea;
        
        // Сохраняем модуль дорог Тарту в window cache для быстрого доступа
        // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
        if (this.config.mapType !== undefined && this.config.mapType === "tartaria") {
            (window as any).__tartuRoads = tartuRoadsModule;
            logger.log("[RoadNetwork] Tartu roads module loaded for tartaria map");
        }
    }
    
    /**
     * Установить тип карты (для поддержки реальных дорог)
     */
    setMapType(mapType: string): void {
        this.config.mapType = mapType;
        // Очищаем кэш дорог при смене типа карты
        this.roads.clear();
    }
    
    private createMaterials(): void {
        // Asphalt for highways - более светлый и заметный
        const highwayMat = new StandardMaterial("roadHighway", this.scene);
        highwayMat.diffuseColor = new Color3(0.25, 0.25, 0.25); // Светлее для лучшей видимости
        highwayMat.specularColor = new Color3(0.1, 0.1, 0.1);
        highwayMat.freeze();
        this.materials.set("highway", highwayMat);
        
        // Darker asphalt for streets - более заметный
        const streetMat = new StandardMaterial("roadStreet", this.scene);
        streetMat.diffuseColor = new Color3(0.2, 0.2, 0.2); // Светлее для лучшей видимости
        streetMat.specularColor = new Color3(0.05, 0.05, 0.05);
        streetMat.freeze();
        this.materials.set("street", streetMat);
        
        // Dirt path
        const pathMat = new StandardMaterial("roadPath", this.scene);
        pathMat.diffuseColor = new Color3(0.45, 0.38, 0.3); // Светлее
        pathMat.specularColor = Color3.Black();
        pathMat.freeze();
        this.materials.set("path", pathMat);
        
        // Road markings (white)
        const markingMat = new StandardMaterial("roadMarking", this.scene);
        markingMat.diffuseColor = new Color3(0.9, 0.9, 0.85);
        markingMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
        markingMat.specularColor = Color3.Black();
        markingMat.freeze();
        this.materials.set("marking", markingMat);
        
        // Yellow road markings
        const yellowMarkingMat = new StandardMaterial("roadMarkingYellow", this.scene);
        yellowMarkingMat.diffuseColor = new Color3(0.9, 0.8, 0.2);
        yellowMarkingMat.emissiveColor = new Color3(0.1, 0.08, 0.02);
        yellowMarkingMat.specularColor = Color3.Black();
        yellowMarkingMat.freeze();
        this.materials.set("markingYellow", yellowMarkingMat);
    }
    
    // Generate curved road path following terrain (avoids garages)
    private generateCurvedRoad(
        start: Vector3, 
        end: Vector3, 
        biome: string, 
        curvature: number = 0.3
    ): Vector3[] {
        const points: Vector3[] = [start];
        const segments = 8; // Number of intermediate points
        
        // Calculate base direction
        const direction = end.subtract(start);
        const length = direction.length();
        const normalizedDir = direction.normalize();
        
        // Add curvature using noise for organic feel
        const perpDir = new Vector3(-normalizedDir.z, 0, normalizedDir.x);
        
        // Определяем запас для проверки гаражей (используем средний запас для curved дорог)
        const garageMargin = 10;
        
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const basePoint = start.add(direction.scale(t));
            
            // Пробуем несколько вариантов смещения для обхода гаражей
            let curvedPoint: Vector3 | null = null;
            const maxAttempts = 5; // Максимальное количество попыток найти точку не в гараже
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                // Add perpendicular offset using noise for organic curves
                const noiseScale = 0.02;
                const offsetNoise = this.noise.fbm(
                    basePoint.x * noiseScale + attempt * 0.1, 
                    basePoint.z * noiseScale + attempt * 0.1, 
                    2, 2, 0.5
                );
                
                // Применяем кривизну с вариацией шума, увеличиваем смещение при попытках обхода
                const offsetMultiplier = attempt === 0 ? 1.0 : 1.0 + attempt * 0.3;
                const offsetAmount = (Math.sin(t * Math.PI) * curvature + offsetNoise * 0.2) * length * 0.15 * offsetMultiplier;
                const offset = perpDir.scale(offsetAmount);
                
                let candidatePoint = basePoint.add(offset);
                
                // Проверяем, не находится ли точка в гараже
                if (this.isPositionInGarageArea) {
                    if (this.isPositionInGarageArea(candidatePoint.x, candidatePoint.z, garageMargin)) {
                        // Точка в гараже, пробуем другую
                        continue;
                    }
                }
                
                // Adjust height based on terrain if terrain generator is available
                if (this.config.terrainGenerator) {
                    const terrainHeight = this.config.terrainGenerator.getHeight(candidatePoint.x, candidatePoint.z, biome);
                    candidatePoint.y = terrainHeight + 0.02;
                } else {
                    candidatePoint.y = 0.02;
                }
                
                curvedPoint = candidatePoint;
                break; // Нашли валидную точку
            }
            
            // Если не удалось найти точку не в гараже, используем базовую точку (но проверяем её тоже)
            if (!curvedPoint) {
                // Последняя попытка - используем базовую точку без смещения
                if (this.isPositionInGarageArea && 
                    this.isPositionInGarageArea(basePoint.x, basePoint.z, garageMargin)) {
                    // Даже базовая точка в гараже - пропускаем эту точку
                    continue;
                }
                
                curvedPoint = basePoint.clone();
                if (this.config.terrainGenerator) {
                    const terrainHeight = this.config.terrainGenerator.getHeight(curvedPoint.x, curvedPoint.z, biome);
                    curvedPoint.y = terrainHeight + 0.02;
                } else {
                    curvedPoint.y = 0.02;
                }
            }
            
            if (curvedPoint) {
                points.push(curvedPoint);
            }
        }
        
        // Проверяем конечную точку
        if (this.isPositionInGarageArea && this.isPositionInGarageArea(end.x, end.z, garageMargin)) {
            // Если конечная точка в гараже, используем последнюю валидную точку
            if (points.length > 1) {
                points.push(points[points.length - 1]!.clone());
            } else {
                points.push(start.clone());
            }
        } else {
            // Adjust height for end point
            if (this.config.terrainGenerator) {
                const terrainHeight = this.config.terrainGenerator.getHeight(end.x, end.z, biome);
                end.y = terrainHeight + 0.02;
            } else {
                end.y = 0.02;
            }
            points.push(end);
        }
        
        return points;
    }
    
    // Generate road path that follows terrain (avoids steep slopes, follows valleys, avoids garages)
    private generateTerrainFollowingRoad(
        start: Vector3,
        end: Vector3,
        biome: string,
        stepSize: number = 5
    ): Vector3[] {
        if (!this.config.terrainGenerator) {
            // Fallback to curved road if no terrain generator
            return this.generateCurvedRoad(start, end, biome);
        }
        
        const points: Vector3[] = [start];
        const direction = end.subtract(start);
        const totalLength = direction.length();
        const normalizedDir = direction.normalize();
        const perpDir = new Vector3(-normalizedDir.z, 0, normalizedDir.x);
        
        const steps = Math.ceil(totalLength / stepSize);
        let currentPos = start.clone();
        
        // Определяем запас для проверки гаражей (используем средний запас для terrain-following дорог)
        const garageMargin = 12;
        
        for (let i = 0; i < steps; i++) {
            const t = (i + 1) / steps;
            const targetPos = start.add(direction.scale(t));
            
            // Sample terrain in front and to the sides to find best path
            const samples: Array<{ pos: Vector3, cost: number }> = [];
            
            // Sample center and sides (расширяем диапазон для обхода гаражей)
            for (let sideOffset = -2; sideOffset <= 2; sideOffset++) {
                const samplePos = targetPos.add(perpDir.scale(sideOffset * stepSize * 0.5));
                const height = this.config.terrainGenerator!.getHeight(samplePos.x, samplePos.z, biome);
                
                // Calculate slope cost (steep slopes are expensive)
                const currentHeight = this.config.terrainGenerator!.getHeight(currentPos.x, currentPos.z, biome);
                const heightDiff = Math.abs(height - currentHeight);
                const distance = Vector3.Distance(currentPos, samplePos);
                const slope = distance > 0 ? heightDiff / distance : 0;
                
                // Cost: prefer lower slopes and lower elevations (valleys)
                const slopeCost = Math.pow(slope, 2) * 100; // Penalize steep slopes
                const heightCost = height * 0.1; // Slightly prefer lower elevations
                const deviationCost = Math.abs(sideOffset) * 2; // Prefer straight paths
                
                // КРИТИЧНО: Добавляем большую стоимость для точек в гаражах
                let garageCost = 0;
                if (this.isPositionInGarageArea) {
                    if (this.isPositionInGarageArea(samplePos.x, samplePos.z, garageMargin)) {
                        garageCost = 10000; // Очень большая стоимость - избегаем гаражей
                    }
                }
                
                samples.push({
                    pos: new Vector3(samplePos.x, height + 0.02, samplePos.z),
                    cost: slopeCost + heightCost + deviationCost + garageCost
                });
            }
            
            // Choose best sample (lowest cost)
            if (samples.length > 0) {
                samples.sort((a, b) => a.cost - b.cost);
                const bestSample = samples[0];
                if (bestSample) {
                    // Дополнительная проверка: если лучший вариант всё ещё в гараже, пробуем другие варианты
                    if (this.isPositionInGarageArea && 
                        this.isPositionInGarageArea(bestSample.pos.x, bestSample.pos.z, garageMargin)) {
                        // Ищем первый вариант не в гараже
                        let found = false;
                        for (let j = 1; j < samples.length; j++) {
                            const altSample = samples[j];
                            if (altSample && !this.isPositionInGarageArea(altSample.pos.x, altSample.pos.z, garageMargin)) {
                                currentPos = altSample.pos;
                                points.push(currentPos.clone());
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            // Если все варианты в гараже, пропускаем эту точку (дорога будет разорвана)
                            continue;
                        }
                    } else {
                        currentPos = bestSample.pos;
                        points.push(currentPos.clone());
                    }
                }
            }
        }
        
        // Ensure we end at the target (проверяем, не в гараже ли конечная точка)
        const finalHeight = this.config.terrainGenerator.getHeight(end.x, end.z, biome);
        if (this.isPositionInGarageArea && this.isPositionInGarageArea(end.x, end.z, garageMargin)) {
            // Если конечная точка в гараже, используем последнюю валидную точку
            if (points.length > 1) {
                points[points.length - 1] = points[points.length - 2]!.clone();
            }
        } else {
            points[points.length - 1] = new Vector3(end.x, finalHeight + 0.02, end.z);
        }
        
        return points;
    }
    
    // Convert point list to road segments, filtering out segments that pass through garages
    private pointsToSegments(points: Vector3[], width: number, type: "highway" | "street" | "path"): RoadSegment[] {
        const segments: RoadSegment[] = [];
        
        // Определяем запас для проверки гаражей в зависимости от типа дороги
        const garageMargin = type === "highway" ? 18 : type === "street" ? 12 : 8;
        
        for (let i = 0; i < points.length - 1; i++) {
            const startPoint = points[i]!;
            const endPoint = points[i + 1]!;
            
            // Проверяем, не проходит ли сегмент через гараж
            if (this.isPositionInGarageArea) {
                // Проверяем начальную и конечную точки
                const startInGarage = this.isPositionInGarageArea(startPoint.x, startPoint.z, garageMargin);
                const endInGarage = this.isPositionInGarageArea(endPoint.x, endPoint.z, garageMargin);
                
                // Если обе точки в гараже, пропускаем сегмент
                if (startInGarage && endInGarage) {
                    continue;
                }
                
                // Проверяем среднюю точку сегмента
                const midPoint = new Vector3(
                    (startPoint.x + endPoint.x) / 2,
                    (startPoint.y + endPoint.y) / 2,
                    (startPoint.z + endPoint.z) / 2
                );
                const midInGarage = this.isPositionInGarageArea(midPoint.x, midPoint.z, garageMargin);
                
                // Если средняя точка в гараже, пропускаем сегмент
                if (midInGarage) {
                    continue;
                }
            }
            
            segments.push({
                start: startPoint,
                end: endPoint,
                width: width,
                type: type
            });
        }
        
        return segments;
    }
    
    // Generate roads for a chunk
    generateRoadsForChunk(chunkX: number, chunkZ: number, biome: string): RoadSegment[] {
        const key = `${chunkX}_${chunkZ}`;
        
        if (this.roads.has(key)) {
            const cached = this.roads.get(key)!;
            return cached;
        }
        
        // Специальная обработка для карты Тартария - используем реальные дороги
        // ТОЛЬКО для Тартарии используем специальную систему дорог
        if (this.config.mapType === "tartaria") {
            return this.generateTartuRoadsForChunk(chunkX, chunkZ, biome);
        }
        
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const random = new SeededRandom(seed);
        const roads: RoadSegment[] = [];
        
        const worldX = chunkX * this.config.chunkSize;
        const worldZ = chunkZ * this.config.chunkSize;
        const size = this.config.chunkSize;
        
        // Check if this chunk should have highways
        const hasHorizontalHighway = Math.abs(worldZ % this.config.highwaySpacing) < size;
        const hasVerticalHighway = Math.abs(worldX % this.config.highwaySpacing) < size;
        
        // Generate highways with curved/terrain-following paths
        if (hasHorizontalHighway && biome !== "wasteland" && biome !== "park") {
            const start = new Vector3(worldX, 0.02, worldZ + size / 2);
            const end = new Vector3(worldX + size, 0.02, worldZ + size / 2);
            
            // Проверяем начальную и конечную точки перед генерацией дороги
            if (this.isPositionInGarageArea) {
                const startInGarage = this.isPositionInGarageArea(start.x, start.z, 20);
                const endInGarage = this.isPositionInGarageArea(end.x, end.z, 20);
                // Если обе точки в гараже, пропускаем дорогу
                if (startInGarage && endInGarage) {
                    // Пропускаем генерацию этой дороги
                } else {
                    // Highways follow terrain but with less curvature (straighter)
                    const highwayPoints = this.generateTerrainFollowingRoad(start, end, biome, 8);
                    roads.push(...this.pointsToSegments(highwayPoints, 12, "highway"));
                }
            } else {
                // Highways follow terrain but with less curvature (straighter)
                const highwayPoints = this.generateTerrainFollowingRoad(start, end, biome, 8);
                roads.push(...this.pointsToSegments(highwayPoints, 12, "highway"));
            }
        }
        
        if (hasVerticalHighway && biome !== "wasteland" && biome !== "park") {
            const start = new Vector3(worldX + size / 2, 0.02, worldZ);
            const end = new Vector3(worldX + size / 2, 0.02, worldZ + size);
            
            // Проверяем начальную и конечную точки перед генерацией дороги
            if (this.isPositionInGarageArea) {
                const startInGarage = this.isPositionInGarageArea(start.x, start.z, 20);
                const endInGarage = this.isPositionInGarageArea(end.x, end.z, 20);
                // Если обе точки в гараже, пропускаем дорогу
                if (startInGarage && endInGarage) {
                    // Пропускаем генерацию этой дороги
                } else {
                    // Highways follow terrain but with less curvature (straighter)
                    const highwayPoints = this.generateTerrainFollowingRoad(start, end, biome, 8);
                    roads.push(...this.pointsToSegments(highwayPoints, 12, "highway"));
                }
            } else {
                // Highways follow terrain but with less curvature (straighter)
                const highwayPoints = this.generateTerrainFollowingRoad(start, end, biome, 8);
                roads.push(...this.pointsToSegments(highwayPoints, 12, "highway"));
            }
        }
        
        // Generate streets based on biome with realistic hierarchy
        if (biome === "city" || biome === "industrial" || biome === "residential") {
            // Realistic street density - more streets in city centers
            const numStreets = biome === "city" ? random.int(2, 4) : random.int(1, 3);
            
            for (let i = 0; i < numStreets; i++) {
                if (random.chance(0.5)) {
                    // Horizontal street with some curvature
                    const z = worldZ + random.range(10, size - 10);
                    const start = new Vector3(worldX, 0.02, z);
                    const end = new Vector3(worldX + size, 0.02, z);
                    
                    // Проверяем начальную и конечную точки перед генерацией дороги
                    if (this.isPositionInGarageArea) {
                        const startInGarage = this.isPositionInGarageArea(start.x, start.z, 12);
                        const endInGarage = this.isPositionInGarageArea(end.x, end.z, 12);
                        // Если обе точки в гараже, пропускаем дорогу
                        if (startInGarage && endInGarage) {
                            continue;
                        }
                    }
                    
                    // Streets have moderate curvature
                    const streetPoints = this.generateCurvedRoad(start, end, biome, 0.2);
                    roads.push(...this.pointsToSegments(streetPoints, 8, "street"));
                } else {
                    // Vertical street with some curvature
                    const x = worldX + random.range(10, size - 10);
                    const start = new Vector3(x, 0.02, worldZ);
                    const end = new Vector3(x, 0.02, worldZ + size);
                    
                    // Проверяем начальную и конечную точки перед генерацией дороги
                    if (this.isPositionInGarageArea) {
                        const startInGarage = this.isPositionInGarageArea(start.x, start.z, 12);
                        const endInGarage = this.isPositionInGarageArea(end.x, end.z, 12);
                        // Если обе точки в гараже, пропускаем дорогу
                        if (startInGarage && endInGarage) {
                            continue;
                        }
                    }
                    
                    // Streets have moderate curvature
                    const streetPoints = this.generateCurvedRoad(start, end, biome, 0.2);
                    roads.push(...this.pointsToSegments(streetPoints, 8, "street"));
                }
            }
        } else if (biome === "park" || biome === "desert") {
            // Organic paths with more curvature
            if (random.chance(0.4)) {
                const startX = worldX + random.range(0, size);
                const startZ = worldZ + random.range(0, size);
                const endX = worldX + random.range(0, size);
                const endZ = worldZ + random.range(0, size);
                
                const start = new Vector3(startX, 0.02, startZ);
                const end = new Vector3(endX, 0.02, endZ);
                
                // Проверяем начальную и конечную точки перед генерацией дороги
                if (this.isPositionInGarageArea) {
                    const startInGarage = this.isPositionInGarageArea(start.x, start.z, 10);
                    const endInGarage = this.isPositionInGarageArea(end.x, end.z, 10);
                    // Если обе точки в гараже, пропускаем дорогу
                    if (startInGarage && endInGarage) {
                        // Пропускаем генерацию этой дороги
                    } else {
                        // Paths follow terrain and have high curvature
                        const pathPoints = this.generateTerrainFollowingRoad(start, end, biome, 4);
                        roads.push(...this.pointsToSegments(pathPoints, 4, "path"));
                    }
                } else {
                    // Paths follow terrain and have high curvature
                    const pathPoints = this.generateTerrainFollowingRoad(start, end, biome, 4);
                    roads.push(...this.pointsToSegments(pathPoints, 4, "path"));
                }
            }
        } else if (biome === "military") {
            // Military base has organized roads with slight curves
            if (random.chance(0.6)) {
                const start = new Vector3(worldX, 0.02, worldZ + size / 2);
                const end = new Vector3(worldX + size, 0.02, worldZ + size / 2);
                
                // Проверяем начальную и конечную точки перед генерацией дороги
                if (this.isPositionInGarageArea) {
                    const startInGarage = this.isPositionInGarageArea(start.x, start.z, 12);
                    const endInGarage = this.isPositionInGarageArea(end.x, end.z, 12);
                    // Если обе точки в гараже, пропускаем дорогу
                    if (!(startInGarage && endInGarage)) {
                        const roadPoints = this.generateCurvedRoad(start, end, biome, 0.15);
                        roads.push(...this.pointsToSegments(roadPoints, 10, "street"));
                    }
                } else {
                    const roadPoints = this.generateCurvedRoad(start, end, biome, 0.15);
                    roads.push(...this.pointsToSegments(roadPoints, 10, "street"));
                }
            }
            if (random.chance(0.6)) {
                const start = new Vector3(worldX + size / 2, 0.02, worldZ);
                const end = new Vector3(worldX + size / 2, 0.02, worldZ + size);
                
                // Проверяем начальную и конечную точки перед генерацией дороги
                if (this.isPositionInGarageArea) {
                    const startInGarage = this.isPositionInGarageArea(start.x, start.z, 12);
                    const endInGarage = this.isPositionInGarageArea(end.x, end.z, 12);
                    // Если обе точки в гараже, пропускаем дорогу
                    if (!(startInGarage && endInGarage)) {
                        const roadPoints = this.generateCurvedRoad(start, end, biome, 0.15);
                        roads.push(...this.pointsToSegments(roadPoints, 10, "street"));
                    }
                } else {
                    const roadPoints = this.generateCurvedRoad(start, end, biome, 0.15);
                    roads.push(...this.pointsToSegments(roadPoints, 10, "street"));
                }
            }
        } else if (biome === "wasteland") {
            // Wasteland has rare, winding paths
            if (random.chance(0.2)) {
                const startX = worldX + random.range(5, size - 5);
                const startZ = worldZ + random.range(5, size - 5);
                const endX = worldX + random.range(5, size - 5);
                const endZ = worldZ + random.range(5, size - 5);
                
                const start = new Vector3(startX, 0.02, startZ);
                const end = new Vector3(endX, 0.02, endZ);
                
                // Проверяем начальную и конечную точки перед генерацией дороги
                if (this.isPositionInGarageArea) {
                    const startInGarage = this.isPositionInGarageArea(start.x, start.z, 10);
                    const endInGarage = this.isPositionInGarageArea(end.x, end.z, 10);
                    // Если обе точки в гараже, пропускаем дорогу
                    if (startInGarage && endInGarage) {
                        // Пропускаем генерацию этой дороги
                    } else {
                        // Winding paths following terrain
                        const pathPoints = this.generateTerrainFollowingRoad(start, end, biome, 3);
                        roads.push(...this.pointsToSegments(pathPoints, 3, "path"));
                    }
                } else {
                    // Winding paths following terrain
                    const pathPoints = this.generateTerrainFollowingRoad(start, end, biome, 3);
                    roads.push(...this.pointsToSegments(pathPoints, 3, "path"));
                }
            }
        }
        
        this.roads.set(key, roads);
        return roads;
    }
    
    // Create road meshes for a chunk
    createRoadMeshes(chunkX: number, chunkZ: number, biome: string, parentNode: any): Mesh[] {
        const roads = this.generateRoadsForChunk(chunkX, chunkZ, biome);
        
        
        
        const meshes: Mesh[] = [];
        
        // Если parentNode задан, вычисляем его позицию для корректировки координат дорог
        const parentOffset = parentNode ? parentNode.position.clone() : Vector3.Zero();
        
        for (let i = 0; i < roads.length; i++) {
            const road: RoadSegment = roads[i]!;
            
            
            
            const mesh = this.createRoadMesh(road, `road_${chunkX}_${chunkZ}_${i}`);
            if (mesh) {
                
                
                // Если есть parentNode, корректируем позицию относительно него
                if (parentNode) {
                    const beforePos = mesh.position.clone();
                    mesh.position = mesh.position.subtract(parentOffset);
                    mesh.parent = parentNode;
                    
                    
                }
                meshes.push(mesh);
                
                // Add road markings - передаем высоту дороги
                const avgHeight = (road.start.y + road.end.y) / 2;
                const markings = this.createRoadMarkings(road, `marking_${chunkX}_${chunkZ}_${i}`, avgHeight);
                for (const marking of markings) {
                    
                    
                    if (parentNode) {
                        const beforePos = marking.position.clone();
                        marking.position = marking.position.subtract(parentOffset);
                        marking.parent = parentNode;
                        
                        
                    }
                    meshes.push(marking);
                }
            }
        }
        
        return meshes;
    }
    
    private createRoadMesh(road: RoadSegment, name: string): Mesh | null {
        const direction = road.end.subtract(road.start);
        const length = direction.length();
        if (length < 0.5) return null; // Пропускаем очень короткие сегменты
        
        const center = road.start.add(direction.scale(0.5));
        const angle = Math.atan2(direction.x, direction.z);
        
        // Вычисляем среднюю высоту для наклона дороги
        const avgHeight = (road.start.y + road.end.y) / 2;
        
        // Вычисляем высоту дороги более точно - учитываем наклон
        const roadHeight = 0.12; // Немного увеличена для лучшей видимости
        
        // Вычисляем наклон дороги для правильного позиционирования
        const heightDiff = road.end.y - road.start.y;
        const slopeAngle = Math.atan2(heightDiff, length);
        
        const mesh = MeshBuilder.CreateBox(name, {
            width: road.width,
            height: roadHeight,
            depth: length
        }, this.scene);
        
        mesh.position = center;
        // Используем высоту из road segment (уже скорректированную по террейну)
        // Дороги должны быть точно на уровне террейна для правильной физики
        mesh.position.y = avgHeight;
        mesh.rotation.y = angle;
        
        // Немного наклоняем дорогу по склону для плавности
        if (Math.abs(slopeAngle) > 0.01) {
            mesh.rotation.x = slopeAngle * 0.5; // Увеличен наклон для лучшей плавности
        }
        
        
        
        const mat = this.materials.get(road.type);
        if (mat) {
            mesh.material = mat;
        } else {
            // Fallback материал если тип не найден
            const fallbackMat = new StandardMaterial(`${name}_fallback`, this.scene);
            fallbackMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
            mesh.material = fallbackMat;
        }
        
        // Add physics (static ground) - только если дорога достаточно большая
        // ВАЖНО: Дороги не должны иметь физику, так как танк использует ground clamping
        // Физика дорог может создавать конфликты и застревания
        // Вместо этого дороги должны быть визуальными и использоваться только для определения isOnRoad
        // if (length > 0.5) {
        //     try {
        //         const roadPhysics = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        //         if (roadPhysics.shape) {
        //             roadPhysics.shape.filterMembershipMask = 2; // Environment group
        //             roadPhysics.shape.filterCollideMask = 1 | 8 | 16; // Player (1), enemies (8), enemy bullets (16)
        //             if (roadPhysics.body) {
        //                 roadPhysics.body.setFriction(0.8);
        //             }
        //         }
        //     } catch (e) {
        //         console.warn(`[RoadNetwork] Failed to add physics to road ${name}:`, e);
        //     }
        // }
        
        mesh.receiveShadows = true;
        mesh.isPickable = true; // ВАЖНО: Дороги должны быть pickable для ground raycast танка!
        mesh.setEnabled(true); // Убеждаемся, что меш включен
        
        return mesh;
    }
    
    private createRoadMarkings(road: RoadSegment, baseName: string, roadHeight: number = 0.12): Mesh[] {
        const markings: Mesh[] = [];
        
        if (road.type === "path") return markings; // No markings on paths
        
        const direction = road.end.subtract(road.start);
        const length = direction.length();
        if (length < 5) return markings;
        
        const normalized = direction.normalize();
        const angle = Math.atan2(direction.x, direction.z);
        
        // Center line (dashed for streets, solid for highways)
        if (road.type === "highway") {
            // Solid yellow center line
            const centerLine = MeshBuilder.CreateBox(`${baseName}_center`, {
                width: 0.15,
                height: 0.02,
                depth: length - 2
            }, this.scene);
            
            const center = road.start.add(direction.scale(0.5));
            centerLine.position = new Vector3(center.x, roadHeight + 0.02, center.z);
            centerLine.rotation.y = angle;
            centerLine.material = this.materials.get("markingYellow")!;
            centerLine.isPickable = false;
            markings.push(centerLine);
            
            // Edge lines (white)
            for (const side of [-1, 1]) {
                const offset = side * (road.width / 2 - 0.5);
                const perpendicular = new Vector3(-normalized.z, 0, normalized.x);
                
                const edgeLine = MeshBuilder.CreateBox(`${baseName}_edge_${side}`, {
                    width: 0.15,
                    height: 0.02,
                    depth: length - 2
                }, this.scene);
                
                const edgePos = center.add(perpendicular.scale(offset));
                edgeLine.position = new Vector3(edgePos.x, roadHeight + 0.02, edgePos.z);
                edgeLine.rotation.y = angle;
                edgeLine.material = this.materials.get("marking")!;
                edgeLine.isPickable = false;
                markings.push(edgeLine);
            }
        } else if (road.type === "street") {
            // Dashed white center line
            const dashLength = 3;
            const gapLength = 3;
            const numDashes = Math.floor(length / (dashLength + gapLength));
            
            for (let i = 0; i < numDashes; i++) {
                const t = (i * (dashLength + gapLength) + dashLength / 2) / length;
                const dashPos = road.start.add(direction.scale(t));
                
                const dash = MeshBuilder.CreateBox(`${baseName}_dash_${i}`, {
                    width: 0.12,
                    height: 0.02,
                    depth: dashLength
                }, this.scene);
                
                dash.position = new Vector3(dashPos.x, roadHeight + 0.02, dashPos.z);
                dash.rotation.y = angle;
                dash.material = this.materials.get("marking")!;
                dash.isPickable = false;
                markings.push(dash);
            }
        }
        
        return markings;
    }
    
    // Check if a point is on a road
    isOnRoad(worldX: number, worldZ: number): boolean {
        const chunkX = Math.floor(worldX / this.config.chunkSize);
        const chunkZ = Math.floor(worldZ / this.config.chunkSize);
        const key = `${chunkX}_${chunkZ}`;
        
        const roads = this.roads.get(key);
        if (!roads) return false;
        
        for (const road of roads) {
            if (this.isPointOnSegment(worldX, worldZ, road)) {
                return true;
            }
        }
        
        return false;
    }
    
    private isPointOnSegment(x: number, z: number, road: RoadSegment): boolean {
        const dx = road.end.x - road.start.x;
        const dz = road.end.z - road.start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        
        if (length < 1) return false;
        
        // Project point onto line
        const t = ((x - road.start.x) * dx + (z - road.start.z) * dz) / (length * length);
        
        if (t < 0 || t > 1) return false;
        
        // Distance from projected point
        const projX = road.start.x + t * dx;
        const projZ = road.start.z + t * dz;
        const dist = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);
        
        return dist < road.width / 2;
    }
    
    // Get road width at a point (0 if not on road)
    getRoadWidth(worldX: number, worldZ: number): number {
        const chunkX = Math.floor(worldX / this.config.chunkSize);
        const chunkZ = Math.floor(worldZ / this.config.chunkSize);
        const key = `${chunkX}_${chunkZ}`;
        
        const roads = this.roads.get(key);
        if (!roads) return 0;
        
        for (const road of roads) {
            if (this.isPointOnSegment(worldX, worldZ, road)) {
                return road.width;
            }
        }
        
        return 0;
    }
    
    // Generate real Tartu roads for a chunk
    private generateTartuRoadsForChunk(chunkX: number, chunkZ: number, biome: string): RoadSegment[] {
        const key = `${chunkX}_${chunkZ}`;
        
        try {
            // Используем прямой импорт модуля
            const tartuRoads = tartuRoadsModule;
            
            if (!tartuRoads || !tartuRoads.getTartuRoadsInChunk) {
                logger.warn("[RoadNetwork] Tartu roads module not available");
                this.roads.set(key, []);
                return [];
            }
            
            const worldX = chunkX * this.config.chunkSize;
            const worldZ = chunkZ * this.config.chunkSize;
            const chunkMinX = worldX;
            const chunkMaxX = worldX + this.config.chunkSize;
            const chunkMinZ = worldZ;
            const chunkMaxZ = worldZ + this.config.chunkSize;
            
            const tartuRoadSegments = tartuRoads.getTartuRoadsInChunk(
                chunkX,
                chunkZ,
                this.config.chunkSize
            );
            
            
            
            const roads: RoadSegment[] = [];
            
            for (const tartuRoad of tartuRoadSegments) {
                const converted = tartuRoads.convertTartuRoadToSegment(tartuRoad);
                
                
                
                // Разбиваем длинные дороги на более мелкие сегменты для плавного следования террейну
                if (this.config.terrainGenerator) {
                    const roadLength = Vector3.Distance(converted.start, converted.end);
                    const segmentLength = 10; // Уменьшена длина сегмента для большей плавности
                    const numSegments = Math.max(1, Math.ceil(roadLength / segmentLength));
                    
                    const direction = converted.end.subtract(converted.start);
                    const normalizedDir = direction.normalize();
                    
                    // Вычисляем высоты для всех точек заранее для плавной интерполяции
                    const points: Vector3[] = [];
                    const heights: number[] = [];
                    
                    for (let i = 0; i <= numSegments; i++) {
                        const t = i / numSegments;
                        const point = converted.start.add(direction.scale(t));
                        const height = this.config.terrainGenerator.getHeight(
                            point.x,
                            point.z,
                            biome
                        );
                        points.push(point);
                        heights.push(height);
                    }
                    
                    // Создаем сегменты с плавной интерполяцией высот
                    // Дороги должны быть на уровне террейна или чуть выше для видимости
                    const roadOffset = 0.02; // Уменьшен offset для лучшей физики
                    for (let i = 0; i < numSegments; i++) {
                        const segStart = points[i]!.clone();
                        const segEnd = points[i + 1]!.clone();
                        
                        // Используем предвычисленные высоты
                        segStart.y = heights[i]! + roadOffset;
                        segEnd.y = heights[i + 1]! + roadOffset;
                        
                        // Убеждаемся, что соседние сегменты имеют одинаковую высоту в точке соединения
                        if (i > 0 && roads.length > 0) {
                            const prevSegment = roads[roads.length - 1]!;
                            // Синхронизируем высоту начала текущего сегмента с концом предыдущего
                            const prevEndHeight = prevSegment.end.y;
                            segStart.y = prevEndHeight;
                        }
                        
                        
                        
                        roads.push({
                            start: segStart,
                            end: segEnd,
                            width: converted.width,
                            type: converted.type
                        });
                    }
                } else {
                    // Если нет terrainGenerator, используем базовую высоту
                    converted.start.y = 0.05;
                    converted.end.y = 0.05;
                    roads.push(converted);
                }
            }
            
            if (roads.length > 0) {
                logger.log(`[RoadNetwork] Generated ${roads.length} Tartu roads for chunk ${key}`);
            }
            
            this.roads.set(key, roads);
            return roads;
        } catch (e) {
            // Если модуль не загружен, возвращаем пустой массив
            logger.warn("[RoadNetwork] Tartu roads module not available:", e);
            this.roads.set(key, []);
            return [];
        }
    }
    
    // Clear roads for a chunk (when unloading)
    clearChunk(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        this.roads.delete(key);
        this.intersections.delete(key);
    }
    
    // Обрезать дорогу до границ чанка
    private clipRoadToChunk(
        road: RoadSegment,
        chunkMinX: number,
        chunkMaxX: number,
        chunkMinZ: number,
        chunkMaxZ: number
    ): RoadSegment | null {
        const start = road.start;
        const end = road.end;
        
        // Если обе точки внутри чанка, возвращаем дорогу как есть
        if (start.x >= chunkMinX && start.x <= chunkMaxX &&
            start.z >= chunkMinZ && start.z <= chunkMaxZ &&
            end.x >= chunkMinX && end.x <= chunkMaxX &&
            end.z >= chunkMinZ && end.z <= chunkMaxZ) {
            return road;
        }
        
        // Вычисляем точки пересечения с границами чанка
        const clippedStart = this.clipPointToChunk(start, end, chunkMinX, chunkMaxX, chunkMinZ, chunkMaxZ);
        const clippedEnd = this.clipPointToChunk(end, start, chunkMinX, chunkMaxX, chunkMinZ, chunkMaxZ);
        
        // Если точки не найдены или совпадают, дорога не пересекает чанк
        if (!clippedStart || !clippedEnd || 
            (clippedStart.x === clippedEnd.x && clippedStart.z === clippedEnd.z)) {
            return null;
        }
        
        return {
            start: clippedStart,
            end: clippedEnd,
            width: road.width,
            type: road.type
        };
    }
    
    // Обрезать точку до границ чанка (найти точку пересечения линии с границей чанка)
    private clipPointToChunk(
        point: Vector3,
        otherPoint: Vector3,
        chunkMinX: number,
        chunkMaxX: number,
        chunkMinZ: number,
        chunkMaxZ: number
    ): Vector3 | null {
        // Если точка уже внутри чанка, возвращаем её
        if (point.x >= chunkMinX && point.x <= chunkMaxX &&
            point.z >= chunkMinZ && point.z <= chunkMaxZ) {
            return point.clone();
        }
        
        // Вычисляем направление линии
        const dx = otherPoint.x - point.x;
        const dz = otherPoint.z - point.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        
        if (length < 0.001) return null;
        
        const dirX = dx / length;
        const dirZ = dz / length;
        
        // Находим пересечения с каждой границей
        const intersections: Vector3[] = [];
        
        // Левая граница (x = chunkMinX)
        if (dirX !== 0) {
            const t = (chunkMinX - point.x) / dirX;
            if (t >= 0 && t <= length) {
                const z = point.z + dirZ * t;
                if (z >= chunkMinZ && z <= chunkMaxZ) {
                    intersections.push(new Vector3(chunkMinX, point.y, z));
                }
            }
        }
        
        // Правая граница (x = chunkMaxX)
        if (dirX !== 0) {
            const t = (chunkMaxX - point.x) / dirX;
            if (t >= 0 && t <= length) {
                const z = point.z + dirZ * t;
                if (z >= chunkMinZ && z <= chunkMaxZ) {
                    intersections.push(new Vector3(chunkMaxX, point.y, z));
                }
            }
        }
        
        // Нижняя граница (z = chunkMinZ)
        if (dirZ !== 0) {
            const t = (chunkMinZ - point.z) / dirZ;
            if (t >= 0 && t <= length) {
                const x = point.x + dirX * t;
                if (x >= chunkMinX && x <= chunkMaxX) {
                    intersections.push(new Vector3(x, point.y, chunkMinZ));
                }
            }
        }
        
        // Верхняя граница (z = chunkMaxZ)
        if (dirZ !== 0) {
            const t = (chunkMaxZ - point.z) / dirZ;
            if (t >= 0 && t <= length) {
                const x = point.x + dirX * t;
                if (x >= chunkMinX && x <= chunkMaxX) {
                    intersections.push(new Vector3(x, point.y, chunkMaxZ));
                }
            }
        }
        
        // Находим ближайшую точку пересечения
        if (intersections.length === 0) return null;
        
        let closest = intersections[0]!;
        let minDist = Vector3.Distance(point, closest);
        for (let i = 1; i < intersections.length; i++) {
            const dist = Vector3.Distance(point, intersections[i]!);
            if (dist < minDist) {
                minDist = dist;
                closest = intersections[i]!;
            }
        }
        
        return closest;
    }
}

