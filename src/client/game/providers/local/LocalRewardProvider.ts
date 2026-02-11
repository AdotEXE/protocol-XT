/**
 * LocalRewardProvider - SP реализация провайдера наград
 * Начисляет награды локально, без синхронизации с сервером
 */

import type { IRewardProvider } from "../interfaces/IRewardProvider";
import type { Reward, RewardContext } from "../types";
import type { ExperienceSystem, XP_REWARDS } from "../../../experienceSystem";
import type { CurrencyManager } from "../../../currencyManager";
import type { PlayerProgressionSystem } from "../../../playerProgression";
import type { AchievementsSystem } from "../../../achievements";
import type { MissionSystem } from "../../../missionSystem";
import type { DailyQuestsSystem, BattlePassSystem } from "../../../dailyQuests";
import type { PlayerStatsSystem } from "../../../playerStats";
import type { TankController } from "../../../tankController";
import type { HUD } from "../../../hud";
import { logger } from "../../../utils/logger";

/**
 * Зависимости для LocalRewardProvider
 */
export interface LocalRewardDependencies {
    experienceSystem?: ExperienceSystem;
    currencyManager?: CurrencyManager;
    playerProgression?: PlayerProgressionSystem;
    achievementsSystem?: AchievementsSystem;
    missionSystem?: MissionSystem;
    dailyQuestsSystem?: DailyQuestsSystem;
    battlePassSystem?: BattlePassSystem;
    playerStats?: PlayerStatsSystem;
    tank?: TankController;
    hud?: HUD;
    getDifficultyMultiplier?: () => number;
    upgradeManager?: any; // UpgradeManager - опциональный
}

/**
 * Провайдер наград для одиночного режима
 * Все награды начисляются сразу, без ожидания сервера
 */
export class LocalRewardProvider implements IRewardProvider {
    private deps: LocalRewardDependencies | null = null;
    private initialized = false;

    // Константы наград (из experienceSystem)
    private readonly XP_KILL_TANK = 50;
    private readonly XP_DAMAGE_DEALT = 0.1;
    private readonly XP_SURVIVAL_MINUTE = 10;
    private readonly XP_PICKUP_COLLECTED = 5;

    /**
     * Инициализация провайдера
     */
    initialize(dependencies: LocalRewardDependencies): void {
        if (this.initialized) {
            logger.warn("[LocalRewardProvider] Already initialized");
            return;
        }

        this.deps = dependencies;
        this.initialized = true;

        logger.log("[LocalRewardProvider] Initialized with dependencies:",
            Object.keys(dependencies).filter(k => dependencies[k as keyof LocalRewardDependencies] !== undefined).join(", "));
    }

