/**
 * @module hud/MinimapManager
 * @description Менеджер миникарты (радара) - управление конфигурацией и обновлением
 * 
 * Этот модуль содержит:
 * - Конфигурацию размеров и стилей радара
 * - Типы для маркеров врагов и игроков
 * - Вспомогательные функции для расчётов позиций
 * 
 * Основная логика UI остаётся в hud.ts для обратной совместимости.
 */

import { Vector3 } from "@babylonjs/core";
import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

// ============================================
// КОНФИГУРАЦИЯ РАДАРА
// ============================================

export interface MinimapManagerConfig {
    // Размеры
    radarSize: number;
    radarInner: number;
    headerHeight: number;
    infoHeight: number;
    statusWidth: number;
    gap: number;
    padding: number;
    
    // Цвета
    primaryColor: string;
    backgroundColor: string;
    enemyColor: string;
    playerColor: string;
    aimColor: string;
    
    // Анимация
    scanSpeed: number;          // Скорость вращения сканлайна (мс на полный оборот)
    scanWidth: number;          // Ширина сканирующего луча (радианы)
    fadeDuration: number;       // Длительность затухания (мс)
    updateInterval: number;     // Интервал обновления (мс)
    
    // Масштаб
    radarRange: number;         // Радиус обзора радара в игровых единицах
    markerSize: number;         // Размер маркера врага
    playerMarkerSize: number;   // Размер маркера игрока
}

export const DEFAULT_MINIMAP_MANAGER_CONFIG: MinimapManagerConfig = {
    // Размеры
    radarSize: 220,
    radarInner: 180,
    headerHeight: 26,
    infoHeight: 26,
    statusWidth: 95,
    gap: 10,
    padding: 10,
    
    // Цвета
    primaryColor: "#00ff00",
    backgroundColor: "rgba(0, 20, 0, 0.9)",
    enemyColor: "#ff0000",
    playerColor: "#00ff00",
    aimColor: "#ffff00",
    
    // Анимация
    scanSpeed: 3000,
    scanWidth: 0.3,
    fadeDuration: 1500,
    updateInterval: 100,
    
    // Масштаб
    radarRange: 100,
    markerSize: 6,
    playerMarkerSize: 10
};

// ============================================
// ТИПЫ
// ============================================

export interface EnemyMarkerData {
    x: number;
    z: number;
    alive: boolean;
    turretRotation?: number;
    id?: string;
}

export interface MinimapMarker {
    marker: Rectangle;
    barrelMarker?: Rectangle;
    id: string;
    lastUpdate: number;
}

export interface ScannedEnemy {
    marker: Rectangle | null;
    fadeTime: number;
}

