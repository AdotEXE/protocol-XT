// ═══════════════════════════════════════════════════════════════════════════
// GAME CAMERA - Управление камерами и режимами обзора
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, ArcRotateCamera, UniversalCamera, Ray, Matrix } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { Scene } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { AimingSystem } from "../aimingSystem";
import type { PostProcessingManager } from "../effects/PostProcessingManager";
import type { Garage } from "../garage";
import { GameProjectile } from "./GameProjectile";

/**
 * Интерфейс для доступа к состоянию игры из камеры
 */
export interface GameCameraContext {
    gameStarted: boolean;
    gamePaused: boolean;
    isPaused?: boolean;
    isMultiplayer: boolean;
    garage?: Garage;
    mainMenu?: { isVisible: () => boolean };
    postProcessingManager?: PostProcessingManager;
    gameStats?: { show: () => void; hide: () => void };
    _inputMap: Record<string, boolean>;
    settings: { virtualTurretFixation?: boolean };
}

/**
 * GameCamera - Управление камерами и режимами обзора
 * 
 * Отвечает за:
 * - Обновление основной камеры
 * - Режим прицеливания
 * - Тряску камеры
 * - Настройки камеры
 * - Spectator mode (будет в GameSpectator.ts)
 */
export class GameCamera {
    // Камеры
    camera: ArcRotateCamera | undefined;
    aimCamera: UniversalCamera | undefined;

    // Настройки камеры
    cameraBeta = Math.PI / 2 - (20 * Math.PI / 180); // 20 градусов от горизонта
    targetCameraAlpha = 0;
    currentCameraAlpha = 0;
    shouldCenterCamera = false;
    centerCameraSpeed = 0.08;
    isCenteringActive = false;

    // Режим прицеливания
    isAiming = false;
    aimingTransitionProgress = 0.0;
    aimingTransitionSpeed = 0.12;

    normalRadius = 12;
    aimRadius = 6;
    normalBeta = Math.PI / 2 - (20 * Math.PI / 180);
    aimBeta = 0.25;

    // FOV settings
    normalFOV = 0.8;
    aimFOV = 0.4;

    // Mouse control for aiming (УЛУЧШЕНА ЧУВСТВИТЕЛЬНОСТЬ)
    aimMouseSensitivity = 0.0004; // УВЕЛИЧЕНО с 0.00015 для более отзывчивого управления башней
    aimMouseSensitivityVertical = 0.0015; // УВЕЛИЧЕНО с 0.00015 для быстрой вертикальной наводки
    aimMaxMouseSpeed = 25;
    aimPitchSmoothing = 0.70; // INCREASED for sensitivity sharpness (was 0.08)
    aimYawSmoothing = 0.70;   // INCREASED for sensitivity sharpness (was 0.10)
    targetAimPitch = 0;
    targetAimYaw = 0;
    isPointerLocked = false;
    aimYaw = 0;
    aimPitch = 0;

    // Zoom (ПЛАВНЫЙ ЗУМ)
    aimZoom = 0;
    targetAimZoom = 0; // Целевой зум для плавной интерполяции
    minZoom = 0;
    maxZoom = 4.0;
    zoomStep = 0.5;
    zoomSmoothSpeed = 0.12; // Скорость плавной интерполяции зума

    // Camera control
    cameraYaw = 0;
    isFreeLook = false;
    mouseSensitivity = 0.003;
    virtualTurretTarget: Vector3 | null = null;
    lastMouseControlTime = 0;
    lastChassisRotation = 0;

    // Camera shake
    private cameraShakeIntensity = 0;
    private cameraShakeDecay = 0.95;
    private cameraShakeOffset = Vector3.Zero();
    private cameraShakeTime = 0;
    private lastTurretAngle = 0; // Предыдущий угол башни для вычисления скорости вращения

    // Input handling state
    private altKeyPressed = false;
    private pointerMoveBlocked = false;

    // Cache vectors for optimization
    private _tmpCameraPos = Vector3.Zero();
    private _tmpCameraTarget = Vector3.Zero();
    private _tmpAimPos = Vector3.Zero();
    private _aimCameraStartPos: Vector3 | null = null;
    private _aimCameraStartTarget: Vector3 | null = null;

    // Collision detection
    private collisionRay: Ray = new Ray(Vector3.Zero(), Vector3.Zero(), 100);
    private currentCollisionRadius = 12; // Adjusted radius after collision
    private collisionSmoothSpeed = 0.2; // Smoothing factor for collision adjustment
    private cameraCollisionOffset = 1.5; // УВЕЛИЧЕНО: Offset от стены для более надёжного предотвращения клиппинга (было 0.5)

    // Cache for performance
    private _updateTick = 0;
    private _cachedBarrelHeight = 2.5;
    private _cachedBarrelHeightFrame = -1;
    private _cachedChassisRotY = 0;
    private _cachedChassisRotYFrame = -1;
    private _cachedTurretPos = Vector3.Zero();
    private _cachedTurretPosFrame = -1;
    private _cachedBarrelWorldDir = Vector3.Forward();
    private _cachedBarrelWorldDirFrame = -1;
    private _cachedBarrelWorldPos = Vector3.Zero();
    private _cachedBarrelWorldPosFrame = -1;

    // ОПТИМИЗАЦИЯ: Кэш для computeWorldMatrix
    private _cachedWorldMatrix: Matrix | null = null;
    private _worldMatrixCacheFrame = -1;

    // ОПТИМИЗАЦИЯ: Кэш для raycast камеры
    private _lastRaycastResult: { hit: boolean, distance: number, frame: number } | null = null;
    private _lastRaycastPos: Vector3 = Vector3.Zero();
    private _raycastCacheDistance = 0.1; // УМЕНЬШЕНО: Чаще обновляем raycast для предотвращения проникновения сквозь стены (было 0.5)

    // ОПТИМИЗАЦИЯ: Расширенный кэш позиций
    private _cachedBarrelPos: Vector3 = Vector3.Zero();
    private _cachedPositionsFrame = -1;

    // Ссылки на системы
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected aimingSystem: AimingSystem | undefined;
    protected isSpectating = false;
    protected spectatingPlayerId: string | null = null;
    protected gameProjectile: GameProjectile | undefined;
    protected gameContext: GameCameraContext | undefined;

    // Callbacks
    protected onSwitchSpectatorTarget: ((forward: boolean) => void) | null = null;
    protected getSpectatingPlayerPosition: (() => Vector3 | null) | null = null;

