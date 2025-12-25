// ═══════════════════════════════════════════════════════════════════════════
// GAME CONSUMABLES - Логика подбора припасов
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, Color3 } from "@babylonjs/core";
import { logger } from "../utils/logger";
import { CONSUMABLE_TYPES } from "../consumables";
import type { TankController } from "../tankController";
import type { ChunkSystem } from "../chunkSystem";
import type { ConsumablesManager } from "../consumables";
import type { HUD } from "../hud";
import type { SoundManager } from "../soundManager";
import type { EffectsManager } from "../effects";
import type { ExperienceSystem } from "../experienceSystem";
import type { ChatSystem } from "../chatSystem";
import type { MultiplayerManager } from "../multiplayer";

/**
 * GameConsumables - Логика подбора припасов
 * 
 * Отвечает за:
 * - Проверку подбора припасов
 * - Обработку подбора в одиночной и мультиплеерной игре
 * - Обновление HUD и систем
 */
export class GameConsumables {
    // Ссылки на системы
    protected tank: TankController | undefined;
    protected chunkSystem: ChunkSystem | undefined;
    protected consumablesManager: ConsumablesManager | undefined;
    protected hud: HUD | undefined;
    protected soundManager: SoundManager | undefined;
    protected effectsManager: EffectsManager | undefined;
    protected experienceSystem: ExperienceSystem | undefined;
    protected chatSystem: ChatSystem | undefined;
    protected multiplayerManager: MultiplayerManager | undefined;
    protected isMultiplayer: boolean = false;
    
    // Кэш позиции танка для оптимизации
    private _cachedTankPosition: Vector3 = new Vector3();
    private _tankPositionCacheFrame = -1;
    private _updateTick = 0;
    
    /**
     * Инициализация системы припасов
     */
    initialize(
        tank: TankController | undefined,
        chunkSystem: ChunkSystem | undefined,
        consumablesManager: ConsumablesManager | undefined,
        hud?: HUD,
        soundManager?: SoundManager,
        effectsManager?: EffectsManager,
        experienceSystem?: ExperienceSystem,
        chatSystem?: ChatSystem,
        multiplayerManager?: MultiplayerManager,
        isMultiplayer: boolean = false
    ): void {
        this.tank = tank;
        this.chunkSystem = chunkSystem;
        this.consumablesManager = consumablesManager;
        this.hud = hud;
        this.soundManager = soundManager;
        this.effectsManager = effectsManager;
        this.experienceSystem = experienceSystem;
        this.chatSystem = chatSystem;
        this.multiplayerManager = multiplayerManager;
        this.isMultiplayer = isMultiplayer;
        
        logger.log("[GameConsumables] Consumables system initialized");
    }
    
    /**
     * Обновление системы (вызывается каждый кадр)
     */
    update(updateTick: number): void {
        this._updateTick = updateTick;
        this.checkConsumablePickups();
    }
    
