/**
 * @module game/GameWorld
 * @description Система мира игры - генерация, загрузка и управление игровым миром
 * 
 * Этот модуль содержит:
 * - Типы и конфигурацию мира
 * - Вспомогательные функции для работы с миром
 * - Класс управления миром
 */

import { Vector3 } from "@babylonjs/core";

// ============================================
// ТИПЫ МИРА
// ============================================

export type BiomeType = 
    | "desert"
    | "forest"
    | "snow"
    | "urban"
    | "industrial"
    | "volcanic"
    | "swamp"
    | "plains";

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

export type WeatherType = "clear" | "cloudy" | "rain" | "snow" | "fog" | "storm" | "sandstorm";

/**
 * Настройки окружения
 */
export interface EnvironmentSettings {
    biome: BiomeType;
    timeOfDay: TimeOfDay;
    weather: WeatherType;
    fogDensity: number;
    ambientIntensity: number;
    sunIntensity: number;
    sunAngle: number;
    windSpeed: number;
    windDirection: Vector3;
}

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
    biome: "plains",
    timeOfDay: "day",
    weather: "clear",
    fogDensity: 0.001,
    ambientIntensity: 0.3,
    sunIntensity: 1.0,
    sunAngle: 45,
    windSpeed: 5,
    windDirection: new Vector3(1, 0, 0)
};

// ============================================
// ТИПЫ ТЕРРЕЙНА
// ============================================

export interface TerrainConfig {
    width: number;
    depth: number;
    subdivisions: number;
    minHeight: number;
    maxHeight: number;
    seed: number;
    roughness: number;
    persistence: number;
    octaves: number;
}

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
    width: 1000,
    depth: 1000,
    subdivisions: 128,
    minHeight: 0,
    maxHeight: 50,
    seed: 12345,
    roughness: 0.5,
    persistence: 0.5,
    octaves: 4
};

// ============================================
// ТОЧКИ СПАВНА
// ============================================

export type SpawnPointType = "player" | "enemy" | "item" | "vehicle" | "objective";

export interface SpawnPoint {
    id: string;
    type: SpawnPointType;
    position: Vector3;
    rotation: number;
    team?: string;
    radius?: number;
    maxOccupants?: number;
    currentOccupants?: number;
    respawnTime?: number;
    enabled: boolean;
}

// ============================================
// ЗОНЫ
// ============================================

export type ZoneType = 
    | "safe"
    | "combat"
    | "objective"
    | "restricted"
    | "damage"
    | "heal"
    | "speed_boost"
    | "capture";

export interface Zone {
    id: string;
    type: ZoneType;
    center: Vector3;
    radius: number;
    height: number;
    team?: string;
    effectStrength?: number;
    captureProgress?: number;
    enabled: boolean;
}

// ============================================
// ГРАНИЦЫ КАРТЫ
// ============================================

export interface WorldBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

export const DEFAULT_WORLD_BOUNDS: WorldBounds = {
    minX: -500,
    maxX: 500,
    minY: -50,
    maxY: 200,
    minZ: -500,
    maxZ: 500
};

// ============================================
// КОНФИГУРАЦИЯ МИРА
// ============================================

export interface WorldConfig {
    name: string;
    description: string;
    bounds: WorldBounds;
    terrain: TerrainConfig;
    environment: EnvironmentSettings;
    spawnPoints: SpawnPoint[];
    zones: Zone[];
    maxPlayers: number;
    minPlayers: number;
    supportedModes: string[];
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
    name: "Default Map",
    description: "Standard battlefield",
    bounds: DEFAULT_WORLD_BOUNDS,
    terrain: DEFAULT_TERRAIN_CONFIG,
    environment: DEFAULT_ENVIRONMENT,
    spawnPoints: [],
    zones: [],
    maxPlayers: 16,
    minPlayers: 2,
    supportedModes: ["ffa", "tdm", "ctf"]
};

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Проверить, находится ли точка в границах мира
 */
export function isInWorldBounds(position: Vector3, bounds: WorldBounds): boolean {
    return (
        position.x >= bounds.minX && position.x <= bounds.maxX &&
        position.y >= bounds.minY && position.y <= bounds.maxY &&
        position.z >= bounds.minZ && position.z <= bounds.maxZ
    );
}

