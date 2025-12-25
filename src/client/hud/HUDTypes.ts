/**
 * Типы и интерфейсы для HUD системы
 */

import { Rectangle, TextBlock } from "@babylonjs/gui";

/**
 * Слот арсенала с боеприпасами
 */
export interface ArsenalSlot {
    container: Rectangle;
    icon: TextBlock;
    countText: TextBlock;
    type: string; // "tracer", "ap", "apcr", "he", "apds"
    cooldownOverlay: Rectangle;
    cooldownFill: Rectangle;
    cooldownFillGlow: Rectangle;
    cooldownText: TextBlock;
}

/**
 * Маркер POI для миникарты
 */
export interface POIMinimapMarker {
    container: Rectangle;
    icon: TextBlock;
    x: number;
    z: number;
    type: string;
}

/**
 * 3D маркер POI
 */
export interface POI3DMarker {
    container: Rectangle;
    text: TextBlock;
    distance: TextBlock;
    x: number;
    y: number;
    z: number;
    type: string;
    poiId: string;
}

/**
 * Активный эффект с анимацией
 */
export interface ActiveEffect {
    container: Rectangle;
    icon: TextBlock;
    durationText: TextBlock;
    startTime: number;
    duration: number;
    type: string;
}

/**
 * Индикатор направленного урона
 */
export interface DamageDirection {
    indicator: Rectangle;
    angle: number;
    opacity: number;
    active: boolean;
}

/**
 * Элемент комбо-счетчика
 */
export interface ComboElement {
    text: TextBlock;
    time: number;
    fadeOut: boolean;
}

/**
 * Конфигурация HUD
 */
export interface HUDConfig {
    /** Показывать ли миникарту */
    showMinimap: boolean;
    /** Показывать ли компас */
    showCompass: boolean;
    /** Показывать ли арсенал */
    showArsenal: boolean;
    /** Показывать ли припасы */
    showSupplies: boolean;
    /** Показывать ли здоровье */
    showHealth: boolean;
    /** Показывать ли перезарядку */
    showReload: boolean;
    /** Показывать ли прицел */
    showCrosshair: boolean;
    /** Показывать ли спидометр */
    showSpeedometer: boolean;
    /** Показывать ли координаты */
    showPosition: boolean;
    /** Размер миникарты (px) */
    minimapSize: number;
    /** Прозрачность HUD (0-1) */
    opacity: number;
}

/**
 * Конфигурация HUD по умолчанию
 */
export const DEFAULT_HUD_CONFIG: HUDConfig = {
    showMinimap: true,
    showCompass: true,
    showArsenal: true,
    showSupplies: true,
    showHealth: true,
    showReload: true,
    showCrosshair: true,
    showSpeedometer: true,
    showPosition: false, // По умолчанию скрыто для чистоты
    minimapSize: 180,
    opacity: 1.0
};

/**
 * Состояние HUD
 */
export interface HUDState {
    /** Текущее здоровье */
    health: number;
    /** Максимальное здоровье */
    maxHealth: number;
    /** Прогресс перезарядки (0-1) */
    reloadProgress: number;
    /** Текущая скорость */
    speed: number;
    /** Количество убийств */
    kills: number;
    /** Текущая позиция */
    position: { x: number; y: number; z: number };
    /** Направление компаса (градусы) */
    compassDirection: number;
    /** Активные эффекты */
    activeEffects: string[];
    /** Текущий выбранный слот арсенала */
    currentArsenalSlot: number;
    /** Количество боеприпасов по типам */
    ammoCount: Record<string, { current: number; max: number }>;
}