    /**
     * Проверка подбора припасов
     */
    private checkConsumablePickups(): void {
        if (!this.tank || !this.tank.chassis || !this.chunkSystem || !this.consumablesManager) return;
        if (!this.chunkSystem.consumablePickups || this.chunkSystem.consumablePickups.length === 0) return;
        
        // Используем кэшированную позицию
        if (this._tankPositionCacheFrame !== this._updateTick) {
            this._cachedTankPosition.copyFrom(this.tank.chassis.absolutePosition);
            this._tankPositionCacheFrame = this._updateTick;
        }
        const tankPos = this._cachedTankPosition;
        const pickupRadius = 2.0;
        const pickupRadiusSq = pickupRadius * pickupRadius;
        
        // Проверяем все припасы
        for (let i = this.chunkSystem.consumablePickups.length - 1; i >= 0; i--) {
            const pickup = this.chunkSystem.consumablePickups[i];
            const pickupAny = pickup as any;
            if (!pickup || !pickupAny.mesh || pickupAny.mesh.isDisposed()) {
                this.chunkSystem.consumablePickups.splice(i, 1);
                continue;
            }
            
            const pickupPos = pickupAny.mesh.absolutePosition || pickup.position;
            const dx = pickupPos.x - tankPos.x;
            const dz = pickupPos.z - tankPos.z;
            const distanceSq = dx * dx + dz * dz;
            
            if (distanceSq < pickupRadiusSq) {
                // Подбираем припас
                const consumableType = CONSUMABLE_TYPES.find(c => c.id === pickup.type);
                if (consumableType) {
                    // Ищем свободный слот (1-5)
                    let slot = -1;
                    for (let s = 1; s <= 5; s++) {
                        if (!this.consumablesManager.get(s)) {
                            slot = s;
                            break;
                        }
                    }
                    
                    if (slot > 0) {
                        // В мультиплеере запрашиваем подбор у сервера
                        if (this.isMultiplayer && this.multiplayerManager) {
                            const consumableId = (pickupAny.mesh.metadata as any)?.consumableId || 
                                                 `consumable_${pickupAny.mesh.position.x}_${pickupAny.mesh.position.z}`;
                            this.multiplayerManager.requestConsumablePickup(
                                consumableId,
                                pickup.type,
                                { x: pickupAny.mesh.position.x, y: pickupAny.mesh.position.y, z: pickupAny.mesh.position.z }
                            );
                            continue;
                        }
                        
                        // Одиночная игра: подбираем сразу
                        this.consumablesManager.pickUp(consumableType, slot);
                        
                        // Удаляем припас с карты
                        pickupAny.mesh.dispose();
                        this.chunkSystem.consumablePickups.splice(i, 1);
                        
                        // Обновляем HUD и чат
                        if (this.chatSystem) {
                            this.chatSystem.updateConsumables(this.consumablesManager.getAll());
                            this.chatSystem.success(`Подобран: ${consumableType.icon} ${consumableType.name} (слот ${slot})`);
                        }
                        if (this.hud) {
                            this.hud.updateConsumables(this.consumablesManager.getAll());
                        }
                        
                        // Звуковой эффект
                        if (this.soundManager) {
                            this.soundManager.playPickup();
                        }
                        
                        // Визуальный эффект
                        if (this.effectsManager) {
                            const color = Color3.FromHexString(consumableType.color);
                            this.effectsManager.createPickupEffect(pickup.position, color, pickup.type);
                        }
                        
                        // Опыт за подбор
                        if (this.experienceSystem && this.tank) {
                            this.experienceSystem.recordPickup(this.tank.chassisType.id);
                        }
                        
                        logger.log(`[GameConsumables] Picked up ${consumableType.name} in slot ${slot}`);
                    } else {
                        // Все слоты заняты - заменяем первый
                        if (this.isMultiplayer && this.multiplayerManager) {
                            const consumableId = (pickupAny.mesh.metadata as any)?.consumableId || 
                                                 `consumable_${pickupAny.mesh.position.x}_${pickupAny.mesh.position.z}`;
                            this.multiplayerManager.requestConsumablePickup(
                                consumableId,
                                pickup.type,
                                { x: pickupAny.mesh.position.x, y: pickupAny.mesh.position.y, z: pickupAny.mesh.position.z }
                            );
                            continue;
                        }
                        
                        // Одиночная игра: заменяем слот 1
                        this.consumablesManager.pickUp(consumableType, 1);
                        pickupAny.mesh.dispose();
                        this.chunkSystem.consumablePickups.splice(i, 1);
                        
                        if (this.chatSystem) {
                            this.chatSystem.updateConsumables(this.consumablesManager.getAll());
                            this.chatSystem.success(`Подобран: ${consumableType.icon} ${consumableType.name} (заменён слот 1)`);
                        }
                        if (this.hud) {
                            this.hud.updateConsumables(this.consumablesManager.getAll());
                        }
                        
                        if (this.soundManager) {
                            this.soundManager.playPickup();
                        }
                        
                        if (this.experienceSystem && this.tank) {
                            this.experienceSystem.recordPickup(this.tank.chassisType.id);
                        }
                        
                        logger.log(`[GameConsumables] Picked up ${consumableType.name} (replaced slot 1)`);
                    }
                }
            }
        }
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        tank?: TankController;
        chunkSystem?: ChunkSystem;
        consumablesManager?: ConsumablesManager;
        hud?: HUD;
        soundManager?: SoundManager;
        effectsManager?: EffectsManager;
        experienceSystem?: ExperienceSystem;
        chatSystem?: ChatSystem;
        multiplayerManager?: MultiplayerManager;
        isMultiplayer?: boolean;
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.chunkSystem !== undefined) this.chunkSystem = callbacks.chunkSystem;
        if (callbacks.consumablesManager !== undefined) this.consumablesManager = callbacks.consumablesManager;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.soundManager !== undefined) this.soundManager = callbacks.soundManager;
        if (callbacks.effectsManager !== undefined) this.effectsManager = callbacks.effectsManager;
        if (callbacks.experienceSystem !== undefined) this.experienceSystem = callbacks.experienceSystem;
        if (callbacks.chatSystem !== undefined) this.chatSystem = callbacks.chatSystem;
        if (callbacks.multiplayerManager !== undefined) this.multiplayerManager = callbacks.multiplayerManager;
        if (callbacks.isMultiplayer !== undefined) this.isMultiplayer = callbacks.isMultiplayer;
    }
    
    /**
     * Dispose системы припасов
     */
    dispose(): void {
        this.tank = undefined;
        this.chunkSystem = undefined;
        this.consumablesManager = undefined;
        this.hud = undefined;
        this.soundManager = undefined;
        this.effectsManager = undefined;
        this.experienceSystem = undefined;
        this.chatSystem = undefined;
        this.multiplayerManager = undefined;
        
        logger.log("[GameConsumables] Consumables system disposed");
    }
}

