/**
 * @module upgrade/UpgradeManager
 * @description Менеджер системы прокачки
 * 
 * Функции:
 * - Загрузка/сохранение прогресса в localStorage
 * - Синхронизация с сервером
 * - Прокачка элементов
 * - Получение бонусов для применения
 * - Начисление XP и кредитов
 */

import {
    PlayerUpgrades,
    ElementUpgrade,
    UpgradeCategory,
    UpgradeBonuses,
    UpgradeResult,
    XpGainEvent,
    CreditsGainEvent,
    MAX_UPGRADE_LEVEL,
    UPGRADE_STORAGE_KEY,
    UPGRADE_DATA_VERSION
} from './UpgradeTypes';

import {
    getLevelRequirements,
    getCategoryBonuses,
    getPlayerLevelFromXp,
    getXpForDamage,
    getXpForKill,
    getXpForAssist,
    getCreditsForBattle
} from './UpgradeConfig';
import { createLogger, LogCategory } from '../utils/logger';

const logger = createLogger("[UpgradeManager]", LogCategory.MENU);

// ============================================
// МЕНЕДЖЕР ПРОКАЧКИ
// ============================================

/**
 * Менеджер системы прокачки
 */
export class UpgradeManager {
    private upgrades: PlayerUpgrades;
    private syncPending: boolean = false;
    private syncTimeout: number | null = null;
    private serverUrl: string;
    private playerId: string | null = null;

    // Слушатели событий
    private onXpGained: ((event: XpGainEvent) => void)[] = [];
    private onCreditsGained: ((event: CreditsGainEvent) => void)[] = [];
    private onUpgradeComplete: ((category: UpgradeCategory, elementId: string, newLevel: number) => void)[] = [];
    private onLevelUp: ((newLevel: number) => void)[] = [];

