/**
 * @module upgrade/UpgradeConfig
 * @description Конфигурация системы прокачки
 * 
 * Определяет:
 * - Требования XP и кредитов для каждого уровня
 * - Бонусы на каждом уровне
 * - Специфичные бонусы для разных категорий
 */

import { 
    UpgradeLevel, 
    UpgradeBonuses, 
    UpgradeCategory,
    MAX_UPGRADE_LEVEL 
} from './UpgradeTypes';

// ============================================
// ТАБЛИЦА УРОВНЕЙ
// ============================================

/**
 * Требования и бонусы для каждого уровня прокачки
 * Уровень 1 - базовый (бесплатно)
 * Уровни 2-10 требуют ресурсы
 */
export const UPGRADE_LEVELS: UpgradeLevel[] = [
    {
        level: 1,
        requirements: { xp: 0, credits: 0 },
        bonuses: { damageMultiplier: 1.0, healthMultiplier: 1.0, speedMultiplier: 1.0 }
    },
    {
        level: 2,
        requirements: { xp: 100, credits: 500 },
        bonuses: { damageMultiplier: 1.05, healthMultiplier: 1.05, speedMultiplier: 1.03 }
    },
    {
        level: 3,
        requirements: { xp: 300, credits: 1500 },
        bonuses: { damageMultiplier: 1.10, healthMultiplier: 1.10, speedMultiplier: 1.06 }
    },
    {
        level: 4,
        requirements: { xp: 600, credits: 3000 },
        bonuses: { damageMultiplier: 1.15, healthMultiplier: 1.15, speedMultiplier: 1.09 }
    },
    {
        level: 5,
        requirements: { xp: 1000, credits: 5000 },
        bonuses: { damageMultiplier: 1.22, healthMultiplier: 1.22, speedMultiplier: 1.13 }
    },
    {
        level: 6,
        requirements: { xp: 1500, credits: 8000 },
        bonuses: { damageMultiplier: 1.30, healthMultiplier: 1.30, speedMultiplier: 1.18 }
    },
    {
        level: 7,
        requirements: { xp: 2200, credits: 12000 },
        bonuses: { damageMultiplier: 1.40, healthMultiplier: 1.40, speedMultiplier: 1.24 }
    },
    {
        level: 8,
        requirements: { xp: 3000, credits: 18000 },
        bonuses: { damageMultiplier: 1.52, healthMultiplier: 1.52, speedMultiplier: 1.31 }
    },
    {
        level: 9,
        requirements: { xp: 4000, credits: 25000 },
        bonuses: { damageMultiplier: 1.65, healthMultiplier: 1.65, speedMultiplier: 1.39 }
    },
    {
        level: 10,
        requirements: { xp: 5500, credits: 35000 },
        bonuses: { damageMultiplier: 1.80, healthMultiplier: 1.80, speedMultiplier: 1.50 }
    }
];

// ============================================
// СПЕЦИФИЧНЫЕ БОНУСЫ ПО КАТЕГОРИЯМ
// ============================================

/**
 * Бонусы для орудий на каждом уровне
 */
export const CANNON_UPGRADE_BONUSES: Record<number, UpgradeBonuses> = {
    1: { damageMultiplier: 1.0, cooldownMultiplier: 1.0, projectileSpeedMultiplier: 1.0, maxRicochetsBonus: 0 },
    2: { damageMultiplier: 1.05, cooldownMultiplier: 0.97, projectileSpeedMultiplier: 1.02, maxRicochetsBonus: 0 },
    3: { damageMultiplier: 1.10, cooldownMultiplier: 0.94, projectileSpeedMultiplier: 1.04, maxRicochetsBonus: 0 },
    4: { damageMultiplier: 1.15, cooldownMultiplier: 0.91, projectileSpeedMultiplier: 1.06, maxRicochetsBonus: 1 },
    5: { damageMultiplier: 1.22, cooldownMultiplier: 0.88, projectileSpeedMultiplier: 1.08, maxRicochetsBonus: 1 },
    6: { damageMultiplier: 1.30, cooldownMultiplier: 0.85, projectileSpeedMultiplier: 1.10, maxRicochetsBonus: 1 },
    7: { damageMultiplier: 1.40, cooldownMultiplier: 0.82, projectileSpeedMultiplier: 1.13, maxRicochetsBonus: 2 },
    8: { damageMultiplier: 1.52, cooldownMultiplier: 0.79, projectileSpeedMultiplier: 1.16, maxRicochetsBonus: 2 },
    9: { damageMultiplier: 1.65, cooldownMultiplier: 0.76, projectileSpeedMultiplier: 1.19, maxRicochetsBonus: 2 },
    10: { damageMultiplier: 1.80, cooldownMultiplier: 0.72, projectileSpeedMultiplier: 1.22, maxRicochetsBonus: 3 }
};

