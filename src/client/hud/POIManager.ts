/**
 * @module hud/POIManager
 * @description Менеджер POI (Points of Interest) - маркеры, прогресс захвата, 3D индикаторы
 * 
 * Этот модуль содержит:
 * - Типы POI и их конфигурацию
 * - Вспомогательные функции для отображения POI
 * - Класс менеджера для управления POI
 */

import { Vector3 } from "@babylonjs/core";
import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

// ============================================
// ТИПЫ POI
// ============================================

export type POIType = 
    | "garage" 
    | "ammoDepot" 
    | "fuelStation" 
    | "repairStation" 
    | "checkpoint" 
    | "objective"
    | "spawn"
    | "danger"
    | "quest"
    | "custom";

export interface POIData {
    id: string;
    type: POIType;
    position: Vector3;
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    isActive?: boolean;
    captureProgress?: number;      // 0-1
    captureTeam?: string;
    isContested?: boolean;
    radius?: number;
    metadata?: Record<string, unknown>;
}

export interface POIMarkerConfig {
    // Размеры
    minimapMarkerSize: number;
    worldMarkerSize: number;
    
    // Цвета по типу
    colors: Record<POIType, string>;
    
    // Иконки по типу
    icons: Record<POIType, string>;
    
    // Поведение
    fadeAtDistance: number;        // Расстояние начала затухания
    hideAtDistance: number;        // Расстояние полного скрытия
    showDistance: boolean;         // Показывать расстояние
    showOnMinimap: boolean;        // Показывать на миникарте
    showIn3D: boolean;             // Показывать в 3D мире
    
    // Анимация
    pulseSpeed: number;            // Скорость пульсации (мс)
    pulseIntensity: number;        // Интенсивность пульсации (0-1)
}

export const DEFAULT_POI_CONFIG: POIMarkerConfig = {
    // Размеры
    minimapMarkerSize: 8,
    worldMarkerSize: 48,
    
    // Цвета
    colors: {
        garage: "#00ff00",
        ammoDepot: "#ff9900",
        fuelStation: "#ffff00",
        repairStation: "#00ffff",
        checkpoint: "#ffffff",
        objective: "#ff00ff",
        spawn: "#00ff00",
        danger: "#ff0000",
        quest: "#ffd700",
        custom: "#888888"
    },
    
    // Иконки
    icons: {
        garage: "🏠",
        ammoDepot: "🔫",
        fuelStation: "⛽",
        repairStation: "🔧",
        checkpoint: "🏁",
        objective: "⭐",
        spawn: "📍",
        danger: "⚠️",
        quest: "❗",
        custom: "📌"
    },
    
    // Поведение
    fadeAtDistance: 200,
    hideAtDistance: 500,
    showDistance: true,
    showOnMinimap: true,
    showIn3D: true,
    
    // Анимация
    pulseSpeed: 1000,
    pulseIntensity: 0.3
};

// ============================================
// CAPTURE PROGRESS КОНФИГУРАЦИЯ
// ============================================

export interface CaptureBarConfig {
    width: number;
    height: number;
    cornerRadius: number;
    backgroundColor: string;
    neutralColor: string;
    friendlyColor: string;
    enemyColor: string;
    contestedColor: string;
}

export const DEFAULT_CAPTURE_CONFIG: CaptureBarConfig = {
    width: 200,
    height: 12,
    cornerRadius: 3,
    backgroundColor: "#222222",
    neutralColor: "#666666",
    friendlyColor: "#00ff00",
    enemyColor: "#ff0000",
    contestedColor: "#ffff00"
};

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Получить цвет POI по типу
 */
export function getPOIColor(type: POIType, config: POIMarkerConfig = DEFAULT_POI_CONFIG): string {
    return config.colors[type] || config.colors.custom;
}

/**
 * Получить иконку POI по типу
 */
export function getPOIIcon(type: POIType, config: POIMarkerConfig = DEFAULT_POI_CONFIG): string {
    return config.icons[type] || config.icons.custom;
}

/**
 * Получить название POI по типу
 */
export function getPOITypeName(type: POIType): string {
    const names: Record<POIType, string> = {
        garage: "Гараж",
        ammoDepot: "Склад боеприпасов",
        fuelStation: "Заправка",
        repairStation: "Ремонтная станция",
        checkpoint: "Контрольная точка",
        objective: "Цель",
        spawn: "Точка возрождения",
        danger: "Опасность",
        quest: "Задание",
        custom: "Метка"
    };
    return names[type] || "Неизвестно";
}

/**
 * Форматировать расстояние до POI
 */
export function formatPOIDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Вычислить расстояние до POI
 */
export function getDistanceToPOI(playerPos: Vector3, poiPos: Vector3): number {
    return Vector3.Distance(playerPos, poiPos);
}

/**
 * Вычислить направление до POI
 */
export function getDirectionToPOI(playerPos: Vector3, poiPos: Vector3): number {
    const dx = poiPos.x - playerPos.x;
    const dz = poiPos.z - playerPos.z;
    return Math.atan2(dx, dz);
}

/**
 * Вычислить альфу для затухания по расстоянию
 */
export function calculateDistanceFade(
    distance: number, 
    fadeStart: number, 
    fadeEnd: number
): number {
    if (distance <= fadeStart) return 1;
    if (distance >= fadeEnd) return 0;
    return 1 - (distance - fadeStart) / (fadeEnd - fadeStart);
}

/**
 * Вычислить пульсацию
 */
export function calculatePulse(time: number, speed: number, intensity: number): number {
    return 1 - intensity + intensity * Math.abs(Math.sin(time / speed * Math.PI));
}

/**
 * Преобразовать мировые координаты в экранные (для 3D маркеров)
 */
