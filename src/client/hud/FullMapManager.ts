/**
 * @module hud/FullMapManager
 * @description Менеджер полноэкранной карты - отображение всей игровой зоны
 * 
 * Этот модуль содержит:
 * - Конфигурацию полноэкранной карты
 * - Типы маркеров и легенды
 * - Вспомогательные функции для отображения
 * - Класс менеджера для управления картой
 */

import { Vector3 } from "@babylonjs/core";
import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

// ============================================
// ТИПЫ
// ============================================

export type FullMapMarkerType = 
    | "player" 
    | "enemy" 
    | "ally" 
    | "objective" 
    | "poi" 
    | "spawn" 
    | "zone";

export interface FullMapMarkerData {
    id: string;
    type: FullMapMarkerType;
    position: Vector3;
    rotation?: number;
    name?: string;
    color?: string;
    visible?: boolean;
}

export interface MapBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface LegendItem {
    type: FullMapMarkerType;
    label: string;
    color: string;
    icon?: string;
}

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

export interface FullMapConfig {
    // Размеры
    width: number;
    height: number;
    mapAreaPadding: number;
    
    // Цвета
    backgroundColor: string;
    borderColor: string;
    gridColor: string;
    textColor: string;
    
    // Маркеры
    playerColor: string;
    enemyColor: string;
    allyColor: string;
    objectiveColor: string;
    poiColor: string;
    
    // Поведение
    maxEnemyMarkers: number;
    showGrid: boolean;
    showLegend: boolean;
    showCoordinates: boolean;
    animateMarkers: boolean;
}

export const DEFAULT_FULLMAP_CONFIG: FullMapConfig = {
    // Размеры
    width: 700,
    height: 600,
    mapAreaPadding: 40,
    
    // Цвета
    backgroundColor: "rgba(0, 10, 0, 0.95)",
    borderColor: "#00ff00",
    gridColor: "rgba(0, 255, 0, 0.2)",
    textColor: "#ffffff",
    
    // Маркеры
    playerColor: "#00ff00",
    enemyColor: "#ff0000",
    allyColor: "#00aaff",
    objectiveColor: "#ffff00",
    poiColor: "#ff00ff",
    
    // Поведение
    maxEnemyMarkers: 50,
    showGrid: true,
    showLegend: true,
    showCoordinates: true,
    animateMarkers: true
};

export interface MarkerConfig {
    size: number;
    directionLength: number;
    pulseSpeed: number;
    pulseIntensity: number;
}

export const DEFAULT_MARKER_CONFIG: MarkerConfig = {
    size: 12,
    directionLength: 16,
    pulseSpeed: 1000,
    pulseIntensity: 0.3
};

// ============================================
// ЛЕГЕНДА
// ============================================

export const DEFAULT_LEGEND_ITEMS: LegendItem[] = [
    { type: "player", label: "Вы", color: "#00ff00", icon: "▲" },
    { type: "enemy", label: "Враги", color: "#ff0000", icon: "●" },
    { type: "ally", label: "Союзники", color: "#00aaff", icon: "●" },
    { type: "objective", label: "Цели", color: "#ffff00", icon: "★" },
    { type: "poi", label: "Точки интереса", color: "#ff00ff", icon: "◆" }
];

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Получить цвет маркера по типу
 */
export function getMarkerColor(type: FullMapMarkerType, config: FullMapConfig = DEFAULT_FULLMAP_CONFIG): string {
    switch (type) {
        case "player": return config.playerColor;
        case "enemy": return config.enemyColor;
        case "ally": return config.allyColor;
        case "objective": return config.objectiveColor;
        case "poi": return config.poiColor;
        default: return config.textColor;
    }
}

/**
 * Преобразовать мировые координаты в координаты карты
 */