    constructor(serverUrl: string = '/api/upgrade') {
        this.serverUrl = serverUrl;
        this.upgrades = this.createDefaultUpgrades();
        this.load();
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================

    /**
     * Создать пустую структуру прокачки
     */
    private createDefaultUpgrades(): PlayerUpgrades {
        return {
            cannons: {},
            chassis: {},
            tracks: {},
            modules: {},
            totalXp: 0,
            credits: 1000, // Начальные кредиты
            playerLevel: 1,
            lastSyncTime: undefined
        };
    }

    /**
     * Установить ID игрока (для синхронизации)
     */
    setPlayerId(playerId: string): void {
        this.playerId = playerId;
        // Попробовать загрузить с сервера
        this.syncFromServer();
    }

    // ============================================
    // ЗАГРУЗКА / СОХРАНЕНИЕ
    // ============================================

    /**
     * Загрузить из localStorage
     */
    load(): void {
        try {
            const stored = localStorage.getItem(UPGRADE_STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                // Проверка версии
                if (data.version === UPGRADE_DATA_VERSION) {
                    this.upgrades = {
                        ...this.createDefaultUpgrades(),
                        ...data.upgrades
                    };
                    logger.info('Loaded from localStorage');
                } else {
                    logger.info('Data version mismatch, using defaults');
                }
            }
        } catch (e) {
            logger.error('[UpgradeManager] Failed to load:', e);
        }
    }

    /**
     * Сохранить в localStorage
     */
    save(): void {
        try {
            const data = {
                version: UPGRADE_DATA_VERSION,
                upgrades: this.upgrades
            };
            localStorage.setItem(UPGRADE_STORAGE_KEY, JSON.stringify(data));

            // Запланировать синхронизацию с сервером
            this.scheduleSyncToServer();
        } catch (e) {
            logger.error('[UpgradeManager] Failed to save:', e);
        }
    }

    // ============================================
    // СИНХРОНИЗАЦИЯ С СЕРВЕРОМ
    // ============================================

    /**
     * Запланировать синхронизацию с сервером (дебаунс)
     */
    private scheduleSyncToServer(): void {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        this.syncPending = true;
        this.syncTimeout = window.setTimeout(() => {
            this.syncToServer();
        }, 5000); // Синхронизация через 5 секунд после последнего изменения
    }

    /**
     * Синхронизировать на сервер
     */
    async syncToServer(): Promise<boolean> {
        if (!this.playerId || !this.syncPending) return false;

        try {
            const response = await fetch(`${this.serverUrl}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playerId: this.playerId,
                    upgrades: this.upgrades
                })
            });

            if (response.ok) {
                this.syncPending = false;
                this.upgrades.lastSyncTime = Date.now();
                logger.log('[UpgradeManager] Synced to server');
                return true;
            }
        } catch (e) {
            logger.error('[UpgradeManager] Sync to server failed:', e);
        }
        return false;
    }

    /**
     * Загрузить с сервера
     */
    async syncFromServer(): Promise<boolean> {
        if (!this.playerId) return false;

        try {
            const response = await fetch(`${this.serverUrl}/load?playerId=${this.playerId}`);

            if (response.ok) {
                const data = await response.json();
                if (data.upgrades) {
                    // Merge with local data, prefer server data if newer
                    const serverTime = data.upgrades.lastSyncTime || 0;
                    const localTime = this.upgrades.lastSyncTime || 0;

                    if (serverTime > localTime) {
                        this.upgrades = {
                            ...this.createDefaultUpgrades(),
                            ...data.upgrades
                        };
                        this.save();
                        logger.log('[UpgradeManager] Loaded from server');
                    }
                }
                return true;
            }
        } catch (e) {
            logger.error('[UpgradeManager] Sync from server failed:', e);
        }
        return false;
    }

    // ============================================
    // ПРОКАЧКА
    // ============================================

    /**
     * Получить текущий уровень элемента
     */
    getElementLevel(category: UpgradeCategory, elementId: string): number {
        const categoryData = this.getCategoryData(category);
        return categoryData[elementId]?.level ?? 1;
    }

    /**
     * Получить данные категории
     */
    private getCategoryData(category: UpgradeCategory): Record<string, ElementUpgrade> {
        switch (category) {
            case "cannon": return this.upgrades.cannons;
            case "chassis": return this.upgrades.chassis;
            case "tracks": return this.upgrades.tracks;
            case "module": return this.upgrades.modules;
        }
    }

    /**
     * Прокачать элемент
     */
    upgrade(category: UpgradeCategory, elementId: string): UpgradeResult {
        const currentLevel = this.getElementLevel(category, elementId);

        // Проверка максимального уровня
        if (currentLevel >= MAX_UPGRADE_LEVEL) {
            return { success: false, error: "max_level" };
        }

        const nextLevel = currentLevel + 1;
        const requirements = getLevelRequirements(nextLevel);

        // Проверка XP
        if (this.upgrades.totalXp < requirements.xp) {
            return { success: false, error: "insufficient_xp" };
        }

        // Проверка кредитов
        if (this.upgrades.credits < requirements.credits) {
            return { success: false, error: "insufficient_credits" };
        }

        // Выполняем прокачку
        const categoryData = this.getCategoryData(category);
        if (!categoryData[elementId]) {
            categoryData[elementId] = {
                elementId,
                level: 1,
                currentXp: 0
            };
        }

        categoryData[elementId]!.level = nextLevel;
        this.upgrades.credits -= requirements.credits;
        // XP не тратится, только проверяется наличие

        this.save();

        // Уведомляем слушателей
        this.onUpgradeComplete.forEach(cb => cb(category, elementId, nextLevel));

        return {
            success: true,
            newLevel: nextLevel,
            spent: {
                xp: 0, // XP не тратится
                credits: requirements.credits
            }
        };
    }

    /**
     * Проверить, можно ли прокачать элемент
     */
    canUpgrade(category: UpgradeCategory, elementId: string): {
        canUpgrade: boolean;
        reason?: string;
        requirements?: { xp: number; credits: number };
    } {
        const currentLevel = this.getElementLevel(category, elementId);

        if (currentLevel >= MAX_UPGRADE_LEVEL) {
            return { canUpgrade: false, reason: "Максимальный уровень" };
        }

        const requirements = getLevelRequirements(currentLevel + 1);

        if (this.upgrades.totalXp < requirements.xp) {
            return {
                canUpgrade: false,
                reason: `Недостаточно опыта (${this.upgrades.totalXp}/${requirements.xp})`,
                requirements
            };
        }

        if (this.upgrades.credits < requirements.credits) {
            return {
                canUpgrade: false,
                reason: `Недостаточно кредитов (${this.upgrades.credits}/${requirements.credits})`,
                requirements
            };
        }

        return { canUpgrade: true, requirements };
    }

    // ============================================
    // БОНУСЫ
    // ============================================

    /**
     * Получить бонусы для орудия
     */
    getCannonBonuses(cannonId: string): UpgradeBonuses {
        const level = this.getElementLevel("cannon", cannonId);
        return getCategoryBonuses("cannon", level);
    }

    /**
     * Получить бонусы для корпуса
     */
    getChassisBonuses(chassisId: string): UpgradeBonuses {
        const level = this.getElementLevel("chassis", chassisId);
        return getCategoryBonuses("chassis", level);
    }

    /**
     * Получить бонусы для шасси
     */
    getTracksBonuses(tracksId: string): UpgradeBonuses {
        const level = this.getElementLevel("tracks", tracksId);
        return getCategoryBonuses("tracks", level);
    }

    /**
     * Получить бонусы для модуля
     */
    getModuleBonuses(moduleId: string): UpgradeBonuses {
        const level = this.getElementLevel("module", moduleId);
        return getCategoryBonuses("module", level);
    }

    /**
     * Получить все бонусы для танка
     */
    getAllBonuses(cannonId: string, chassisId: string, tracksId: string): UpgradeBonuses {
        const cannonBonuses = this.getCannonBonuses(cannonId);
        const chassisBonuses = this.getChassisBonuses(chassisId);
        const tracksBonuses = this.getTracksBonuses(tracksId);

        return {
            ...cannonBonuses,
            ...chassisBonuses,
            ...tracksBonuses
        };
    }

    // ============================================
    // XP И КРЕДИТЫ
    // ============================================

    /**
     * Добавить XP
     */
    addXp(amount: number, source: XpGainEvent['source'], description?: string): void {
        const oldLevel = this.upgrades.playerLevel;
        this.upgrades.totalXp += amount;
        this.upgrades.playerLevel = getPlayerLevelFromXp(this.upgrades.totalXp);

        this.save();

        // Уведомляем слушателей
        const event: XpGainEvent = { amount, source, description };
        this.onXpGained.forEach(cb => cb(event));

        // Проверяем повышение уровня
        if (this.upgrades.playerLevel > oldLevel) {
            this.onLevelUp.forEach(cb => cb(this.upgrades.playerLevel));
        }
    }

    /**
     * Добавить кредиты
     */
    addCredits(amount: number, source: CreditsGainEvent['source'], description?: string): void {
        this.upgrades.credits += amount;
        this.save();

        const event: CreditsGainEvent = { amount, source, description };
        this.onCreditsGained.forEach(cb => cb(event));
    }

    /**
     * Добавить XP за урон
     */
    addXpForDamage(damage: number): void {
        const xp = getXpForDamage(damage);
        this.addXp(xp, "damage", `Урон: ${damage}`);
    }

    /**
     * Добавить XP за убийство
     */
    addXpForKill(enemyLevel: number = 1): void {
        const xp = getXpForKill(enemyLevel);
        this.addXp(xp, "kill", `Уничтожение врага`);
    }

    /**
     * Добавить XP за помощь
     */
    addXpForAssist(): void {
        const xp = getXpForAssist();
        this.addXp(xp, "assist", `Помощь в уничтожении`);
    }

    /**
     * Добавить награды за бой
     */
    addBattleRewards(damageDealt: number, kills: number, assists: number, won: boolean): void {
        const credits = getCreditsForBattle(damageDealt, kills, assists, won);
        this.addCredits(credits, "battle", `Бой завершён: ${kills} убийств, ${assists} помощи`);
    }

    // ============================================
    // ГЕТТЕРЫ
    // ============================================

    /**
     * Получить общий XP
     */
    getTotalXp(): number {
        return this.upgrades.totalXp;
    }

    /**
     * Получить кредиты
     */
    getCredits(): number {
        return this.upgrades.credits;
    }

    /**
     * Получить уровень игрока
     */
    getPlayerLevel(): number {
        return this.upgrades.playerLevel;
    }

    /**
     * Получить все данные прокачки
     */
    getUpgrades(): PlayerUpgrades {
        return { ...this.upgrades };
    }

    // ============================================
    // СЛУШАТЕЛИ СОБЫТИЙ
    // ============================================

    /**
     * Подписаться на получение XP
     */
    onXpGain(callback: (event: XpGainEvent) => void): void {
        this.onXpGained.push(callback);
    }

    /**
     * Подписаться на получение кредитов
     */
    onCreditsGain(callback: (event: CreditsGainEvent) => void): void {
        this.onCreditsGained.push(callback);
    }

    /**
     * Подписаться на прокачку элемента
     */
    onUpgrade(callback: (category: UpgradeCategory, elementId: string, newLevel: number) => void): void {
        this.onUpgradeComplete.push(callback);
    }

    /**
     * Подписаться на повышение уровня игрока
     */
    onPlayerLevelUp(callback: (newLevel: number) => void): void {
        this.onLevelUp.push(callback);
    }

    // ============================================
    // ОТЛАДКА
    // ============================================

    /**
     * Сбросить все данные (для отладки)
     */
    reset(): void {
        this.upgrades = this.createDefaultUpgrades();
        this.save();
        logger.log('[UpgradeManager] Reset to defaults');
    }

    /**
     * Добавить тестовые ресурсы (для отладки)
     */
    addTestResources(): void {
        this.upgrades.totalXp += 10000;
        this.upgrades.credits += 100000;
        this.upgrades.playerLevel = getPlayerLevelFromXp(this.upgrades.totalXp);
        this.save();
        logger.log('[UpgradeManager] Added test resources');
    }
}

// ============================================
// СИНГЛТОН (LAZY INITIALIZATION)
// ============================================

/** Приватный экземпляр менеджера прокачки */
let _upgradeManagerInstance: UpgradeManager | null = null;

/** Получить глобальный экземпляр менеджера прокачки */
export function getUpgradeManager(): UpgradeManager {
    if (!_upgradeManagerInstance) {
        _upgradeManagerInstance = new UpgradeManager();
    }
    return _upgradeManagerInstance;
}

/** 
 * Глобальный экземпляр менеджера прокачки (lazy proxy)
 * Использует Proxy для прозрачного доступа к lazy-initialized инстансу
 */
export const upgradeManager: UpgradeManager = new Proxy({} as UpgradeManager, {
    get(_target, prop) {
        const instance = getUpgradeManager();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    set(_target, prop, value) {
        const instance = getUpgradeManager();
        (instance as any)[prop] = value;
        return true;
    }
});

