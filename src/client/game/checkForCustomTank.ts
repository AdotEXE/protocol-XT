/**
 * Проверка и применение кастомной конфигурации танка из localStorage (одноразовое использование).
 * Вызывается из Game при инициализации.
 */

import { logger } from "../utils/logger";

const STORAGE_KEY = "testCustomTank";

export interface TankWithCustomConfig {
    loadCustomConfiguration(config: unknown): void;
}

/**
 * Если в localStorage есть 'testCustomTank', применяет конфиг к танку и удаляет ключ.
 */
export function checkForCustomTank(tank: TankWithCustomConfig | undefined): void {
    const testTank = localStorage.getItem(STORAGE_KEY);
    if (!testTank || !tank) return;
    try {
        const config = JSON.parse(testTank) as { name?: string };
        tank.loadCustomConfiguration(config);
        localStorage.removeItem(STORAGE_KEY);
        logger.log(`[Game] Custom tank configuration loaded: ${config.name ?? "Unknown"}`);
    } catch (e) {
        logger.error("[Game] Failed to load custom tank:", e);
    }
}
