// ═══════════════════════════════════════════════════════════════════════════
// GAME INPUT - Обработка ввода (клавиатура, мышь, pointer lock)
// ═══════════════════════════════════════════════════════════════════════════

import { Ray, Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { Scene, Engine } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { ChunkSystem } from "../chunkSystem";

/**
 * GameInput - Обработка ввода пользователя
 * 
 * Отвечает за:
 * - Обработку клавиатуры (keydown, keyup)
 * - Обработку мыши (wheel)
 * - Pointer lock
 * - Горячие клавиши (F1-F10, Ctrl+1-9, etc.)
 * - Обработку ввода для гаража, панелей, и т.д.
 */
export class GameInput {
    // Input map для отслеживания нажатых клавиш
    private _inputMap: { [key: string]: boolean } = {};

    // Флаги состояний
    private isFreeLook = false; // Shift зажат - свободный обзор
    private altKeyPressed = false; // Alt зажат для pointer lock
    private isAiming = false; // Режим прицеливания

    // Ссылки на системы (будут переданы из Game)
    protected scene: Scene | undefined;
    protected engine: Engine | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected chunkSystem: ChunkSystem | undefined;
    protected garage: any | undefined;
    protected mainMenu: any | undefined;
    protected gameStarted = false;
    protected gamePaused = false;

    // Lazy-loaded модули (будут переданы из Game)
    protected helpMenu: any | undefined;
    protected screenshotManager: any | undefined;
    protected screenshotPanel: any | undefined;
    protected debugDashboard: any | undefined;
    protected physicsPanel: any | undefined;
    protected cheatMenu: any | undefined;
    protected networkMenu: any | undefined;
    protected worldGenerationMenu: any | undefined;
    protected sessionSettings: any | undefined;
    protected socialMenu: any | undefined;
    protected mapEditor: any | undefined;
    protected chatSystem: any | undefined; // ChatSystem for toggle

    // Callbacks для действий (будут переданы из Game)
    protected onToggleGarage: (() => void) | null = null;
    protected onToggleGarageDoor: ((doorData: any) => void) | null = null;
    protected onShowStatsOverlay: (() => void) | null = null;
    protected onHideStatsOverlay: (() => void) | null = null;
    protected onSwitchSpectatorTarget: ((forward: boolean) => void) | null = null;
    protected isSpectating = false;
    protected loadGarage: (() => Promise<void>) | null = null;
    protected openScreenshotPanel: (() => Promise<void>) | null = null;
    protected openMapEditorInternal: (() => Promise<void>) | null = null;

    /**
     * Инициализация обработки ввода
     */
    initialize(
        scene: Scene,
        engine: Engine,
        callbacks: {
            tank?: TankController;
            hud?: HUD;
            chunkSystem?: ChunkSystem;
            garage?: any;
            mainMenu?: any;
            gameStarted: boolean;
            gamePaused: boolean;
            isSpectating: boolean;
            onToggleGarage?: () => void;
            onToggleGarageDoor?: (doorData: any) => void;
            onShowStatsOverlay?: () => void;
            onHideStatsOverlay?: () => void;
            onSwitchSpectatorTarget?: (forward: boolean) => void;
            loadGarage?: () => Promise<void>;
            openScreenshotPanel?: () => Promise<void>;
            openMapEditorInternal?: () => Promise<void>;
            // Lazy-loaded модули
            helpMenu?: any;
            screenshotManager?: any;
            screenshotPanel?: any;
            debugDashboard?: any;
            physicsPanel?: any;
            cheatMenu?: any;
            networkMenu?: any;
            worldGenerationMenu?: any;
            sessionSettings?: any;
            socialMenu?: any;
            mapEditor?: any;
            chatSystem?: any; // ChatSystem reference
        }
    ): void {
        this.scene = scene;
        this.engine = engine;
        this.tank = callbacks.tank;
        this.hud = callbacks.hud;
        this.chunkSystem = callbacks.chunkSystem;
        this.garage = callbacks.garage;
        this.mainMenu = callbacks.mainMenu;
        this.gameStarted = callbacks.gameStarted;
        this.gamePaused = callbacks.gamePaused;
        this.isSpectating = callbacks.isSpectating;

        // Callbacks
        this.onToggleGarage = callbacks.onToggleGarage || null;
        this.onToggleGarageDoor = callbacks.onToggleGarageDoor || null;
        this.onShowStatsOverlay = callbacks.onShowStatsOverlay || null;
        this.onHideStatsOverlay = callbacks.onHideStatsOverlay || null;
        this.onSwitchSpectatorTarget = callbacks.onSwitchSpectatorTarget || null;
        this.loadGarage = callbacks.loadGarage || null;
        this.openScreenshotPanel = callbacks.openScreenshotPanel || null;
        this.openMapEditorInternal = callbacks.openMapEditorInternal || null;

        // Lazy-loaded модули
        this.helpMenu = callbacks.helpMenu;
        this.screenshotManager = callbacks.screenshotManager;
        this.screenshotPanel = callbacks.screenshotPanel;
        this.debugDashboard = callbacks.debugDashboard;
        this.physicsPanel = callbacks.physicsPanel;
        this.cheatMenu = callbacks.cheatMenu;
        this.networkMenu = callbacks.networkMenu;
        this.worldGenerationMenu = callbacks.worldGenerationMenu;
        this.sessionSettings = callbacks.sessionSettings;
        this.socialMenu = callbacks.socialMenu;
        this.mapEditor = callbacks.mapEditor;
        this.chatSystem = callbacks.chatSystem;

        this.setupInputHandlers();
    }

    /**
     * Настройка обработчиков ввода
     */
    private setupInputHandlers(): void {
        // Основной обработчик keydown (создается в конструкторе Game)
        // Здесь мы только настраиваем дополнительные обработчики

        // Обработчик keyup
        window.addEventListener("keyup", (evt) => {
            this._inputMap[evt.code] = false;

            // Отпустили Shift - выход из freelook
            if (evt.code === "ShiftLeft" || evt.code === "ShiftRight") {
                this.isFreeLook = false;
            }

            // Отпустили Tab - скрыть stats overlay
            if (evt.code === "Tab" && this.gameStarted) {
                evt.preventDefault();
                if (this.onHideStatsOverlay) {
                    this.onHideStatsOverlay();
                }
            }

            // Отпустили Alt - выход из pointer lock
            if ((evt.code === "AltLeft" || evt.code === "AltRight") && this.altKeyPressed) {
                this.altKeyPressed = false;
                const canvas = this.scene?.getEngine().getRenderingCanvas() as HTMLCanvasElement;
                if (canvas && document.pointerLockElement === canvas) {
                    document.exitPointerLock();
                    logger.log("[GameInput] Pointer lock deactivated via Alt key release");
                    if (this.hud) {
                        this.hud.showMessage("🖱️ Игровой курсор выключен", "#888", 1500);
                    }
                }
            }
        });

        // Обработчик wheel
        window.addEventListener("wheel", (evt) => {
            if (!this.scene) return;

            // Spectator mode: switch targets with wheel
            if (this.isSpectating && !this.isAiming) {
                if (evt.deltaY < 0 && this.onSwitchSpectatorTarget) {
                    this.onSwitchSpectatorTarget(true); // Next player
                } else if (evt.deltaY > 0 && this.onSwitchSpectatorTarget) {
                    this.onSwitchSpectatorTarget(false); // Previous player
                }
                return;
            }
        });

        logger.log("[GameInput] Input handlers setup complete");
    }

    /**
     * Обработка keydown событий
     * Вызывается из основного обработчика в Game.ts
     */
    handleKeyDown(e: KeyboardEvent): boolean {
        // Возвращает true если событие обработано и нужно предотвратить default

        // === CHAT TOGGLE: Enter или / открывает, Esc закрывает ===
        if (this.chatSystem && this.gameStarted) {
            // Enter или / - открыть чат (если он закрыт и не в input)
            if ((e.code === "Enter" || e.code === "Slash") && !this.chatSystem.isChatActive()) {
                e.preventDefault();
                this.chatSystem.setVisible(true);
                // Если нажали /, добавляем / в input для команды
                if (e.code === "Slash" && this.chatSystem.commandInput) {
                    setTimeout(() => {
                        if (this.chatSystem.commandInput) {
                            this.chatSystem.commandInput.value = "/";
                        }
                    }, 10);
                }
                return true;
            }

            // Escape - закрыть чат (если открыт)
            if (e.code === "Escape" && this.chatSystem.isChatActive()) {
                e.preventDefault();
                this.chatSystem.setVisible(false);
                return true;
            }
        }

        // Open/Close garage MENU with B key
        if (e.code === "KeyB" || e.key === "b" || e.key === "B") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (this.onToggleGarage) {
                this.onToggleGarage();
            }
            return true;
        }

        // Закрытие UI гаража клавишей G
        if ((e.code === "KeyG" || e.key === "g" || e.key === "G") &&
            this.garage && this.garage.isGarageOpen()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.garage.close();
            return true;
        }

        // Ручное управление воротами гаража клавишей G
        if ((e.code === "KeyG" || e.key === "g" || e.key === "G")) {
            logger.log(`[GameInput] G pressed: gameStarted=${this.gameStarted}, chunkSystem=${!!this.chunkSystem}, garageDoors=${this.chunkSystem?.garageDoors?.length || 0}, garageOpen=${this.garage?.isGarageOpen?.() || false}`);

            if (this.gameStarted &&
                this.chunkSystem &&
                this.chunkSystem.garageDoors &&
                this.chunkSystem.garageDoors.length > 0 &&
                (!this.garage || !this.garage.isGarageOpen())) {
                e.preventDefault();
                logger.log(`[GameInput] Calling handleGarageDoorToggle...`);
                this.handleGarageDoorToggle();
                return true;
            }
        }

        // Показать stats panel при зажатии Tab
        if (e.code === "Tab" && this.gameStarted) {
            e.preventDefault();
            if (this.onShowStatsOverlay) {
                this.onShowStatsOverlay();
            }
            return true;
        }

        // Альтернативные F1-F10 для панелей
        if (this.gameStarted && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const fKeyToDigit: Record<string, string> = {
                F1: "Digit1",
                F2: "Digit2",
                F3: "Digit3",
                F4: "Digit4",
                F5: "Digit5",
                F6: "Digit6",
                F7: "Digit7",
                F8: "Digit8",
                F9: "Digit9",
                F10: "Digit0",
            };
            const mapped = fKeyToDigit[e.code as keyof typeof fKeyToDigit];
            if (mapped) {
                e.preventDefault();
                e.stopPropagation();
                const synthetic = new KeyboardEvent("keydown", {
                    key: mapped === "Digit0" ? "0" : mapped.replace("Digit", ""),
                    code: mapped,
                    ctrlKey: true,
                    shiftKey: false,
                    altKey: false,
                    metaKey: false,
                    bubbles: true,
                    cancelable: true,
                });
                window.dispatchEvent(synthetic);
                return true;
            }
        }

        // Комбинации Ctrl+1-9,0
        // ВАЖНО: Основная обработка Ctrl+комбинаций происходит в game.ts с capture phase
        // Этот код выполняется только если GameInput.handleKeyDown вызывается явно
        // и только когда gameStarted === true (для совместимости)
        if (e.ctrlKey && this.gameStarted) {
            return this.handleCtrlKeyCombinations(e);
        }

        return false;
    }

    /**
     * Обработка комбинаций Ctrl+клавиши
     */
    private handleCtrlKeyCombinations(e: KeyboardEvent): boolean {
        // Ctrl+1: Help/Controls Menu
        if (e.code === "Digit1" || e.code === "Numpad1") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handleHelpMenu();
            return true;
        }

        // Ctrl+2: Screenshot Panel
        if (e.code === "Digit2" || e.code === "Numpad2") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (this.openScreenshotPanel) {
                this.openScreenshotPanel();
            }
            return true;
        }

        // Ctrl+3: Debug Dashboard
        if (e.code === "Digit3" || e.code === "Numpad3") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handleDebugDashboard();
            return true;
        }

        // Ctrl+4: Physics Panel
        if (e.code === "Digit4" || e.code === "Numpad4") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handlePhysicsPanel();
            return true;
        }

        // Ctrl+5: System Terminal
        if (e.code === "Digit5" || e.code === "Numpad5") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handleSystemTerminal();
            return true;
        }

        // Ctrl+6: Session Settings
        if (e.code === "Digit6" || e.code === "Numpad6") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handleSessionSettings();
            return true;
        }

        // Ctrl+7: Cheat Menu
        if (e.code === "Digit7" || e.code === "Numpad7") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handleCheatMenu();
            return true;
        }

        // F9: Network Menu (обрабатывается в game.ts)
        // Удалено отсюда, чтобы не конфликтовать с обработчиком в game.ts

        // Ctrl+9: World Generation Menu
        if (e.code === "Digit9" || e.code === "Numpad9") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.handleWorldGenerationMenu();
            return true;
        }

        // Ctrl+0: Physics Editor - обрабатывается в game.ts, не здесь
        // Удалено, чтобы не конфликтовать с обработчиком в game.ts

        return false;
    }

    /**
     * Обработка управления воротами гаража (G key)
     * УЛУЧШЕНО: Добавлено логирование и снижен порог для срабатывания
     */
    private handleGarageDoorToggle(): void {
        if (!this.tank || !this.tank.chassis || !this.tank.barrel || !this.chunkSystem) {
            logger.log(`[GameInput] Cannot toggle door: missing tank=${!!this.tank}, chassis=${!!this.tank?.chassis}, barrel=${!!this.tank?.barrel}, chunkSystem=${!!this.chunkSystem}`);
            return;
        }

        const playerPos = this.tank.chassis.absolutePosition;

        if (!this.chunkSystem.garageDoors || !Array.isArray(this.chunkSystem.garageDoors) || this.chunkSystem.garageDoors.length === 0) {
            logger.log(`[GameInput] No garage doors found: ${this.chunkSystem.garageDoors?.length || 0}`);
            return;
        }

        // Находим ближайший гараж
        type NearestGarageType = { doorData: any; distance: number; };
        let nearestGarage: NearestGarageType | null = null;

        for (const doorData of this.chunkSystem.garageDoors) {
            if (!doorData || !doorData.position) continue;
            const garagePos = doorData.position;
            const distance = Vector3.Distance(
                new Vector3(garagePos.x, 0, garagePos.z),
                new Vector3(playerPos.x, 0, playerPos.z)
            );

            if (nearestGarage === null || distance < nearestGarage.distance) {
                nearestGarage = { doorData, distance };
            }
        }

        // Проверяем расстояние до гаража (максимум 50 метров)
        if (nearestGarage === null || nearestGarage.distance >= 50) {
            logger.log(`[GameInput] No garage nearby (nearest: ${nearestGarage?.distance.toFixed(1) || 'N/A'}m)`);
            return;
        }

        const doorData = nearestGarage.doorData;
        logger.log(`[GameInput] Found garage at distance ${nearestGarage.distance.toFixed(1)}m`);

        // Получаем направление взгляда (башня/ствол)
        this.tank.chassis.computeWorldMatrix(true);
        this.tank.turret.computeWorldMatrix(true);
        this.tank.barrel.computeWorldMatrix(true);
        const barrelPos = this.tank.barrel.getAbsolutePosition();
        const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();

        // Raycast для определения ворот
        let hitDoor: "front" | "back" | null = null;

        if (this.scene) {
            const ray = new Ray(barrelPos, barrelDir, 100);
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                const name = mesh.name.toLowerCase();
                return name.includes("garagefrontdoor") || name.includes("garagebackdoor") ||
                    (name.includes("garage") && name.includes("door"));
            });

            if (pick && pick.hit && pick.pickedMesh) {
                const meshName = pick.pickedMesh.name.toLowerCase();
                if (meshName.includes("front")) {
                    hitDoor = "front";
                } else if (meshName.includes("back")) {
                    hitDoor = "back";
                }
                logger.log(`[GameInput] Raycast hit: ${pick.pickedMesh.name} -> ${hitDoor}`);
            }
        }

        // Fallback: проверка направления к воротам
        if (!hitDoor) {
            const garageDepth = doorData.garageDepth || 20;
            const frontDoorPos = new Vector3(doorData.position.x, barrelPos.y, doorData.position.z + garageDepth / 2);
            const backDoorPos = new Vector3(doorData.position.x, barrelPos.y, doorData.position.z - garageDepth / 2);

            const toFrontDoor = frontDoorPos.subtract(barrelPos).normalize();
            const toBackDoor = backDoorPos.subtract(barrelPos).normalize();

            const frontDot = Vector3.Dot(barrelDir, toFrontDoor);
            const backDot = Vector3.Dot(barrelDir, toBackDoor);

            logger.log(`[GameInput] Direction check: frontDot=${frontDot.toFixed(2)}, backDot=${backDot.toFixed(2)}`);

            // Более низкий порог для срабатывания (0.15 вместо 0.3)
            if (frontDot > backDot && frontDot > 0.15) {
                hitDoor = "front";
            } else if (backDot > frontDot && backDot > 0.15) {
                hitDoor = "back";
            }
        }

        // Переключаем ворота
        if (hitDoor === "front") {
            doorData.frontDoorOpen = !doorData.frontDoorOpen;
            logger.log(`[GameInput] Front door ${doorData.frontDoorOpen ? 'OPENING' : 'CLOSING'}`);
        } else if (hitDoor === "back") {
            doorData.backDoorOpen = !doorData.backDoorOpen;
            logger.log(`[GameInput] Back door ${doorData.backDoorOpen ? 'OPENING' : 'CLOSING'}`);
        } else {
            // Fallback: выбираем ближайшую ворота к игроку
            const garageDepth = doorData.garageDepth || 20;
            const frontDoorZ = doorData.position.z + garageDepth / 2;
            const backDoorZ = doorData.position.z - garageDepth / 2;
            const distToFront = Math.abs(playerPos.z - frontDoorZ);
            const distToBack = Math.abs(playerPos.z - backDoorZ);

            if (distToFront < distToBack) {
                doorData.frontDoorOpen = !doorData.frontDoorOpen;
                logger.log(`[GameInput] Fallback: Front door (closer by ${(distToBack - distToFront).toFixed(1)}m) ${doorData.frontDoorOpen ? 'OPENING' : 'CLOSING'}`);
            } else {
                doorData.backDoorOpen = !doorData.backDoorOpen;
                logger.log(`[GameInput] Fallback: Back door (closer by ${(distToFront - distToBack).toFixed(1)}m) ${doorData.backDoorOpen ? 'OPENING' : 'CLOSING'}`);
            }
        }

        // Вызываем callback если есть
        if (this.onToggleGarageDoor) {
            this.onToggleGarageDoor(doorData);
        }
    }

    /**
     * Обработка Help Menu (Ctrl+1)
     */
    private handleHelpMenu(): void {
        if (!this.helpMenu) {
            logger.log("[GameInput] Loading help menu (Ctrl+1)...");
            import("../helpMenu").then(({ HelpMenu }) => {
                this.helpMenu = new HelpMenu();
                // setGame будет вызван из Game.ts
                if (typeof this.helpMenu.toggle === 'function') {
                    this.helpMenu.toggle();
                }
                logger.log("[GameInput] Help menu loaded successfully");
            }).catch(error => {
                logger.error("[GameInput] Failed to load help menu:", error);
                if (this.hud) {
                    this.hud.showMessage("Failed to load Help Menu", "#f00", 3000);
                }
                this.helpMenu = undefined;
            });
        } else {
            if (typeof this.helpMenu.toggle === 'function') {
                this.helpMenu.toggle();
            }
        }
    }

    /**
     * Обработка Debug Dashboard (Ctrl+3)
     */
    private handleDebugDashboard(): void {
        // Будет реализовано в Game.ts, так как требует доступа к Game
        logger.log("[GameInput] Debug Dashboard requested (Ctrl+3)");
    }

    /**
     * Обработка Physics Panel (Ctrl+4)
     */
    private handlePhysicsPanel(): void {
        // Будет реализовано в Game.ts
        logger.log("[GameInput] Physics Panel requested (Ctrl+4)");
    }

    /**
     * Обработка System Terminal (Ctrl+5)
     */
    private handleSystemTerminal(): void {
        // Будет реализовано в Game.ts
        logger.log("[GameInput] System Terminal requested (Ctrl+5)");
    }

    /**
     * Обработка Session Settings (Ctrl+6)
     */
    private handleSessionSettings(): void {
        // Будет реализовано в Game.ts
        logger.log("[GameInput] Session Settings requested (Ctrl+6)");
    }

    /**
     * Обработка Cheat Menu (Ctrl+7)
     */
    private handleCheatMenu(): void {
        // Будет реализовано в Game.ts
        logger.log("[GameInput] Cheat Menu requested (Ctrl+7)");
    }

    /**
     * Обработка Network Menu (F9)
     * @deprecated Обработка перенесена в game.ts для консистентности с F7/F8
     */
    private handleNetworkMenu(): void {
        // Будет реализовано в Game.ts
        logger.log("[GameInput] Network Menu requested (F9)");
    }

    /**
     * Обработка World Generation Menu (Ctrl+9)
     */
    private handleWorldGenerationMenu(): void {
        // Будет реализовано в Game.ts
        logger.log("[GameInput] World Generation Menu requested (Ctrl+9)");
    }

    /**
     * Обработка Social Menu (Ctrl+0)
     */
    private handleSocialMenu(): void {
        // Будет реализовано в Game.ts
        logger.log("[GameInput] Social Menu requested (Ctrl+0)");
    }

    /**
     * Настройка обработки ввода камеры
     * Вызывается из setupCameraInput() в Game.ts
     */
    setupCameraInput(): void {
        window.addEventListener("keydown", (evt) => {
            this._inputMap[evt.code] = true;

            // Shift = свободный обзор (freelook)
            if (evt.code === "ShiftLeft" || evt.code === "ShiftRight") {
                this.isFreeLook = true;
            }

            // Alt = включение pointer lock
            if ((evt.code === "AltLeft" || evt.code === "AltRight") && !this.altKeyPressed) {
                if (this.gameStarted && !this.gamePaused &&
                    (!this.garage || !this.garage.isGarageOpen()) &&
                    (!this.mainMenu || !this.mainMenu.isVisible())) {
                    this.altKeyPressed = true;
                    evt.preventDefault();
                    evt.stopPropagation();
                    const canvas = this.scene?.getEngine().getRenderingCanvas() as HTMLCanvasElement;

                    if (canvas && document.pointerLockElement !== canvas) {
                        try {
                            const lockResult: any = canvas.requestPointerLock();

                            if (lockResult && typeof lockResult === 'object' && typeof lockResult.then === 'function') {
                                lockResult.then(() => {
                                    logger.log("[GameInput] Pointer lock activated via Alt key");
                                    if (this.hud) {
                                        this.hud.showMessage("🖱️ Игровой курсор включен (Alt)", "#0f0", 2000);
                                    }
                                }).catch((err: Error) => {

                                    logger.warn("[GameInput] Failed to request pointer lock on Alt:", err);
                                    if (this.hud) {
                                        this.hud.showMessage("⚠️ Не удалось включить курсор", "#f00", 2000);
                                    }
                                });
                            }
                        } catch (err) {

                            logger.warn("[GameInput] Failed to request pointer lock on Alt:", err);
                        }
                    }
                }
            }
        });
    }

    /**
     * Получить состояние клавиши
     */
    isKeyPressed(keyCode: string): boolean {
        return this._inputMap[keyCode] || false;
    }

    /**
     * Получить состояние freelook
     */
    getIsFreeLook(): boolean {
        return this.isFreeLook;
    }

    /**
     * Установить состояние прицеливания
     */
    setAiming(aiming: boolean): void {
        this.isAiming = aiming;
    }

    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        tank?: TankController;
        hud?: HUD;
        chunkSystem?: ChunkSystem;
        garage?: any;
        mainMenu?: any;
        gameStarted?: boolean;
        gamePaused?: boolean;
        isSpectating?: boolean;
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.chunkSystem !== undefined) this.chunkSystem = callbacks.chunkSystem;
        if (callbacks.garage !== undefined) this.garage = callbacks.garage;
        if (callbacks.mainMenu !== undefined) this.mainMenu = callbacks.mainMenu;
        if (callbacks.gameStarted !== undefined) this.gameStarted = callbacks.gameStarted;
        if (callbacks.gamePaused !== undefined) this.gamePaused = callbacks.gamePaused;
        if (callbacks.isSpectating !== undefined) this.isSpectating = callbacks.isSpectating;
    }

    /**
     * Dispose обработчиков ввода
     */
    dispose(): void {
        // Обработчики будут удалены автоматически при размонтировании компонента
        logger.log("[GameInput] Input handlers disposed");
    }
}

