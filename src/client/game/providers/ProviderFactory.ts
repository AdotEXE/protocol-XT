/**
 * ProviderFactory - Фабрика для создания провайдеров
 * Выбирает правильную реализацию в зависимости от режима игры (SP/MP)
 */

import type { IRewardProvider } from "./interfaces/IRewardProvider";
import { LocalRewardProvider } from "./local/LocalRewardProvider";
import { NetworkRewardProvider } from "./network/NetworkRewardProvider";
import { logger } from "../../utils/logger";

/**
 * Фабрика провайдеров
 */
export class ProviderFactory {
    /**
     * Создать провайдер наград
     * @param isMultiplayer - true для MP режима, false для SP
     * @returns Экземпляр IRewardProvider
     */
    static createRewardProvider(isMultiplayer: boolean): IRewardProvider {
        if (isMultiplayer) {
            logger.log("[ProviderFactory] Creating NetworkRewardProvider (MP mode)");
            return new NetworkRewardProvider();
        }

        logger.log("[ProviderFactory] Creating LocalRewardProvider (SP mode)");
        return new LocalRewardProvider();
    }

    // === БУДУЩИЕ ПРОВАЙДЕРЫ ===

    // static createEnemySpawner(isMultiplayer: boolean): IEnemySpawner {
    //     if (isMultiplayer) {
    //         return new NetworkEnemySpawner();
    //     }
    //     return new LocalEnemySpawner();
    // }

    // static createProgressionProvider(isMultiplayer: boolean): IProgressionProvider {
    //     if (isMultiplayer) {
    //         return new NetworkProgressionProvider();
    //     }
    //     return new LocalProgressionProvider();
    // }
}