export function worldToMapCoordinates(
    worldX: number,
    worldZ: number,
    bounds: MapBounds,
    mapWidth: number,
    mapHeight: number,
    padding: number = 0
): { x: number; y: number } {
    const effectiveWidth = mapWidth - padding * 2;
    const effectiveHeight = mapHeight - padding * 2;
    
    const rangeX = bounds.maxX - bounds.minX;
    const rangeZ = bounds.maxZ - bounds.minZ;
    
    const normalizedX = (worldX - bounds.minX) / rangeX;
    const normalizedZ = (worldZ - bounds.minZ) / rangeZ;
    
    return {
        x: padding + normalizedX * effectiveWidth,
        y: padding + (1 - normalizedZ) * effectiveHeight // Инвертируем Z
    };
}

/**
 * Преобразовать координаты карты в мировые
 */
export function mapToWorldCoordinates(
    mapX: number,
    mapY: number,
    bounds: MapBounds,
    mapWidth: number,
    mapHeight: number,
    padding: number = 0
): { x: number; z: number } {
    const effectiveWidth = mapWidth - padding * 2;
    const effectiveHeight = mapHeight - padding * 2;
    
    const normalizedX = (mapX - padding) / effectiveWidth;
    const normalizedZ = 1 - (mapY - padding) / effectiveHeight; // Инвертируем Z
    
    const rangeX = bounds.maxX - bounds.minX;
    const rangeZ = bounds.maxZ - bounds.minZ;
    
    return {
        x: bounds.minX + normalizedX * rangeX,
        z: bounds.minZ + normalizedZ * rangeZ
    };
}

/**
 * Вычислить границы карты на основе позиций
 */
