/**
 * NetworkRewardProvider - MP реализация провайдера наград
 * Показывает оптимистичные награды, ждёт подтверждения от сервера
 */

import type { IRewardProvider } from "../interfaces/IRewardProvider";
import type { Reward, RewardContext } from "../types";
import type { MultiplayerManager } from "../../../multiplayer";
import type { HUD } from "../../../hud";
import type { TankController } from "../../../tankController";
import { logger } from "../../../utils/logger";

/**
 * Зависимости для NetworkRewardProvider
 */
export interface NetworkRewardDependencies {
    multiplayerManager?: MultiplayerManager;
    hud?: HUD;
    tank?: TankController;
    getPlayerId?: () => string;
}

/**
 * Кэшированная награда (для оптимистичных обновлений)
 */
interface PendingReward {
    id: string;
    reward: Reward;
    timestamp: number;
    applied: boolean;
}

/**
 * Провайдер наград для мультиплеерного режима
 * - Показывает награды сразу (optimistic update)
 * - Ждёт подтверждения от сервера
 * - Корректирует при несовпадении
 */
export class NetworkRewardProvider implements IRewardProvider {
    private deps: NetworkRewardDependencies | null = null;
    private initialized = false;

    // Кэш ожидающих подтверждения наград
    private pendingRewards: Map<string, PendingReward> = new Map();

    // Константы наград (оптимистичные, могут отличаться от серверных)
    private readonly XP_KILL_TANK = 50;
    private readonly XP_DAMAGE_DEALT = 0.1;
    private readonly XP_SURVIVAL_MINUTE = 10;
    private readonly XP_PICKUP_COLLECTED = 5;

    // Таймаут для очистки старых наград (5 секунд)
    private readonly REWARD_TIMEOUT = 5000;

    /**
     * Инициализация провайдера
     */
    initialize(dependencies: NetworkRewardDependencies): void {
        if (this.initialized) {
            logger.warn("[NetworkRewardProvider] Already initialized");
            return;
        }

        if (!dependencies.multiplayerManager) {
            logger.error("[NetworkRewardProvider] multiplayerManager is required");
            return;
        }

        this.deps = dependencies;
        this.setupNetworkCallbacks();
        this.initialized = true;

        logger.log("[NetworkRewardProvider] Initialized");
    }

    /**
     * Настройка сетевых callback'ов
     */
    private setupNetworkCallbacks(): void {
        if (!this.deps?.multiplayerManager) return;

        // Подписываемся на сообщения о наградах от сервера
        // Это будет реализовано после добавления соответствующих типов сообщений

        // Очистка старых наград каждые 5 секунд
        setInterval(() => this.cleanupPendingRewards(), 5000);

        logger.log("[NetworkRewardProvider] Network callbacks setup");
    }

    /**
     * Очистка старых ожидающих наград
     */
    private cleanupPendingRewards(): void {
        const now = Date.now();
        const toDelete: string[] = [];

        this.pendingRewards.forEach((pending, id) => {
            if (now - pending.timestamp > this.REWARD_TIMEOUT) {
                toDelete.push(id);
            }
        });

        toDelete.forEach(id => {
            logger.warn(`[NetworkRewardProvider] Pending reward ${id} timed out`);
            this.pendingRewards.delete(id);
        });
    }

    /**
     * Генерация уникального ID для награды
     */
    private generateRewardId(): string {
        return `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Награда за убийство (оптимистичное обновление)
     */
    awardKill(context: RewardContext): Reward {
        if (!this.initialized || !this.deps) {
            logger.error("[NetworkRewardProvider] Not initialized");
            return { experience: 0, credits: 0 };
        }

        const { isPlayerKill } = context;

        // Оптимистичные награды (будут скорректированы сервером)
        const baseExperience = isPlayerKill ? 100 : this.XP_KILL_TANK;
        const baseCredits = isPlayerKill ? 200 : 100;

        const reward: Reward = {
            experience: baseExperience,
            credits: baseCredits,
            battlePassXP: 25,
            dailyQuestProgress: [{ questId: "daily_kills", progress: 1 }]
        };

        // Генерируем ID для отслеживания
        const rewardId = this.generateRewardId();

        // Сохраняем в кэш ожидающих
        this.pendingRewards.set(rewardId, {
            id: rewardId,
            reward,
            timestamp: Date.now(),
            applied: false
        });

        // Показываем оптимистичное обновление на HUD
        if (this.deps.hud) {
            this.deps.hud.addKill();
            this.deps.hud.showMessage(`+${baseCredits} кредитов!`, "#ffaa00", 2000);
        }

        logger.log(`[NetworkRewardProvider] Optimistic kill reward: ${baseCredits} credits (pending: ${rewardId})`);

        return reward;
    }

    /**
     * Награда за урон
     */
    awardDamage(_attackerId: string, damage: number, _isPlayer: boolean): number {
        if (!this.initialized) return 0;

        // В MP урон обрабатывается сервером
        // Здесь только оптимистичный расчёт для отображения
        return Math.round(damage * this.XP_DAMAGE_DEALT);
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

        // Оптимистичное отображение
        if (this.deps.hud && rewardData.credits > 0) {
            this.deps.hud.showMessage(`+${rewardData.credits}`, "#22c55e", 1500);
        }

        return {
            experience: rewardData.exp,
            credits: rewardData.credits
        };
    }

    /**
     * Применить награды (ждёт подтверждения сервера)
     */
    async applyReward(reward: Reward, playerId: string): Promise<void> {
        // В MP награды применяются сервером
        // Клиент показывает оптимистичные обновления, но реальные значения приходят с сервера
        logger.log(`[NetworkRewardProvider] Waiting for server confirmation for player ${playerId}`);
    }

    /**
     * Обработка награды с сервера
     */
    handleServerReward(serverReward: {
        type: "kill" | "damage" | "survival" | "pickup" | "match_end";
        playerId: string;
        reward: Reward;
        context?: RewardContext;
    }): void {
        if (!this.deps) return;

        const { type, playerId, reward } = serverReward;
        const localPlayerId = this.deps.getPlayerId?.() || "";

        // Обрабатываем только свои награды
        if (playerId !== localPlayerId) {
            return;
        }

        logger.log(`[NetworkRewardProvider] Server reward received: ${type}, ${reward.credits} credits, ${reward.experience} XP`);

        // Здесь можно сравнить с оптимистичными наградами и показать разницу
        // Например, если сервер дал больше кредитов, показать бонус

        // Очищаем соответствующую ожидающую награду
        // (в реальной реализации нужно сопоставлять по ID или контексту)

        // Обновляем HUD с реальными значениями
        if (this.deps.hud) {
            // Можно показать уведомление о подтверждении
            // this.deps.hud.showMessage(`✓ +${reward.credits}`, "#22c55e", 1000);
        }
    }

    /**
     * Проверка готовности провайдера
     */
    isReady(): boolean {
        return this.initialized &&
            this.deps !== null &&
            this.deps.multiplayerManager !== undefined;
    }

    /**
     * Очистка ресурсов
     */
    cleanup(): void {
        this.pendingRewards.clear();
        this.deps = null;
        this.initialized = false;
        logger.log("[NetworkRewardProvider] Cleaned up");
    }
}
