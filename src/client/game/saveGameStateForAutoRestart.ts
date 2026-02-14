/**
 * Сохранение состояния игры для автозапуска после перезагрузки страницы.
 * Сохраняет тип карты и настройки в localStorage.
 */

const STORAGE_KEY = "tx_auto_restart_state";

export interface SaveGameStateParams {
    mapType?: string;
    settings?: { enemyDifficulty?: number };
}

export function saveGameStateForAutoRestart(params: SaveGameStateParams): void {
    try {
        const payload = {
            mapType: params.mapType ?? "",
            settings: params.settings ?? undefined,
            savedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn("[saveGameStateForAutoRestart] localStorage failed:", e);
    }
}