export function worldToScreen(
    worldPos: Vector3,
    viewMatrix: any,
    projectionMatrix: any,
    screenWidth: number,
    screenHeight: number
): { x: number; y: number; behind: boolean } | null {
    // Simplified projection - in real use, use engine.getProjectionMatrix() etc.
    // This is a placeholder for the actual implementation
    return null;
}

/**
 * Получить цвет прогресса захвата
 */
export function getCaptureProgressColor(
    progress: number, 
    isContested: boolean, 
    isFriendly: boolean,
    config: CaptureBarConfig = DEFAULT_CAPTURE_CONFIG
): string {
    if (isContested) return config.contestedColor;
    if (progress === 0) return config.neutralColor;
    return isFriendly ? config.friendlyColor : config.enemyColor;
}

/**
 * Сортировать POI по расстоянию
 */
export function sortPOIByDistance(pois: POIData[], playerPos: Vector3): POIData[] {
    return [...pois].sort((a, b) => {
        const distA = getDistanceToPOI(playerPos, a.position);
        const distB = getDistanceToPOI(playerPos, b.position);
        return distA - distB;
    });
}

/**
 * Фильтровать POI по типу
 */
export function filterPOIByType(pois: POIData[], types: POIType[]): POIData[] {
    return pois.filter(poi => types.includes(poi.type));
}

/**
 * Фильтровать POI по расстоянию
 */
export function filterPOIByDistance(
    pois: POIData[], 
    playerPos: Vector3, 
    maxDistance: number
): POIData[] {
    return pois.filter(poi => getDistanceToPOI(playerPos, poi.position) <= maxDistance);
}

// ============================================
// КЛАСС МЕНЕДЖЕРА
// ============================================

/**
 * Менеджер POI
 */
export class POIManager {
    private guiTexture: AdvancedDynamicTexture | null = null;
    private config: POIMarkerConfig;
    private captureConfig: CaptureBarConfig;
    
    private pois: Map<string, POIData> = new Map();
    private minimapMarkers: Map<string, Rectangle> = new Map();
    private worldMarkers: Map<string, { container: Rectangle; text: TextBlock; distance: TextBlock }> = new Map();
    
    private lastUpdateTime = 0;
    
    constructor(
        config: Partial<POIMarkerConfig> = {},
        captureConfig: Partial<CaptureBarConfig> = {}
    ) {
        this.config = { ...DEFAULT_POI_CONFIG, ...config };
        this.captureConfig = { ...DEFAULT_CAPTURE_CONFIG, ...captureConfig };
    }
    
    /**
     * Инициализация
     */
    initialize(guiTexture: AdvancedDynamicTexture): void {
        this.guiTexture = guiTexture;
        this.lastUpdateTime = Date.now();
    }
    
    /**
     * Добавить POI
     */
    addPOI(poi: POIData): void {
        this.pois.set(poi.id, poi);
    }
    
    /**
     * Удалить POI
     */
    removePOI(id: string): void {
        this.pois.delete(id);
        
        // Удалить маркеры
        const minimapMarker = this.minimapMarkers.get(id);
        if (minimapMarker) {
            minimapMarker.dispose();
            this.minimapMarkers.delete(id);
        }
        
        const worldMarker = this.worldMarkers.get(id);
        if (worldMarker) {
            worldMarker.container.dispose();
            this.worldMarkers.delete(id);
        }
    }
    
    /**
     * Обновить POI
     */
    updatePOI(id: string, updates: Partial<POIData>): void {
        const poi = this.pois.get(id);
        if (poi) {
            Object.assign(poi, updates);
        }
    }
    
    /**
     * Получить POI по ID
     */
    getPOI(id: string): POIData | undefined {
        return this.pois.get(id);
    }
    
    /**
     * Получить все POI
     */
    getAllPOIs(): POIData[] {
        return Array.from(this.pois.values());
    }
    
    /**
     * Получить ближайшие POI
     */
    getNearestPOIs(playerPos: Vector3, count: number = 5): POIData[] {
        const sorted = sortPOIByDistance(this.getAllPOIs(), playerPos);
        return sorted.slice(0, count);
    }
    
    /**
     * Получить POI в радиусе
     */
    getPOIsInRange(playerPos: Vector3, radius: number): POIData[] {
        return filterPOIByDistance(this.getAllPOIs(), playerPos, radius);
    }
    
    /**
     * Получить POI определённого типа
     */
    getPOIsByType(types: POIType[]): POIData[] {
        return filterPOIByType(this.getAllPOIs(), types);
    }
    
    /**
     * Проверить, находится ли игрок в зоне POI
     */
    isPlayerInPOI(playerPos: Vector3, poiId: string): boolean {
        const poi = this.pois.get(poiId);
        if (!poi || !poi.radius) return false;
        return getDistanceToPOI(playerPos, poi.position) <= poi.radius;
    }
    
    /**
     * Получить конфигурацию
     */
    getConfig(): POIMarkerConfig {
        return { ...this.config };
    }
    
    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<POIMarkerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * Вычислить пульсацию для анимации
     */
    getPulse(): number {
        return calculatePulse(Date.now(), this.config.pulseSpeed, this.config.pulseIntensity);
    }
    
    /**
     * Очистить все POI
     */
    clear(): void {
        // Удалить все маркеры
        for (const marker of this.minimapMarkers.values()) {
            marker.dispose();
        }
        this.minimapMarkers.clear();
        
        for (const marker of this.worldMarkers.values()) {
            marker.container.dispose();
        }
        this.worldMarkers.clear();
        
        this.pois.clear();
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.clear();
        this.guiTexture = null;
    }
}

export default POIManager;

