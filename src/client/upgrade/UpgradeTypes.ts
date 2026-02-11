/**
 * @module upgrade/UpgradeTypes
 * @description Типы и интерфейсы системы прокачки
 * 
 * Система прокачки включает:
 * - Орудия (cannons)
 * - Корпуса (chassis)  
 * - Шасси/гусеницы (tracks)
 * - Модули (modules)
 * 
 * Каждый элемент может быть прокачан до 10 уровня
 * Для прокачки требуются XP и Credits
 */

// ============================================
// ТИПЫ ПРОКАЧИВАЕМЫХ ЭЛЕМЕНТОВ
// ============================================

/**
 * Категория прокачиваемого элемента
 */
export type UpgradeCategory = "cannon" | "chassis" | "tracks" | "module";

/**
 * Бонусы от прокачки
 */
export interface UpgradeBonuses {
    // === Орудия ===
    /** Бонус к урону (множитель, 1.0 = 0%) */
    damageMultiplier?: number;
    /** Сокращение перезарядки (множитель, 0.9 = -10%) */
    cooldownMultiplier?: number;
    /** Бонус к скорости снаряда (множитель) */
    projectileSpeedMultiplier?: number;
    /** Бонус к максимальному количеству рикошетов */
    maxRicochetsBonus?: number;
    /** Бонус к сохранению скорости при рикошете */
    ricochetSpeedRetentionBonus?: number;

    // === Корпуса ===
    /** Бонус к здоровью (множитель) */
    healthMultiplier?: number;
    /** Бонус к броне (множитель) */
    armorMultiplier?: number;

    // === Шасси/Гусеницы ===
    /** Бонус к скорости (множитель) */
    speedMultiplier?: number;
    /** Бонус к скорости поворота (множитель) */
    turnSpeedMultiplier?: number;
    /** Бонус к ускорению (множитель) */
    accelerationMultiplier?: number;

    // === Модули ===
    /** Сокращение перезарядки модуля (множитель) */
    moduleCooldownMultiplier?: number;
    /** Усиление эффекта модуля (множитель) */
    moduleEffectMultiplier?: number;
    /** Увеличение длительности эффекта (множитель) */
    moduleDurationMultiplier?: number;
}

/**
 * Требования для уровня прокачки
 */
export interface UpgradeLevelRequirements {
    /** Требуемый XP */
    xp: number;
    /** Требуемые кредиты */
    credits: number;
}

/**
 * Конфигурация уровня прокачки
 */
export interface UpgradeLevel {
    /** Номер уровня (1-10) */
    level: number;
    /** Требования для достижения этого уровня */
    requirements: UpgradeLevelRequirements;
    /** Бонусы на этом уровне */
    bonuses: UpgradeBonuses;
}

/**
 * Данные о прокачке одного элемента
 */
export interface ElementUpgrade {
    /** ID элемента (например, "ricochet" для пушки) */
    elementId: string;
    /** Текущий уровень (1-10) */
    level: number;
    /** Заработанный XP на текущем элементе */
    currentXp: number;
}

/**
 * Полные данные прокачки игрока
 */
export interface PlayerUpgrades {
    /** Прокачка орудий: id -> данные */
    cannons: Record<string, ElementUpgrade>;
    /** Прокачка корпусов: id -> данные */
    chassis: Record<string, ElementUpgrade>;
    /** Прокачка шасси/гусениц: id -> данные */
    tracks: Record<string, ElementUpgrade>;
    /** Прокачка модулей: id -> данные */
    modules: Record<string, ElementUpgrade>;
    /** Общий XP игрока */
    totalXp: number;
    /** Кредиты игрока */
    credits: number;
    /** Уровень игрока (общий) */
    playerLevel: number;
    /** Время последней синхронизации с сервером */
    lastSyncTime?: number;
}

/**
 * Результат попытки прокачки
 */
export interface UpgradeResult {
    /** Успешно ли прокачано */
    success: boolean;
    /** Новый уровень (если успешно) */
    newLevel?: number;
    /** Причина неудачи */
    error?: "insufficient_xp" | "insufficient_credits" | "max_level" | "element_not_found";
    /** Потраченные ресурсы */
    spent?: {
        xp: number;
        credits: number;
    };
}

/**
 * Событие получения XP
 */
export interface XpGainEvent {
    /** Количество полученного XP */
    amount: number;
    /** Источник XP */
    source: "damage" | "kill" | "assist" | "objective" | "bonus";
    /** Описание */
    description?: string;
}

/**
 * Событие получения кредитов
 */
export interface CreditsGainEvent {
    /** Количество полученных кредитов */
    amount: number;
    /** Источник */
    source: "battle" | "achievement" | "daily" | "purchase";
    /** Описание */
    description?: string;
}

// ============================================
// КОНСТАНТЫ
// ============================================

/** Максимальный уровень прокачки */
export const MAX_UPGRADE_LEVEL = 10;

/** Ключ для localStorage */
export const UPGRADE_STORAGE_KEY = "tx_player_upgrades";

/** Версия формата данных (для миграций) */
export const UPGRADE_DATA_VERSION = 1;

