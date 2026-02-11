/**
 * GameStatsOverlay - overlay по Tab (K/D, убийства, кредиты, мультиплеер скорборд).
 */

export interface GameStatsOverlayDeps {
    enemyTanks?: unknown[];
    enemyManager?: unknown;
    playerProgression?: unknown;
    currencyManager?: unknown;
    experienceSystem?: unknown;
    realtimeStatsTracker?: unknown;
    multiplayerManager?: unknown;
    getIsMultiplayer?: () => boolean;
    currentMapType?: string;
}

export class GameStatsOverlay {
    private visible = false;
    private deps: GameStatsOverlayDeps = {};

    updateDependencies(deps: Partial<GameStatsOverlayDeps>): void {
        this.deps = { ...this.deps, ...deps };
    }

    isVisible(): boolean {
        return this.visible;
    }

    show(): void {
        this.visible = true;
        // TODO: при необходимости — создать/показать DOM или Babylon GUI
    }

    hide(): void {
        this.visible = false;
        // TODO: скрыть overlay
    }
}
