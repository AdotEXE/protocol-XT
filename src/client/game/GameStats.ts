/**
 * GameStats - инициализация и состояние панели статистики (Tab).
 * Логика отображения в реальном времени вынесена в GameStatsOverlay.
 */

export interface GameStatsInitOptions {
    playerProgression?: unknown;
    experienceSystem?: unknown;
    currencyManager?: unknown;
    realtimeStatsTracker?: unknown;
    multiplayerManager?: unknown;
    playerStats?: unknown;
    enemyTanks?: unknown[];
    enemyManager?: unknown;
    networkPlayerTanks?: Map<string, unknown>;
    getIsMultiplayer?: () => boolean;
    setIsMultiplayer?: (v: boolean) => void;
    currentMapType?: string;
}

export class GameStats {
    private visible = false;
    private opts: GameStatsInitOptions = {};

    initialize(opts: GameStatsInitOptions): void {
        this.opts = opts;
    }

    isVisible(): boolean {
        return this.visible;
    }

    show(): void {
        this.visible = true;
    }

    hide(): void {
        this.visible = false;
    }

    update(): void {
        // Обновление контента overlay — при необходимости подключается к GameStatsOverlay
    }
}
