/**
 * GamePOI - Управление системой точек интереса (POI)
 * Вынесено из game.ts для уменьшения размера файла
 */

import { Vector3, Matrix } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { ChunkSystem } from "../chunkSystem";
import type { TankController } from "../tankController";
import type { EnemyTank } from "../enemyTank";
import type { HUD } from "../hud";
import type { SoundManager } from "../soundManager";
import type { EffectsManager } from "../effects";
import type { AchievementsSystem } from "../achievements";
import type { MissionSystem } from "../missionSystem";
import type { PlayerStatsSystem } from "../playerStats";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { CurrencyManager } from "../currencyManager";
import type { Scene, Engine, Camera } from "@babylonjs/core";

export interface GamePOIDependencies {
    chunkSystem?: ChunkSystem;
    tank?: TankController;
    enemyTanks: EnemyTank[];
    hud?: HUD;
    soundManager?: SoundManager;
    effectsManager?: EffectsManager;
    achievementsSystem?: AchievementsSystem;
    missionSystem?: MissionSystem;
    playerStats?: PlayerStatsSystem;
    playerProgression?: PlayerProgressionSystem;
    currencyManager?: CurrencyManager;
    scene?: Scene;
    engine?: Engine;
    getDifficultyRewardMultiplier: () => number;
}

/**
 * Класс для управления POI системой
 */
export class GamePOI {
    private deps: GamePOIDependencies;
    private updateTick = 0;
    
    constructor() {
        this.deps = {
            enemyTanks: [],
            getDifficultyRewardMultiplier: () => 1.0
        };
    }
    
    /**
     * Обновить зависимости
     */
    updateDependencies(deps: Partial<GamePOIDependencies>): void {
        Object.assign(this.deps, deps);
    }
    
    /**
     * Настроить callbacks для POI системы
     */
    setupCallbacks(): void {
        const poiSystem = this.deps.chunkSystem?.getPOISystem?.();
        if (!poiSystem) return;
        
        poiSystem.setCallbacks({
            onCapture: (poi, newOwner) => this.handleCapture(poi, newOwner ?? "unknown"),
            onContestStart: (poi) => this.handleContestStart(poi),
            onAmmoPickup: (_poi, amount, special) => this.handleAmmoPickup(amount, special),
            onRepair: (_poi, amount) => this.handleRepair(amount),
            onFuelRefill: (_poi, amount) => this.handleFuelRefill(amount),
            onExplosion: (_poi, position, radius, damage) => this.handleExplosion(position, radius, damage),
            onRadarPing: (poi, detectedPositions) => this.handleRadarPing(poi, detectedPositions),
            onBonusXP: (amount) => this.handleBonusXP(amount),
            onBonusCredits: (amount) => this.handleBonusCredits(amount)
        });
    }
    
    private handleCapture(poi: any, newOwner: string): void {
        logger.log(`[POI] ${poi.type} captured by ${newOwner}`);
        
        if (newOwner === "player") {
            this.deps.hud?.showNotification?.(`Точка захвачена!`, "success");
            this.deps.soundManager?.playReloadComplete?.();
            
            // Achievement tracking
            if (this.deps.achievementsSystem) {
                this.deps.achievementsSystem.updateProgress("poi_first_capture", 1);
                this.deps.achievementsSystem.updateProgress("poi_conqueror", 1);
                this.deps.achievementsSystem.updateProgress("poi_warlord", 1);
                
                const poiSystem = this.deps.chunkSystem?.getPOISystem?.();
                const ownedPOIs = poiSystem?.getOwnedPOIs("player").length || 0;
                if (ownedPOIs >= 5) {
                    this.deps.achievementsSystem.updateProgress("domination", 1);
                }
            }
            
            this.deps.missionSystem?.updateProgress("capture", 1);
            this.deps.playerStats?.recordPOICapture();
        } else if (newOwner === "enemy") {
            this.deps.soundManager?.playHit?.("critical", poi.worldPosition);
        }
    }
    
    private handleContestStart(poi: any): void {
        logger.log(`[POI] ${poi.type} contested!`);
        this.deps.hud?.showNotification?.(`⚔️ Контест!`, "warning");
        this.deps.soundManager?.playHit?.("armor", poi.worldPosition);
        this.deps.playerStats?.recordPOIContest();
    }
    