    /**
     * Награда за убийство
     */
    awardKill(context: RewardContext): Reward {
        if (!this.initialized || !this.deps) {
            logger.error("[LocalRewardProvider] Not initialized");
            return { experience: 0, credits: 0 };
        }

        const { isPlayerKill } = context;

        // Базовые награды
        const baseExperience = isPlayerKill ? 100 : this.XP_KILL_TANK;
        const baseCredits = isPlayerKill ? 200 : 100;

        // Применяем множитель сложности
        const multiplier = this.deps.getDifficultyMultiplier?.() || 1.0;
        const credits = Math.round(baseCredits * multiplier);

        // === HUD ===
        if (this.deps.hud) {
            this.deps.hud.addKill();
        }

        // === Ежедневные задания ===
        if (this.deps.dailyQuestsSystem) {
            this.deps.dailyQuestsSystem.updateProgress("daily_kills", 1);
        }

        // === Боевой пропуск ===
        if (this.deps.battlePassSystem) {
            this.deps.battlePassSystem.addExperience(25);
        }

        // === Достижения ===
        const achievements: string[] = [];
        if (this.deps.achievementsSystem) {
            this.deps.achievementsSystem.updateProgress("first_blood", 1);
            this.deps.achievementsSystem.updateProgress("tank_hunter", 1);
            this.deps.achievementsSystem.updateProgress("tank_ace", 1);

            // Comeback achievement - если здоровье < 20%
            if (this.deps.tank && this.deps.tank.currentHealth / this.deps.tank.maxHealth < 0.2) {
                this.deps.achievementsSystem.updateProgress("comeback", 1);
            }
        }

        // === Миссии ===
        if (this.deps.missionSystem) {
            this.deps.missionSystem.updateProgress("kill", 1);
        }

        // === Статистика ===
        if (this.deps.playerStats) {
            this.deps.playerStats.recordKill();
        }

        // === Кредиты ===
        if (this.deps.currencyManager) {
            this.deps.currencyManager.addCurrency(credits);
            if (this.deps.hud) {
                this.deps.hud.setCurrency(this.deps.currencyManager.getCurrency());
                this.deps.hud.showMessage(`+${credits} кредитов!`, "#ffaa00", 2000);
            }
        }

        // === Опыт ===
        if (this.deps.experienceSystem && this.deps.tank) {
            this.deps.experienceSystem.recordKill(
                this.deps.tank.chassisType?.id || "medium",
                this.deps.tank.cannonType?.id || "standard",
                false // isTurret
            );
        }

        // === Прогрессия ===
        if (this.deps.playerProgression) {
            this.deps.playerProgression.recordKill();
            this.deps.playerProgression.addCredits(credits);
        }

        // === UpgradeManager ===
        if (this.deps.upgradeManager) {
            this.deps.upgradeManager.addXpForKill?.();
            this.deps.upgradeManager.addCredits?.(credits, "battle", "Enemy tank destroyed");
        }

        const reward: Reward = {
            experience: baseExperience,
            credits,
            achievements,
            battlePassXP: 25,
            dailyQuestProgress: [{ questId: "daily_kills", progress: 1 }]
        };

        logger.log(`[LocalRewardProvider] Awarded kill: ${credits} credits, ${baseExperience} XP`);

        return reward;
    }

    /**
     * Награда за урон
     */
    awardDamage(_attackerId: string, damage: number, _isPlayer: boolean): number {
        if (!this.initialized || !this.deps) return 0;

        const experience = Math.round(damage * this.XP_DAMAGE_DEALT);

        // Здесь можно добавить логику записи урона в системы

        return experience;
    }

    /**
     * Награда за выживание
     */
    awardSurvival(_playerId: string, seconds: number): number {
        if (!this.initialized) return 0;

        return Math.round((seconds / 60) * this.XP_SURVIVAL_MINUTE);
    }

    /**
     * Награда за подбор предмета
     */
    awardPickup(_playerId: string, itemType: string): Reward {
        if (!this.initialized || !this.deps) {
            return { experience: 0, credits: 0 };
        }

        const rewards: Record<string, { exp: number; credits: number }> = {
            ammo: { exp: this.XP_PICKUP_COLLECTED, credits: 10 },
            health: { exp: this.XP_PICKUP_COLLECTED, credits: 15 },
            speed: { exp: this.XP_PICKUP_COLLECTED, credits: 20 },
            shield: { exp: this.XP_PICKUP_COLLECTED, credits: 25 },
        };

        const rewardData = rewards[itemType] || { exp: 0, credits: 0 };

        // Начисляем кредиты
        if (this.deps.currencyManager && rewardData.credits > 0) {
            this.deps.currencyManager.addCurrency(rewardData.credits);
        }

        return {
            experience: rewardData.exp,
            credits: rewardData.credits
        };
    }

    /**
     * Применить награды
     * В SP награды уже применены в awardKill(), этот метод для совместимости
     */
    async applyReward(reward: Reward, _playerId: string): Promise<void> {
        logger.log(`[LocalRewardProvider] Reward applied: ${reward.credits} credits, ${reward.experience} XP`);
        // В SP награды уже применены
    }

    /**
     * Проверка готовности провайдера
     */
    isReady(): boolean {
        return this.initialized && this.deps !== null;
    }

    /**
     * Очистка ресурсов
     */
    cleanup(): void {
        this.deps = null;
        this.initialized = false;
        logger.log("[LocalRewardProvider] Cleaned up");
    }
}