export interface PlayerMarkerData {
    id: string;
    x: number;
    z: number;
    rotation: number;
    team?: string;
    isLocal?: boolean;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Преобразует мировые координаты в координаты радара
 */
export function worldToRadar(
    worldX: number, 
    worldZ: number, 
    playerX: number, 
    playerZ: number, 
    angle: number,
    radarRange: number,
    radarInner: number
): { x: number; y: number; visible: boolean } {
    // Вычисляем относительную позицию
    const relX = worldX - playerX;
    const relZ = worldZ - playerZ;
    
    // Вращаем относительно направления игрока
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotX = relX * cos - relZ * sin;
    const rotZ = relX * sin + relZ * cos;
    
    // Масштабируем к размеру радара
    const scale = radarInner / 2 / radarRange;
    const radarX = rotX * scale;
    const radarY = -rotZ * scale; // Инвертируем Z для правильного отображения
    
    // Проверяем, находится ли точка в пределах радара
    const distance = Math.sqrt(radarX * radarX + radarY * radarY);
    const visible = distance <= radarInner / 2;
    
    return { x: radarX, y: radarY, visible };
}

/**
 * Вычисляет угол до цели
 */
export function getAngleToTarget(
    playerX: number, 
    playerZ: number, 
    targetX: number, 
    targetZ: number
): number {
    return Math.atan2(targetX - playerX, targetZ - playerZ);
}

/**
 * Нормализует угол в диапазон [0, 2π]
 */
export function normalizeAngle(angle: number): number {
    let normalized = angle % (Math.PI * 2);
    if (normalized < 0) normalized += Math.PI * 2;
    return normalized;
}

/**
 * Проверяет, попадает ли угол в зону сканирования
 */
export function isInScanZone(
    targetAngle: number, 
    scanAngle: number, 
    scanWidth: number
): boolean {
    const normalizedTarget = normalizeAngle(targetAngle);
    const normalizedScan = normalizeAngle(scanAngle);
    
    let diff = Math.abs(normalizedScan - normalizedTarget);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    
    return diff < scanWidth;
}

/**
 * Получает направление по компасу
 */
export function getCompassDirection(angle: number): string {
    // Нормализуем угол к 0-360
    let degrees = (angle * 180 / Math.PI) % 360;
    if (degrees < 0) degrees += 360;
    
    // Определяем направление
    if (degrees >= 337.5 || degrees < 22.5) return "N";
    if (degrees >= 22.5 && degrees < 67.5) return "NE";
    if (degrees >= 67.5 && degrees < 112.5) return "E";
    if (degrees >= 112.5 && degrees < 157.5) return "SE";
    if (degrees >= 157.5 && degrees < 202.5) return "S";
    if (degrees >= 202.5 && degrees < 247.5) return "SW";
    if (degrees >= 247.5 && degrees < 292.5) return "W";
    if (degrees >= 292.5 && degrees < 337.5) return "NW";
    return "N";
}

/**
 * Интерполирует цвет между двумя значениями
 */
export function interpolateColor(
    color1: [number, number, number], 
    color2: [number, number, number], 
    t: number
): string {
    const r = Math.floor(color1[0] + (color2[0] - color1[0]) * t);
    const g = Math.floor(color1[1] + (color2[1] - color1[1]) * t);
    const b = Math.floor(color1[2] + (color2[2] - color1[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

// ============================================
// КЛАСС МЕНЕДЖЕРА (для будущего использования)
// ============================================

/**
 * Менеджер миникарты
 * Примечание: Основная логика UI пока остаётся в hud.ts
 * Этот класс используется для конфигурации и вспомогательных функций
 */
export class MinimapManager {
    private config: MinimapManagerConfig;
    private guiTexture: AdvancedDynamicTexture | null = null;
    
    // Состояние сканирования
    private scanAngle = 0;
    private lastScanTime = 0;
    private scannedEnemies: Map<string, ScannedEnemy> = new Map();
    
    constructor(config: Partial<MinimapManagerConfig> = {}) {
        this.config = { ...DEFAULT_MINIMAP_MANAGER_CONFIG, ...config };
    }
    
    /**
     * Инициализация с GUI текстурой
     */
    initialize(guiTexture: AdvancedDynamicTexture): void {
        this.guiTexture = guiTexture;
        this.lastScanTime = Date.now();
    }
    
    /**
     * Получить конфигурацию
     */
    getConfig(): MinimapManagerConfig {
        return { ...this.config };
    }
    
    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<MinimapManagerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * Преобразовать мировые координаты в координаты радара
     */
    worldToRadar(worldX: number, worldZ: number, playerX: number, playerZ: number, angle: number): { x: number; y: number; visible: boolean } {
        return worldToRadar(
            worldX, worldZ, 
            playerX, playerZ, 
            angle, 
            this.config.radarRange, 
            this.config.radarInner
        );
    }
    
    /**
     * Обновить угол сканирования
     */
    updateScan(deltaTime: number): number {
        this.scanAngle += (deltaTime / this.config.scanSpeed) * Math.PI * 2;
        if (this.scanAngle > Math.PI * 2) {
            this.scanAngle -= Math.PI * 2;
        }
        return this.scanAngle;
    }
    
    /**
     * Проверить, попадает ли враг в зону сканирования
     */
    isEnemyScanned(enemyAngle: number): boolean {
        return isInScanZone(enemyAngle, this.scanAngle, this.config.scanWidth);
    }
    
    /**
     * Получить общие размеры контейнера
     */
    getTotalSize(): { width: number; height: number } {
        const width = this.config.radarSize + this.config.statusWidth + this.config.gap + this.config.padding * 2;
        const height = this.config.headerHeight + this.config.radarSize + this.config.infoHeight + this.config.gap * 2 + this.config.padding * 2;
        return { width, height };
    }
    
    /**
     * Вычислить позицию центральной области
     */
    getCenterY(): number {
        return this.config.padding + this.config.headerHeight + this.config.gap;
    }
    
    /**
     * Очистить состояние
     */
    dispose(): void {
        this.scannedEnemies.clear();
        this.guiTexture = null;
    }
}

export default MinimapManager;

