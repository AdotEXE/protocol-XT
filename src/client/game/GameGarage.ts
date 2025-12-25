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
        enemyTanks?: EnemyTank[]
    ): void {
        this.scene = scene;
        this.chunkSystem = chunkSystem;
        this.tank = tank;
        this.hud = hud;
        this.enemyTanks = enemyTanks || [];
        
        logger.log("[GameGarage] Garage system initialized");
    }
    
    /**
     * Получить позицию гаража игрока для респавна
     */
    getPlayerGaragePosition(camera?: any): Vector3 | null {
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
            
            // Ищем ближайший гараж
            let nearestGarage: Vector3 | null = null;
            let nearestDistance = Infinity;
            
            for (const garage of this.chunkSystem.garagePositions) {
                const garageVec = new Vector3(garage.x, 0, garage.z);
                const dist = Vector3.Distance(
                    new Vector3(playerPos.x, 0, playerPos.z), 
                    garageVec
                );
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestGarage = garageVec;
                }
            }
            
            if (nearestGarage) {
                logger.log(`[GameGarage] Found nearest garage at distance ${nearestDistance.toFixed(1)}m: (${nearestGarage.x.toFixed(2)}, ${nearestGarage.y.toFixed(2)}, ${nearestGarage.z.toFixed(2)})`);
                return nearestGarage.clone();
            }
        }
        
        // Fallback: используем сохранённую позицию
        if (this.playerGaragePosition) {
            logger.log(`[GameGarage] Using saved garage position: (${this.playerGaragePosition.x.toFixed(2)}, ${this.playerGaragePosition.y.toFixed(2)}, ${this.playerGaragePosition.z.toFixed(2)})`);
            return this.playerGaragePosition.clone();
        }
        
        // Последний fallback: центр гаража по умолчанию
        logger.warn(`[GameGarage] No garage found, using default position (0, 2, 0)`);
        const defaultPos = new Vector3(0, 2.0, 0);
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
     * Обновление ворот гаражей
     */
    updateGarageDoors(): void {
        if (!this.chunkSystem || !this.chunkSystem.garageDoors) return;
        
        const doorSpeed = 0.18;
        
        this.chunkSystem.garageDoors.forEach((doorData: any) => {
            if (!doorData.frontDoor || !doorData.backDoor) return;
            
            // Автооткрытие ворот для ботов
            const doorOpenDistance = 18;
            const garagePos = doorData.position;
            const garageDepth = doorData.garageDepth || 20;
            
            const frontDoorPos = new Vector3(garagePos.x, 0, garagePos.z + garageDepth / 2);
            const backDoorPos = new Vector3(garagePos.x, 0, garagePos.z - garageDepth / 2);
            
            // Проверяем всех вражеских танков
            for (const enemy of this.enemyTanks) {
                if (!enemy || !enemy.isAlive || !enemy.chassis) continue;
                
                const enemyPos = enemy.chassis.absolutePosition;
                
                const distToFront = Vector3.Distance(
                    new Vector3(enemyPos.x, 0, enemyPos.z),
                    frontDoorPos
                );
                if (distToFront < doorOpenDistance && !doorData.frontDoorOpen) {
                    doorData.frontDoorOpen = true;
                }
                
                const distToBack = Vector3.Distance(
                    new Vector3(enemyPos.x, 0, enemyPos.z),
                    backDoorPos
                );
                if (distToBack < doorOpenDistance && !doorData.backDoorOpen) {
                    doorData.backDoorOpen = true;
                }
            }
            
            const targetFrontOpen = doorData.frontDoorOpen !== undefined ? doorData.frontDoorOpen : false;
            const targetBackOpen = doorData.backDoorOpen !== undefined ? doorData.backDoorOpen : false;
            
            const targetFrontY = targetFrontOpen ? doorData.frontOpenY : doorData.frontClosedY;
            const targetBackY = targetBackOpen ? doorData.backOpenY : doorData.backClosedY;
            
            // Передние ворота
            const currentFrontY = doorData.frontDoor.position.y;
            const frontDiff = Math.abs(currentFrontY - targetFrontY);
            if (frontDiff > 0.01) {
                const newFrontY = currentFrontY + (targetFrontY - currentFrontY) * doorSpeed;
                doorData.frontDoor.position.y = newFrontY;
            } else {
                doorData.frontDoor.position.y = targetFrontY;
            }
            if (doorData.frontDoorPhysics && doorData.frontDoorPhysics.body) {
                doorData.frontDoor.computeWorldMatrix(true);
                doorData.frontDoorPhysics.body.setTargetTransform(
                    doorData.frontDoor.position.clone(),
                    Quaternion.Identity()
                );
            }
            
            // Задние ворота
            const currentBackY = doorData.backDoor.position.y;
            const backDiff = Math.abs(currentBackY - targetBackY);
            if (backDiff > 0.01) {
                const newBackY = currentBackY + (targetBackY - currentBackY) * doorSpeed;
                doorData.backDoor.position.y = newBackY;
            } else {
                doorData.backDoor.position.y = targetBackY;
            }
            if (doorData.backDoorPhysics && doorData.backDoorPhysics.body) {
                doorData.backDoor.computeWorldMatrix(true);
                doorData.backDoorPhysics.body.setTargetTransform(
                    doorData.backDoor.position.clone(),
                    Quaternion.Identity()
                );
            }
        });
    }
    
    /**
     * Обновление системы захвата гаражей
     */
    updateGarageCapture(deltaTime: number, onRespawnEnemy?: (pos: Vector3) => void): void {
        if (!this.chunkSystem || !this.tank || !this.tank.chassis || !this.chunkSystem.garageCapturePoints) return;
        
        const playerPos = this.tank.chassis.absolutePosition;
        const playerId = this.PLAYER_ID;
        
        // Собираем позиции всех танков
        const tankPositions: Vector3[] = [playerPos];
        if (this.enemyTanks) {
            this.enemyTanks.forEach(enemy => {
                if (enemy && enemy.isAlive && enemy.chassis) {
                    tankPositions.push(enemy.chassis.absolutePosition);
                }
            });
        }
        
        // Проверяем каждую точку захвата
        this.chunkSystem.garageCapturePoints.forEach(capturePoint => {
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
            const nearbyTanks: Vector3[] = [];
            tankPositions.forEach(tankPos => {
                const distance = Vector3.Distance(
                    new Vector3(capturePoint.position.x, 0, capturePoint.position.z),
                    new Vector3(tankPos.x, 0, tankPos.z)
                );
                if (distance <= this.CAPTURE_RADIUS) {
                    nearbyTanks.push(tankPos);
                }
            });
            
            const capturingCount = nearbyTanks.length;
            const isPlayerNearby = nearbyTanks.some(tankPos => 
                Math.abs(tankPos.x - playerPos.x) < 0.1 && 
                Math.abs(tankPos.z - playerPos.z) < 0.1
            );
            
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
        });
        
        // Обновляем цвет гаечных ключей для гаражей, которые не захватываются
        this.chunkSystem.garageCapturePoints.forEach(capturePoint => {
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
        });
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
        this.garageRespawnTimers.forEach((data, key) => {
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
        });
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

