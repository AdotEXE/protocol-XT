// ═══════════════════════════════════════════════════════════════════════════
// GAME GARAGE - Логика гаражей (respawn, capture, doors)
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, Mesh, StandardMaterial, Color3, Quaternion, MeshBuilder } from "@babylonjs/core";
import { TextBlock, AdvancedDynamicTexture } from "@babylonjs/gui";
import { logger } from "../utils/logger";
import type { Scene } from "@babylonjs/core";
import type { ChunkSystem } from "../chunkSystem";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { EnemyTank } from "../enemyTank";
import { saveSelectedSkin, getSkinById, applySkinToTank } from "../tank/tankSkins";

/**
 * GameGarage - Логика гаражей
 * 
 * Отвечает за:
 * - Позицию гаража игрока для респавна
 * - Таймеры респавна гаражей
 * - Систему захвата гаражей
 * - Управление воротами гаражей
 */
export class GameGarage {
    // Позиция гаража игрока для респавна
    playerGaragePosition: Vector3 | null = null;
    
    // Таймеры респавна для гаражей
    private garageRespawnTimers: Map<string, { timer: number, billboard: Mesh | null, textBlock: TextBlock | null }> = new Map();
    private readonly RESPAWN_TIME = 180000; // 3 минуты в миллисекундах
    
    // Система захвата гаражей
    private garageCaptureProgress: Map<string, { progress: number, capturingPlayers: number }> = new Map();
    private readonly CAPTURE_TIME_SINGLE = 180; // 3 минуты в секундах для одного игрока
    private readonly CAPTURE_RADIUS = 3.0; // Радиус захвата в единицах
    private readonly PLAYER_ID = "player"; // ID игрока (в будущем будет из мультиплеера)
    
    // Ссылки на системы
    protected scene: Scene | undefined;
    protected chunkSystem: ChunkSystem | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected enemyTanks: EnemyTank[] = [];
    
    // УБРАНО: terrainReadyTime больше не используется - ворота открываются сразу
    
    // Состояние для детекции входа в гараж (для применения pending изменений)
    private wasPlayerInGarage: boolean = false;
    private isApplyingChanges: boolean = false;
    
    // Ссылка на систему гаража (UI) для применения pending изменений
    private garageUI: any = null; // Garage class instance
    
    // Кэшированные цвета для оптимизации
    private readonly _colorNeutral = new Color3(0.9, 0.9, 0.9);
    private readonly _colorPlayer = new Color3(0.0, 1.0, 0.0);
    private readonly _colorEnemy = new Color3(1.0, 0.0, 0.0);
    private readonly _colorEmissiveNeutral = new Color3(0.1, 0.1, 0.1);
    private readonly _colorEmissivePlayer = new Color3(0.2, 0.5, 0.2);
    private readonly _colorEmissiveEnemy = new Color3(0.5, 0.1, 0.1);
    
    /**
     * Инициализация системы гаражей
     */
    initialize(
        scene: Scene,
        chunkSystem: ChunkSystem | undefined,
        tank: TankController | undefined,
        hud?: HUD,
        enemyTanks?: EnemyTank[],
        garageUI?: any
    ): void {
        this.scene = scene;
        this.chunkSystem = chunkSystem;
        this.tank = tank;
        this.hud = hud;
        this.enemyTanks = enemyTanks || [];
        this.garageUI = garageUI || null;
        
        logger.log("[GameGarage] Garage system initialized");
    }
    
    /**
     * Установить ссылку на UI гаража (для применения pending изменений)
     */
    setGarageUI(garageUI: any): void {
        this.garageUI = garageUI;
    }
    
    /**
     * Получить позицию гаража игрока для респавна
     */
    getPlayerGaragePosition(camera?: any): Vector3 | null {
        // Для карты "sand" возвращаем случайную позицию внутри карты (если сохранена)
        if (this.chunkSystem && this.chunkSystem.config?.mapType === "sand") {
            if (this.playerGaragePosition) {
                // Используем сохранённую позицию (установлена при спавне)
                return this.playerGaragePosition.clone();
            }
            // Если позиция не сохранена, генерируем случайную внутри границ карты
            const mapBounds = this.chunkSystem.getMapBounds();
            if (mapBounds) {
                const randomX = mapBounds.minX + Math.random() * (mapBounds.maxX - mapBounds.minX);
                const randomZ = mapBounds.minZ + Math.random() * (mapBounds.maxZ - mapBounds.minZ);
                const randomY = 2.0; // Для плоской карты
                const randomPos = new Vector3(randomX, randomY, randomZ);
                this.playerGaragePosition = randomPos.clone();
                return randomPos;
            }
        }
        
        // Если есть система чанков с гаражами - ищем ближайший к текущей позиции танка
        if (this.chunkSystem && this.chunkSystem.garagePositions.length > 0) {
            // Получаем текущую позицию танка (или камеры, если танк не инициализирован)
            let playerPos: Vector3;
            if (this.tank && this.tank.chassis) {
                playerPos = this.tank.chassis.absolutePosition;
            } else if (camera) {
                playerPos = camera.position.clone();
            } else {
                playerPos = new Vector3(0, 0, 0);
            }
            
            // Ищем ближайший гараж (только для определения X и Z)
            let nearestGarageX = 0;
            let nearestGarageZ = 0;
            let nearestDistance = Infinity;
            
            for (const garage of this.chunkSystem.garagePositions) {
                const dist = Vector3.Distance(
                    new Vector3(playerPos.x, 0, playerPos.z), 
                    new Vector3(garage.x, 0, garage.z)
                );
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestGarageX = garage.x;
                    nearestGarageZ = garage.z;
                }
            }
            
            // Если найден ближайший гараж, используем сохраненную позицию или вычисляем высоту
            if (nearestDistance < Infinity) {
                // КРИТИЧНО: ВСЕГДА пересчитываем высоту террейна, даже если есть сохраненная позиция
                let groundHeight = 2.0;
                
                // Вычисляем высоту террейна через game instance (более надёжный метод)
                const game = (window as any).gameInstance;
                if (game && typeof game.getGroundHeight === 'function') {
                    groundHeight = game.getGroundHeight(nearestGarageX, nearestGarageZ);
                } else if (this.chunkSystem?.terrainGenerator) {
                    // Fallback: используем terrainGenerator
                    const biomes = ["dirt", "city", "residential", "park", "industrial", "concrete"];
                    let maxHeight = 0;
                    for (const biome of biomes) {
                        try {
                            const height = this.chunkSystem.terrainGenerator.getHeight(nearestGarageX, nearestGarageZ, biome);
                            if (height > maxHeight && height > -10 && height < 200) {
                                maxHeight = height;
                            }
                        } catch (e) {
                            // Игнорируем ошибки
                        }
                    }
                    groundHeight = maxHeight > 0 ? maxHeight : 2.0;
                }
                
                // Высота пола гаража: верхняя поверхность пола на groundHeight + 0.15
                // Спавн на 1 метр выше пола: groundHeight + 0.15 + 1.0 = groundHeight + 1.15
                const garageY = groundHeight + 1.15;
                const correctedGaragePos = new Vector3(nearestGarageX, garageY, nearestGarageZ);
                
                logger.log(`[GameGarage] Garage position: (${correctedGaragePos.x.toFixed(2)}, ${correctedGaragePos.y.toFixed(2)}, ${correctedGaragePos.z.toFixed(2)}) - ground: ${groundHeight.toFixed(2)}`);
                return correctedGaragePos;
            }
        }
        
