/**
 * @description Регистрация колбэков главного меню (Restart, Exit, Start Game).
 * Вынесено из Game для уменьшения размера game.ts.
 */

import type { MainMenu, MapType } from "../menu";
import type { MapData } from "../mapEditor";
import { logger } from "../utils/logger";
import { getSupplyDropSystem } from "../supplyDropSystem";
import { normalizeMapDataForGame } from "./normalizeMapDataForGame";

/** ChunkSystem с опциональным mapSize для SupplyDropSystem */
interface ChunkSystemWithMapSize {
    mapSize?: number;
    getHeightAt?(x: number, z: number): number;
}

/**
 * Минимальный интерфейс Game, необходимый для колбэков меню.
 * Позволяет не импортировать весь Game и избежать циклических зависимостей.
 */
export interface IGameForMenuCallbacks {
    restartGame(): void;
    exitBattle(): void;
    currentMapType: MapType;
    normalizeMapDataForGame(data: MapData): ReturnType<typeof normalizeMapDataForGame>;
    multiplayerManager?: {
        getRoomId(): string | undefined;
        getMapType(): MapType | undefined;
        isConnected(): boolean;
    };
    isMultiplayer: boolean;
    gameInitialized: boolean;
    init(): Promise<void>;
    chunkSystem?: ChunkSystemWithMapSize | null;
    reloadMap(mapType: MapType): Promise<void>;
    canvas: HTMLCanvasElement;
    scene: import("@babylonjs/core").Scene;
    supplyDropSystem: import("../supplyDropSystem").SupplyDropSystem | undefined;
    consumablesManager?: { get(slot: number): unknown; getAll(): unknown; pickUp(type: unknown, slot: number): void } | null;
    chatSystem?: { updateConsumables(data: unknown): void; success(msg: string): void } | null;
    hud?: { updateConsumables(data: unknown): void; showMessage(msg: string, color: string, ms: number): void } | null;
    soundManager?: { playPickup(): void } | null;
    experienceSystem?: { recordPickup(id: string): void } | null;
    tank?: { chassisType: { id: string } } | null;
    dailyQuestsSystem?: { updateProgress(type: string, delta: number): void } | null;
    achievementsSystem?: { updateProgress(id: string, delta: number): void } | null;
    startGame(): void;
}

/**
 * Регистрирует колбэки главного меню (Restart, Exit Battle, Start Game).
 * F3 Physics Viewer и инициализация SupplyDrop при старте остаются внутри onStartGame.
 */