/**
 * Ограничить точку границами мира
 */
export function clampToWorldBounds(position: Vector3, bounds: WorldBounds): Vector3 {
    return new Vector3(
        Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
        Math.max(bounds.minY, Math.min(bounds.maxY, position.y)),
        Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z))
    );
}

/**
 * Получить размер мира
 */
export function getWorldSize(bounds: WorldBounds): { width: number; height: number; depth: number } {
    return {
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
        depth: bounds.maxZ - bounds.minZ
    };
}

/**
 * Получить центр мира
 */
export function getWorldCenter(bounds: WorldBounds): Vector3 {
    return new Vector3(
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        (bounds.minZ + bounds.maxZ) / 2
    );
}

/**
 * Получить случайную точку в границах
 */
export function getRandomPointInBounds(bounds: WorldBounds, margin: number = 0): Vector3 {
    return new Vector3(
        bounds.minX + margin + Math.random() * (bounds.maxX - bounds.minX - margin * 2),
        bounds.minY,
        bounds.minZ + margin + Math.random() * (bounds.maxZ - bounds.minZ - margin * 2)
    );
}

/**
 * Проверить, находится ли точка в зоне
 */
export function isInZone(position: Vector3, zone: Zone): boolean {
    if (!zone.enabled) return false;
    
    const dx = position.x - zone.center.x;
    const dz = position.z - zone.center.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > zone.radius) return false;
    
    const dy = position.y - zone.center.y;
    if (Math.abs(dy) > zone.height / 2) return false;
    
    return true;
}

/**
 * Найти зоны в которых находится точка
 */
export function getZonesAtPosition(position: Vector3, zones: Zone[]): Zone[] {
    return zones.filter(zone => isInZone(position, zone));
}

/**
 * Получить ближайшую точку спавна
 */
export function getNearestSpawnPoint(
    position: Vector3,
    spawnPoints: SpawnPoint[],
    type?: SpawnPointType,
    team?: string
): SpawnPoint | undefined {
    let filtered = spawnPoints.filter(sp => sp.enabled);
    
    if (type) {
        filtered = filtered.filter(sp => sp.type === type);
    }
    
    if (team) {
        filtered = filtered.filter(sp => !sp.team || sp.team === team);
    }
    
    if (filtered.length === 0) return undefined;
    
    let nearest = filtered[0];
    let nearestDist = Vector3.Distance(position, nearest!.position);
    
    for (const sp of filtered) {
        const dist = Vector3.Distance(position, sp.position);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = sp;
        }
    }
    
    return nearest;
}

/**
 * Получить доступную точку спавна
 */
export function getAvailableSpawnPoint(
    spawnPoints: SpawnPoint[],
    type?: SpawnPointType,
    team?: string
): SpawnPoint | undefined {
    let filtered = spawnPoints.filter(sp => sp.enabled);
    
    if (type) {
        filtered = filtered.filter(sp => sp.type === type);
    }
    
    if (team) {
        filtered = filtered.filter(sp => !sp.team || sp.team === team);
    }
    
    // Найти точку с минимальной загруженностью
    filtered = filtered.filter(sp => {
        if (!sp.maxOccupants) return true;
        return (sp.currentOccupants || 0) < sp.maxOccupants;
    });
    
    if (filtered.length === 0) return undefined;
    
    // Случайный выбор
    return filtered[Math.floor(Math.random() * filtered.length)];
}

/**
 * Получить настройки освещения для времени суток
 */
export function getLightingForTimeOfDay(timeOfDay: TimeOfDay): {
    sunIntensity: number;
    ambientIntensity: number;
    sunAngle: number;
    skyColor: string;
} {
    switch (timeOfDay) {
        case "dawn":
            return { sunIntensity: 0.4, ambientIntensity: 0.2, sunAngle: 10, skyColor: "#ff9966" };
        case "day":
            return { sunIntensity: 1.0, ambientIntensity: 0.3, sunAngle: 60, skyColor: "#87ceeb" };
        case "dusk":
            return { sunIntensity: 0.5, ambientIntensity: 0.15, sunAngle: 170, skyColor: "#ff6633" };
        case "night":
            return { sunIntensity: 0.05, ambientIntensity: 0.05, sunAngle: 270, skyColor: "#1a1a2e" };
        default:
            return { sunIntensity: 1.0, ambientIntensity: 0.3, sunAngle: 60, skyColor: "#87ceeb" };
    }
}

