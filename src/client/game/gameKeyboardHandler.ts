// ═══════════════════════════════════════════════════════════════════════════
// GAME KEYBOARD HANDLER - обработка клавиш B, G, M, J, Escape, 1-5 (припасы)
// Регистрируется один раз из Game (init/startGame). Ожидает Game-like API.
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";

/** Элемент garageDoors в ChunkSystem. */
interface GarageDoorData {
    position: { x: number; y: number; z: number };
    garageDepth?: number;
    frontDoorOpen?: boolean;
    backDoorOpen?: boolean;
}

/** ChunkSystem с garageDoors для управления воротами. */
interface ChunkSystemWithGarageDoors {
    garageDoors: GarageDoorData[];
}

/** Минимальный API для обработчика игровых клавиш (ожидается Game). */
export interface GameKeyboardHandlerAPI {
    garage?: {
        isGarageOpen?: () => boolean;
        open?: () => void;
        close?: () => void;
    } | null;
    mainMenu?: {
        show?: (paused?: boolean) => void;
        hide?: () => void;
        isVisible?: () => boolean;
        showGarage?: () => void;
    } | null;
    hud?: {
        isFullMapVisible?: () => boolean;
        toggleFullMap?: () => void;
        toggleMissionPanel?: () => void;
        updateConsumables?: (list: unknown) => void;
    } | null;
    gameStarted?: boolean;
    gamePaused?: boolean;
    chunkSystem?: ChunkSystemWithGarageDoors | null;
    tank?: { chassis?: { absolutePosition: { x: number; y: number; z: number } } } | null;
    consumablesManager?: {
        use: (slot: number, tank: unknown) => boolean;
        get: (slot: number) => unknown;
        getAll: () => unknown;
    } | null;
    chatSystem?: {
        updateConsumables?: (list: unknown) => void;
        success?: (msg: string) => void;
        warning?: (msg: string) => void;
        isTerminalVisible?: () => boolean;
        toggleTerminal?: () => void;
    } | null;
    loadGarage?: () => Promise<void>;
    loadMainMenu?: () => Promise<void>;
    togglePause?: () => void;
    openMapEditorInternal?: () => Promise<void>;
    physicsEditor?: { isVisible?: () => boolean; hide?: () => void } | null;
    botPerformanceUI?: { isVisible?: () => boolean; hide?: () => void } | null;
    botPerformanceSettingsUI?: { isVisible?: () => boolean; hide?: () => void } | null;
    adminPanel?: { isVisible?: () => boolean; hide?: () => void } | null;
    helpMenu?: { isVisible?: () => boolean; hide?: () => void } | null;
    screenshotPanel?: { isVisible?: () => boolean; hide?: () => void } | null;
    physicsPanel?: { isVisible?: () => boolean; hide?: () => void } | null;
    gameStats?: { isVisible?: () => boolean; hide?: () => void } | null;
    gameStatsOverlay?: { isVisible?: () => boolean; hide?: () => void } | null;
    unifiedMenu?: { visible?: boolean } | null;
    sessionSettings?: { isVisible?: () => boolean; hide?: () => void } | null;
    networkMenu?: { isVisible?: () => boolean; hide?: () => void } | null;
    worldGenerationMenu?: { isVisible?: () => boolean; hide?: () => void } | null;
    cheatMenu?: { isVisible?: () => boolean; hide?: () => void } | null;
    debugDashboard?: { visible?: boolean; container?: HTMLDivElement } | null;
}

const FLAG_KEY = "_gameKeyboardHandlerRegistered";

/**
 * Регистрирует обработчик игровых клавиш: B (гараж), G (ворота/закрыть гараж),
 * Ctrl+Shift+M (редактор карт), J (миссии), M (карта), Escape (меню/пауза/закрытие UI), 1-5 (припасы).
 * Вызывать один раз (повторные вызовы игнорируются по флагу на game).
 */
