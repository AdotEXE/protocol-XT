/**
 * @module upgrade
 * @description Система прокачки танков
 * 
 * Включает:
 * - UpgradeTypes - типы и интерфейсы
 * - UpgradeConfig - конфигурация уровней и бонусов
 * - UpgradeManager - менеджер прокачки
 * - UpgradeUI - пользовательский интерфейс
 */

// Типы
export type { 
    UpgradeCategory,
    UpgradeBonuses,
    UpgradeLevelRequirements,
    UpgradeLevel,
    ElementUpgrade,
    PlayerUpgrades,
    UpgradeResult,
    XpGainEvent,
    CreditsGainEvent
} from './UpgradeTypes';

export {
    MAX_UPGRADE_LEVEL,
    UPGRADE_STORAGE_KEY,
    UPGRADE_DATA_VERSION
} from './UpgradeTypes';

// Конфигурация
export {
    UPGRADE_LEVELS,
    CANNON_UPGRADE_BONUSES,
    CHASSIS_UPGRADE_BONUSES,
    TRACKS_UPGRADE_BONUSES,
    MODULE_UPGRADE_BONUSES,
    getLevelRequirements,
    getCategoryBonuses,
    getTotalRequirements,
    getPlayerLevelFromXp,
    getXpForNextPlayerLevel,
    getXpForDamage,
    getXpForKill,
    getXpForAssist,
    getCreditsForBattle
} from './UpgradeConfig';

// Менеджер
export { UpgradeManager, upgradeManager, getUpgradeManager } from './UpgradeManager';

// UI
export { UpgradeUI, upgradeUI, getUpgradeUI } from './UpgradeUI';

