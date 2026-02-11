// ═══════════════════════════════════════════════════════════════════════════
// GAME VISIBILITY - Проверка видимости танков и башен
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { Scene } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { EnemyTank } from "../enemyTank";
import type { HUD } from "../hud";

/**
 * GameVisibility - Пустой класс для совместимости
 * Вся логика видимости удалена - танк не будет отображаться/мерцать когда камера за стеной
 */
export class GameVisibility {
    // Ссылки на системы (оставлены для совместимости, но не используются)
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected enemyTanks: EnemyTank[] = [];
    
    /**
     * Инициализация системы видимости
     */
    initialize(
        scene: Scene,
        tank: TankController | undefined,
        hud: HUD | undefined,
        enemyTanks: EnemyTank[] = []
    ): void {
        this.scene = scene;
        this.tank = tank;
        this.hud = hud;
        this.enemyTanks = enemyTanks;
        
        logger.log("[GameVisibility] Visibility system initialized");
    }
    
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        tank?: TankController;
        hud?: HUD;
        enemyTanks?: EnemyTank[];
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.enemyTanks !== undefined) this.enemyTanks = callbacks.enemyTanks;
    }
    
    /**
     * Dispose системы видимости
     */
    dispose(): void {
        this.tank = undefined;
        this.hud = undefined;
        this.enemyTanks = [];
        
        logger.log("[GameVisibility] Visibility system disposed");
    }
}