    private handleAmmoPickup(amount: number, special: boolean): void {
        if (this.deps.tank && amount > 0) {
            if (special) {
                logger.log(`[POI] Special ammo pickup!`);
            }
            this.deps.achievementsSystem?.updateProgress("ammo_collector", Math.floor(amount));
            this.deps.missionSystem?.updateProgress("ammo", Math.floor(amount));
            this.deps.playerStats?.recordAmmoCollected(Math.floor(amount));
        }
    }
    
    private handleRepair(amount: number): void {
        if (this.deps.tank && this.deps.tank.currentHealth < this.deps.tank.maxHealth) {
            const healAmount = (amount / 100) * this.deps.tank.maxHealth;
            this.deps.tank.currentHealth = Math.min(
                this.deps.tank.maxHealth, 
                this.deps.tank.currentHealth + healAmount
            );
            
            this.deps.achievementsSystem?.updateProgress("repair_addict", Math.floor(healAmount));
            this.deps.missionSystem?.updateProgress("repair", Math.floor(healAmount));
            this.deps.playerStats?.recordHPRepaired(Math.floor(healAmount));
        }
    }
    
    private handleFuelRefill(amount: number): void {
        if (this.deps.tank) {
            this.deps.tank.addFuel?.(amount);
            this.deps.hud?.updateFuel?.(this.deps.tank.currentFuel, this.deps.tank.maxFuel);
            this.deps.achievementsSystem?.updateProgress("fuel_tanker", Math.floor(amount));
            this.deps.playerStats?.recordFuelCollected(Math.floor(amount));
        }
    }
    
    private handleExplosion(position: Vector3, radius: number, damage: number): void {
        logger.log(`[POI] Explosion at ${position}, radius ${radius}, damage ${damage}`);
        
        this.deps.achievementsSystem?.updateProgress("explosives_expert", 1);
        this.deps.playerStats?.recordFuelDepotDestroyed();
        this.deps.soundManager?.playExplosion?.(position, 2.0);
        
        // Damage to player tank
        if (this.deps.tank?.chassis) {
            const dist = Vector3.Distance(this.deps.tank.chassis.absolutePosition, position);
            if (dist < radius) {
                const dmgFactor = 1 - (dist / radius);
                this.deps.tank.takeDamage(damage * dmgFactor);
            }
        }
        
        // Damage to enemy tanks
        for (const enemy of this.deps.enemyTanks) {
            if (enemy?.isAlive && enemy.chassis) {
                const dist = Vector3.Distance(enemy.chassis.absolutePosition, position);
                if (dist < radius) {
                    const dmgFactor = 1 - (dist / radius);
                    enemy.takeDamage(damage * dmgFactor);
                }
            }
        }
        
        this.deps.effectsManager?.createExplosion?.(position);
        this.deps.hud?.showNotification?.("💥 Топливный склад взорван!", "warning");
    }
    
    private handleRadarPing(poi: any, detectedPositions: Vector3[]): void {
        logger.log(`[POI] Radar ping: ${detectedPositions.length} enemies detected`);
        
        if (detectedPositions.length > 0) {
            this.deps.achievementsSystem?.updateProgress("radar_operator", detectedPositions.length);
            this.deps.hud?.showNotification?.(`📡 Обнаружено врагов: ${detectedPositions.length}`, "info");
            this.deps.soundManager?.playHit?.("normal", poi.worldPosition);
        }
    }
    
    private handleBonusXP(amount: number): void {
        if (this.deps.playerProgression) {
            const diffMul = this.deps.getDifficultyRewardMultiplier();
            const xp = Math.round(amount * diffMul);
            this.deps.playerProgression.addExperience(xp, "bonus");
        }
    }
    
    private handleBonusCredits(amount: number): void {
        this.deps.currencyManager?.addCurrency(amount);
    }
    
