// ═══════════════════════════════════════════════════════════════════════════
// GAME MULTIPLAYER - Мультиплеерная логика
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { MultiplayerManager } from "../multiplayer";
import type { NetworkPlayerTank } from "../networkPlayerTank";
import type { Scene } from "@babylonjs/core";
import type { TankController } from "../tankController";

/**
 * GameMultiplayer - Мультиплеерная логика
 * 
 * Отвечает за:
 * - Настройку мультиплеерных колбэков
 * - Создание сетевых танков игроков
 * - Обработку мультиплеерных событий
 * - Синхронизацию состояния
 */
export class GameMultiplayer {
    // Мультиплеер
    multiplayerManager: MultiplayerManager | undefined;
    networkPlayerTanks: Map<string, NetworkPlayerTank> = new Map();
    isMultiplayer: boolean = false;
    
    // Ссылки на системы
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    
    /**
     * Инициализация мультиплеера
     */
    initialize(
        scene: Scene,
        tank: TankController | undefined,
        multiplayerManager: MultiplayerManager | undefined
    ): void {
        this.scene = scene;
        this.tank = tank;
        this.multiplayerManager = multiplayerManager;
        
        if (this.multiplayerManager) {
            this.setupMultiplayerCallbacks();
        }
        
        logger.log("[GameMultiplayer] Multiplayer initialized");
    }
    
    /**
     * Настройка мультиплеерных колбэков
     */
    private setupMultiplayerCallbacks(): void {
        if (!this.multiplayerManager) return;
        
        // Будет реализовано в Game.ts, так как требует доступа к множеству систем
        logger.log("[GameMultiplayer] Multiplayer callbacks setup (will be implemented in Game.ts)");
    }
    
    /**
     * Создание сетевого танка игрока
     */
    createNetworkPlayerTank(playerData: any): void {
        if (!this.scene || !this.multiplayerManager) return;
        
        // Будет реализовано в Game.ts
        logger.log("[GameMultiplayer] Creating network player tank (will be implemented in Game.ts)");
    }
    
    /**
     * Обновление мультиплеерного состояния
     */
    update(): void {
        // Обновление сетевых танков будет в Game.ts
    }
    
    /**
     * Dispose мультиплеера
     */
    dispose(): void {
        if (this.multiplayerManager) {
            this.multiplayerManager.disconnect();
        }
        
        this.networkPlayerTanks.forEach(tank => {
            tank.dispose();
        });
        this.networkPlayerTanks.clear();
        
        logger.log("[GameMultiplayer] Multiplayer disposed");
    }
}