/**
 * Получить цвет тумана для погоды
 */
export function getFogColorForWeather(weather: WeatherType, biome: BiomeType): string {
    const baseColors: Record<BiomeType, string> = {
        desert: "#e6d4a3",
        forest: "#4a6741",
        snow: "#e0e8ef",
        urban: "#888888",
        industrial: "#666655",
        volcanic: "#3d2817",
        swamp: "#3d4a3a",
        plains: "#8899aa"
    };
    
    const weatherModifiers: Record<WeatherType, number> = {
        clear: 0,
        cloudy: 0.1,
        rain: 0.3,
        snow: 0.4,
        fog: 0.6,
        storm: 0.5,
        sandstorm: 0.7
    };
    
    // В реальности нужно смешать цвета, упрощённо возвращаем базовый
    return baseColors[biome] || "#888888";
}

// ============================================
// КЛАСС МЕНЕДЖЕРА МИРА
// ============================================

/**
 * Менеджер игрового мира
 */
export class GameWorldManager {
    private config: WorldConfig;
    private isLoaded = false;
    
    constructor(config: Partial<WorldConfig> = {}) {
        this.config = { ...DEFAULT_WORLD_CONFIG, ...config };
    }
    
    /**
     * Загрузить мир
     */
    async load(): Promise<void> {
        // В реальности здесь загрузка ресурсов
        this.isLoaded = true;
    }
    
    /**
     * Проверить загружен ли мир
     */
    isWorldLoaded(): boolean {
        return this.isLoaded;
    }
    
    /**
     * Получить конфигурацию
     */
    getConfig(): WorldConfig {
        return { ...this.config };
    }
    
    /**
     * Получить границы
     */
    getBounds(): WorldBounds {
        return { ...this.config.bounds };
    }
    
    /**
     * Получить окружение
     */
    getEnvironment(): EnvironmentSettings {
        return { ...this.config.environment };
    }
    
    /**
     * Обновить окружение
     */
    updateEnvironment(settings: Partial<EnvironmentSettings>): void {
        this.config.environment = { ...this.config.environment, ...settings };
    }
    
    /**
     * Получить все точки спавна
     */
    getSpawnPoints(): SpawnPoint[] {
        return [...this.config.spawnPoints];
    }
    
    /**
     * Добавить точку спавна
     */
    addSpawnPoint(point: SpawnPoint): void {
        this.config.spawnPoints.push(point);
    }
    
    /**
     * Получить все зоны
     */
    getZones(): Zone[] {
        return [...this.config.zones];
    }
    
    /**
     * Добавить зону
     */
    addZone(zone: Zone): void {
        this.config.zones.push(zone);
    }
    
    /**
     * Проверить точку в границах
     */
    isInBounds(position: Vector3): boolean {
        return isInWorldBounds(position, this.config.bounds);
    }
    
    /**
     * Ограничить точку границами
     */
    clampToBounds(position: Vector3): Vector3 {
        return clampToWorldBounds(position, this.config.bounds);
    }
    
    /**
     * Получить случайную точку
     */
    getRandomPoint(margin: number = 50): Vector3 {
        return getRandomPointInBounds(this.config.bounds, margin);
    }
    
    /**
     * Найти точку спавна
     */
    findSpawnPoint(type?: SpawnPointType, team?: string): SpawnPoint | undefined {
        return getAvailableSpawnPoint(this.config.spawnPoints, type, team);
    }
    
    /**
     * Получить зоны в точке
     */
    getZonesAt(position: Vector3): Zone[] {
        return getZonesAtPosition(position, this.config.zones);
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.isLoaded = false;
        this.config.spawnPoints = [];
        this.config.zones = [];
    }
}

export default {
    DEFAULT_WORLD_CONFIG,
    DEFAULT_TERRAIN_CONFIG,
    DEFAULT_ENVIRONMENT,
    DEFAULT_WORLD_BOUNDS
};