        // Fallback: используем сохранённую позицию, но ВСЕГДА пересчитываем высоту
        if (this.playerGaragePosition) {
            const savedX = this.playerGaragePosition.x;
            const savedZ = this.playerGaragePosition.z;
            
            // КРИТИЧНО: Пересчитываем высоту террейна для сохранённой позиции
            let groundHeight = 2.0;
            const game = (window as any).gameInstance;
            if (game && typeof game.getGroundHeight === 'function') {
                groundHeight = game.getGroundHeight(savedX, savedZ);
            } else if (this.chunkSystem?.terrainGenerator) {
                const biomes = ["dirt", "city", "residential", "park", "industrial", "concrete"];
                let maxHeight = 0;
                for (const biome of biomes) {
                    try {
                        const height = this.chunkSystem.terrainGenerator.getHeight(savedX, savedZ, biome);
                        if (height > maxHeight && height > -10 && height < 200) {
                            maxHeight = height;
                        }
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }
                groundHeight = maxHeight > 0 ? maxHeight : 2.0;
            }
            
            // Высота пола гаража: верхняя поверхность пола на groundHeight + 0.15
            // Спавн на 1 метр выше пола: groundHeight + 0.15 + 1.0 = groundHeight + 1.15
            const correctedY = groundHeight + 1.15;
            const correctedPos = new Vector3(savedX, correctedY, savedZ);
            
            logger.log(`[GameGarage] Using saved garage position (corrected): (${correctedPos.x.toFixed(2)}, ${correctedPos.y.toFixed(2)}, ${correctedPos.z.toFixed(2)}) - ground: ${groundHeight.toFixed(2)}`);
            return correctedPos;
        }
        
        // Последний fallback: центр гаража по умолчанию с безопасной высотой
        logger.warn(`[GameGarage] No garage found, using default position (0, 7, 0)`);
        const defaultPos = new Vector3(0, 7.0, 0);
        this.playerGaragePosition = defaultPos.clone();
        return defaultPos;
    }
    
    /**
     * Найти ближайший доступный гараж (не занятый таймером респавна)
     */
    findNearestAvailableGarage(fromPos: Vector3): Vector3 | null {
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) return null;
        
        let nearestGarage: Vector3 | null = null;
        let nearestDistance = Infinity;
        