export function registerGameKeyboardHandler(game: GameKeyboardHandlerAPI): void {
    const g = game as GameKeyboardHandlerAPI & Record<string, unknown>;
    if (g[FLAG_KEY]) return;
    g[FLAG_KEY] = true;

    const setPointerMoveBlocked = (v: boolean) => {
        (g as { pointerMoveBlocked?: boolean }).pointerMoveBlocked = v;
    };

    window.addEventListener(
        "keydown",
        (e) => {
            if (e.code === "KeyB" || e.key === "b" || e.key === "B") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                logger.debug("===== KeyB/KeyG pressed for Garage =====");
                logger.debug("Garage exists:", !!g.garage);
                logger.debug("Game started:", g.gameStarted);

                const toggleGarage = () => {
                    if (!g.garage) {
                        logger.error("ERROR: Garage is null!");
                        if (g.mainMenu) {
                            logger.debug("[Game] Garage not available, trying to open via mainMenu...");
                            g.mainMenu.showGarage?.();
                        }
                        return;
                    }
                    try {
                        const isCurrentlyOpen = g.garage.isGarageOpen?.() ?? false;
                        logger.log(`[Game] Garage isOpen: ${isCurrentlyOpen}`);
                        if (isCurrentlyOpen) {
                            g.garage.close?.();
                            logger.log("✓ Garage menu CLOSED");
                        } else {
                            if (g.hud?.isFullMapVisible?.()) g.hud.toggleFullMap?.();
                            if (g.mainMenu?.isVisible?.()) g.mainMenu.hide?.();
                            g.garage.open?.();
                            logger.log("✓ Garage menu OPENED");
                            setTimeout(() => {
                                if (g.garage?.isGarageOpen?.()) logger.debug("✓ Garage confirmed open");
                                else logger.error("✗ Garage failed to open!");
                            }, 200);
                        }
                    } catch (error) {
                        logger.error("✗ Error toggling garage:", error);
                        if (g.mainMenu) g.mainMenu.showGarage?.();
                    }
                };

                if (g.garage) {
                    toggleGarage();
                } else {
                    logger.debug("[Game] Garage not loaded yet, loading now...");
                    g.loadGarage?.().then(() => {
                        if (g.garage) toggleGarage();
                        else g.mainMenu?.showGarage?.();
                    }).catch((err) => {
                        logger.error("[Game] Failed to load Garage:", err);
                        g.mainMenu?.showGarage?.();
                    });
                }
                return;
            }

            if (e.code === "KeyG" && g.garage?.isGarageOpen?.()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                g.garage.close?.();
                logger.log("[Game] Garage closed by G key");
                return;
            }

            const chunkSystem = g.chunkSystem;
            if (
                e.code === "KeyG" &&
                g.gameStarted &&
                chunkSystem?.garageDoors?.length
            ) {
                if (!g.garage || !g.garage.isGarageOpen?.()) {
                    e.preventDefault();
                    const tank = g.tank;
                    if (tank?.chassis) {
                        const playerPos = tank.chassis.absolutePosition;
                        let nearestDoor: GarageDoorData | null = null;
                        let nearestDist = 50;
                        for (const doorData of chunkSystem.garageDoors) {
                            if (!doorData?.position) continue;
                            const dist = Vector3.Distance(
                                new Vector3(doorData.position.x, 0, doorData.position.z),
                                new Vector3(playerPos.x, 0, playerPos.z)
                            );
                            if (dist < nearestDist) {
                                nearestDist = dist;
                                nearestDoor = doorData;
                            }
                        }
                        if (nearestDoor) {
                            const garageDepth = nearestDoor.garageDepth ?? 20;
                            const frontDoorZ = nearestDoor.position.z + garageDepth / 2;
                            const backDoorZ = nearestDoor.position.z - garageDepth / 2;
                            const distToFront = Math.abs(playerPos.z - frontDoorZ);
                            const distToBack = Math.abs(playerPos.z - backDoorZ);
                            if (distToFront < distToBack) {
                                nearestDoor.frontDoorOpen = !nearestDoor.frontDoorOpen;
                            } else {
                                nearestDoor.backDoorOpen = !nearestDoor.backDoorOpen;
                            }
                        }
                    }
                    return;
                }
            }

            if (e.ctrlKey && e.shiftKey && e.code === "KeyM" && g.gameStarted) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                void (g as { openMapEditorInternal?: () => Promise<void> }).openMapEditorInternal?.();
                return;
            }

            if (e.code === "KeyJ" && g.hud) {
                e.preventDefault();
                e.stopPropagation();
                g.hud.toggleMissionPanel?.();
                return;
            }

            if (e.code === "KeyM" && g.hud) {
                e.preventDefault();
                e.stopPropagation();
                if (g.garage?.isGarageOpen?.()) g.garage.close?.();
                g.hud.toggleFullMap?.();
                return;
            }

            if (e.code === "Escape") {
                logger.log(`[Game] ESC pressed - gameStarted: ${g.gameStarted}, mainMenu: ${!!g.mainMenu}`);

                if (g.garage?.isGarageOpen?.()) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    g.garage.close?.();
                    if (g.gameStarted && g.gamePaused) g.togglePause?.();
                    return;
                }

                if (!g.gameStarted) {
                    if (!g.mainMenu) {
                        logger.log("[Game] Loading menu on ESC...");
                        g.loadMainMenu?.().then(() => g.mainMenu?.show?.()).catch((err) => logger.error("[Game] Failed to load menu on ESC:", err));
                    } else {
                        logger.log("[Game] Showing menu on ESC...");
                        g.mainMenu.show?.();
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                const hideIfVisible = (panel: { isVisible?: () => boolean; hide?: () => void } | null | undefined) => {
                    if (panel && typeof panel.isVisible === "function" && panel.isVisible()) {
                        e.preventDefault();
                        e.stopPropagation();
                        panel.hide?.();
                        return true;
                    }
                    return false;
                };

                if (hideIfVisible(g.physicsEditor)) return;
                if (hideIfVisible(g.botPerformanceUI)) return;
                if (hideIfVisible(g.botPerformanceSettingsUI)) return;
                const botProfiler = (g as Record<string, unknown>).botPerformanceProfiler as { isVisible?: () => boolean; hide?: () => void } | undefined;
                if (botProfiler && typeof botProfiler.isVisible === "function" && botProfiler.isVisible()) {
                    e.preventDefault();
                    e.stopPropagation();
                    botProfiler.hide?.();
                    return;
                }
                if (hideIfVisible(g.adminPanel)) return;
                if (hideIfVisible(g.helpMenu)) return;
                if (hideIfVisible(g.screenshotPanel)) return;

                const debugDashboard = g.debugDashboard;
                if (debugDashboard?.visible && debugDashboard.container && !debugDashboard.container.classList.contains("hidden")) {
                    e.preventDefault();
                    e.stopPropagation();
                    debugDashboard.container.classList.add("hidden");
                    debugDashboard.container.style.display = "none";
                    (debugDashboard as { visible?: boolean }).visible = false;
                    return;
                }

                if (hideIfVisible(g.physicsPanel)) return;

                if (g.chatSystem?.isTerminalVisible?.() && g.chatSystem.toggleTerminal) {
                    e.preventDefault();
                    e.stopPropagation();
                    g.chatSystem.toggleTerminal?.();
                    return;
                }
                if (hideIfVisible(g.sessionSettings)) return;
                if (hideIfVisible(g.cheatMenu)) return;
                if (hideIfVisible(g.networkMenu)) return;
                if (hideIfVisible(g.worldGenerationMenu)) return;
                if (hideIfVisible(g.gameStats)) return;
                if (hideIfVisible(g.gameStatsOverlay)) return;

                if (g.unifiedMenu?.visible) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                if (g.mainMenu) {
                    const isMenuVisible = g.mainMenu.isVisible?.() ?? false;
                    if (isMenuVisible) {
                        logger.log("[Game] ESC pressed - closing menu and resuming game");
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        setPointerMoveBlocked(true);
                        g.mainMenu.hide?.();
                        if (g.gamePaused) g.togglePause?.();
                        setTimeout(() => setPointerMoveBlocked(false), 400);
                        return;
                    } else {
                        logger.log("[Game] ESC pressed - opening menu and pausing game");
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        setPointerMoveBlocked(true);
                        if (!g.gamePaused) g.togglePause?.();
                        g.mainMenu.show?.(g.gamePaused);
                        setTimeout(() => setPointerMoveBlocked(false), 300);
                        return;
                    }
                }
            }

            if (g.gameStarted && g.tank && g.consumablesManager && !e.ctrlKey) {
                const keyToSlot: Record<string, number> = {
                    Digit1: 1,
                    Digit2: 2,
                    Digit3: 3,
                    Digit4: 4,
                    Digit5: 5
                };
                const slot = keyToSlot[e.code];
                if (slot) {
                    const used = g.consumablesManager.use(slot, g.tank);
                    g.chatSystem?.updateConsumables?.(g.consumablesManager.getAll());
                    g.hud?.updateConsumables?.(g.consumablesManager.getAll());
                    if (used) {
                        const consumable = g.consumablesManager.get(slot);
                        if (!consumable && g.chatSystem) g.chatSystem.success?.(`Припас из слота ${slot} использован`);
                    } else {
                        if (g.chatSystem) g.chatSystem.warning?.(`Слот ${slot} пуст`);
                    }
                }
            }
        },
        true
    );
}