    /**
     * Назначить ботов на захват POI
     */
    assignBotsToPOIs(): void {
        if (!this.deps.chunkSystem || this.deps.enemyTanks.length === 0) return;
        
        const poiSystem = this.deps.chunkSystem.getPOISystem?.();
        if (!poiSystem) return;
        
        const allPOIs = poiSystem.getAllPOIs();
        if (allPOIs.length === 0) return;
        
        const unownedPOIs = allPOIs.filter(poi => poi.ownerId !== "enemy" && poi.capturable);
        if (unownedPOIs.length === 0) return;
        
        const botsForPOI = Math.floor(this.deps.enemyTanks.length * 0.3);
        let assigned = 0;
        
        for (const enemy of this.deps.enemyTanks) {
            if (assigned >= botsForPOI) break;
            if (!enemy?.isAlive || !enemy.chassis) continue;
            
            const currentState = enemy.getState?.();
            if (currentState === "attack" || currentState === "chase") continue;
            
            const enemyPos = enemy.chassis.absolutePosition;
            let nearestPOI = null;
            let nearestDist = Infinity;
            
            for (const poi of unownedPOIs) {
                const dist = Vector3.Distance(enemyPos, poi.worldPosition);
                if (dist < nearestDist && dist < 500) {
                    nearestDist = dist;
                    nearestPOI = poi;
                }
            }
            
            if (nearestPOI) {
                enemy.setPOITarget?.({
                    position: nearestPOI.worldPosition,
                    type: nearestPOI.type,
                    id: nearestPOI.id
                });
                assigned++;
            }
        }
    }
    
    /**
     * Обновление POI системы
     */
    update(deltaTime: number): void {
        this.updateTick++;
        
        if (!this.deps.chunkSystem || !this.deps.tank?.chassis) return;
        
        const poiSystem = this.deps.chunkSystem.getPOISystem?.();
        if (!poiSystem) return;
        
        const playerPos = this.deps.tank.chassis.absolutePosition;
        
        // Collect enemy positions
        const enemyPositions: Vector3[] = [];
        for (const enemy of this.deps.enemyTanks) {
            if (enemy?.isAlive && enemy.chassis) {
                enemyPositions.push(enemy.chassis.absolutePosition);
            }
        }
        
        poiSystem.update(playerPos, enemyPositions, deltaTime);
        
        // Update minimap POIs
        if (this.deps.hud && this.updateTick % 4 === 0) {
            this.updateMinimapPOIs(poiSystem, playerPos);
        }
    }
    
    private updateMinimapPOIs(poiSystem: any, playerPos: Vector3): void {
        const allPOIs = poiSystem.getAllPOIs();
        const tankRotation = this.deps.tank?.turret?.rotation.y || this.deps.tank?.chassis?.rotation.y || 0;
        
        const minimapPOIs = allPOIs.map((poi: any) => ({
            id: poi.id,
            type: poi.type,
            worldPosition: { x: poi.worldPosition.x, z: poi.worldPosition.z },
            ownerId: poi.ownerId,
            captureProgress: poi.captureProgress
        }));
        
        this.deps.hud?.updateMinimapPOIs?.(
            minimapPOIs,
            { x: playerPos.x, z: playerPos.z },
            tankRotation
        );
        
        // 3D markers
        if (this.deps.scene?.activeCamera && this.deps.engine) {
            this.update3DMarkers(allPOIs);
        }
    }
    
    private update3DMarkers(allPOIs: any[]): void {
        const camera = this.deps.scene!.activeCamera!;
        const engine = this.deps.engine!;
        
        const poi3DData = allPOIs.map(poi => {
            const worldPos = poi.worldPosition.add(new Vector3(0, 10, 0));
            const screenPos = Vector3.Project(
                worldPos,
                Matrix.Identity(),
                this.deps.scene!.getTransformMatrix(),
                camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            );
            
            const toCamera = camera.position.subtract(worldPos);
            const cameraForward = (camera as any).getForwardRay?.()?.direction;
            const visible = cameraForward ? Vector3.Dot(toCamera.normalize(), cameraForward.negate()) > 0 : true;
            
            return {
                id: poi.id,
                type: poi.type,
                screenX: screenPos.x,
                screenY: screenPos.y,
                distance: Vector3.Distance(camera.position, worldPos),
                visible,
                ownerId: poi.ownerId,
                captureProgress: poi.captureProgress
            };
        });
        
        this.deps.hud?.updatePOI3DMarkers?.(poi3DData);
    }
    
    /**
     * Очистка
     */
    dispose(): void {
        // Cleanup if needed
    }
}