        for (const garage of this.chunkSystem.garagePositions) {
            const garageVec = new Vector3(garage.x, 0, garage.z);
            // Проверяем, не занят ли гараж таймером респавна
            const key = `${garage.x.toFixed(1)},${garage.z.toFixed(1)}`;
            if (this.garageRespawnTimers.has(key)) {
                continue; // Гараж занят таймером
            }
            
            // Исключаем гараж игрока и близлежащие гаражи (минимум 100 единиц!)
            if (this.playerGaragePosition) {
                const distToPlayerGarage = Vector3.Distance(garageVec, this.playerGaragePosition);
                if (distToPlayerGarage < 100) continue; // Минимум 100 единиц от гаража игрока
            }
            
            const dist = Vector3.Distance(fromPos, garageVec);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestGarage = garageVec;
            }
        }
        
        return nearestGarage ? nearestGarage.clone() : null;
    }
    
    /**
     * Найти ближайший гараж (даже если занят) - для врагов
     */
    findNearestGarage(fromPos: Vector3): Vector3 | null {
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) return null;
        
        let nearestGarage: Vector3 | null = null;
        let nearestDistance = Infinity;
        
        for (const garage of this.chunkSystem.garagePositions) {
            const garageVec = new Vector3(garage.x, 0, garage.z);
            // Исключаем гараж игрока и близлежащие гаражи (минимум 100 единиц!)
            if (this.playerGaragePosition) {
                const distToPlayerGarage = Vector3.Distance(garageVec, this.playerGaragePosition);
                if (distToPlayerGarage < 100) continue; // Минимум 100 единиц от гаража игрока
            }
            
            const dist = Vector3.Distance(fromPos, garageVec);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestGarage = garageVec;
            }
        }
        
        return nearestGarage ? nearestGarage.clone() : null;
    }
    
    /**
     * Найти гараж далеко от игрока (для спавна врагов)
     */
    findGarageFarFromPlayer(): Vector3 | null {
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length || !this.tank || !this.tank.chassis) {
            return null;
        }
        
        const playerPos = this.tank.chassis.absolutePosition;
        let farthestGarage: Vector3 | null = null;
        let farthestDistance = 0;
        
        for (const garage of this.chunkSystem.garagePositions) {
            const garageVec = new Vector3(garage.x, 0, garage.z);
            const dist = Vector3.Distance(
                new Vector3(playerPos.x, 0, playerPos.z),
                garageVec
            );
            
            if (dist > farthestDistance) {
                farthestDistance = dist;
                farthestGarage = garageVec;
            }
        }
        
        return farthestGarage ? farthestGarage.clone() : null;
    }
    
    /**
     * Проверить находится ли игрок внутри любого гаража
     */
    isPlayerInAnyGarage(): boolean {
        if (!this.chunkSystem || !this.chunkSystem.garageDoors) {
            // logger.log(`[GameGarage] isPlayerInAnyGarage: no chunkSystem or garageDoors`);
            return false;
        }
        if (!this.tank || !this.tank.chassis || !this.tank.isAlive) {
            // logger.log(`[GameGarage] isPlayerInAnyGarage: no tank or tank not alive`);
            return false;
        }
        
        const playerPos = this.tank.chassis.getAbsolutePosition();
        const doors = this.chunkSystem.garageDoors;
        
        for (let i = 0; i < doors.length; i++) {
            const doorData = doors[i];
            if (!doorData) continue;
            const garagePos = doorData.position;
            const garageDepth = doorData.garageDepth || 20;
            const garageWidth = 16;
            
            const isInside = (
                playerPos.x >= garagePos.x - garageWidth / 2 &&
                playerPos.x <= garagePos.x + garageWidth / 2 &&
                playerPos.z >= garagePos.z - garageDepth / 2 &&
                playerPos.z <= garagePos.z + garageDepth / 2
            );
            
            if (isInside) {
                // logger.log(`[GameGarage] isPlayerInAnyGarage: TRUE - player at (${playerPos.x.toFixed(2)}, ${playerPos.z.toFixed(2)}), garage at (${garagePos.x.toFixed(2)}, ${garagePos.z.toFixed(2)})`);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Проверить есть ли pending изменения в localStorage
     */
    private hasPendingChangesFromStorage(): boolean {
        const hasChassis = !!localStorage.getItem("pendingChassis");
        const hasCannon = !!localStorage.getItem("pendingCannon");
        const hasTrack = !!localStorage.getItem("pendingTrack");
        const hasSkin = !!localStorage.getItem("pendingSkin");
        const result = hasChassis || hasCannon || hasTrack || hasSkin;
        
        // Логируем только если есть изменения (чтобы не спамить)
        if (result && Math.random() < 0.1) { // 10% вероятность
            logger.log(`[GameGarage] hasPendingChangesFromStorage: chassis=${hasChassis}, cannon=${hasCannon}, track=${hasTrack}, skin=${hasSkin}`);
        }
        
        return result;
    }
    
    /**
     * Получить pending изменения из localStorage
     */
    private getPendingFromStorage() {
        return {
            chassisId: localStorage.getItem("pendingChassis"),
            cannonId: localStorage.getItem("pendingCannon"),
            trackId: localStorage.getItem("pendingTrack"),
            skinId: localStorage.getItem("pendingSkin")
        };
    }
    
    /**
     * Проверить и применить pending изменения при въезде в гараж
     */
    checkAndApplyPendingChanges(): void {
        const isInGarage = this.isPlayerInAnyGarage();
        
        // Проверяем pending изменения, если игрок в гараже
        // Применяем изменения при входе в гараж (переход из false в true)
        // или если игрок уже в гараже и есть pending изменения
        if (isInGarage && !this.isApplyingChanges) {
            const hasPending = this.hasPendingChangesFromStorage();
            if (hasPending) {
                // Применяем изменения при входе в гараж
                if (!this.wasPlayerInGarage) {
                    logger.log(`[GameGarage] Player entered garage. Checking for pending changes...`);
                    const pending = this.getPendingFromStorage();
                    logger.log(`[GameGarage] Pending changes: chassis=${pending.chassisId}, cannon=${pending.cannonId}, track=${pending.trackId}, skin=${pending.skinId}`);
                    this.applyPendingGarageChanges();
                }
            }
        }
        
        this.wasPlayerInGarage = isInGarage;
    }
    
    /**
     * Применить pending изменения с анимацией
     */
    private applyPendingGarageChanges(): void {
        // Если есть garageUI - используем его
        if (this.garageUI && typeof this.garageUI.hasPendingChanges === 'function' && this.garageUI.hasPendingChanges()) {
            this.isApplyingChanges = true;
            
            // Получаем pending изменения
            const pending = this.garageUI.getPendingChanges();
            logger.log(`[GameGarage] Applying pending changes via garageUI: chassis=${pending.chassisId}, cannon=${pending.cannonId}, track=${pending.trackId}, skin=${pending.skinId}`);
            
            // Запускаем анимацию смены частей
            if (this.tank && typeof (this.tank as any).playPartChangeAnimation === 'function') {
                const applied = this.garageUI.applyPendingChangesToTank();
                
                // Запускаем анимацию для каждой измененной части
                (this.tank as any).playPartChangeAnimation(applied, () => {
                    this.isApplyingChanges = false;
                    
                    // Показываем уведомление
                    if (this.hud && typeof this.hud.showNotification === 'function') {
                        this.hud.showNotification("🔧 Оборудование установлено!", "success");
                    }
                    
                    logger.log("[GameGarage] Part change animation complete");
                });
            } else {
                // Если анимации нет, просто применяем изменения
                this.garageUI.applyPendingChangesToTank();
                this.isApplyingChanges = false;
                
                if (this.hud && typeof this.hud.showNotification === 'function') {
                    this.hud.showNotification("🔧 Оборудование установлено!", "success");
                }
                
                logger.log("[GameGarage] Pending changes applied (no animation)");
            }
        } else {
            // Fallback: применяем напрямую через localStorage
            this.applyChangesDirectly();
        }
    }
    
    /**
     * Применить изменения напрямую из localStorage (без garageUI)
     */
    private applyChangesDirectly(): void {
        const pending = this.getPendingFromStorage();
        if (!this.tank) {
            logger.log("[GameGarage] applyChangesDirectly: no tank");
            return;
        }
        
        logger.log(`[GameGarage] Applying changes directly: chassis=${pending.chassisId}, cannon=${pending.cannonId}, track=${pending.trackId}, skin=${pending.skinId}`);
        
        this.isApplyingChanges = true;
        
        const tankController = this.tank as any;
        
        // Сохраняем выбранные части в localStorage (чтобы они использовались при респавне)
        // НЕ вызываем setChassisType/setCannonType/setTrackType здесь - они обновят типы,
        // и respawn() не увидит изменений. Вместо этого просто сохраняем в localStorage,
        // и respawn() сам перезагрузит типы и пересоздаст части.
        if (pending.chassisId) {
            localStorage.setItem("selectedChassis", pending.chassisId);
        }
        if (pending.cannonId) {
            localStorage.setItem("selectedCannon", pending.cannonId);
        }
        if (pending.trackId) {
            localStorage.setItem("selectedTrack", pending.trackId);
        }
        if (pending.skinId) {
            saveSelectedSkin(pending.skinId);
            const skin = getSkinById(pending.skinId);
            if (skin && tankController.chassis?.material && tankController.turret?.material) {
                const skinColors = applySkinToTank(skin);
                (tankController.chassis.material as StandardMaterial).diffuseColor = skinColors.chassisColor;
                (tankController.turret.material as StandardMaterial).diffuseColor = skinColors.turretColor;
            }
        }
        
        // Очищаем pending изменения из localStorage
        localStorage.removeItem("pendingChassis");
        localStorage.removeItem("pendingCannon");
        localStorage.removeItem("pendingTrack");
        localStorage.removeItem("pendingSkin");
        
        // Для пересоздания визуальных частей нужен respawn
        // (setChassisType/setCannonType только обновляют статистику, не пересоздают визуал)
        if (pending.chassisId || pending.cannonId || pending.trackId) {
            // Сохраняем текущую позицию для респавна
            const currentPos = tankController.chassis?.position?.clone() || new Vector3(0, 1.2, 0);
            
            logger.log(`[GameGarage] Current tank position: ${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`);
            logger.log(`[GameGarage] Current types before respawn: chassis=${tankController.chassisType?.id}, cannon=${tankController.cannonType?.id}, track=${tankController.trackType?.id}`);
            
            // Определяем, какие части изменились (для анимации)
            const applied = {
                chassis: !!pending.chassisId && pending.chassisId !== (tankController.chassisType?.id || ""),
                cannon: !!pending.cannonId && pending.cannonId !== (tankController.cannonType?.id || ""),
                track: !!pending.trackId && pending.trackId !== (tankController.trackType?.id || ""),
                skin: !!pending.skinId
            };
            
            logger.log(`[GameGarage] Parts to change: chassis=${applied.chassis}, cannon=${applied.cannon}, track=${applied.track}, skin=${applied.skin}`);
            
            // Вызываем respawn для пересоздания танка с новыми частями
            if (typeof tankController.respawn === 'function') {
                // Временно устанавливаем callback для сохранения позиции
                const originalCallback = tankController.respawnPositionCallback;
                tankController.setRespawnPositionCallback(() => {
                    logger.log(`[GameGarage] Respawn callback called, returning position: ${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`);
                    return currentPos;
                });
                
                logger.log(`[GameGarage] Calling respawn()...`);
                // Вызываем respawn (он пересоздаст части)
                tankController.respawn();
                
                // Восстанавливаем оригинальный callback
                if (originalCallback) {
                    tankController.setRespawnPositionCallback(originalCallback);
                } else {
                    tankController.respawnPositionCallback = null;
                }
                
                logger.log(`[GameGarage] Respawn completed. New types: chassis=${tankController.chassisType?.id}, cannon=${tankController.cannonType?.id}, track=${tankController.trackType?.id}`);
                
                // После respawn запускаем анимацию (если есть изменённые части)
                if ((applied.chassis || applied.cannon || applied.track) && typeof (tankController as any).playPartChangeAnimation === 'function') {
                    logger.log(`[GameGarage] Starting part change animation...`);
                    // Небольшая задержка, чтобы части успели пересоздаться
                    setTimeout(() => {
                        (tankController as any).playPartChangeAnimation(applied, () => {
                            logger.log("[GameGarage] Part change animation complete");
                        });
                    }, 100);
                }
            } else {
                logger.error(`[GameGarage] tankController.respawn is not a function!`);
            }
        }
        
        this.isApplyingChanges = false;
        
        // Показываем уведомление
        if (this.hud && typeof this.hud.showNotification === 'function') {
            this.hud.showNotification("🔧 Оборудование установлено!", "success");
        }
        
        logger.log("[GameGarage] Pending changes applied directly (with respawn)");
    }
    
    /**
     * Обновление ворот гаражей
     * ПРОСТАЯ ЛОГИКА: Ворота просто двигаются вверх/вниз к целевой позиции
     * КРИТИЧНО: Ворота не открываются до загрузки террейна
     */
    updateGarageDoors(): void {
        if (!this.chunkSystem || !this.chunkSystem.garageDoors) return;
        
        // === ПРОВЕРКА PENDING ИЗМЕНЕНИЙ ПРИ ВХОДЕ В ГАРАЖ ===
        this.checkAndApplyPendingChanges();
        
        // АГРЕССИВНАЯ ПРОВЕРКА: если игрок в гараже и есть pending изменения, применяем их СРАЗУ
        // (независимо от wasPlayerInGarage - на случай, если логика входа не сработала)
        const isInGarage = this.isPlayerInAnyGarage();
        const hasPending = this.hasPendingChangesFromStorage();
        
        // Логируем состояние каждые 60 кадров (примерно раз в секунду) для отладки
        if (Math.random() < 0.016) { // ~1/60 вероятность
            logger.log(`[GameGarage] DEBUG: isInGarage=${isInGarage}, hasPending=${hasPending}, wasPlayerInGarage=${this.wasPlayerInGarage}, isApplyingChanges=${this.isApplyingChanges}`);
            if (hasPending) {
                const pending = this.getPendingFromStorage();
                logger.log(`[GameGarage] DEBUG: Pending values: chassis=${pending.chassisId}, cannon=${pending.cannonId}, track=${pending.trackId}, skin=${pending.skinId}`);
            }
        }
        
        if (isInGarage && !this.isApplyingChanges && hasPending) {
            logger.log(`[GameGarage] ⚠️ AGGRESSIVE CHECK: Player in garage with pending changes! Applying now...`);
            const pending = this.getPendingFromStorage();
            logger.log(`[GameGarage] Pending: chassis=${pending.chassisId}, cannon=${pending.cannonId}, track=${pending.trackId}, skin=${pending.skinId}`);
            this.applyPendingGarageChanges();
        }
        
        // КРИТИЧНО: УБРАНА ВСЯ ПРОВЕРКА ТЕРРЕЙНА - ворота открываются сразу, если игрок внутри гаража
        // Проверяем, находится ли игрок внутри гаража ПЕРВЫМ ДЕЛОМ
        let playerInsideGarage = false;
        if (this.tank && this.tank.chassis && this.tank.isAlive) {
            const playerPos = this.tank.chassis.getAbsolutePosition();
            const doors = this.chunkSystem.garageDoors;
            for (let i = 0; i < doors.length; i++) {
                const doorData = doors[i];
                if (!doorData) continue;
                const garagePos = doorData.position;
                const garageDepth = doorData.garageDepth || 20;
                const garageWidth = 16; // Ширина гаража
                
                // Проверяем, находится ли игрок внутри этого гаража
                const isInside = (
                    playerPos.x >= garagePos.x - garageWidth / 2 &&
                    playerPos.x <= garagePos.x + garageWidth / 2 &&
                    playerPos.z >= garagePos.z - garageDepth / 2 &&
                    playerPos.z <= garagePos.z + garageDepth / 2
                );
                
                if (isInside) {
                    playerInsideGarage = true;
                    // Если игрок внутри гаража, открываем ворота сразу БЕЗ ПРОВЕРКИ ТЕРРЕЙНА
                    if (!doorData.manualControl) {
                        doorData.frontDoorOpen = true;
                        doorData.backDoorOpen = true;
                        
                        // КРИТИЧНО: Принудительно устанавливаем позицию ворот в открытое состояние СРАЗУ
                        // Это гарантирует, что ворота откроются даже если логика движения не сработает
                        if (doorData.frontDoor && doorData.frontOpenY !== undefined) {
                            doorData.frontDoor.position.y = doorData.frontOpenY;
                            // Обновляем физику - перемещаем далеко вверх, чтобы не блокировать проход
                            if (doorData.frontDoorPhysics && doorData.frontDoorPhysics.body) {
                                doorData.frontDoor.getWorldMatrix();
                                doorData.frontDoorPhysics.body.setTargetTransform(
                                    new Vector3(doorData.frontDoor.position.x, 100, doorData.frontDoor.position.z),
                                    Quaternion.Identity()
                                );
                            }
                        }
                        if (doorData.backDoor && doorData.backOpenY !== undefined) {
                            doorData.backDoor.position.y = doorData.backOpenY;
                            // Обновляем физику - перемещаем далеко вверх, чтобы не блокировать проход
                            if (doorData.backDoorPhysics && doorData.backDoorPhysics.body) {
                                doorData.backDoor.getWorldMatrix();
                                doorData.backDoorPhysics.body.setTargetTransform(
                                    new Vector3(doorData.backDoor.position.x, 100, doorData.backDoor.position.z),
                                    Quaternion.Identity()
                                );
                            }
                        }
                        
                        // Логируем для отладки (только раз в секунду, чтобы не спамить)
                        const now = Date.now();
                        if (!(this as any)._lastDoorOpenLog || now - (this as any)._lastDoorOpenLog > 1000) {
                            // logger.log(`[GameGarage] Player inside garage, opening doors IMMEDIATELY (player: ${playerPos.x.toFixed(1)}, ${playerPos.z.toFixed(1)}, garage: ${garagePos.x.toFixed(1)}, ${garagePos.z.toFixed(1)})`);
                            (this as any)._lastDoorOpenLog = now;
                        }
                    }
                    break;
                }
            }
        }
        
        // Скорость движения ворот - увеличиваем если игрок внутри гаража
        const doorSpeed = playerInsideGarage ? 1.0 : 0.18; // Быстрое открытие если игрок внутри
        
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach для лучшей производительности
        const doors = this.chunkSystem.garageDoors;
        const doorCount = doors.length;
        for (let i = 0; i < doorCount; i++) {
            const doorData = doors[i];
            if (!doorData || !doorData.frontDoor || !doorData.backDoor) continue;
            
            // Автооткрытие ворот для ботов
            const doorOpenDistance = 18;
            const doorOpenDistanceSq = doorOpenDistance * doorOpenDistance;
            const doorCloseDistanceSq = (doorOpenDistance + 5) * (doorOpenDistance + 5);
            const garagePos = doorData.position;
            const garageDepth = doorData.garageDepth || 20;
            
            const frontDoorPos = new Vector3(garagePos.x, 0, garagePos.z + garageDepth / 2);
            const backDoorPos = new Vector3(garagePos.x, 0, garagePos.z - garageDepth / 2);
            
            // ИСПРАВЛЕНО: Проверяем ручное управление ДО изменения состояния ворот
            const currentTime = Date.now();
            const manualControlTimeout = 5000; // 5 секунд
            const timeSinceManualControl = currentTime - (doorData.manualControlTime || 0);
            const allowAutoControl = !doorData.manualControl || timeSinceManualControl > manualControlTimeout;
            
            // Если ручное управление истекло, сбрасываем флаг
            if (doorData.manualControl && timeSinceManualControl > manualControlTimeout) {
                doorData.manualControl = false;
            }
            
            // КРИТИЧНО: Проверяем, находится ли игрок внутри ЭТОГО гаража
            let playerInThisGarage = false;
            if (this.tank && this.tank.chassis && this.tank.isAlive) {
                const playerPos = this.tank.chassis.getAbsolutePosition();
                const garageWidth = 16;
                const isInside = (
                    playerPos.x >= garagePos.x - garageWidth / 2 &&
                    playerPos.x <= garagePos.x + garageWidth / 2 &&
                    playerPos.z >= garagePos.z - garageDepth / 2 &&
                    playerPos.z <= garagePos.z + garageDepth / 2
                );
                playerInThisGarage = isInside;
            }
            
            // КРИТИЧНО: Проверяем игрока для автооткрытия ворот (ТОЛЬКО если разрешено автоматическое управление)
            if (allowAutoControl && this.tank && this.tank.chassis && this.tank.isAlive) {
                // КРИТИЧНО: Используем getAbsolutePosition() для получения мировой позиции
                // position может быть локальной позицией относительно родителя
                const playerPos = this.tank.chassis.getAbsolutePosition();
                
                // ОПТИМИЗАЦИЯ: Используем квадраты расстояний вместо Vector3.Distance (избегаем sqrt)
                
                const dxFront = playerPos.x - frontDoorPos.x;
                const dzFront = playerPos.z - frontDoorPos.z;
                const distToFrontSq = dxFront * dxFront + dzFront * dzFront;
                
                // КРИТИЧНО: Если игрок внутри гаража, ворота всегда открыты
                if (playerInThisGarage) {
                    doorData.frontDoorOpen = true;
                    doorData.backDoorOpen = true;
                } else {
                    // Открываем ворота если игрок близко, закрываем если далеко
                    if (distToFrontSq < doorOpenDistanceSq) {
                        doorData.frontDoorOpen = true;
                    } else if (distToFrontSq > doorCloseDistanceSq) {
                        // Закрываем только если игрок достаточно далеко (гистерезис)
                        doorData.frontDoorOpen = false;
                    }
                    // Если игрок между порогами - сохраняем текущее состояние (гистерезис)
                    
                    const dxBack = playerPos.x - backDoorPos.x;
                    const dzBack = playerPos.z - backDoorPos.z;
                    const distToBackSq = dxBack * dxBack + dzBack * dzBack;
                    
                    // Открываем ворота если игрок близко, закрываем если далеко
                    if (distToBackSq < doorOpenDistanceSq) {
                        doorData.backDoorOpen = true;
                    } else if (distToBackSq > doorCloseDistanceSq) {
                        // Закрываем только если игрок достаточно далеко (гистерезис)
                        doorData.backDoorOpen = false;
                    }
                    // Если игрок между порогами - сохраняем текущее состояние (гистерезис)
                }
            } else if (allowAutoControl) {
                // ИСПРАВЛЕНО: Если игрок не существует или не жив - закрываем ворота (ТОЛЬКО если разрешено автоматическое управление)
                doorData.frontDoorOpen = false;
                doorData.backDoorOpen = false;
            }
            
            // ИСПРАВЛЕНО: Проверяем всех вражеских танков (ТОЛЬКО если разрешено автоматическое управление)
            if (allowAutoControl) {
                // ОПТИМИЗАЦИЯ: Используем квадраты расстояний и переиспользуем вычисления
                const enemyCount = this.enemyTanks.length;
                for (let j = 0; j < enemyCount; j++) {
                    const enemy = this.enemyTanks[j];
                    if (!enemy || !enemy.isAlive || !enemy.chassis) continue;
                    
                    // ОПТИМИЗАЦИЯ: Используем position вместо absolutePosition для производительности
                    const enemyPos = enemy.chassis.position;
                    
                    const dxFront = enemyPos.x - frontDoorPos.x;
                    const dzFront = enemyPos.z - frontDoorPos.z;
                    const distToFrontSq = dxFront * dxFront + dzFront * dzFront;
                    
                    if (distToFrontSq < doorOpenDistanceSq && !doorData.frontDoorOpen) {
                        doorData.frontDoorOpen = true;
                    }
                    
                    const dxBack = enemyPos.x - backDoorPos.x;
                    const dzBack = enemyPos.z - backDoorPos.z;
                    const distToBackSq = dxBack * dxBack + dzBack * dzBack;
                    
                    if (distToBackSq < doorOpenDistanceSq && !doorData.backDoorOpen) {
                        doorData.backDoorOpen = true;
                    }
                }
            }
            
            // Определяем целевые позиции
            
            // Определяем целевое состояние ворот
            const targetFrontOpen = doorData.frontDoorOpen !== undefined ? doorData.frontDoorOpen : false;
            const targetBackOpen = doorData.backDoorOpen !== undefined ? doorData.backDoorOpen : false;
            
            const targetFrontY = targetFrontOpen ? doorData.frontOpenY : doorData.frontClosedY;
            const targetBackY = targetBackOpen ? doorData.backOpenY : doorData.backClosedY;
            
            // ПРОСТАЯ ЛОГИКА: Передние ворота - просто двигаем к целевой позиции
            const currentFrontY = doorData.frontDoor.position.y;
            const frontDiff = targetFrontY - currentFrontY;
            
            // Логируем для отладки (только если ворота должны открываться и есть разница)
            if (targetFrontOpen && Math.abs(frontDiff) > 0.1) {
                const now = Date.now();
                if (!(this as any)._lastDoorMoveLog || now - (this as any)._lastDoorMoveLog > 2000) {
                    logger.log(`[GameGarage] Moving front door: current=${currentFrontY.toFixed(2)}, target=${targetFrontY.toFixed(2)}, diff=${frontDiff.toFixed(2)}, open=${targetFrontOpen}`);
                    (this as any)._lastDoorMoveLog = now;
                }
            }
            
            if (Math.abs(frontDiff) > 0.01) {
                // ИСПРАВЛЕНО: Плавное движение ворот без дёргания - используем фиксированную скорость
                // Используем doorSpeed из внешней области видимости (быстрее если игрок внутри гаража)
                const moveAmount = Math.min(Math.abs(frontDiff), doorSpeed); // Ограничиваем максимальное движение за кадр
                const newFrontY = currentFrontY + Math.sign(frontDiff) * moveAmount;
                doorData.frontDoor.position.y = newFrontY;
                
                // ИСПРАВЛЕНО: НЕ обновляем физику во время движения - это вызывает дёргание
                // Физика будет обновлена только когда ворота достигнут цели
            } else {
                // Ворота достигли цели - фиксируем позицию
                doorData.frontDoor.position.y = targetFrontY;
                
                // ИСПРАВЛЕНО: Обновляем физику ТОЛЬКО когда ворота достигли цели
                if (doorData.frontDoorPhysics && doorData.frontDoorPhysics.body) {
                    doorData.frontDoor.getWorldMatrix(); // Обновляем матрицу
                    
                    // Если ворота полностью открыты - отключаем коллизию (перемещаем физику далеко вверх)
                    if (targetFrontOpen) {
                        doorData.frontDoorPhysics.body.setTargetTransform(
                            new Vector3(doorData.frontDoor.position.x, 100, doorData.frontDoor.position.z),
                            Quaternion.Identity()
                        );
                    } else {
                        // Если ворота закрыты - синхронизируем с мешем
                        doorData.frontDoorPhysics.body.setTargetTransform(
                            doorData.frontDoor.position.clone(),
                            Quaternion.Identity()
                        );
                    }
                }
            }
            
            // ПРОСТАЯ ЛОГИКА: Задние ворота - просто двигаем к целевой позиции
            const currentBackY = doorData.backDoor.position.y;
            const backDiff = targetBackY - currentBackY;
            
            if (Math.abs(backDiff) > 0.01) {
                // ИСПРАВЛЕНО: Плавное движение ворот без дёргания - используем фиксированную скорость
                // Используем doorSpeed из внешней области видимости (быстрее если игрок внутри гаража)
                const moveAmount = Math.min(Math.abs(backDiff), doorSpeed); // Ограничиваем максимальное движение за кадр
                const newBackY = currentBackY + Math.sign(backDiff) * moveAmount;
                doorData.backDoor.position.y = newBackY;
                
                // ИСПРАВЛЕНО: НЕ обновляем физику во время движения - это вызывает дёргание
                // Физика будет обновлена только когда ворота достигнут цели
            } else {
                // Ворота достигли цели - фиксируем позицию
                doorData.backDoor.position.y = targetBackY;
                
                // ИСПРАВЛЕНО: Обновляем физику ТОЛЬКО когда ворота достигли цели
                if (doorData.backDoorPhysics && doorData.backDoorPhysics.body) {
                    doorData.backDoor.getWorldMatrix(); // Обновляем матрицу
                    
                    // Если ворота полностью открыты - отключаем коллизию (перемещаем физику далеко вверх)
                    if (targetBackOpen) {
                        doorData.backDoorPhysics.body.setTargetTransform(
                            new Vector3(doorData.backDoor.position.x, 100, doorData.backDoor.position.z),
                            Quaternion.Identity()
                        );
                    } else {
                        // Если ворота закрыты - синхронизируем с мешем
                        doorData.backDoorPhysics.body.setTargetTransform(
                            doorData.backDoor.position.clone(),
                            Quaternion.Identity()
                        );
                    }
                }
            }
        }
        
        // ОБНОВЛЕНИЕ ПРОЗРАЧНОСТИ СТЕН: Делаем стены прозрачными когда игрок внутри гаража
        if (this.chunkSystem && this.chunkSystem.garageWalls && this.tank && this.tank.chassis && this.tank.isAlive) {
            const playerPos = this.tank.chassis.position;
            
            // Проверяем каждый гараж
            for (const wallData of this.chunkSystem.garageWalls) {
                if (!wallData || !wallData.walls) continue;
                
                // Проверяем, находится ли игрок внутри этого гаража
                const garageWidth = wallData.width || 20;
                const garageDepth = wallData.depth || 20;
                const garagePos = wallData.position;
                
                const isInside = (
                    playerPos.x >= garagePos.x - garageWidth / 2 &&
                    playerPos.x <= garagePos.x + garageWidth / 2 &&
                    playerPos.z >= garagePos.z - garageDepth / 2 &&
                    playerPos.z <= garagePos.z + garageDepth / 2
                );
                
                // Устанавливаем прозрачность стен (как у ворот - 50%)
                const targetVisibility = isInside ? 0.5 : 1.0;
                
                // Обновляем видимость всех стен гаража
                for (const wall of wallData.walls) {
                    if (wall && !wall.isDisposed()) {
                        wall.visibility = targetVisibility;
                    }
                }
            }
        }
    }
    
    /**
     * Обновление системы захвата гаражей
     */
    updateGarageCapture(deltaTime: number, onRespawnEnemy?: (pos: Vector3) => void): void {
        if (!this.chunkSystem || !this.tank || !this.tank.chassis || !this.chunkSystem.garageCapturePoints) return;
        
        const playerPos = this.tank.chassis.absolutePosition;
        const playerId = this.PLAYER_ID;
        
        // Собираем позиции всех танков
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        const tankPositions: Vector3[] = [playerPos];
        if (this.enemyTanks) {
            const enemyCount = this.enemyTanks.length;
            for (let i = 0; i < enemyCount; i++) {
                const enemy = this.enemyTanks[i];
                if (enemy && enemy.isAlive && enemy.chassis) {
                    tankPositions.push(enemy.chassis.absolutePosition);
                }
            }
        }
        
        // Проверяем каждую точку захвата
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        const capturePoints = this.chunkSystem.garageCapturePoints;
        const capturePointCount = capturePoints.length;
        for (let i = 0; i < capturePointCount; i++) {
            const capturePoint = capturePoints[i];
            if (!capturePoint) continue;
            const garageKey = `${capturePoint.position.x.toFixed(1)}_${capturePoint.position.z.toFixed(1)}`;
            const ownership = ((this.chunkSystem as any).garageOwnership || new Map()).get(garageKey);
            if (!ownership) return;
            
            // Проверяем состояние ворот
            const garageDoor = this.chunkSystem!.garageDoors.find(door => 
                Math.abs(door.position.x - capturePoint.position.x) < 0.1 &&
                Math.abs(door.position.z - capturePoint.position.z) < 0.1
            );
            
            const garageDoorAny = garageDoor as any;
            if (garageDoor && !garageDoorAny.frontDoorOpen && !garageDoorAny.backDoorOpen) {
                // Ворота закрыты - захват невозможен
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                if (ownership.ownerId === null) {
                    this.updateWrenchColor((capturePoint as any).wrench, "neutral");
                } else if (ownership.ownerId === playerId) {
                    this.updateWrenchColor((capturePoint as any).wrench, "player");
                } else {
                    this.updateWrenchColor((capturePoint as any).wrench, "enemy");
                }
                return;
            }
            
            // Проверяем расстояние до точки захвата
            // ОПТИМИЗАЦИЯ: Используем for цикл и квадраты расстояний вместо Vector3.Distance
            const nearbyTanks: Vector3[] = [];
            const captureRadiusSq = this.CAPTURE_RADIUS * this.CAPTURE_RADIUS;
            const captureX = capturePoint.position.x;
            const captureZ = capturePoint.position.z;
            const tankCount = tankPositions.length;
            for (let j = 0; j < tankCount; j++) {
                const tankPos = tankPositions[j];
                if (!tankPos) continue;
                const dx = captureX - tankPos.x;
                const dz = captureZ - tankPos.z;
                const distanceSq = dx * dx + dz * dz;
                if (distanceSq <= captureRadiusSq) {
                    nearbyTanks.push(tankPos);
                }
            }
            
            const capturingCount = nearbyTanks.length;
            let isPlayerNearby = false;
            for (let j = 0; j < nearbyTanks.length; j++) {
                const tankPos = nearbyTanks[j];
                if (!tankPos) continue;
                if (Math.abs(tankPos.x - playerPos.x) < 0.1 && 
                    Math.abs(tankPos.z - playerPos.z) < 0.1) {
                    isPlayerNearby = true;
                    break;
                }
            }
            
            // Если гараж уже принадлежит игроку
            if (ownership.ownerId === playerId) {
                if (this.garageCaptureProgress.has(garageKey)) {
                    this.garageCaptureProgress.delete(garageKey);
                }
                if (this.hud && isPlayerNearby) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                this.updateWrenchColor((capturePoint as any).wrench, "player");
                return;
            }
            
            // Если игрок не рядом, скрываем прогресс-бар
            if (!isPlayerNearby) {
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                return;
            }
            
            // Начинаем/продолжаем захват
            if (!this.garageCaptureProgress.has(garageKey)) {
                this.garageCaptureProgress.set(garageKey, { progress: 0, capturingPlayers: capturingCount });
                logger.log(`[GameGarage] Starting capture of garage at (${capturePoint.position.x.toFixed(1)}, ${capturePoint.position.z.toFixed(1)})`);
            }
            
            const captureData = this.garageCaptureProgress.get(garageKey)!;
            captureData.capturingPlayers = capturingCount;
            
            const captureTime = this.CAPTURE_TIME_SINGLE / captureData.capturingPlayers;
            captureData.progress += deltaTime / captureTime;
            
            // Обновляем прогресс-бар
            if (this.hud) {
                const remainingTime = (1.0 - captureData.progress) * captureTime;
                this.hud.setGarageCaptureProgress(garageKey, captureData.progress, remainingTime);
            }
            
            // Если захват завершён
            if (captureData.progress >= 1.0) {
                ownership.ownerId = playerId;
                this.garageCaptureProgress.delete(garageKey);
                
                this.updateWrenchColor((capturePoint as any).wrench, "player");
                
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                
                const wasEnemy = ownership.ownerId !== null && ownership.ownerId !== playerId;
                logger.log(`[GameGarage] Garage ${wasEnemy ? 'captured from enemy' : 'captured'} at (${capturePoint.position.x.toFixed(1)}, ${capturePoint.position.z.toFixed(1)})`);
            } else {
                this.updateWrenchColor((capturePoint as any).wrench, "capturing");
            }
        }
        
        // Обновляем цвет гаечных ключей для гаражей, которые не захватываются
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        for (let i = 0; i < capturePointCount; i++) {
            const capturePoint = capturePoints[i];
            if (!capturePoint) continue;
            const garageKey = `${capturePoint.position.x.toFixed(1)}_${capturePoint.position.z.toFixed(1)}`;
            const ownership = ((this.chunkSystem as any).garageOwnership || new Map()).get(garageKey);
            if (!ownership) return;
            
            if (!this.garageCaptureProgress.has(garageKey)) {
                if (ownership.ownerId === null) {
                    this.updateWrenchColor((capturePoint as any).wrench, "neutral");
                } else if (ownership.ownerId === this.PLAYER_ID) {
                    this.updateWrenchColor((capturePoint as any).wrench, "player");
                } else {
                    this.updateWrenchColor((capturePoint as any).wrench, "enemy");
                }
            }
        }
    }
    
    /**
     * Обновление цвета гаечного ключа
     */
    private updateWrenchColor(wrench: Mesh, state: "neutral" | "player" | "enemy" | "capturing"): void {
        if (!wrench || !wrench.material) return;
        
        const mat = wrench.material as StandardMaterial;
        switch (state) {
            case "neutral":
                mat.diffuseColor = this._colorNeutral;
                mat.emissiveColor = this._colorEmissiveNeutral;
                break;
            case "player":
                mat.diffuseColor = this._colorPlayer;
                mat.emissiveColor = this._colorEmissivePlayer;
                break;
            case "enemy":
                mat.diffuseColor = this._colorEnemy;
                mat.emissiveColor = this._colorEmissiveEnemy;
                break;
            case "capturing":
                const pulse = 0.3 + 0.2 * Math.sin(Date.now() / 200);
                mat.diffuseColor.set(1.0, 1.0, 0.0);
                mat.emissiveColor.set(0.5 * pulse, 0.5 * pulse, 0.1 * pulse);
                break;
        }
    }
    
    /**
     * Обновление таймеров респавна гаражей
     */
    updateGarageRespawnTimers(deltaTime: number, onRespawnEnemy?: (pos: Vector3) => void): void {
        // ОПТИМИЗАЦИЯ: Используем for...of для Map вместо forEach
        for (const [key, data] of this.garageRespawnTimers.entries()) {
            data.timer -= deltaTime * 1000; // deltaTime в секундах, timer в миллисекундах
            
            if (data.timer <= 0) {
                // Время вышло - респавним врага
                const parts = key.split(',');
                if (parts.length === 2) {
                    const xStr = parts[0];
                    const zStr = parts[1];
                    if (xStr === undefined || zStr === undefined) {
                        return;
                    }
                    const x = parseFloat(xStr);
                    const z = parseFloat(zStr);
                    if (!isNaN(x) && !isNaN(z)) {
                        // Не респавним врага рядом с гаражом игрока
                        if (this.playerGaragePosition) {
                            const garagePos = new Vector3(x, 0, z);
                            const distToPlayer = Vector3.Distance(garagePos, new Vector3(this.playerGaragePosition.x, 0, this.playerGaragePosition.z));
                            if (distToPlayer < 30) {
                                logger.log(`[GameGarage] Skipping enemy respawn too close to player (${distToPlayer.toFixed(1)}m away)`);
                                if (data.billboard) {
                                    data.billboard.dispose();
                                }
                                this.garageRespawnTimers.delete(key);
                                return;
                            }
                        }
                        
                        const garagePos = new Vector3(x, 0.6, z);
                        if (onRespawnEnemy) {
                            onRespawnEnemy(garagePos);
                        }
                    }
                }
                
                // Удаляем таймер
                if (data.billboard) {
                    data.billboard.dispose();
                }
                if (data.textBlock) {
                    data.textBlock.dispose();
                }
                this.garageRespawnTimers.delete(key);
            } else {
                // Обновляем текст таймера
                const totalSeconds = Math.ceil(data.timer / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                if (data.textBlock) {
                    data.textBlock.text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    if (totalSeconds <= 10) {
                        data.textBlock.color = "red";
                    } else if (totalSeconds <= 30) {
                        data.textBlock.color = "yellow";
                    } else {
                        data.textBlock.color = "white";
                    }
                }
            }
        }
    }
    
    /**
     * Запустить таймер респавна для гаража
     */
    startGarageRespawnTimer(garagePos: Vector3): void {
        if (!this.scene) return;
        
        const key = `${garagePos.x.toFixed(1)},${garagePos.z.toFixed(1)}`;
        
        // Проверяем, нет ли уже таймера
        if (this.garageRespawnTimers.has(key)) {
            return;
        }
        
        // Создаём billboard с таймером
        const billboard = MeshBuilder.CreatePlane("respawnTimer", { size: 2 }, this.scene);
        billboard.position = new Vector3(garagePos.x, 5, garagePos.z);
        billboard.billboardMode = Mesh.BILLBOARDMODE_ALL;
        
        const texture = AdvancedDynamicTexture.CreateForMesh(billboard);
        const textBlock = new TextBlock("timerText", "3:00");
        textBlock.color = "white";
        textBlock.fontSize = 48;
        texture.addControl(textBlock);
        
        // Сохраняем таймер
        this.garageRespawnTimers.set(key, {
            timer: this.RESPAWN_TIME,
            billboard: billboard,
            textBlock: textBlock
        });
    }
    
    /**
     * Установить позицию гаража игрока
     */
    setPlayerGaragePosition(position: Vector3 | null): void {
        this.playerGaragePosition = position;
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        chunkSystem?: ChunkSystem;
        tank?: TankController;
        hud?: HUD;
        enemyTanks?: EnemyTank[];
    }): void {
        if (callbacks.chunkSystem !== undefined) this.chunkSystem = callbacks.chunkSystem;
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.enemyTanks !== undefined) this.enemyTanks = callbacks.enemyTanks;
    }
    
    /**
     * Проверить, занят ли гараж таймером респавна
     */
    isGarageRespawnTimerActive(garagePos: Vector3): boolean {
        const key = `${garagePos.x.toFixed(1)},${garagePos.z.toFixed(1)}`;
        return this.garageRespawnTimers.has(key);
    }
    
    /**
     * Переместить все ворота в закрытое состояние (когда террейн не загружен)
     */
    private moveDoorsToClosedState(): void {
        if (!this.chunkSystem || !this.chunkSystem.garageDoors) return;
        
        const doorSpeed = 0.18; // Скорость движения ворот
        const doors = this.chunkSystem.garageDoors;
        const doorCount = doors.length;
        
        for (let i = 0; i < doorCount; i++) {
            const doorData = doors[i];
            if (!doorData || !doorData.frontDoor || !doorData.backDoor) continue;
            
            // Игнорируем ворота с ручным управлением
            if (doorData.manualControl) continue;
            
            // Передние ворота - двигаем к закрытому состоянию
            const currentFrontY = doorData.frontDoor.position.y;
            const frontDiff = doorData.frontClosedY - currentFrontY;
            
            if (Math.abs(frontDiff) > 0.01) {
                const newFrontY = currentFrontY + frontDiff * doorSpeed;
                doorData.frontDoor.position.y = newFrontY;
                
                // Обновляем физику ворот
                if (doorData.frontDoorPhysics && doorData.frontDoorPhysics.body && Math.abs(frontDiff) > 0.1) {
                    doorData.frontDoor.getWorldMatrix();
                    doorData.frontDoorPhysics.body.setTargetTransform(
                        doorData.frontDoor.position.clone(),
                        Quaternion.Identity()
                    );
                }
            } else {
                doorData.frontDoor.position.y = doorData.frontClosedY;
                if (doorData.frontDoorPhysics && doorData.frontDoorPhysics.body) {
                    doorData.frontDoor.getWorldMatrix();
                    doorData.frontDoorPhysics.body.setTargetTransform(
                        doorData.frontDoor.position.clone(),
                        Quaternion.Identity()
                    );
                }
            }
            
            // Задние ворота - двигаем к закрытому состоянию
            const currentBackY = doorData.backDoor.position.y;
            const backDiff = doorData.backClosedY - currentBackY;
            
            if (Math.abs(backDiff) > 0.01) {
                const newBackY = currentBackY + backDiff * doorSpeed;
                doorData.backDoor.position.y = newBackY;
                
                // Обновляем физику ворот
                if (doorData.backDoorPhysics && doorData.backDoorPhysics.body && Math.abs(backDiff) > 0.1) {
                    doorData.backDoor.getWorldMatrix();
                    doorData.backDoorPhysics.body.setTargetTransform(
                        doorData.backDoor.position.clone(),
                        Quaternion.Identity()
                    );
                }
            } else {
                doorData.backDoor.position.y = doorData.backClosedY;
                if (doorData.backDoorPhysics && doorData.backDoorPhysics.body) {
                    doorData.backDoor.getWorldMatrix();
                    doorData.backDoorPhysics.body.setTargetTransform(
                        doorData.backDoor.position.clone(),
                        Quaternion.Identity()
                    );
                }
            }
        }
    }
    
    /**
     * Dispose системы гаражей
     */
    dispose(): void {
        // Очищаем таймеры
        for (const timerData of this.garageRespawnTimers.values()) {
            if (timerData.billboard) {
                timerData.billboard.dispose();
            }
            if (timerData.textBlock) {
                timerData.textBlock.dispose();
            }
        }
        this.garageRespawnTimers.clear();
        this.garageCaptureProgress.clear();
        
        logger.log("[GameGarage] Garage system disposed");
    }
}