/**
 * Бонусы для корпусов на каждом уровне
 */
export const CHASSIS_UPGRADE_BONUSES: Record<number, UpgradeBonuses> = {
    1: { healthMultiplier: 1.0, armorMultiplier: 1.0 },
    2: { healthMultiplier: 1.05, armorMultiplier: 1.03 },
    3: { healthMultiplier: 1.10, armorMultiplier: 1.06 },
    4: { healthMultiplier: 1.16, armorMultiplier: 1.09 },
    5: { healthMultiplier: 1.23, armorMultiplier: 1.13 },
    6: { healthMultiplier: 1.31, armorMultiplier: 1.17 },
    7: { healthMultiplier: 1.40, armorMultiplier: 1.22 },
    8: { healthMultiplier: 1.50, armorMultiplier: 1.27 },
    9: { healthMultiplier: 1.62, armorMultiplier: 1.33 },
    10: { healthMultiplier: 1.75, armorMultiplier: 1.40 }
};

/**
 * Бонусы для шасси/гусениц на каждом уровне
 */
export const TRACKS_UPGRADE_BONUSES: Record<number, UpgradeBonuses> = {
    1: { speedMultiplier: 1.0, turnSpeedMultiplier: 1.0, accelerationMultiplier: 1.0 },
    2: { speedMultiplier: 1.03, turnSpeedMultiplier: 1.03, accelerationMultiplier: 1.04 },
    3: { speedMultiplier: 1.06, turnSpeedMultiplier: 1.06, accelerationMultiplier: 1.08 },
    4: { speedMultiplier: 1.09, turnSpeedMultiplier: 1.09, accelerationMultiplier: 1.12 },
    5: { speedMultiplier: 1.13, turnSpeedMultiplier: 1.13, accelerationMultiplier: 1.17 },
    6: { speedMultiplier: 1.17, turnSpeedMultiplier: 1.17, accelerationMultiplier: 1.22 },
    7: { speedMultiplier: 1.22, turnSpeedMultiplier: 1.22, accelerationMultiplier: 1.28 },
    8: { speedMultiplier: 1.27, turnSpeedMultiplier: 1.27, accelerationMultiplier: 1.35 },
    9: { speedMultiplier: 1.33, turnSpeedMultiplier: 1.33, accelerationMultiplier: 1.42 },
    10: { speedMultiplier: 1.40, turnSpeedMultiplier: 1.40, accelerationMultiplier: 1.50 }
};

/**
 * Бонусы для модулей на каждом уровне
 */
