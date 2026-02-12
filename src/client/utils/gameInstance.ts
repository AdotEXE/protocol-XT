/**
 * Хелпер для безопасного доступа к gameInstance через window
 */
import type { IGameExtended } from "../game/types";

declare global {
    interface Window {
        gameInstance?: IGameExtended;
    }
}

/**
 * Получить gameInstance с проверкой типа
 */
export function getGameInstance(): IGameExtended | undefined {
    return window.gameInstance;
}

/**
 * Получить gameInstance или выбросить ошибку
 */
export function requireGameInstance(): IGameExtended {
    const game = window.gameInstance;
    if (!game) {
        throw new Error("gameInstance is not available");
    }
    return game;
}
