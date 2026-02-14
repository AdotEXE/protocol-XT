// ═══════════════════════════════════════════════════════════════════════════
// GAME GARAGE - Логика гаражей (respawn, capture, doors)
// ═══════════════════════════════════════════════════════════════════════════

import type { Scene } from "@babylonjs/core";
import { Color3, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import type { ChunkSystem } from "../chunkSystem";
import type { EnemyTank } from "../enemyTank";
import type { HUD } from "../hud";
import { ChassisTransformAnimation } from "../tank/chassisTransformAnimation";
import { applySkinColorToMaterial, applySkinToTank, getSkinById, loadSelectedSkin, saveSelectedSkin } from "../tank/tankSkins";
import type { TankController } from "../tankController";
import { getCannonById, getChassisById } from "../tankTypes";
import { getTrackById } from "../trackTypes";
import { logger } from "../utils/logger";

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

    // УБРАНО: playerGarageEntry - больше не используется, ворота управляются только через G

    // Отслеживание предыдущего состояния ворот для предотвращения дёргания
    private doorStateCache: Map<number, { frontOpen: boolean, backOpen: boolean }> = new Map();

    // Ссылка на систему гаража (UI) для применения pending изменений
    private garageUI: any = null; // Garage class instance

    // Анимация трансформации корпуса
    private chassisTransformAnimation: ChassisTransformAnimation | null = null;

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
     * Проверить, есть ли на карте физические гаражи
     * На картах без гаражей переодевание происходит на месте
     */
    mapHasGarages(): boolean {
        if (!this.chunkSystem) return false;

        // Проверяем наличие garageDoors (физических гаражей с воротами)
        const hasGarageDoors = this.chunkSystem.garageDoors && this.chunkSystem.garageDoors.length > 0;

        // Проверяем наличие garagePositions (позиций гаражей)
        const hasGaragePositions = this.chunkSystem.garagePositions && this.chunkSystem.garagePositions.length > 0;

        return hasGarageDoors || hasGaragePositions;
    }

    /**
     * Применить pending изменения принудительно (для карт без гаражей)
     * Вызывает respawn() на текущей позиции танка
     */
    applyPendingChangesInPlace(): void {
        if (!this.tank) {
            logger.warn("[GameGarage] applyPendingChangesInPlace: no tank");
            return;
        }

        const hasPending = this.hasPendingChangesFromStorage();
        if (!hasPending) {
            logger.log("[GameGarage] applyPendingChangesInPlace: no pending changes");
            return;
        }

        logger.log("[GameGarage] Applying pending changes in place (no garage on map)...");
        this.applyChangesDirectly();
    }

    /**
     * Получить позицию гаража игрока для респавна
     */
    getPlayerGaragePosition(camera?: any): Vector3 | null {
        // Для карт "sand", "madness", "expo" и "brest" возвращаем случайную позицию внутри карты (если сохранена)
        if (this.chunkSystem && (this.chunkSystem.config?.mapType === "sand" || this.chunkSystem.config?.mapType === "madness" || this.chunkSystem.config?.mapType === "expo" || this.chunkSystem.config?.mapType === "brest" || this.chunkSystem.config?.mapType === "arena")) {
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
                // ИСПРАВЛЕНО: Используем getTopSurfaceHeight() вместо getGroundHeight() для нахождения верхней поверхности
                let surfaceHeight = 2.0;

                // Вычисляем высоту ВЕРХНЕЙ поверхности через game instance
                const game = (window as any).gameInstance;
                if (game && typeof game.getTopSurfaceHeight === 'function') {
                    surfaceHeight = game.getTopSurfaceHeight(nearestGarageX, nearestGarageZ);
                } else if (game && typeof game.getGroundHeight === 'function') {
                    // Fallback на getGroundHeight если getTopSurfaceHeight недоступен
                    surfaceHeight = game.getGroundHeight(nearestGarageX, nearestGarageZ);
                } else if (this.chunkSystem?.terrainGenerator) {
                    // Fallback: используем terrainGenerator
                    const biomes = ["dirt", "city", "residential", "park", "industrial", "concrete"];
                    let maxHeight = 0;
                    for (const biome of biomes) {
                        try {
                            const height = this.chunkSystem.terrainGenerator.getHeight(nearestGarageX, nearestGarageZ, biome);
                            if (height > maxHeight && height > -10 && height < 500) {
                                maxHeight = height;
                            }
                        } catch (e) {
                            // Игнорируем ошибки
                        }
                    }
                    surfaceHeight = maxHeight > 0 ? maxHeight : 2.0;
                }

                // ИСПРАВЛЕНО: Проверка валидности высоты перед использованием
                if (surfaceHeight < -10 || surfaceHeight > 500) {
                    logger.warn(`[GameGarage] getPlayerGaragePosition: Invalid surface height ${surfaceHeight.toFixed(2)}, using fallback 2.0`);
                    surfaceHeight = 2.0;
                }

                // Спавн на 2 метра над верхней поверхностью
                const garageY = surfaceHeight + 2.0;
                const correctedGaragePos = new Vector3(nearestGarageX, garageY, nearestGarageZ);

                logger.log(`[GameGarage] Garage position: (${correctedGaragePos.x.toFixed(2)}, ${correctedGaragePos.y.toFixed(2)}, ${correctedGaragePos.z.toFixed(2)}) - surface: ${surfaceHeight.toFixed(2)}`);
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

            // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            const correctedY = groundHeight + 1.0;
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
            // Логируем только иногда чтобы не спамить
            if (Math.random() < 0.01) {
                console.log(`[GARAGE] isPlayerInAnyGarage: no chunkSystem or garageDoors`);
            }
            return false;
        }
        if (!this.tank || !this.tank.chassis || !this.tank.isAlive) {
            if (Math.random() < 0.01) {
                console.log(`[GARAGE] isPlayerInAnyGarage: no tank or tank not alive`);
            }
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

            // Проверяем X и Z координаты
            const isInsideXZ = (
                playerPos.x >= garagePos.x - garageWidth / 2 &&
                playerPos.x <= garagePos.x + garageWidth / 2 &&
                playerPos.z >= garagePos.z - garageDepth / 2 &&
                playerPos.z <= garagePos.z + garageDepth / 2
            );

            if (isInsideXZ) {
                // Дополнительно проверяем Y координату - танк должен быть внутри гаража (не на потолке/крыше)
                // Гараж обычно имеет высоту около 8-10 метров, проверяем что танк находится в разумных пределах
                const garageHeight = 10; // Высота гаража
                const garageFloorY = garagePos.y; // Y координата пола гаража
                const garageCeilingY = garageFloorY + garageHeight; // Y координата потолка гаража

                // Танк должен быть внутри гаража по высоте (с небольшим запасом)
                const isInsideY = playerPos.y >= garageFloorY - 2 && playerPos.y <= garageCeilingY + 2;

                if (isInsideY) {
                    return true;
                }
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
        const hasPending = this.hasPendingChangesFromStorage();

        // Убрано избыточное логирование

        // Проверяем pending изменения, если игрок в гараже
        // НО НЕ применяем если UI гаража открыт (он сам применит при закрытии)
        const garageUI = this.garageUI;
        const isGarageUIOpen = garageUI && typeof garageUI.isGarageOpen === 'function' && garageUI.isGarageOpen();
        const isApplyingFromUI = garageUI && typeof garageUI.getIsApplyingFromUI === 'function' && garageUI.getIsApplyingFromUI();

        if (isInGarage && !this.isApplyingChanges && hasPending && !isGarageUIOpen && !isApplyingFromUI) {
            // Применяем изменения при входе в гараж (только если UI гаража закрыт)
            this.applyPendingGarageChanges();
        }

        this.wasPlayerInGarage = isInGarage;
    }

    /**
     * Применить pending изменения с анимацией
     */
    private applyPendingGarageChanges(): void {
        // КРИТИЧНО: Всегда используем applyChangesDirectly() для применения изменений
        // Это гарантирует, что respawn() будет вызван для пересоздания визуальных частей
        this.applyChangesDirectly();
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
            if (skin) {
                console.log(`[SKIN] Applying skin "${pending.skinId}" to tank...`);
                const skinColors = applySkinToTank(skin);

                // Применяем к chassis независимо от turret
                if (tankController.chassis?.material) {
                    console.log(`[SKIN] Applying to chassis...`);
                    applySkinColorToMaterial(tankController.chassis.material as StandardMaterial, skinColors.chassisColor);
                } else {
                    console.warn(`[SKIN] chassis.material is null/undefined!`);
                }

                // Применяем к turret независимо от chassis
                if (tankController.turret?.material) {
                    applySkinColorToMaterial(tankController.turret.material as StandardMaterial, skinColors.turretColor);
                }
            }
        }

        // Очищаем pending изменения из localStorage
        localStorage.removeItem("pendingChassis");
        localStorage.removeItem("pendingCannon");
        localStorage.removeItem("pendingTrack");
        localStorage.removeItem("pendingSkin");

        // Send customization update to other players via RPC
        const gameInstance = (window as any).gameInstance;
        if (gameInstance?.multiplayerManager?.sendRpc) {
            const currentChassisId = localStorage.getItem("selectedChassis") || "medium";
            const currentCannonId = localStorage.getItem("selectedCannon") || "standard";
            const currentTrackId = localStorage.getItem("selectedTrack") || "standard";
            const currentSkinId = loadSelectedSkin();

            // КРИТИЧНО: Если скин не выбран, используем цвет типа корпуса (не зеленый!)
            let tankColor: string;
            let turretColor: string;

            if (currentSkinId && currentSkinId !== "default") {
                // Скин выбран - используем его цвета
                const currentSkin = getSkinById(currentSkinId);
                if (currentSkin) {
                    tankColor = currentSkin.chassisColor;
                    turretColor = currentSkin.turretColor;
                } else {
                    // Скин не найден - используем цвет корпуса
                    const chassisTypeObj = getChassisById(currentChassisId);
                    tankColor = chassisTypeObj.color;
                    turretColor = chassisTypeObj.color;
                }
            } else {
                // Скин не выбран - используем цвет корпуса по умолчанию
                const chassisTypeObj = getChassisById(currentChassisId);
                tankColor = chassisTypeObj.color;
                turretColor = chassisTypeObj.color;
            }

            gameInstance.multiplayerManager.sendRpc("DRESS_UPDATE", {
                chassisType: currentChassisId,
                cannonType: currentCannonId,
                trackType: currentTrackId,
                tankColor: tankColor,
                turretColor: turretColor,
            });
            logger.log(`[GameGarage] 🎨 Sent DRESS_UPDATE RPC: chassis=${currentChassisId}, cannon=${currentCannonId}, track=${currentTrackId}, skin=${currentSkinId || "none (chassis color)"}, tankColor=${tankColor}, turretColor=${turretColor}`);
        }

        // Для пересоздания визуальных частей нужен respawn
        // (setChassisType/setCannonType только обновляют статистику, не пересоздают визуал)
        if (pending.chassisId || pending.cannonId || pending.trackId) {
            // КРИТИЧНО: Сохраняем ТОЧНУЮ текущую позицию танка (включая высоту!)
            const currentPos = tankController.chassis?.position?.clone() || new Vector3(0, 1.2, 0);
            const currentRotation = tankController.chassis?.rotation?.clone() || new Vector3(0, 0, 0);

            logger.log(`[GameGarage] Current tank position: ${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`);
            logger.log(`[GameGarage] Current types before respawn: chassis=${tankController.chassisType?.id}, cannon=${tankController.cannonType?.id}, track=${tankController.trackType?.id}`);

            // Определяем, какие части изменились (для анимации)
            const oldChassisId = tankController.chassisType?.id || "medium";
            const applied = {
                chassis: !!pending.chassisId && pending.chassisId !== oldChassisId,
                cannon: !!pending.cannonId && pending.cannonId !== (tankController.cannonType?.id || ""),
                track: !!pending.trackId && pending.trackId !== (tankController.trackType?.id || ""),
                skin: !!pending.skinId
            };

            logger.log(`[GameGarage] Parts to change: chassis=${applied.chassis}, cannon=${applied.cannon}, track=${applied.track}, skin=${applied.skin}`);

            // НОВАЯ АНИМАЦИЯ: Если меняется корпус - запускаем анимацию трансформации
            if (applied.chassis && this.scene && tankController.chassis && pending.chassisId) {
                logger.log(`[GameGarage] Starting chassis transformation animation: ${oldChassisId} -> ${pending.chassisId}`);

                // Создаём анимацию, если ещё не создана
                if (!this.chassisTransformAnimation) {
                    this.chassisTransformAnimation = new ChassisTransformAnimation(this.scene);
                }

                // Получаем типы корпусов
                const oldChassisType = getChassisById(oldChassisId);
                const newChassisType = getChassisById(pending.chassisId);

                // Получаем типы пушки
                const oldCannonId = tankController.cannonType?.id || "standard";
                const newCannonId = pending.cannonId || oldCannonId;
                const oldCannonType = getCannonById(oldCannonId);
                const newCannonType = getCannonById(newCannonId);

                // Получаем типы гусениц
                const oldTrackId = tankController.trackType?.id || "standard";
                const newTrackId = pending.trackId || oldTrackId;
                const oldTrackType = getTrackById(oldTrackId);
                const newTrackType = getTrackById(newTrackId);

                // Останавливаем танк на время анимации
                if (tankController.physicsBody) {
                    tankController.physicsBody.setLinearVelocity(Vector3.Zero());
                    tankController.physicsBody.setAngularVelocity(Vector3.Zero());
                }

                // Запускаем анимацию трансформации (включая пушку и гусеницы)
                this.chassisTransformAnimation.start(
                    tankController.chassis,
                    oldChassisType,
                    newChassisType,
                    tankController.turret,
                    tankController.barrel,
                    oldCannonType,
                    newCannonType,
                    oldTrackType,
                    newTrackType,
                    tankController.leftTrack,
                    tankController.rightTrack,
                    () => {
                        // После анимации вызываем respawn для создания нового корпуса
                        this.completeChassisChange(tankController, currentPos, pending, applied);
                    }
                );
            } else {
                // Если корпус не меняется - обычный respawn
                this.performStandardRespawn(tankController, currentPos, pending, applied);
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
     * Завершает смену корпуса после анимации трансформации
     */
    private completeChassisChange(
        tankController: any,
        currentPos: Vector3,
        pending: { chassisId: string | null, cannonId: string | null, trackId: string | null, skinId: string | null },
        applied: { chassis: boolean, cannon: boolean, track: boolean, skin: boolean }
    ): void {
        logger.log(`[GameGarage] Completing chassis change after animation...`);

        // КРИТИЧНО: Восстанавливаем точную позицию танка (особенно Y) перед respawn
        // Это гарантирует, что танк не взлетит в воздух
        if (tankController.chassis && !tankController.chassis.isDisposed()) {
            tankController.chassis.position.copyFrom(currentPos);
            logger.log(`[GameGarage] Restored tank position before respawn: Y=${currentPos.y.toFixed(2)}`);
        }

        // Вызываем стандартный respawn для создания нового корпуса
        this.performStandardRespawn(tankController, currentPos, pending, applied);
    }

    /**
     * Выполняет стандартный respawn без анимации трансформации корпуса
     */
    private performStandardRespawn(
        tankController: any,
        currentPos: Vector3,
        pending: { chassisId: string | null, cannonId: string | null, trackId: string | null, skinId: string | null },
        applied: { chassis: boolean, cannon: boolean, track: boolean, skin: boolean }
    ): void {
        if (typeof tankController.respawn !== 'function') {
            logger.error(`[GameGarage] tankController.respawn is not a function!`);
            return;
        }

        // КРИТИЧНО: Сохраняем оригинальный callback для восстановления ПОСЛЕ завершения respawn
        const originalCallback = tankController.respawnPositionCallback;

        // КРИТИЧНО: Сохраняем точную Y-позицию для предотвращения взлёта
        const savedY = currentPos.y;

        // Устанавливаем callback, который вернёт ТЕКУЩУЮ позицию танка (переодевание на месте)
        tankController.setRespawnPositionCallback(() => {
            // КРИТИЧНО: Всегда возвращаем сохранённую Y-позицию
            const respawnPos = currentPos.clone();
            respawnPos.y = savedY; // Гарантируем точную высоту
            logger.log(`[GameGarage] Respawn callback: returning saved position Y=${savedY.toFixed(2)}`);
            return respawnPos;
        });

        // КРИТИЧНО: Устанавливаем флаг, что танк уже телепортирован (предотвращает пересчёт высоты)
        tankController._wasTeleportedToGarage = true;
        tankController._inPlaceDressing = true; // Флаг для переодевания на месте

        // КРИТИЧНО: Устанавливаем позицию ДО respawn, чтобы она не потерялась
        if (tankController.chassis && !tankController.chassis.isDisposed()) {
            tankController.chassis.position.copyFrom(currentPos);
        }

        // Вызываем respawn (он пересоздаст части)
        tankController.respawn();

        // ИСПРАВЛЕНО: Запускаем проверку anti-stuck после переодевания для предотвращения застревания
        const game = (window as any).gameInstance;
        if (game && typeof game.startAntiStuckCheck === 'function') {
            setTimeout(() => {
                game.startAntiStuckCheck();
            }, 500); // Запускаем через 500ms после respawn
        }

        // КРИТИЧНО: Восстанавливаем callback с ЗАДЕРЖКОЙ (после завершения respawn)
        setTimeout(() => {
            if (originalCallback) {
                tankController.setRespawnPositionCallback(originalCallback);
            } else {
                tankController.respawnPositionCallback = null;
            }

            // Сбрасываем флаги ПОСЛЕ завершения respawn
            setTimeout(() => {
                tankController._wasTeleportedToGarage = false;
                tankController._inPlaceDressing = false;
                logger.log(`[GameGarage] Flags reset after respawn complete`);
            }, 200);

            // Принудительно стабилизируем физику (без изменения позиции!)
            if (tankController.physicsBody) {
                tankController.physicsBody.setLinearVelocity(Vector3.Zero());
                tankController.physicsBody.setAngularVelocity(Vector3.Zero());
            }

            // Восстанавливаем parent для barrel если потерялся
            if (tankController.barrel && tankController.turret && !tankController.barrel.isDisposed() && !tankController.turret.isDisposed()) {
                if (tankController.barrel.parent !== tankController.turret) {
                    tankController.barrel.parent = tankController.turret;
                    logger.log(`[GameGarage] Restored barrel parent to turret`);
                }
            }

            logger.log(`[GameGarage] Respawn callback restored`);
        }, 300);

        // После respawn запускаем анимацию переодевания (для пушки/гусениц)
        if ((applied.cannon || applied.track) && typeof tankController.playPartChangeAnimation === 'function') {
            logger.log(`[GameGarage] Starting part change animation...`);
            setTimeout(() => {
                tankController.playPartChangeAnimation(applied, () => {
                    logger.log("[GameGarage] Part change animation complete");
                });
            }, 100);
        }
    }

    /**
     * Обновление ворот гаражей
     * ПРОСТАЯ ЛОГИКА: Ворота управляются ТОЛЬКО клавишей G (ручное управление)
     * Без автоматического открытия/закрытия - если ворота открыты, любой может войти и захватить гараж
     */
    updateGarageDoors(): void {
        // Для карт БЕЗ гаражей (custom maps) - автоматически применяем pending изменения
        if (!this.mapHasGarages()) {
            const hasPending = this.hasPendingChangesFromStorage();
            if (hasPending && !this.isApplyingChanges) {
                logger.log("[GameGarage] No garages on map - applying changes in place");
                this.applyPendingChangesInPlace();
            }
            return; // Выходим - ворот нет
        }

        if (!this.chunkSystem || !this.chunkSystem.garageDoors) {
            return;
        }

        // === ПРОВЕРКА PENDING ИЗМЕНЕНИЙ ПРИ ВХОДЕ В ГАРАЖ ===
        this.checkAndApplyPendingChanges();

        // АГРЕССИВНАЯ ПРОВЕРКА: если игрок в гараже и есть pending изменения, применяем их СРАЗУ
        const isInGarage = this.isPlayerInAnyGarage();
        const hasPending = this.hasPendingChangesFromStorage();

        if (isInGarage && !this.isApplyingChanges && hasPending) {
            this.applyPendingGarageChanges();
        }

        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach для лучшей производительности
        const doors = this.chunkSystem.garageDoors;
        const doorCount = doors.length;
        for (let i = 0; i < doorCount; i++) {
            const doorData = doors[i];
            if (!doorData || !doorData.frontDoor || !doorData.backDoor) continue;

            // ПРОСТАЯ ЛОГИКА: Ворота управляются ТОЛЬКО клавишей G
            // Никакой автоматики - полный контроль игрока

            // Определяем целевое состояние ворот (управляется только через G)
            const targetFrontOpen = doorData.frontDoorOpen !== undefined ? doorData.frontDoorOpen : false;
            const targetBackOpen = doorData.backDoorOpen !== undefined ? doorData.backDoorOpen : false;

            // Проверяем что позиции ворот установлены (только при ошибке)
            if (!doorData.frontOpenY || !doorData.frontClosedY || !doorData.backOpenY || !doorData.backClosedY) {
                logger.error(`[GameGarage] Door positions not set! frontOpenY=${doorData.frontOpenY}, frontClosedY=${doorData.frontClosedY}, backOpenY=${doorData.backOpenY}, backClosedY=${doorData.backClosedY}`);
            }

            // Целевые позиции: закрытое + 6 метров для открытого
            const closedFrontY = doorData.frontClosedY || 2.8;
            const closedBackY = doorData.backClosedY || 2.8;
            const targetFrontY = targetFrontOpen ? (closedFrontY + 6.0) : closedFrontY;
            const targetBackY = targetBackOpen ? (closedBackY + 6.0) : closedBackY;

            // Отладочное логирование (только при изменении состояния)
            if (i === 0) { // Логируем только для первого гаража, чтобы не спамить
                const currentFrontY = doorData.frontDoor.position.y;
                const currentBackY = doorData.backDoor.position.y;
                if (Math.abs(currentFrontY - targetFrontY) > 0.1 || Math.abs(currentBackY - targetBackY) > 0.1) {
                    console.log(`[GameGarage] Door state: frontOpen=${targetFrontOpen}, targetY=${targetFrontY.toFixed(2)}, currentY=${currentFrontY.toFixed(2)}, diff=${(targetFrontY - currentFrontY).toFixed(2)}`);
                }
            }

            // Скорость плавного движения (единиц за обновление)
            const doorSpeed = 0.2; // Фиксированная скорость движения за обновление

            // ПЕРЕДНИЕ ВОРОТА: Плавное движение на 6 метров
            const currentFrontY = doorData.frontDoor.position.y;
            const frontDiff = targetFrontY - currentFrontY;

            // Всегда проверяем и двигаем ворота к целевой позиции
            if (Math.abs(frontDiff) > 0.01) {
                // Ворота движутся - плавное движение меша
                const moveAmount = Math.min(Math.abs(frontDiff), doorSpeed);
                const newFrontY = currentFrontY + Math.sign(frontDiff) * moveAmount;
                doorData.frontDoor.position.y = newFrontY;

                // КРИТИЧНО: НЕ обновляем физику во время движения - это вызывает дёргание!
                // Физика будет обновлена только когда движение завершено
            } else {
                // Движение завершено - фиксируем позицию
                doorData.frontDoor.position.y = targetFrontY;

                // Обновляем физику ТОЛЬКО когда движение завершено (один раз)
                if (doorData.frontDoorPhysics && doorData.frontDoorPhysics.body) {
                    doorData.frontDoor.getWorldMatrix();
                    doorData.frontDoorPhysics.body.setTargetTransform(
                        doorData.frontDoor.position.clone(),
                        Quaternion.Identity()
                    );
                }
            }

            // ЗАДНИЕ ВОРОТА: Плавное движение на 6 метров
            const currentBackY = doorData.backDoor.position.y;
            const backDiff = targetBackY - currentBackY;

            if (Math.abs(backDiff) > 0.01) {
                // Ворота движутся - плавное движение меша
                const moveAmount = Math.min(Math.abs(backDiff), doorSpeed);
                const newBackY = currentBackY + Math.sign(backDiff) * moveAmount;
                doorData.backDoor.position.y = newBackY;

                // КРИТИЧНО: НЕ обновляем физику во время движения - это вызывает дёргание!
                // Физика будет обновлена только когда движение завершено
            } else {
                // Движение завершено - фиксируем позицию
                doorData.backDoor.position.y = targetBackY;

                // Обновляем физику ТОЛЬКО когда движение завершено (один раз)
                if (doorData.backDoorPhysics && doorData.backDoorPhysics.body) {
                    doorData.backDoor.getWorldMatrix();
                    doorData.backDoorPhysics.body.setTargetTransform(
                        doorData.backDoor.position.clone(),
                        Quaternion.Identity()
                    );
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

