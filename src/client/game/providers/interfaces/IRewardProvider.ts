/**
 * Интерфейс для начисления наград
 * Унифицирует логику для SP (локальное начисление) и MP (синхронизация с сервером)
 */

import type { Reward, RewardContext, IBaseProvider } from "../types";

/**
 * Интерфейс провайдера наград
 */
export interface IRewardProvider extends IBaseProvider {
    /**
     * Награда за убийство
     * @param context - Контекст убийства
     * @returns Награда (в MP может быть временной, пока не придут данные с сервера)
     */
    awardKill(context: RewardContext): Reward;

    /**
     * Награда за урон
     * @param attackerId - ID атакующего
     * @param damage - Количество урона
     * @param isPlayer - true если урон по игроку
     * @returns Опыт за урон
     */
    awardDamage(attackerId: string, damage: number, isPlayer: boolean): number;

    /**
     * Награда за выживание
     * @param playerId - ID игрока
     * @param seconds - Секунд выживания
     * @returns Опыт за выживание
     */
    awardSurvival(playerId: string, seconds: number): number;

    /**
     * Награда за подбор предмета
     * @param playerId - ID игрока
     * @param itemType - Тип предмета
     * @returns Награда
     */
    awardPickup(playerId: string, itemType: string): Reward;

    /**
     * Применить награды
     * В SP: применяет сразу
     * В MP: применяет после получения подтверждения с сервера
     * @param reward - Награда для применения
     * @param playerId - ID игрока
     */
    applyReward(reward: Reward, playerId: string): Promise<void>;

    /**
     * Обработка награды с сервера (только для MP)
     * @param serverReward - Награда с сервера
     */
    handleServerReward?(serverReward: {
        type: "kill" | "damage" | "survival" | "pickup" | "match_end";
        playerId: string;
        reward: Reward;
        context?: RewardContext;
    }): void;
}