export function calculateMapBounds(positions: Vector3[], padding: number = 100): MapBounds {
    if (positions.length === 0) {
        return { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (const pos of positions) {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minZ = Math.min(minZ, pos.z);
        maxZ = Math.max(maxZ, pos.z);
    }
    
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minZ: minZ - padding,
        maxZ: maxZ + padding
    };
}

/**
 * Вычислить масштаб карты
 */
export function calculateMapScale(bounds: MapBounds, mapWidth: number, mapHeight: number): number {
    const rangeX = bounds.maxX - bounds.minX;
    const rangeZ = bounds.maxZ - bounds.minZ;
    
    const scaleX = mapWidth / rangeX;
    const scaleZ = mapHeight / rangeZ;
    
    return Math.min(scaleX, scaleZ);
}

/**
 * Форматировать координаты для отображения
 */
export function formatCoordinates(x: number, z: number): string {
    return `X: ${Math.round(x)} Z: ${Math.round(z)}`;
}

/**
 * Генерировать линии сетки
 */
export function generateGridLines(
    bounds: MapBounds,
    gridSize: number = 100
): { horizontal: number[]; vertical: number[] } {
    const horizontal: number[] = [];
    const vertical: number[] = [];
    
    // Вертикальные линии (по X)
    const startX = Math.ceil(bounds.minX / gridSize) * gridSize;
    for (let x = startX; x <= bounds.maxX; x += gridSize) {
        vertical.push(x);
    }
    
    // Горизонтальные линии (по Z)
    const startZ = Math.ceil(bounds.minZ / gridSize) * gridSize;
    for (let z = startZ; z <= bounds.maxZ; z += gridSize) {
        horizontal.push(z);
    }
    
    return { horizontal, vertical };
}

/**
 * Проверить, находится ли точка в границах карты
 */
export function isInMapBounds(x: number, z: number, bounds: MapBounds): boolean {
    return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * Вычислить расстояние между двумя точками на карте
 */
export function getMapDistance(x1: number, z1: number, x2: number, z2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
}

/**
 * Вычислить пульсацию для анимации маркеров
 */
export function calculateMarkerPulse(time: number, config: MarkerConfig = DEFAULT_MARKER_CONFIG): number {
    return 1 - config.pulseIntensity + config.pulseIntensity * Math.abs(Math.sin(time / config.pulseSpeed * Math.PI));
}

// ============================================
// КЛАСС МЕНЕДЖЕРА
// ============================================

/**
 * Менеджер полноэкранной карты
 */
export class FullMapManager {
    private guiTexture: AdvancedDynamicTexture | null = null;
    private config: FullMapConfig;
    private markerConfig: MarkerConfig;
    
    private isVisible = false;
    private bounds: MapBounds;
    
    private markers: Map<string, FullMapMarkerData> = new Map();
    private markerPool: Rectangle[] = [];
    private activeMarkers: Map<string, Rectangle> = new Map();
    
    constructor(
        config: Partial<FullMapConfig> = {},
        markerConfig: Partial<MarkerConfig> = {}
    ) {
        this.config = { ...DEFAULT_FULLMAP_CONFIG, ...config };
        this.markerConfig = { ...DEFAULT_MARKER_CONFIG, ...markerConfig };
        this.bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
    }
    
    /**
     * Инициализация
     */
    initialize(guiTexture: AdvancedDynamicTexture): void {
        this.guiTexture = guiTexture;
    }
    
    /**
     * Установить границы карты
     */
    setBounds(bounds: MapBounds): void {
        this.bounds = bounds;
    }
    
    /**
     * Вычислить границы автоматически
     */
    calculateBoundsFromMarkers(padding: number = 100): void {
        const positions = Array.from(this.markers.values())
            .filter(m => m.visible !== false)
            .map(m => m.position);
        this.bounds = calculateMapBounds(positions, padding);
    }
    
    /**
     * Добавить маркер
     */
    addMarker(marker: FullMapMarkerData): void {
        this.markers.set(marker.id, marker);
    }
    
    /**
     * Удалить маркер
     */
    removeMarker(id: string): void {
        this.markers.delete(id);
        
        const rect = this.activeMarkers.get(id);
        if (rect) {
            rect.isVisible = false;
            this.markerPool.push(rect);
            this.activeMarkers.delete(id);
        }
    }
    
    /**
     * Обновить маркер
     */
    updateMarker(id: string, updates: Partial<FullMapMarkerData>): void {
        const marker = this.markers.get(id);
        if (marker) {
            Object.assign(marker, updates);
        }
    }
    
    /**
     * Получить маркер
     */
    getMarker(id: string): FullMapMarkerData | undefined {
        return this.markers.get(id);
    }
    
    /**
     * Получить все маркеры
     */
    getAllMarkers(): FullMapMarkerData[] {
        return Array.from(this.markers.values());
    }
    
    /**
     * Преобразовать мировые координаты в координаты карты
     */
    worldToMap(worldX: number, worldZ: number): { x: number; y: number } {
        return worldToMapCoordinates(
            worldX, worldZ,
            this.bounds,
            this.config.width - this.config.mapAreaPadding * 2,
            this.config.height - this.config.mapAreaPadding * 2,
            0
        );
    }
    
    /**
     * Переключить видимость карты
     */
    toggle(): boolean {
        this.isVisible = !this.isVisible;
        return this.isVisible;
    }
    
    /**
     * Показать карту
     */
    show(): void {
        this.isVisible = true;
    }
    
    /**
     * Скрыть карту
     */
    hide(): void {
        this.isVisible = false;
    }
    
    /**
     * Получить состояние видимости
     */
    getIsVisible(): boolean {
        return this.isVisible;
    }
    
    /**
     * Получить границы
     */
    getBounds(): MapBounds {
        return { ...this.bounds };
    }
    
    /**
     * Получить конфигурацию
     */
    getConfig(): FullMapConfig {
        return { ...this.config };
    }
    
    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<FullMapConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * Получить элементы легенды
     */
    getLegendItems(): LegendItem[] {
        return DEFAULT_LEGEND_ITEMS;
    }
    
    /**
     * Получить пульсацию для анимации
     */
    getPulse(): number {
        return calculateMarkerPulse(Date.now(), this.markerConfig);
    }
    
    /**
     * Очистить все маркеры
     */
    clear(): void {
        for (const rect of this.activeMarkers.values()) {
            rect.isVisible = false;
            this.markerPool.push(rect);
        }
        this.activeMarkers.clear();
        this.markers.clear();
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.clear();
        for (const rect of this.markerPool) {
            rect.dispose();
        }
        this.markerPool = [];
        this.guiTexture = null;
    }
}

export default FullMapManager;