    /**
     * Инициализация камер
     */
    initialize(
        scene: Scene,
        tank: TankController | undefined,
        hud: HUD | undefined,
        aimingSystem: AimingSystem | undefined,
        gameProjectile?: GameProjectile
    ): void {
        this.scene = scene;
        this.tank = tank;
        this.hud = hud;
        this.aimingSystem = aimingSystem;
        this.gameProjectile = gameProjectile || new GameProjectile();

        // Создаем основную камеру
        const cameraPos = tank?.chassis?.position || new Vector3(0, 2, 0);
        this.camera = new ArcRotateCamera("camera1", -Math.PI / 2, this.cameraBeta, 12, cameraPos, scene);
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 25;
        this.camera.lowerBetaLimit = 0.1;
        this.camera.upperBetaLimit = Math.PI / 2.1;
        // ИСПРАВЛЕНИЕ: Уменьшаем near clip plane для предотвращения исчезновения мешей
        this.camera.minZ = 0.1; // Меньшее значение позволяет видеть объекты ближе к камере
        this.camera.inputs.clear();

        // Создаем камеру прицеливания
        const initialPos = tank?.chassis?.position || new Vector3(0, 2, 0);
        this.aimCamera = new UniversalCamera("aimCamera", initialPos.add(new Vector3(0, 3, -8)), scene);
        this.aimCamera.fov = this.aimFOV;
        this.aimCamera.inputs.clear();
        this.aimCamera.setEnabled(false);
        // КРИТИЧЕСКИ ВАЖНО: Устанавливаем начальную цель для предотвращения чёрного экрана
        const initialTarget = initialPos.add(new Vector3(0, 1, 10));
        this.aimCamera.setTarget(initialTarget);
        this.aimCamera.minZ = 0.1; // Минимальное расстояние до камеры

        // Устанавливаем камеру как активную
        scene.activeCamera = this.camera;

        logger.log("[GameCamera] Cameras initialized");
    }

    /**
     * Установка контекста игры для доступа к состоянию
     */
    setGameContext(context: GameCameraContext): void {
        this.gameContext = context;
    }

