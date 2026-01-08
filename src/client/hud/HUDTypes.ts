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

/**
 * Параметр с базовым значением и бонусом
 */
export interface StatWithBonus {
    /** Базовое значение */
    base: number;
    /** Бонус (множитель или абсолютное значение) */
    bonus: number;
    /** Итоговое значение */
    total: number;
    /** Тип бонуса: множитель (%) или абсолютный */
    bonusType: "percent" | "absolute";
}

/**
 * Данные о шасси танка
 */
export interface ChassisStatsData {
    /** ID шасси */
    id: string;
    /** Название */
    name: string;
    /** Максимальное здоровье */
    maxHealth: StatWithBonus;
    /** Скорость движения */
    moveSpeed: StatWithBonus;
    /** Скорость поворота */
    turnSpeed: StatWithBonus;
    /** Ускорение */
    acceleration: StatWithBonus;
    /** Масса (кг) */
    mass: number;
    /** Особая способность */
    specialAbility: string | null;
    /** Уровень прокачки */
    upgradeLevel: number;
    /** Цвет шасси */
    color: string;
}

/**
 * Данные о пушке танка
 */
export interface CannonStatsData {
    /** ID пушки */
    id: string;
    /** Название */
    name: string;
    /** Урон */
    damage: StatWithBonus;
    /** Перезарядка (мс) */
    cooldown: StatWithBonus;
    /** Скорость снаряда */
    projectileSpeed: StatWithBonus;
    /** Размер снаряда */
    projectileSize: number;
    /** Множитель отдачи */
    recoilMultiplier: number;
    /** Длина ствола */
    barrelLength: number;
    /** Максимум рикошетов (если есть) */
    maxRicochets: number | null;
    /** Сохранение скорости при рикошете */
    ricochetSpeedRetention: number | null;
    /** Уровень прокачки */
    upgradeLevel: number;
    /** Цвет пушки */
    color: string;
}

/**
 * Данные о гусеницах танка
 */
export interface TracksStatsData {
    /** ID гусениц */
    id: string;
    /** Название */
    name: string;
    /** Стиль гусениц */
    style: string;
    /** Бонус к скорости (множитель) */
    speedBonus: number;
    /** Бонус к прочности (множитель) */
    durabilityBonus: number;
    /** Бонус к броне (множитель) */
    armorBonus: number;
    /** Уровень прокачки */
    upgradeLevel: number;
    /** Цвет гусениц */
    color: string;
}

/**
 * Суммарные бонусы от модулей и апгрейдов
 */
export interface BonusesStatsData {
    /** Бонус к урону */
    damageBonus: number;
    /** Бонус к перезарядке */
    cooldownBonus: number;
    /** Бонус к здоровью */
    healthBonus: number;
    /** Бонус к броне */
    armorBonus: number;
    /** Бонус к скорости */
    speedBonus: number;
    /** Бонус к скорости поворота */
    turnSpeedBonus: number;
    /** Бонус к ускорению */
    accelerationBonus: number;
    /** Бонус к скорости снаряда */
    projectileSpeedBonus: number;
    /** Шанс критического урона */
    critChance: number;
    /** Шанс уклонения */
    evasion: number;
    /** Скорость авто-ремонта */
    repairRate: number;
    /** Эффективность топлива */
    fuelEfficiency: number;
    /** Общий уровень игрока */
    playerLevel: number;
    /** Установленные модули */
    installedModules: Array<{
        id: string;
        name: string;
        icon: string;
        rarity: string;
    }>;
}

/**
 * Полные данные о характеристиках танка для панели статистики
 */
export interface TankStatsData {
    /** Данные о шасси */
    chassis: ChassisStatsData;
    /** Данные о пушке */
    cannon: CannonStatsData;
    /** Данные о гусеницах */
    tracks: TracksStatsData;
    /** Суммарные бонусы */
    bonuses: BonusesStatsData;
    /** Текущее здоровье */
    currentHealth: number;
    /** Текущее топливо */
    currentFuel: number;
    /** Максимальное топливо */
    maxFuel: number;
    /** Текущая броня (0-1) */
    currentArmor: number;
}

