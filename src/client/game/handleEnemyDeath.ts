/**
 * Обработка смерти врага: награды, достижения, удаление из мира и респавн в гараже.
 * Вызывается из Game и GameMultiplayerCallbacks.
 */

import { Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { EnemyTank } from "../enemyTank";

export interface HandleEnemyDeathDeps {
    getPlayerId: () => string;
    rewardProvider?: { isReady(): boolean; awardKill(params: { killerId: string; victimId: string; isPlayerKill: boolean; position?: { x: number; y: number; z: number } }): unknown; applyReward(reward: unknown, playerId: string): void };
    ensureRewardProvider?: () => void;
    hud?: { addKill(): void; setCurrency(n: number): void; showMessage(text: string, color: string, duration: number): void };
    dailyQuestsSystem?: { updateProgress(type: string, delta: number): void };
    battlePassSystem?: { addExperience(amount: number): void };
    achievementsSystem?: { updateProgress(id: string, delta: number): void };
    missionSystem?: { updateProgress(type: string, delta: number): void };
    playerStats?: { recordKill(): void };
    getDifficultyRewardMultiplier: () => number;
    currencyManager?: { addCurrency(amount: number): void; getCurrency(): number };
    experienceSystem?: { recordKill(chassisId: string, cannonId: string, isPlayerKill: boolean): void };
    tank?: { chassisType: { id: string }; cannonType: { id: string }; currentHealth: number; maxHealth: number };
    playerProgression?: { recordKill(): void; addCredits(amount: number): void };
    aiCoordinator?: { unregisterBot(id: string): void };
    removeEnemyFromList: (enemy: EnemyTank) => void;
    chunkSystem?: { garagePositions: { length: number } };
    gameGarage: {
        findNearestAvailableGarage(pos: Vector3): Vector3 | null;
        findNearestGarage(pos: Vector3): Vector3 | null;
        startGarageRespawnTimer(pos: Vector3): void;
    };
}

/**
 * Обрабатывает смерть врага: награды (через провайдер или fallback), достижения, dispose, удаление из списка, респавн в гараже.
 */
export function handleEnemyDeath(deps: HandleEnemyDeathDeps, enemy: EnemyTank): void {
    logger.log("[GAME] Enemy tank destroyed! Adding kill...");

    if (deps.rewardProvider?.isReady()) {
        if (deps.ensureRewardProvider) {
            deps.ensureRewardProvider();
        }
        const reward = deps.rewardProvider.awardKill({
            killerId: deps.getPlayerId(),
            victimId: enemy.getId?.().toString() || "enemy",
            isPlayerKill: false,
            position: enemy.chassis?.position
        });
        deps.rewardProvider.applyReward(reward, deps.getPlayerId());
    } else {
        if (deps.hud) {
            deps.hud.addKill();
        }
        if (deps.dailyQuestsSystem) {
            deps.dailyQuestsSystem.updateProgress("daily_kills", 1);
        }
        if (deps.battlePassSystem) {
            deps.battlePassSystem.addExperience(25);
        }
        if (deps.achievementsSystem) {
            deps.achievementsSystem.updateProgress("first_blood", 1);
            deps.achievementsSystem.updateProgress("tank_hunter", 1);
            deps.achievementsSystem.updateProgress("tank_ace", 1);
            if (deps.tank && deps.tank.currentHealth / deps.tank.maxHealth < 0.2) {
                deps.achievementsSystem.updateProgress("comeback", 1);
            }
        }
        if (deps.missionSystem) {
            deps.missionSystem.updateProgress("kill", 1);
        }
        if (deps.playerStats) {
            deps.playerStats.recordKill();
        }
        const baseReward = 100;
        const reward = Math.round(baseReward * deps.getDifficultyRewardMultiplier());
        if (deps.currencyManager) {
            deps.currencyManager.addCurrency(reward);
            if (deps.hud) {
                deps.hud.setCurrency(deps.currencyManager.getCurrency());
                deps.hud.showMessage(`+${reward} кредитов!`, "#ffaa00", 2000);
            }
        }
        if (deps.experienceSystem && deps.tank) {
            deps.experienceSystem.recordKill(
                deps.tank.chassisType.id,
                deps.tank.cannonType.id,
                false
            );
        }
        if (deps.playerProgression) {
            deps.playerProgression.recordKill();
            deps.playerProgression.addCredits(reward);
        }
    }

    if (deps.aiCoordinator) {
        deps.aiCoordinator.unregisterBot(enemy.getId().toString());
    }

    if (enemy && typeof (enemy as { dispose?: () => void }).dispose === "function") {
        try {
            (enemy as { dispose: () => void }).dispose();
        } catch (e) {
            logger.warn("[Game] Error disposing enemy:", e);
        }
    }

    deps.removeEnemyFromList(enemy);

    const pos = enemy.chassis?.position || Vector3.Zero();
    if (deps.chunkSystem && deps.chunkSystem.garagePositions.length > 0) {
        const nearestGarage = deps.gameGarage.findNearestAvailableGarage(pos);
        if (nearestGarage) {
            deps.gameGarage.startGarageRespawnTimer(nearestGarage);
        } else {
            const nearest = deps.gameGarage.findNearestGarage(pos);
            if (nearest) {
                deps.gameGarage.startGarageRespawnTimer(nearest);
            } else {
                deps.gameGarage.startGarageRespawnTimer(pos);
            }
        }
    } else {
        deps.gameGarage.startGarageRespawnTimer(pos);
    }
}
