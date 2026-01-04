// ═══════════════════════════════════════════════════════════════════════════
// GAME SPECTATOR - Режим наблюдателя
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { ArcRotateCamera } from "@babylonjs/core";
import type { MultiplayerManager } from "../multiplayer";
import type { TankController } from "../tankController";

/**
 * GameSpectator - Режим наблюдателя
 * 
 * Отвечает за:
 * - Вход/выход в режим наблюдателя
 * - Переключение между игроками
 * - Обновление камеры наблюдателя
 */
export class GameSpectator {
    isSpectating: boolean = false;
    spectatingPlayerId: string | null = null;
    
    // Ссылки на системы
    protected camera: ArcRotateCamera | undefined;
    protected multiplayerManager: MultiplayerManager | undefined;
    protected tank: TankController | undefined;
    protected cameraBeta: number = 0;
    protected settings: any;
    
    /**
     * Инициализация режима наблюдателя
     */
    initialize(
        camera: ArcRotateCamera | undefined,
        multiplayerManager: MultiplayerManager | undefined,
        tank: TankController | undefined,
        cameraBeta: number,
        settings: any
    ): void {
        this.camera = camera;
        this.multiplayerManager = multiplayerManager;
        this.tank = tank;
        this.cameraBeta = cameraBeta;
        this.settings = settings;
        
        logger.log("[GameSpectator] Spectator mode initialized");
    }
    
    /**
     * Вход в режим наблюдателя
     */
    enterSpectatorMode(): void {
        if (!this.multiplayerManager) return;
        
        this.isSpectating = true;
        
        // Находим первого живого игрока
        const playersMap = this.multiplayerManager.getNetworkPlayers();
        const players = Array.from(playersMap.values());
        const alivePlayers = players.filter((p: any) => p && p.status === "alive");
        
        if (alivePlayers.length > 0 && alivePlayers[0]) {
            this.spectatingPlayerId = alivePlayers[0].id;
            logger.log(`[GameSpectator] Entered spectator mode, following: ${alivePlayers[0].name || 'Unknown'}`);
        } else {
            this.spectatingPlayerId = null;
            logger.log("[GameSpectator] Entered spectator mode (free camera)");
        }
    }
    
    /**
     * Выход из режима наблюдателя
     */
    exitSpectatorMode(): void {
        this.isSpectating = false;
        this.spectatingPlayerId = null;
        logger.log("[GameSpectator] Exited spectator mode");
    }
    
    /**
     * Переключение цели наблюдателя
     */
    switchSpectatorTarget(forward: boolean): void {
        if (!this.multiplayerManager) return;
        
        const playersMap = this.multiplayerManager.getNetworkPlayers();
        const players = Array.from(playersMap.values());
        const alivePlayers = players.filter((p: any) => p && p.status === "alive");
        
        if (alivePlayers.length === 0) {
            this.spectatingPlayerId = null;
            return;
        }
        
        if (this.spectatingPlayerId) {
            const currentIndex = alivePlayers.findIndex((p: any) => p && p.id === this.spectatingPlayerId);
            if (currentIndex !== -1) {
                const nextIndex = forward
                    ? (currentIndex + 1) % alivePlayers.length
                    : (currentIndex - 1 + alivePlayers.length) % alivePlayers.length;
                const nextPlayer = alivePlayers[nextIndex];
                if (nextPlayer && nextPlayer.id) {
                    this.spectatingPlayerId = nextPlayer.id;
                }
            } else {
                const firstPlayer = alivePlayers[0];
                if (firstPlayer && firstPlayer.id) {
                    this.spectatingPlayerId = firstPlayer.id;
                }
            }
        } else {
            const firstPlayer = alivePlayers[0];
            if (firstPlayer && firstPlayer.id) {
                this.spectatingPlayerId = firstPlayer.id;
            }
        }
    }
    
    /**
     * Обновление камеры наблюдателя
     */
    updateSpectatorCamera(): void {
        if (!this.camera || !this.multiplayerManager) return;
        
        if (this.spectatingPlayerId) {
            // Следуем за конкретным игроком
            const networkPlayer = this.multiplayerManager.getNetworkPlayer(this.spectatingPlayerId);
            if (networkPlayer && networkPlayer.status === "alive") {
                const targetPos = networkPlayer.position;
                this.camera.setTarget(targetPos);
                this.camera.alpha = networkPlayer.rotation + Math.PI / 2;
                this.camera.beta = this.cameraBeta;
                this.camera.radius = this.settings?.cameraDistance || 12;
            } else {
                // Игрок умер, переключаемся на следующего
                this.switchSpectatorTarget(true);
            }
        }
        // В режиме свободной камеры управление уже работает
    }
    
    /**
     * Проверка режима наблюдателя
     */
    checkSpectatorMode(): void {
        if (!this.multiplayerManager || !this.tank) return;
        
        // Вход в режим наблюдателя если игрок умер
        if (!this.tank.isAlive && !this.isSpectating) {
            this.enterSpectatorMode();
        }
        
        // Выход из режима наблюдателя если игрок возродился
        if (this.tank.isAlive && this.isSpectating) {
            this.exitSpectatorMode();
        }
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        camera?: ArcRotateCamera;
        multiplayerManager?: MultiplayerManager;
        tank?: TankController;
        cameraBeta?: number;
        settings?: any;
    }): void {
        if (callbacks.camera !== undefined) this.camera = callbacks.camera;
        if (callbacks.multiplayerManager !== undefined) this.multiplayerManager = callbacks.multiplayerManager;
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.cameraBeta !== undefined) this.cameraBeta = callbacks.cameraBeta;
        if (callbacks.settings !== undefined) this.settings = callbacks.settings;
    }
    
    /**
     * Dispose режима наблюдателя
     */
    dispose(): void {
        this.isSpectating = false;
        this.spectatingPlayerId = null;
        logger.log("[GameSpectator] Spectator mode disposed");
    }
}