export function setupMenuCallbacks(mainMenu: MainMenu, game: IGameForMenuCallbacks): void {
    logger.log("[Game] Setting up menu callbacks...");

    mainMenu.setOnRestartGame(() => {
        logger.log("[Game] Restart game callback called");
        game.restartGame();
    });

    mainMenu.setOnExitBattle(() => {
        logger.log("[Game] Exit battle callback called");
        game.exitBattle();
    });

    mainMenu.setOnStartGame(async (mode: string, mapType: MapType, _chassisId: string, _cannonId: string) => {
        logger.log(`[Game] ===== Start game callback called with mode=${mode}, map=${mapType} =====`);

        let mapData: MapData | undefined = undefined;

        try {
            if (mapType) {
                game.currentMapType = mapType;
                logger.log(`[Game] Map type set to: ${game.currentMapType}`);

                if (mapType === "custom") {
                    try {
                        const existingMapData = localStorage.getItem("selectedCustomMapData");
                        if (existingMapData) {
                            mapData = JSON.parse(existingMapData) as MapData;
                            logger.log(`[Game] Loaded custom map data from localStorage: ${mapData?.name}`);
                        }
                    } catch (e) {
                        logger.error("[Game] Failed to parse custom map data", e);
                    }
                }

                if (mapData) {
                    const hasRoomId = game.multiplayerManager?.getRoomId();
                    const hasPendingMapType = game.multiplayerManager?.getMapType();
                    const isInMultiplayerRoom =
                        game.isMultiplayer ||
                        (game.multiplayerManager?.isConnected() && !!hasRoomId) ||
                        !!hasPendingMapType;

                    if (!isInMultiplayerRoom) {
                        const normalized = game.normalizeMapDataForGame(mapData);
                        if (normalized) {
                            localStorage.setItem("selectedCustomMapData", JSON.stringify(normalized));
                            logger.log(`[Game] Map data saved (normalized): ${normalized.name}, type: ${normalized.mapType}`);
                        }
                    } else {
                        logger.log(
                            `[Game] 🗺️ Мультиплеер: сохранение данных карты в localStorage запрещено (roomId=${hasRoomId || "N/A"}, pendingMapType=${hasPendingMapType || "N/A"})`
                        );
                    }
                } else {
                    if (mapType !== "custom") {
                        localStorage.removeItem("selectedCustomMapData");
                        localStorage.removeItem("selectedCustomMapIndex");
                    }
                }
            }

            if (!game.gameInitialized) {
                logger.log(`[Game] Game not initialized, initializing with map type: ${game.currentMapType}`);
                await game.init();
                game.gameInitialized = true;
                logger.log("[Game] Game initialized successfully");
            } else {
                if (mapType && game.chunkSystem) {
                    await game.reloadMap(mapType);
                }
            }

            if (game.canvas) {
                game.canvas.style.display = "block";
                game.canvas.style.visibility = "visible";
                game.canvas.style.opacity = "1";
            }

            if (game.scene) {
                const g = game as IGameForMenuCallbacks & { supplyDropSystem: import("../supplyDropSystem").SupplyDropSystem };
                g.supplyDropSystem = getSupplyDropSystem(game.scene, (x, z) => {
                    return game.chunkSystem?.getHeightAt?.(x, z) ?? 0;
                });
                if (g.supplyDropSystem) {
                    const mapSize = (game.chunkSystem as ChunkSystemWithMapSize)?.mapSize ?? 500;
                    g.supplyDropSystem.initialize(mapData);

                    if (game.consumablesManager) {
                        g.supplyDropSystem.setOnPickup((consumableType) => {
                            let slot = -1;
                            for (let s = 1; s <= 5; s++) {
                                if (!game.consumablesManager!.get(s)) {
                                    slot = s;
                                    break;
                                }
                            }

                            if (slot > 0) {
                                game.consumablesManager!.pickUp(consumableType, slot);
                                if (game.chatSystem) {
                                    game.chatSystem.updateConsumables(game.consumablesManager!.getAll());
                                    game.chatSystem.success(`Подобран: ${(consumableType as { icon: string; name: string }).icon} ${(consumableType as { icon: string; name: string }).name} (слот ${slot})`);
                                }
                                if (game.hud) game.hud.updateConsumables(game.consumablesManager!.getAll());
                                if (game.soundManager) game.soundManager.playPickup();
                                if (game.experienceSystem && game.tank) game.experienceSystem.recordPickup(game.tank.chassisType.id);
                                if (game.dailyQuestsSystem) game.dailyQuestsSystem.updateProgress("daily_pickups", 1);
                                if (game.achievementsSystem) game.achievementsSystem.updateProgress("supply_runner", 1);
                                logger.log(`[Game] Picked up supply drop: ${(consumableType as { name: string }).name} in slot ${slot}`);
                            } else {
                                game.consumablesManager!.pickUp(consumableType, 1);
                                if (game.chatSystem) {
                                    game.chatSystem.updateConsumables(game.consumablesManager!.getAll());
                                    game.chatSystem.success(`Подобран: ${(consumableType as { icon: string; name: string }).icon} ${(consumableType as { icon: string; name: string }).name} (заменён слот 1)`);
                                }
                                if (game.hud) game.hud.updateConsumables(game.consumablesManager!.getAll());
                                if (game.soundManager) game.soundManager.playPickup();
                                if (game.experienceSystem && game.tank) game.experienceSystem.recordPickup(game.tank.chassisType.id);
                                if (game.dailyQuestsSystem) game.dailyQuestsSystem.updateProgress("daily_pickups", 1);
                                if (game.achievementsSystem) game.achievementsSystem.updateProgress("supply_runner", 1);
                                logger.log(`[Game] Picked up supply drop: ${(consumableType as { name: string }).name} (replaced slot 1)`);
                            }
                        });
                    }
                    logger.log("[Game] SupplyDropSystem initialized");
                }
            }

            window.addEventListener("keydown", (ev) => {
                if (ev.code !== "F3" || !game.scene) return;
                const gameAny = game as IGameForMenuCallbacks & { _physicsViewer?: { showBody(body: unknown): void; dispose?(): void } | null };
                if (!gameAny._physicsViewer) {
                    import("@babylonjs/core/Debug/physicsViewer").then(({ PhysicsViewer }) => {
                        const viewer = new PhysicsViewer(game.scene);
                        gameAny._physicsViewer = viewer;
                        for (const mesh of game.scene.meshes) {
                            if (mesh.physicsBody) viewer.showBody(mesh.physicsBody);
                        }
                        logger.log("[Game] Physics Viewer Enabled");
                        if (game.hud) game.hud.showMessage("Physics Debug ON", "#0f0", 2000);
                    });
                } else {
                    if (gameAny._physicsViewer.dispose) gameAny._physicsViewer.dispose();
                    gameAny._physicsViewer = null;
                    logger.log("[Game] Physics Viewer Disabled");
                    if (game.hud) game.hud.showMessage("Physics Debug OFF", "#f00", 2000);
                }
            });
        } catch (err) {
            logger.error("[Game] Error in onStartGame callback:", err);
            return;
        }

        logger.log("[Game] Calling startGame()...");
        game.startGame();
        logger.log("[Game] startGame() called successfully");
    });

    logger.log("[Game] Menu callbacks set up successfully");
}