export const MODULE_UPGRADE_BONUSES: Record<number, UpgradeBonuses> = {
    1: { moduleCooldownMultiplier: 1.0, moduleEffectMultiplier: 1.0, moduleDurationMultiplier: 1.0 },
    2: { moduleCooldownMultiplier: 0.97, moduleEffectMultiplier: 1.05, moduleDurationMultiplier: 1.03 },
    3: { moduleCooldownMultiplier: 0.94, moduleEffectMultiplier: 1.10, moduleDurationMultiplier: 1.06 },
    4: { moduleCooldownMultiplier: 0.91, moduleEffectMultiplier: 1.15, moduleDurationMultiplier: 1.10 },
    5: { moduleCooldownMultiplier: 0.87, moduleEffectMultiplier: 1.22, moduleDurationMultiplier: 1.15 },
    6: { moduleCooldownMultiplier: 0.83, moduleEffectMultiplier: 1.30, moduleDurationMultiplier: 1.20 },
    7: { moduleCooldownMultiplier: 0.79, moduleEffectMultiplier: 1.40, moduleDurationMultiplier: 1.26 },
    8: { moduleCooldownMultiplier: 0.75, moduleEffectMultiplier: 1.50, moduleDurationMultiplier: 1.33 },
    9: { moduleCooldownMultiplier: 0.70, moduleEffectMultiplier: 1.62, moduleDurationMultiplier: 1.40 },
    10: { moduleCooldownMultiplier: 0.65, moduleEffectMultiplier: 1.75, moduleDurationMultiplier: 1.50 }
};

// ============================================
// ФУНКЦИИ ПОЛУЧЕНИЯ КОНФИГА
// ============================================

/**
 * Получить требования для уровня
 */
export function getLevelRequirements(level: number): { xp: number; credits: number } {
    const clampedLevel = Math.min(Math.max(level, 1), MAX_UPGRADE_LEVEL);
    return UPGRADE_LEVELS[clampedLevel - 1]!.requirements;
}

/**
 * Получить бонусы для категории и уровня
 */
export function getCategoryBonuses(category: UpgradeCategory, level: number): UpgradeBonuses {
    const clampedLevel = Math.min(Math.max(level, 1), MAX_UPGRADE_LEVEL);
    
    switch (category) {
        case "cannon":
            return CANNON_UPGRADE_BONUSES[clampedLevel] ?? {};
        case "chassis":
            return CHASSIS_UPGRADE_BONUSES[clampedLevel] ?? {};
        case "tracks":
            return TRACKS_UPGRADE_BONUSES[clampedLevel] ?? {};
        case "module":
            return MODULE_UPGRADE_BONUSES[clampedLevel] ?? {};
        default:
            return {};
    }
}

/**
 * Получить общие требования для прокачки с уровня X до уровня Y
 */
export function getTotalRequirements(fromLevel: number, toLevel: number): { xp: number; credits: number } {
    let totalXp = 0;
    let totalCredits = 0;
    
    for (let level = fromLevel + 1; level <= toLevel; level++) {
        const req = getLevelRequirements(level);
        totalXp += req.xp;
        totalCredits += req.credits;
    }
    
    return { xp: totalXp, credits: totalCredits };
}

/**
 * Рассчитать XP для уровня игрока
 */
export function getPlayerLevelFromXp(totalXp: number): number {
    // Простая формула: каждый уровень требует level * 1000 XP
    let level = 1;
    let xpNeeded = 0;
    
    while (xpNeeded + level * 1000 <= totalXp) {
        xpNeeded += level * 1000;
        level++;
    }
    
    return level;
}

/**
 * Рассчитать XP для следующего уровня игрока
 */
export function getXpForNextPlayerLevel(currentLevel: number): number {
    return currentLevel * 1000;
}

// ============================================
// XP И КРЕДИТЫ ИЗ ИГРОВЫХ СОБЫТИЙ
// ============================================

/**
 * XP за нанесённый урон
 */
export function getXpForDamage(damage: number): number {
    return Math.floor(damage * 0.5);
}

/**
 * XP за убийство
 */
export function getXpForKill(enemyLevel: number = 1): number {
    return 50 + enemyLevel * 10;
}

/**
 * XP за помощь в убийстве
 */
export function getXpForAssist(): number {
    return 25;
}

/**
 * Кредиты за бой
 */
export function getCreditsForBattle(damageDealt: number, kills: number, assists: number, won: boolean): number {
    let credits = Math.floor(damageDealt * 0.1);
    credits += kills * 100;
    credits += assists * 30;
    if (won) {
        credits = Math.floor(credits * 1.5);
    }
    return credits;
}

