// ═══════════════════════════════════════════════════════════════════════════
// GAME GARAGE - Логика гаражей (respawn, capture, doors)
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, Mesh } from "@babylonjs/core";
import { TextBlock } from "@babylonjs/gui";
import { logger } from "../utils/logger";
import type { Scene } from "@babylonjs/core";
import type { ChunkSystem } from "../chunkSystem";
import type { TankController } from "../tankController";

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
    
    /**
     * Инициализация системы гаражей
     */
    initialize(
        scene: Scene,
        chunkSystem: ChunkSystem | undefined,
        tank: TankController | undefined
    ): void {
        this.scene = scene;
        this.chunkSystem = chunkSystem;
        this.tank = tank;
        
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
        
        // Будет реализовано в Game.ts, так как требует доступа к множеству систем
        logger.debug("[GameGarage] Updating garage doors (will be implemented in Game.ts)");
    }
    
    /**
     * Обновление системы захвата гаражей
     */
    updateGarageCapture(deltaTime: number): void {
        if (!this.chunkSystem || !this.tank || !this.tank.chassis) return;
        
        const playerPos = this.tank.chassis.absolutePosition;
        
        // Проверяем каждый гараж
        for (const garagePos of this.chunkSystem.garagePositions) {
            const garageKey = `${garagePos.x},0,${garagePos.z}`;
            const garageVec = new Vector3(garagePos.x, 0, garagePos.z);
            const distance = Vector3.Distance(
                garageVec,
                new Vector3(playerPos.x, 0, playerPos.z)
            );
            
            if (distance < this.CAPTURE_RADIUS) {
                // Игрок в радиусе захвата
                const captureData = this.garageCaptureProgress.get(garageKey) || { progress: 0, capturingPlayers: 1 };
                captureData.capturingPlayers = 1; // В одиночной игре всегда 1
                captureData.progress += deltaTime / this.CAPTURE_TIME_SINGLE;
                
                if (captureData.progress >= 1.0) {
                    // Гараж захвачен
                    this.onGarageCaptured(garageKey, garageVec);
                    captureData.progress = 1.0;
                }
                
                this.garageCaptureProgress.set(garageKey, captureData);
            } else {
                // Игрок вне радиуса - сбрасываем прогресс
                const captureData = this.garageCaptureProgress.get(garageKey);
                if (captureData && captureData.progress > 0) {
                    captureData.progress = Math.max(0, captureData.progress - deltaTime / this.CAPTURE_TIME_SINGLE);
                    this.garageCaptureProgress.set(garageKey, captureData);
                }
            }
        }
    }
    
    /**
     * Обработка захвата гаража
     */
    private onGarageCaptured(garageKey: string, garagePos: Vector3): void {
        logger.log(`[GameGarage] Garage captured at ${garageKey}`);
        // Будет реализовано в Game.ts
    }
    
    /**
     * Обновление таймеров респавна гаражей
     */
    updateGarageRespawnTimers(deltaTime: number): void {
        // Обновляем таймеры
        for (const [garageKey, timerData] of this.garageRespawnTimers.entries()) {
            if (timerData.timer > 0) {
                timerData.timer -= deltaTime * 1000; // deltaTime в секундах, timer в миллисекундах
                
                // Обновляем текст таймера
                if (timerData.textBlock) {
                    const minutes = Math.floor(timerData.timer / 60000);
                    const seconds = Math.floor((timerData.timer % 60000) / 1000);
                    timerData.textBlock.text = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                
                if (timerData.timer <= 0) {
                    // Таймер истек - гараж доступен
                    this.onGarageRespawned(garageKey);
                }
            }
        }
    }
    
    /**
     * Обработка респавна гаража
     */
    private onGarageRespawned(garageKey: string): void {
        logger.log(`[GameGarage] Garage respawned: ${garageKey}`);
        
        const timerData = this.garageRespawnTimers.get(garageKey);
        if (timerData) {
            // Удаляем billboard и textBlock
            if (timerData.billboard) {
                timerData.billboard.dispose();
            }
            if (timerData.textBlock) {
                timerData.textBlock.dispose();
            }
            
            this.garageRespawnTimers.delete(garageKey);
        }
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
    }): void {
        if (callbacks.chunkSystem !== undefined) this.chunkSystem = callbacks.chunkSystem;
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
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