    /**
     * Настройка обработчиков ввода для камеры
     */
    setupCameraInput(): void {
        if (!this.scene) {
            logger.warn("[GameCamera] Cannot setup input - scene not initialized");
            return;
        }

        const ctx = this.gameContext;

        // Keydown handler
        window.addEventListener("keydown", (evt) => {
            if (ctx) ctx._inputMap[evt.code] = true;

            // SHIFT = Free look mode
            if (evt.code === "ShiftLeft" || evt.code === "ShiftRight") {
                this.isFreeLook = true;
            }

            // ALT = Pointer lock activation
            if ((evt.code === "AltLeft" || evt.code === "AltRight") && !this.altKeyPressed) {
                if (ctx && ctx.gameStarted && !ctx.isPaused &&
                    (!ctx.garage || !(ctx.garage as any).isGarageOpen?.()) &&
                    (!ctx.mainMenu || !ctx.mainMenu.isVisible())) {
                    this.altKeyPressed = true;
                    evt.preventDefault();
                    evt.stopPropagation();
                    const canvas = this.scene!.getEngine().getRenderingCanvas() as HTMLCanvasElement;
                    if (canvas && document.pointerLockElement !== canvas) {
                        try {
                            const lockResult: any = canvas.requestPointerLock();
                            if (lockResult && typeof lockResult === 'object' && typeof lockResult.then === 'function') {
                                lockResult.then(() => {
                                    logger.log("[GameCamera] Pointer lock activated via Alt key");
                                    if (this.hud) {
                                        this.hud.showMessage("🖱️ Игровой курсор включен (Alt)", "#0f0", 2000);
                                    }
                                }).catch((err: Error) => {
                                    logger.warn("[GameCamera] Failed to request pointer lock on Alt:", err);
                                });
                            }
                        } catch (err) {
                            logger.warn("[GameCamera] Failed to request pointer lock on Alt:", err);
                        }
                    }
                }
            }
        });

        // Keyup handler
        window.addEventListener("keyup", (evt) => {
            if (ctx) ctx._inputMap[evt.code] = false;

            // Release SHIFT - exit free look
            if (evt.code === "ShiftLeft" || evt.code === "ShiftRight") {
                this.isFreeLook = false;
            }

            // Release TAB - hide stats overlay
            if (evt.code === "Tab" && ctx?.gameStarted && ctx.gameStats) {
                evt.preventDefault();
                ctx.gameStats.hide();
            }

            // Release ALT - exit pointer lock
            if ((evt.code === "AltLeft" || evt.code === "AltRight") && this.altKeyPressed) {
                this.altKeyPressed = false;
                const canvas = this.scene!.getEngine().getRenderingCanvas() as HTMLCanvasElement;
                if (document.pointerLockElement === canvas) {
                    document.exitPointerLock();
                    logger.log("[GameCamera] Pointer lock deactivated via Alt key release");
                    if (this.hud) {
                        this.hud.showMessage("🖱️ Игровой курсор выключен", "#888", 1500);
                    }
                }
            }
        });

        // Mouse wheel handler
        window.addEventListener("wheel", (evt) => {
            if (!this.camera) return;

            // Spectator mode: switch targets with wheel
            if (this.isSpectating && !this.isAiming) {
                if (this.onSwitchSpectatorTarget) {
                    this.onSwitchSpectatorTarget(evt.deltaY < 0);
                }
                return;
            }

            if (this.isAiming) {
                // Smooth zoom in aiming mode
                if (evt.deltaY < 0) {
                    this.targetAimZoom = Math.min(this.maxZoom, this.targetAimZoom + this.zoomStep);
                } else {
                    this.targetAimZoom = Math.max(this.minZoom, this.targetAimZoom - this.zoomStep);
                }
                return;
            }

            if (evt.shiftKey) {
                this.cameraBeta += evt.deltaY * 0.001;
                this.cameraBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.cameraBeta));
            } else {
                this.camera.radius += evt.deltaY * 0.01;
                this.camera.radius = Math.max(5, Math.min(25, this.camera.radius));
                this.normalRadius = this.camera.radius;
            }
        });

        // Pointer lock change detection
        const canvas = this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement;
        document.addEventListener("pointerlockchange", () => {
            this.isPointerLocked = document.pointerLockElement === canvas;
            if (!this.isPointerLocked && this.isAiming) {
                this.isAiming = false;
                this.aimPitch = 0;
                this.targetAimPitch = 0;
                this.targetAimYaw = this.aimYaw;
                this.aimZoom = 0;
                this.targetAimZoom = 0;
                if (this.tank) {
                    this.tank.aimPitch = 0;
                }
                if (this.hud) {
                    this.hud.setZoomLevel(-1);
                }
            }
        });

        // Mouse move handler
        this.scene.onPointerMove = (evt) => {
            if (!this.isPointerLocked) return;
            if (ctx?.gamePaused) return;
            if (ctx?.mainMenu && ctx.mainMenu.isVisible()) return;
            if (this.pointerMoveBlocked) return;

            if (evt.movementX !== undefined) {
                let movementX = evt.movementX;
                let movementY = evt.movementY || 0;

                // Soft limit REMOVED
                // if (this.isAiming) {
                //     const maxMovement = 500;
                //     movementX = Math.max(-maxMovement, Math.min(maxMovement, movementX));
                //     movementY = Math.max(-maxMovement, Math.min(maxMovement, movementY));
                // }

                const sensitivity = this.isAiming ? this.aimMouseSensitivity : this.mouseSensitivity;
                const yawDelta = movementX * sensitivity;

                // Camera always follows mouse
                this.cameraYaw += yawDelta;

                // Normalize camera yaw
                while (this.cameraYaw > Math.PI) this.cameraYaw -= Math.PI * 2;
                while (this.cameraYaw < -Math.PI) this.cameraYaw += Math.PI * 2;

                if (this.isAiming) {
                    this.handleAimingMouseMove(movementX, movementY);
                } else if (!this.isFreeLook && this.tank?.turret && this.tank?.chassis) {
                    // Not aiming and not free look - clear virtual target
                    this.virtualTurretTarget = null;
                    this.lastMouseControlTime = 0;

                    // Cancel auto-centering on significant mouse movement
                    if (this.tank && (this.tank as any).isAutoCentering && Math.abs(evt.movementX) > 5) {
                        (this.tank as any).isAutoCentering = false;
                        window.dispatchEvent(new CustomEvent("stopCenterCamera"));
                    }
                }
            }
        };

        // Aim mode change listener
        window.addEventListener("aimModeChanged", ((e: CustomEvent) => {
            this.handleAimModeChanged(e.detail.aiming);
        }) as EventListener);

        // Center camera listener
        window.addEventListener("centerCamera", ((e: CustomEvent) => {
            this.shouldCenterCamera = true;
            if (e.detail) {
                if (e.detail.lerpSpeed) {
                    this.centerCameraSpeed = e.detail.lerpSpeed;
                }
                this.isCenteringActive = e.detail.isActive !== false;
            }
        }) as EventListener);

        // Stop center camera listener
        window.addEventListener("stopCenterCamera", (() => {
            this.shouldCenterCamera = false;
            this.isCenteringActive = false;
        }) as EventListener);

        // Sync camera yaw listener
        window.addEventListener("syncCameraYaw", ((e: CustomEvent) => {
            if (e.detail && e.detail.turretRotY !== undefined) {
                this.cameraYaw = e.detail.turretRotY;
            }
        }) as EventListener);

        logger.log("[GameCamera] Input handlers setup complete");
    }

    /**
     * Обработка движения мыши в режиме прицеливания
     */
    private handleAimingMouseMove(movementX: number, movementY: number): void {
        if (!this.tank) return;

        // Adaptive sensitivity based on zoom (RESTORED by user request)
        const zoomFactor = 1.0 / (1.0 + this.aimZoom * 0.3);
        const adaptiveSensitivity = this.aimMouseSensitivity * zoomFactor;
        const adaptiveYawDelta = movementX * adaptiveSensitivity;

        this.targetAimYaw += adaptiveYawDelta;

        // Normalize
        while (this.targetAimYaw > Math.PI) this.targetAimYaw -= Math.PI * 2;
        while (this.targetAimYaw < -Math.PI) this.targetAimYaw += Math.PI * 2;

        // Turret rotation logic is in updateAimingMode

        // Normalize aimYaw
        while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
        while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;

        // Vertical aiming (pitch)
        if (movementY !== undefined) {
            const adaptiveVerticalSensitivity = this.aimMouseSensitivityVertical * zoomFactor;
            const pitchDelta = -movementY * adaptiveVerticalSensitivity;
            let newPitch = this.targetAimPitch + pitchDelta;

            // Limit pitch angle (-10° to +5°)
            this.targetAimPitch = Math.max(-Math.PI / 18, Math.min(Math.PI / 36, newPitch));
        }

        // ИСПРАВЛЕНО: Минимальная автодоводка только для вертикальной наводки
        const pitchDiff = this.targetAimPitch - this.aimPitch;
        const minimalPitchSmoothing = 0.05; // Только 5% от разницы
        this.aimPitch += pitchDiff * minimalPitchSmoothing;
        if (this.tank) {
            this.tank.aimPitch = this.aimPitch;
        }
    }

    /**
     * Обработка изменения режима прицеливания
     */
    private handleAimModeChanged(aiming: boolean): void {
        this.isAiming = aiming;
        logger.log(`[GameCamera] Aim mode: ${this.isAiming}`);

        if (this.hud) {
            this.hud.setAimMode(this.isAiming);
        }

        // Reset exposure
        if (this.gameContext?.postProcessingManager) {
            (this.gameContext.postProcessingManager as any).resetExposure?.();
        }

        if (this.isAiming) {
            // Entering aiming mode - sync aimYaw with turret
            if (this.tank?.turret && this.tank?.chassis) {
                const chassisRotY = this.tank.chassis.rotationQuaternion
                    ? this.tank.chassis.rotationQuaternion.toEulerAngles().y
                    : this.tank.chassis.rotation.y;
                const turretRotY = this.tank.turret.rotation.y;
                const totalRotY = chassisRotY + turretRotY;

                this.aimYaw = totalRotY;
                this.targetAimYaw = totalRotY;

                let normalizedTurretRotY = turretRotY;
                while (normalizedTurretRotY > Math.PI) normalizedTurretRotY -= Math.PI * 2;
                while (normalizedTurretRotY < -Math.PI) normalizedTurretRotY += Math.PI * 2;
                this.cameraYaw = normalizedTurretRotY;
            }
            this.aimPitch = 0;
            this.targetAimPitch = 0;
        } else {
            // Exiting aiming mode
            // this.aimPitch = 0; // СОХРАНЯЕМ угол наклона ствола по просьбе игрока
            // this.targetAimPitch = 0; // СОХРАНЯЕМ угол наклона ствола
            this.targetAimYaw = this.aimYaw;
            this.aimZoom = 0;
            this.targetAimZoom = 0;

            // Normalize turret angle
            if (this.tank?.turret) {
                let turretY = this.tank.turret.rotation.y;
                while (turretY > Math.PI) turretY -= Math.PI * 2;
                while (turretY < -Math.PI) turretY += Math.PI * 2;
                this.tank.turret.rotation.y = turretY;
            }

            // Sync cameraYaw with turret direction
            if (this.tank?.turret && this.tank?.chassis) {
                const chassisRotY = this.tank.chassis.rotationQuaternion
                    ? this.tank.chassis.rotationQuaternion.toEulerAngles().y
                    : this.tank.chassis.rotation.y;
                const turretRotY = this.tank.turret.rotation.y;
                let normalizedTurretRotY = turretRotY;
                while (normalizedTurretRotY > Math.PI) normalizedTurretRotY -= Math.PI * 2;
                while (normalizedTurretRotY < -Math.PI) normalizedTurretRotY += Math.PI * 2;
                this.cameraYaw = normalizedTurretRotY;

                let totalAngle = chassisRotY + turretRotY;
                while (totalAngle > Math.PI) totalAngle -= Math.PI * 2;
                while (totalAngle < -Math.PI) totalAngle += Math.PI * 2;
                this.aimYaw = totalAngle;
            }

            if (this.tank) {
                // this.tank.aimPitch = 0; // НЕ сбрасываем угол наклона ствола
                // Обновляем aimPitch танка текущим значением камеры, чтобы убедиться в синхронизации
                this.tank.aimPitch = this.aimPitch;
            }

            if (this.hud) {
                this.hud.setZoomLevel(-1);
            }
        }
    }

    /**
     * Увеличить счетчик кадра (для кэширования)
     */
    incrementUpdateTick(): void {
        this._updateTick++;
    }

    /**
     * Получить текущий tick обновления
     */
    getUpdateTick(): number {
        return this._updateTick;
    }

    /**
     * Заблокировать обработку движения мыши
     */
    setPointerMoveBlocked(blocked: boolean): void {
        this.pointerMoveBlocked = blocked;
    }

    /**
     * Обновление камеры (вызывается каждый кадр)
     */
    updateCamera(): void {
        if (!this.camera || !this.scene) return;

        // Spectator mode - будет обрабатываться в GameSpectator.ts
        if (this.isSpectating) {
            this.updateSpectatorCamera();
            return;
        }

        if (!this.tank || !this.tank.chassis) return;

        // ОПТИМИЗАЦИЯ: Используем кэшированную позицию танка
        const tankPos = this.tank.getCachedChassisPosition ? this.tank.getCachedChassisPosition() : this.tank.chassis.absolutePosition;

        // Обновляем тряску камеры
        this.updateCameraShake();

        // ОПТИМИЗАЦИЯ: Обновляем Motion Blur в зависимости от скорости танка
        // Motion Blur включается только при 80%+ скорости для производительности
        if (this.gameContext?.postProcessingManager && typeof (this.tank as any).getSpeed === 'function') {
            const speed = Math.abs((this.tank as any).getSpeed());
            const maxSpeed = (this.tank as any).moveSpeed || 24;
            const speedRatio = speed / maxSpeed;
            (this.gameContext.postProcessingManager as any).updateMotionBlurBySpeed?.(speedRatio);
        }

        // Применяем тряску к позиции камеры
        const shakeOffset = this.cameraShakeOffset;
        const targetPos = tankPos.add(shakeOffset);

        // Плавное центрирование камеры
        if (this.shouldCenterCamera) {
            this.currentCameraAlpha = this.currentCameraAlpha +
                (this.targetCameraAlpha - this.currentCameraAlpha) * this.centerCameraSpeed;

            // Проверяем, достигли ли мы цели
            const diff = Math.abs(this.targetCameraAlpha - this.currentCameraAlpha);
            if (diff < 0.01) {
                this.currentCameraAlpha = this.targetCameraAlpha;
                this.shouldCenterCamera = false;
                this.isCenteringActive = false;
            } else {
                this.isCenteringActive = true;
            }
        }

        // Обновляем позицию и угол камеры
        this.camera.setTarget(targetPos);
        this.camera.alpha = this.currentCameraAlpha;
        this.camera.beta = this.cameraBeta;

        // ОПТИМИЗАЦИЯ: Расширенное кэширование позиций башни и ствола
        if (this._updateTick !== this._cachedPositionsFrame && this.tank) {
            if (this.tank.turret && !this.tank.turret.isDisposed()) {
                this._cachedTurretPos.copyFrom(this.tank.turret.absolutePosition);
            }
            if (this.tank.barrel && !this.tank.barrel.isDisposed()) {
                this._cachedBarrelPos.copyFrom(this.tank.barrel.absolutePosition);
            }
            this._cachedPositionsFrame = this._updateTick;
        }

        // Режим прицеливания
        if (this.isAiming) {
            this.updateAimingMode();
        } else {
            this.updateNormalMode();
        }

        // --- CAMERA COLLISION LOGIC ---
        // Apply collision detection AFTER setting initial target/alpha/beta/radius
        // but BEFORE rendering mechanism uses it (ArcRotateCamera updates on frame render)

        // 1. Determine the "ideal" target position (tank center + shake)
        // This is already 'targetPos' calculated above.

        // 2. Determine ideal direction from Target to Camera
        // We can calculate this from alpha/beta
        const cameraDirection = new Vector3(
            Math.cos(this.camera.alpha) * Math.cos(this.camera.beta),
            Math.sin(this.camera.beta),
            Math.sin(this.camera.alpha) * Math.cos(this.camera.beta)
        );

        // 3. Cast ray from Target towards Camera
        const origin = targetPos; // Start from tank

        // Direction is simple: from target to camera. 
        // But ArcRotateCamera coordinates are spherical. 
        // Let's use the camera's computed position from the previous frame or compute it manually.
        // Better: Use the math to find direction vector based on Alpha/Beta.
        // Actually, ArcRotateCamera.position is automatically updated based on alpha/beta/radius.
        // But we want to check collision BEFORE setting the final radius.

        // Let's use the INTENDED radius (this.normalRadius or this.aimRadius interpolated)
        // 'this.camera.radius' currently holds the smoothed "requested" radius from updateNormalMode/updateAimingMode
        const requestedRadius = this.camera.radius;

        // Calculate direction vector manually to be safe or use camera.position.subtract(targetPos).normalize() if reliable.
        // Using Alpha/Beta is more robust as it doesn't depend on previous frame's collision:
        // Alpha is rotation around Y (horizontal), Beta is rotation around X (vertical)
        // Careful with Babylon coordinates: 
        // X = radius * cos(alpha) * cos(beta)
        // Y = radius * sin(beta)
        // Z = radius * sin(alpha) * cos(beta)
        // ...Wait, Babylon's ArcRotateCamera formulas are:
        // x = radius * cos(alpha) * cos(beta)
        // y = radius * sin(beta)
        // z = radius * sin(alpha) * cos(beta)
        // (Assuming Y is up, but actually Beta is angle from UP usually in Babylon? 
        // No, in Babylon Beta is 0 at top, PI at bottom. Alpha is longitude.

        // ОПТИМИЗАЦИЯ: Кэширование computeWorldMatrix
        if (this._updateTick !== this._worldMatrixCacheFrame) {
            this.camera.computeWorldMatrix();
            this._cachedWorldMatrix = this.camera.getWorldMatrix();
            this._worldMatrixCacheFrame = this._updateTick;
        }

        // Correct vector calculation for Babylon ArcRotateCamera (Y-up):
        // x = r * sin(beta) * cos(alpha)
        // z = r * sin(beta) * sin(alpha)
        // y = r * cos(beta)
        const direction = new Vector3(
            Math.sin(this.camera.beta) * Math.cos(this.camera.alpha),
            Math.cos(this.camera.beta),
            Math.sin(this.camera.beta) * Math.sin(this.camera.alpha)
        );

        // ОПТИМИЗАЦИЯ: Кэширование raycast
        const minDistance = this.isAiming ? 2.5 : 4.0; // УВЕЛИЧЕНО: Минимальная дистанция для предотвращения клиппинга
        let finalRadius = requestedRadius;

        // Вычисляем текущую позицию камеры для проверки движения
        const currentCameraPos = new Vector3(
            targetPos.x + requestedRadius * Math.sin(this.camera.beta) * Math.cos(this.camera.alpha),
            targetPos.y + requestedRadius * Math.cos(this.camera.beta),
            targetPos.z + requestedRadius * Math.sin(this.camera.beta) * Math.sin(this.camera.alpha)
        );

        const cameraMoved = currentCameraPos.subtract(this._lastRaycastPos).lengthSquared() >
            this._raycastCacheDistance * this._raycastCacheDistance;

        if (!cameraMoved && this._lastRaycastResult &&
            this._lastRaycastResult.frame === this._updateTick - 1) {
            // Использовать кэшированный результат
            if (this._lastRaycastResult.hit && this._lastRaycastResult.distance < requestedRadius) {
                let limit = this._lastRaycastResult.distance - this.cameraCollisionOffset;
                if (limit < minDistance) limit = minDistance;
                finalRadius = limit;
            }
        } else {
            // Выполнить новый raycast
            this.collisionRay.origin = origin;
            this.collisionRay.direction = direction;
            this.collisionRay.length = requestedRadius + 1;

            const hit = this.scene.pickWithRay(this.collisionRay, (mesh) => this.cameraCollisionMeshFilter(mesh));

            // Сохранить результат в кэш
            this._lastRaycastResult = {
                hit: hit?.hit || false,
                distance: hit?.distance || requestedRadius,
                frame: this._updateTick
            };
            this._lastRaycastPos.copyFrom(currentCameraPos);

            if (hit && hit.hit && hit.distance < requestedRadius) {
                let limit = hit.distance - this.cameraCollisionOffset;
                if (limit < minDistance) limit = minDistance;
                finalRadius = limit;
            }

            // УЛУЧШЕНИЕ: Дополнительные лучи для предотвращения прохождения через углы
            // Создаём 4 дополнительных луча смещённых от центра
            const offsetDistance = 0.5; // Смещение боковых лучей
            const offsets = [
                new Vector3(offsetDistance, 0, 0),
                new Vector3(-offsetDistance, 0, 0),
                new Vector3(0, offsetDistance, 0),
                new Vector3(0, -offsetDistance, 0)
            ];

            for (const offset of offsets) {
                const offsetOrigin = origin.add(offset);
                const offsetRay = new Ray(offsetOrigin, direction, requestedRadius + 1);
                const offsetHit = this.scene.pickWithRay(offsetRay, (mesh) => this.cameraCollisionMeshFilter(mesh));

                if (offsetHit && offsetHit.hit && offsetHit.distance < finalRadius) {
                    let offsetLimit = offsetHit.distance - this.cameraCollisionOffset;
                    if (offsetLimit < minDistance) offsetLimit = minDistance;
                    if (offsetLimit < finalRadius) {
                        finalRadius = offsetLimit;
                    }
                }
            }
        }

        // Применяем сглаживание для плавного изменения радиуса
        // КРИТИЧНО: Быстрое сглаживание (0.95) для мгновенной реакции на коллизии
        const smoothingFactor = this.isAiming ? 0.98 : 0.95; // УВЕЛИЧЕНО с 0.9/0.7 для предотвращения проникновения

        // КРИТИЧНО: Если камера вот-вот проникнет сквозь объект (finalRadius сильно меньше текущего),
        // применяем МГНОВЕННОЕ ограничение без сглаживания!
        const radiusDifference = this.currentCollisionRadius - finalRadius;
        if (radiusDifference > 0.5) {
            // Камера вот-вот пролетит сквозь объект - мгновенно ограничиваем радиус
            this.currentCollisionRadius = finalRadius;
        } else {
            // Плавное сглаживание для комфортного движения
            this.currentCollisionRadius = this.currentCollisionRadius + (finalRadius - this.currentCollisionRadius) * smoothingFactor;
        }

        // Дополнительная защита: никогда не позволяем радиусу быть больше расчётного
        if (this.currentCollisionRadius > finalRadius) {
            this.currentCollisionRadius = finalRadius;
        }

        // Apply to camera (используем сглаженное значение)
        this.camera.radius = this.currentCollisionRadius;
    }

    /**
     * Обновление обычного режима камеры
     */
    private updateNormalMode(): void {
        if (!this.camera) return;

        // Плавно возвращаемся к обычному режиму
        this.aimingTransitionProgress = Math.max(0.0, this.aimingTransitionProgress - this.aimingTransitionSpeed);

        // Интерполируем радиус
        const targetRadius = this.normalRadius;
        this.camera.radius = this.camera.radius + (targetRadius - this.camera.radius) * 0.1;

        // Интерполируем beta
        const targetBeta = this.normalBeta;
        this.cameraBeta = this.cameraBeta + (targetBeta - this.cameraBeta) * 0.1;
        this.camera.beta = this.cameraBeta;
    }

    /**
     * Обновление режима прицеливания
     * УЛУЧШЕНО: Плавная интерполяция прицеливания и зума
     */
    private updateAimingMode(): void {
        if (!this.camera || !this.tank) return;

        // Плавно переходим в режим прицеливания
        this.aimingTransitionProgress = Math.min(1.0, this.aimingTransitionProgress + this.aimingTransitionSpeed);

        // ИСПРАВЛЕНО: Убрана автодоводка для горизонтальной наводки - мгновенная реакция
        this.aimYaw = this.targetAimYaw;

        // Нормализуем aimYaw
        while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
        while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;

        // ИСПРАВЛЕНО: Минимальная автодоводка только для вертикальной наводки
        const pitchDiff = this.targetAimPitch - this.aimPitch;
        // Минимальное сглаживание: только 5% от разницы
        const minimalPitchSmoothing = 0.05;
        this.aimPitch += pitchDiff * minimalPitchSmoothing;

        // Синхронизируем aimPitch с танком для стрельбы
        this.tank.aimPitch = this.aimPitch;


        // TURRET ROTATION LOGIC (Moved from MouseMove)
        // Turret smoothly rotates towards the aimYaw (where camera is looking)
        if (this.tank && (this.tank as any).isAlive && this.tank.turret) {
            // Target is aimYaw (camera direction)
            // Current is turret.rotation.y
            const currentRotation = this.tank.turret.rotation.y;
            const targetRotation = this.aimYaw;

            // Calculate shortest path
            let diff = targetRotation - currentRotation;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            // Apply smooth LERP rotation (MAXIMUM SMOOTHNESS)
            // Using a factor relative to turret speed for consistent feel
            // The factor determines how fast it catches up (0.1 = slow/smooth, 0.3 = fast)
            const turretSpeed = (this.tank as any).turretSpeed || 0.04;
            const lerpFactor = Math.min(1.0, turretSpeed * 3.5); // Derived from speed

            // If very close, just snap to avoid micro-jitter
            if (Math.abs(diff) < 0.0005) {
                this.tank.turret.rotation.y = targetRotation;
            } else {
                // Classic Lerp: current + (target - current) * factor
                // We apply it to the difference to handle wrapping correctly
                this.tank.turret.rotation.y += diff * lerpFactor;
            }

            // Keep normalized
            while (this.tank.turret.rotation.y > Math.PI) this.tank.turret.rotation.y -= Math.PI * 2;
            while (this.tank.turret.rotation.y < -Math.PI) this.tank.turret.rotation.y += Math.PI * 2;
        }

        // НОВОЕ: Плавная интерполяция зума
        const zoomDiff = this.targetAimZoom - this.aimZoom;
        this.aimZoom += zoomDiff * this.zoomSmoothSpeed;

        // Обновляем HUD с текущим зумом при изменении
        if (this.hud && Math.abs(zoomDiff) > 0.01) {
            this.hud.setZoomLevel(this.aimZoom);
        }

        // Обновляем индикатор дальности в HUD
        if (this.hud && this.tank.barrel) {
            const barrelHeight = this.tank.barrel.getAbsolutePosition().y;
            const projectileSpeed = this.tank.projectileSpeed;
            const range = this.gameProjectile?.calculateProjectileRange(this.aimPitch, projectileSpeed, barrelHeight) ?? 0;
            // HUD updateAimRange method is optional
            if (typeof (this.hud as any).updateAimRange === 'function') {
                (this.hud as any).updateAimRange(range);
            }
        }

        // Интерполируем радиус и beta для режима прицеливания
        const targetRadius = this.aimRadius;
        this.camera.radius = this.camera.radius + (targetRadius - this.camera.radius) * 0.1;

        const targetBeta = this.aimBeta;
        this.cameraBeta = this.cameraBeta + (targetBeta - this.cameraBeta) * 0.1;
        this.camera.beta = this.cameraBeta;

        // Применяем плавный зум к FOV
        if (this.aimZoom > 0 && this.aimCamera) {
            const zoomFOV = this.aimFOV / (1 + this.aimZoom);
            this.aimCamera.fov = zoomFOV;
        }
    }

    /**
     * Обновление камеры в режиме наблюдателя
     */
    private updateSpectatorCamera(): void {
        if (!this.camera) return;

        if (this.spectatingPlayerId) {
            // Следуем за конкретным игроком
            if (this.getSpectatingPlayerPosition) {
                const targetPos = this.getSpectatingPlayerPosition();
                if (targetPos) {
                    this.camera.setTarget(targetPos);
                    // Другие параметры будут установлены из GameSpectator.ts
                }
            }
        }
    }

    /**
     * Обновление тряски камеры
     * ОПТИМИЗИРОВАНО: Тряска только при ОЧЕНЬ быстром движении танка (80%+ скорости)
     * Тряска от вращения башни ОТКЛЮЧЕНА для комфорта игрока
     */
    private updateCameraShake(): void {
        if (this.cameraShakeIntensity > 0.01) {
            this.cameraShakeTime += 0.1;
            // УМЕНЬШЕНО: Базовая интенсивность минимальная для мягкого эффекта
            let baseIntensity = this.cameraShakeIntensity * 0.012;

            // Тряска зависит ТОЛЬКО от скорости танка (башня отключена)
            let tankSpeedFactor = 0; // Начинаем с 0 - нет тряски при остановке

            if (this.tank && typeof (this.tank as any).getSpeed === 'function') {
                // Фактор скорости движения танка
                const speed = Math.abs((this.tank as any).getSpeed());
                const maxSpeed = (this.tank as any).moveSpeed || 24;
                const speedRatio = speed / maxSpeed;
                // ИЗМЕНЕНО: Тряска только при 80%+ от максимальной скорости
                const minThreshold = 0.80;

                if (speedRatio < minThreshold) {
                    tankSpeedFactor = 0; // Нет тряски при обычном движении
                } else {
                    // Нормализуем от 0 до 1 после порога (80% -> 0, 100% -> 1)
                    const normalizedSpeed = (speedRatio - minThreshold) / (1 - minThreshold);
                    // Квадратичная кривая для плавного нарастания
                    tankSpeedFactor = normalizedSpeed * normalizedSpeed;
                }
            }

            // ОТКЛЮЧЕНО: Тряска от вращения башни убрана для комфорта игрока
            // Обновляем lastTurretAngle для корректной работы, но не используем для тряски
            if (this.tank && this.tank.turret && !this.tank.turret.isDisposed()) {
                this.lastTurretAngle = this.tank.turret.rotation.y;
            }

            // Используем только фактор скорости танка
            baseIntensity *= tankSpeedFactor;

            const shakeX = (Math.random() - 0.5) * baseIntensity;
            const shakeY = (Math.random() - 0.5) * baseIntensity;
            const shakeZ = (Math.random() - 0.5) * baseIntensity;

            this.cameraShakeOffset = new Vector3(shakeX, shakeY, shakeZ);
            this.cameraShakeIntensity *= this.cameraShakeDecay;
        } else {
            this.cameraShakeIntensity = 0;
            this.cameraShakeOffset = Vector3.Zero();
            // Сбрасываем угол башни при отсутствии тряски
            if (this.tank && this.tank.turret && !this.tank.turret.isDisposed()) {
                this.lastTurretAngle = this.tank.turret.rotation.y;
            }
        }
    }

    /**
     * Добавить тряску камеры
     */
    addCameraShake(intensity: number, _duration: number = 0.3): void {
        this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
    }

    /**
     * Фильтр мешей для raycast коллизий камеры
     * Возвращает true если меш должен блокировать камеру
     * УЛУЧШЕНО: Включает все объекты карты (здания, деревья, камни из редактора)
     */
    private cameraCollisionMeshFilter(mesh: any): boolean {
        if (!mesh || !mesh.isEnabled() || !mesh.isVisible) return false;

        // Игнорируем части танка игрока
        if (mesh === this.tank?.chassis ||
            mesh === this.tank?.turret ||
            mesh === this.tank?.barrel) {
            return false;
        }

        // Игнорируем дочерние элементы танка
        if (mesh.parent === this.tank?.chassis ||
            mesh.parent === this.tank?.turret ||
            mesh.parent === this.tank?.barrel) {
            return false;
        }

        // Игнорируем вражеские танки и сетевых игроков
        if (mesh.metadata) {
            if (mesh.metadata.type === "enemyTank" ||
                mesh.metadata.type === "networkPlayer" ||
                mesh.metadata.type === "playerTank") {
                return false;
            }
        }

        const name = mesh.name.toLowerCase();

        // ВАЖНО: Террейн и земля должны блокировать камеру даже если isPickable = false
        // Это критично для предотвращения "проваливания" камеры в горы/землю
        const isTerrain = name.startsWith("ground_") ||
            name.includes("terrain") ||
            name.includes("mountain") ||
            name.includes("hill") ||
            name.startsWith("chunk_") ||
            name.includes("platform") ||
            name.includes("ramp") ||
            name.includes("ruin") ||
            name.includes("sand") ||
            name.includes("dirt") ||
            name.includes("grass");

        // Структуры: стены гаража, здания, объекты карты
        const isStructure = name.startsWith("garage") ||
            name.includes("wall") ||
            name.includes("building") ||
            name.includes("floor") ||
            name.includes("roof") ||
            name.includes("door") ||
            name.includes("perimeter") ||
            name.includes("cover") ||
            name.includes("fence") ||
            name.includes("barrier");

        // Объекты из редактора карт (здания, деревья, камни)
        const isMapObject = name.includes("mapeditor") ||
            name.includes("placedobject") ||
            (mesh.metadata && (
                mesh.metadata.mapEditorObject === true ||
                mesh.metadata.objectType === "building" ||
                mesh.metadata.objectType === "tree" ||
                mesh.metadata.objectType === "rock" ||
                mesh.metadata.objectType === "spawn" ||
                mesh.metadata.objectType === "garage" ||
                mesh.metadata.objectType === "custom"
            ));

        // Если это террейн, структура или объект карты - блокируем камеру независимо от isPickable
        if (isTerrain || isStructure || isMapObject) {
            // Но игнорируем прозрачные (visibility < 0.3 для ворот гаража которые 0.5)
            if (mesh.visibility !== undefined && mesh.visibility < 0.3) return false;
            return true;
        }

        // Проверяем метаданные для объектов карты
        const meta = mesh.metadata;
        if (meta) {
            // Игнорируем пули, расходники, танки
            if (meta.type === "bullet" ||
                meta.type === "consumable" ||
                meta.type === "playerTank" ||
                meta.type === "enemyTank" ||
                meta.type === "networkPlayer") {
                return false;
            }

            // Блокируем объекты карты (даже если они не в имени)
            if (meta.mapEditorObject === true ||
                meta.objectType === "building" ||
                meta.objectType === "tree" ||
                meta.objectType === "rock" ||
                meta.objectType === "custom") {
                // Но игнорируем прозрачные
                if (mesh.visibility !== undefined && mesh.visibility < 0.3) return false;
                return true;
            }
        }

        // Для остальных объектов проверяем isPickable
        if (!mesh.isPickable) return false;

        // Игнорируем прозрачные объекты
        if (mesh.visibility !== undefined && mesh.visibility < 0.5) return false;

        // Игнорируем эффекты, частицы и другие невидимые объекты
        if (name.includes("particle") || name.includes("effect") ||
            name.includes("trail") || name.includes("bullet") ||
            name.includes("projectile") || name.includes("muzzle") ||
            name.includes("explosion") || name.includes("spark") ||
            name.includes("smoke") || name.includes("fire") ||
            name.includes("billboard") || name.includes("hp") ||
            name.includes("label") || name.includes("indicator") ||
            name.includes("debug") || name.includes("gizmo") ||
            name.includes("trigger") || name.includes("checkpoint") ||
            name.includes("skybox") || name.includes("sky")) {
            return false;
        }

        // Все остальные объекты блокируют камеру
        return true;
    }

    /**
     * Предотвращение захода камеры за текстуры/стены
     * УЛУЧШЕНО: Корректная работа с ArcRotateCamera через изменение radius
     * Работает как в обычном режиме, так и в режиме прицеливания
     */
    adjustCameraForCollision(aimingTransitionProgress: number): void {
        if (!this.camera || !this.tank || !this.tank.chassis || !this.scene) return;

        const t = aimingTransitionProgress || 0;
        const tankPos = this.tank.chassis.getAbsolutePosition();

        // Точка от которой стреляем луч (выше танка)
        const rayOrigin = tankPos.add(new Vector3(0, 1.5, 0));

        // Получаем текущую позицию камеры
        const cameraPos = this.camera.position.clone();

        // Направление от танка к камере
        const direction = cameraPos.subtract(rayOrigin);
        const currentDistance = direction.length();

        // Если расстояние слишком маленькое, пропускаем
        if (currentDistance < 0.5) return;

        const directionNormalized = direction.normalize();

        // Параметры зависят от режима
        const isAiming = t > 0.01;
        const minDistance = isAiming ? 1.5 : 3.0;
        const wallBuffer = isAiming ? 1.0 : 1.5; // УВЕЛИЧЕНЫ буферы для предотвращения прохождения сквозь объекты (было 0.5 и 1.0)
        const reactionSpeed = isAiming ? 0.98 : 0.9; // УВЕЛИЧЕНА скорость реакции для более быстрого предотвращения коллизий (было 0.95 и 0.85)
        const returnSpeed = isAiming ? 0.1 : 0.05; // Скорость возвращения к нормальному радиусу

        // ИСПРАВЛЕНО: Проверяем коллизию с несколькими лучами для надежности
        // Используем несколько лучей в небольшом конусе для более точного определения коллизий
        const rayCount = 5; // Количество лучей для проверки
        let minHitDistance = currentDistance;
        let hasCollision = false;

        for (let i = 0; i < rayCount; i++) {
            // Создаем небольшой конус лучей вокруг основного направления
            const angle = (i - (rayCount - 1) / 2) * 0.1; // Небольшой угол отклонения
            const right = Vector3.Cross(directionNormalized, Vector3.Up()).normalize();
            const up = Vector3.Cross(right, directionNormalized).normalize();
            const offset = right.scale(Math.sin(angle)).add(up.scale(Math.cos(angle) - 1));
            const rayDir = directionNormalized.add(offset).normalize();

            const ray = new Ray(rayOrigin, rayDir, currentDistance + 2);
            const hit = this.scene.pickWithRay(ray, (mesh) => this.cameraCollisionMeshFilter(mesh));

            if (hit && hit.hit && hit.distance !== null && hit.distance < minHitDistance) {
                minHitDistance = hit.distance;
                hasCollision = true;
            }
        }

        if (hasCollision && minHitDistance < currentDistance) {
            // Есть коллизия - вычисляем безопасный радиус с увеличенным буфером
            const safeDistance = Math.max(minDistance, minHitDistance - wallBuffer);

            // ИСПРАВЛЕНО: Корректно работаем с ArcRotateCamera через radius
            const targetRadius = safeDistance;
            this.camera.radius = this.camera.radius + (targetRadius - this.camera.radius) * reactionSpeed;

            // Ограничиваем минимальный радиус
            if (this.camera.radius < minDistance) {
                this.camera.radius = minDistance;
            }

            // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Если камера все еще слишком близко, принудительно отодвигаем
            const actualDistance = Vector3.Distance(rayOrigin, this.camera.position);
            if (actualDistance < safeDistance) {
                this.camera.radius = safeDistance;
            }
        } else if (!isAiming) {
            // Нет коллизии и не в режиме прицеливания - плавно возвращаем камеру к нормальному радиусу
            const targetRadius = this.normalRadius;
            this.camera.radius = this.camera.radius + (targetRadius - this.camera.radius) * returnSpeed;
        }
        // В режиме прицеливания радиус управляется из updateAimingMode, не трогаем его здесь
    }

    /**
     * Проверка коллизий камеры в режиме прицеливания
     * УЛУЧШЕНО: Использует улучшенный фильтр мешей для всех объектов карты
     * Вызывается из updateAimingMode и game.ts
     */
    checkAimingCameraCollision(targetCamPos: Vector3): Vector3 {
        if (!this.scene || !this.tank || !this.tank.chassis) return targetCamPos;

        // ОПТИМИЗАЦИЯ: Используем кэшированную позицию танка
        const tankPos = this.tank.getCachedChassisPosition ? this.tank.getCachedChassisPosition() : this.tank.chassis.absolutePosition;
        const rayOrigin = tankPos.add(new Vector3(0, 1.5, 0)); // Start slightly above tank center

        // Направление от танка к целевой позиции камеры
        const direction = targetCamPos.subtract(rayOrigin);
        const targetDistance = direction.length();

        // Если расстояние слишком маленькое, пропускаем
        if (targetDistance < 0.5) return targetCamPos;

        const directionNormalized = direction.normalize();

        const minDistance = 1.5;
        const wallBuffer = 1.2; // УВЕЛИЧЕН буфер для предотвращения прохождения сквозь объекты (было 0.8)

        // ИСПРАВЛЕНО: Проверяем коллизию с увеличенным диапазоном для надежности
        const ray = new Ray(rayOrigin, directionNormalized, targetDistance + 2);
        const hit = this.scene.pickWithRay(ray, (mesh) => this.cameraCollisionMeshFilter(mesh));

        if (hit && hit.hit && hit.distance !== null && hit.distance < targetDistance) {
            // Есть коллизия - возвращаем безопасную позицию с увеличенным буфером
            const safeDistance = Math.max(minDistance, hit.distance - wallBuffer);
            const safePos = rayOrigin.add(directionNormalized.scale(safeDistance));

            // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Проверяем еще раз с новой позиции
            const checkRay = new Ray(rayOrigin, directionNormalized, safeDistance + 1);
            const checkHit = this.scene.pickWithRay(checkRay, (mesh) => this.cameraCollisionMeshFilter(mesh));

            if (checkHit && checkHit.hit && checkHit.distance !== null && checkHit.distance < safeDistance) {
                // Если все еще есть коллизия, отодвигаем еще дальше
                const extraSafeDistance = Math.max(minDistance, checkHit.distance - wallBuffer);
                return rayOrigin.add(directionNormalized.scale(extraSafeDistance));
            }

            return safePos;
        }

        return targetCamPos;
    }

    /**
     * Получить смещение от тряски камеры
     */
    getCameraShakeOffset(): Vector3 {
        return this.cameraShakeOffset.clone();
    }

    /**
     * Получить интенсивность тряски
     */
    getCameraShakeIntensity(): number {
        return this.cameraShakeIntensity;
    }

    /**
     * Установить режим прицеливания
     */
    setAiming(aiming: boolean): void {
        this.isAiming = aiming;
        if (!aiming) {
            // Сбрасываем параметры при выходе из режима прицеливания
            this.aimPitch = 0;
            this.targetAimPitch = 0;
            this.targetAimYaw = this.aimYaw;
            this.aimZoom = 0;
            if (this.tank) {
                this.tank.aimPitch = 0;
            }
            if (this.hud) {
                this.hud.setZoomLevel(-1);
            }
        }
    }

    /**
     * Обновить зум в режиме прицеливания
     */
    updateZoom(delta: number): void {
        if (!this.isAiming) return;

        this.aimZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.aimZoom + delta * this.zoomStep));

        if (this.hud) {
            this.hud.setZoomLevel(this.aimZoom);
        }
    }

    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        tank?: TankController;
        hud?: HUD;
        aimingSystem?: AimingSystem;
        isSpectating?: boolean;
        spectatingPlayerId?: string | null;
        onSwitchSpectatorTarget?: (forward: boolean) => void;
        getSpectatingPlayerPosition?: () => Vector3 | null;
        camera?: ArcRotateCamera;
        aimCamera?: UniversalCamera;
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.aimingSystem !== undefined) this.aimingSystem = callbacks.aimingSystem;
        if (callbacks.isSpectating !== undefined) this.isSpectating = callbacks.isSpectating;
        if (callbacks.spectatingPlayerId !== undefined) this.spectatingPlayerId = callbacks.spectatingPlayerId;
        if (callbacks.onSwitchSpectatorTarget !== undefined) this.onSwitchSpectatorTarget = callbacks.onSwitchSpectatorTarget;
        if (callbacks.getSpectatingPlayerPosition !== undefined) this.getSpectatingPlayerPosition = callbacks.getSpectatingPlayerPosition;
        if (callbacks.camera !== undefined) this.camera = callbacks.camera;
        if (callbacks.aimCamera !== undefined) this.aimCamera = callbacks.aimCamera;
    }

    /**
     * Установить внешние ссылки на камеры (когда камеры созданы в game.ts)
     */
    setExternalCameras(camera: ArcRotateCamera, aimCamera: UniversalCamera, scene: Scene): void {
        this.camera = camera;
        this.aimCamera = aimCamera;
        this.scene = scene;
        logger.log("[GameCamera] External cameras set");
    }

    /**
     * Dispose камер
     */
    dispose(): void {
        if (this.camera) {
            this.camera.dispose();
        }
        if (this.aimCamera) {
            this.aimCamera.dispose();
        }
        logger.log("[GameCamera] Cameras disposed");
    }
}

