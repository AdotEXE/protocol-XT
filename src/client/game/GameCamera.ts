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
    
    // Mouse control for aiming (УЛУЧШЕНА ПЛАВНОСТЬ)
    aimMouseSensitivity = 0.00015;
    aimMouseSensitivityVertical = 0.00015;
    aimMaxMouseSpeed = 25;
    aimPitchSmoothing = 0.08; // УМЕНЬШЕНО с 0.12 для более плавного прицеливания
    aimYawSmoothing = 0.10;   // УМЕНЬШЕНО с 0.18 для более плавного прицеливания
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
                
                // Soft limit for extreme values
                if (this.isAiming) {
                    const maxMovement = 500;
                    movementX = Math.max(-maxMovement, Math.min(maxMovement, movementX));
                    movementY = Math.max(-maxMovement, Math.min(maxMovement, movementY));
                }
                
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
        
        // Adaptive sensitivity based on zoom
        const zoomFactor = 1.0 / (1.0 + this.aimZoom * 0.3);
        const adaptiveSensitivity = this.aimMouseSensitivity * zoomFactor;
        const adaptiveYawDelta = movementX * adaptiveSensitivity;
        
        this.targetAimYaw += adaptiveYawDelta;
        
        // Normalize
        while (this.targetAimYaw > Math.PI) this.targetAimYaw -= Math.PI * 2;
        while (this.targetAimYaw < -Math.PI) this.targetAimYaw += Math.PI * 2;
        
        // Turret follows mouse in aiming mode
        if (this.tank.turret) {
            let yawDiff = this.targetAimYaw - this.aimYaw;
            while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            
            const turretSpeed = (this.tank as any).turretSpeed || 0.04;
            if (Math.abs(yawDiff) > 0.01) {
                const rotationAmount = Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), turretSpeed);
                this.tank.turret.rotation.y += rotationAmount;
            }
            
            // Normalize turret angle
            while (this.tank.turret.rotation.y > Math.PI) this.tank.turret.rotation.y -= Math.PI * 2;
            while (this.tank.turret.rotation.y < -Math.PI) this.tank.turret.rotation.y += Math.PI * 2;
        }
        
        // Normalize aimYaw
        while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
        while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
        
        // Vertical aiming (pitch)
        if (movementY !== undefined) {
            const zoomFactor = 1.0 / (1.0 + this.aimZoom * 0.3);
            const adaptiveVerticalSensitivity = this.aimMouseSensitivityVertical * zoomFactor;
            const pitchDelta = -movementY * adaptiveVerticalSensitivity;
            let newPitch = this.targetAimPitch + pitchDelta;
            
            // Limit pitch angle (-10° to +5°)
            this.targetAimPitch = Math.max(-Math.PI / 18, Math.min(Math.PI / 36, newPitch));
        }
        
        // Smooth pitch interpolation
        this.aimPitch += (this.targetAimPitch - this.aimPitch) * this.aimPitchSmoothing;
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
            this.aimPitch = 0;
            this.targetAimPitch = 0;
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
                this.tank.aimPitch = 0;
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
        
        const tankPos = this.tank.chassis.absolutePosition;
        
        // Обновляем тряску камеры
        this.updateCameraShake();
        
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
        
        // Режим прицеливания
        if (this.isAiming) {
            this.updateAimingMode();
        } else {
            this.updateNormalMode();
        }
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
        
        // УЛУЧШЕНО: Более плавная интерполяция горизонтального прицеливания
        let yawDiff = this.targetAimYaw - this.aimYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        // Плавное торможение при приближении к цели (easing)
        const yawEasing = Math.min(1.0, Math.abs(yawDiff) * 2);
        this.aimYaw += yawDiff * this.aimYawSmoothing * (0.5 + yawEasing * 0.5);
        
        // Нормализуем aimYaw
        while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
        while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
        
        // УЛУЧШЕНО: Более плавная интерполяция вертикального прицеливания
        const pitchDiff = this.targetAimPitch - this.aimPitch;
        // Плавное торможение при приближении к цели
        const pitchEasing = Math.min(1.0, Math.abs(pitchDiff) * 10);
        this.aimPitch += pitchDiff * this.aimPitchSmoothing * (0.3 + pitchEasing * 0.7);
        
        // Синхронизируем aimPitch с танком для стрельбы
        this.tank.aimPitch = this.aimPitch;
        
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
     */
    private updateCameraShake(): void {
        if (this.cameraShakeIntensity > 0.01) {
            this.cameraShakeTime += 0.1;
            // УМЕНЬШЕНО: Интенсивность тряски уменьшена в 2 раза (было 0.1, стало 0.05)
            let baseIntensity = this.cameraShakeIntensity * 0.05;
            
            // Тряска зависит от скорости танка И башни
            // ИСПРАВЛЕНО: Плавное нарастание от 0 (при остановке) до 1 (при максимальной скорости)
            let tankSpeedFactor = 0; // Начинаем с 0 - нет тряски при остановке
            let turretSpeedFactor = 0; // Начинаем с 0
            
            if (this.tank && typeof (this.tank as any).getSpeed === 'function') {
                // Фактор скорости движения танка с плавным нарастанием
                const speed = Math.abs((this.tank as any).getSpeed());
                const maxSpeed = (this.tank as any).moveSpeed || 24; // Максимальная скорость танка
                const speedRatio = speed / maxSpeed;
                const minThreshold = 0.15; // Тряска начинается только при 15% от макс. скорости
                
                if (speedRatio < minThreshold) {
                    tankSpeedFactor = 0; // Нет тряски при медленном движении
                } else {
                    // Нормализуем от 0 до 1 после порога
                    const normalizedSpeed = (speedRatio - minThreshold) / (1 - minThreshold);
                    // Квадратичная кривая для плавного нарастания
                    tankSpeedFactor = normalizedSpeed * normalizedSpeed;
                }
            }
            
            // Фактор скорости вращения башни
            if (this.tank && this.tank.turret && !this.tank.turret.isDisposed()) {
                const currentTurretAngle = this.tank.turret.rotation.y;
                // Вычисляем скорость вращения башни (разница углов между кадрами)
                let angleDiff = currentTurretAngle - this.lastTurretAngle;
                // Нормализуем разницу в диапазон [-PI, PI]
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                const turretRotationSpeed = Math.abs(angleDiff);
                // Максимальная скорость башни (примерно baseTurretSpeed * 60 FPS = 0.06 * 60 = 3.6 рад/сек)
                // Но на кадр это примерно 0.06 рад/кадр при 60 FPS
                const maxTurretSpeed = ((this.tank as any).baseTurretSpeed || 0.06) * 1.5; // Немного больше для учета ускорения
                // ИСПРАВЛЕНО: Убран минимум 0.3, теперь плавно от 0 до 1
                turretSpeedFactor = Math.min(1.0, turretRotationSpeed / maxTurretSpeed);
                
                // Сохраняем текущий угол для следующего кадра
                this.lastTurretAngle = currentTurretAngle;
            }
            
            // Объединяем факторы: используем максимальное значение для более заметного эффекта
            const combinedSpeedFactor = Math.max(tankSpeedFactor, turretSpeedFactor);
            baseIntensity *= combinedSpeedFactor;
            
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
     * Предотвращение захода камеры за текстуры/стены
     */
    adjustCameraForCollision(aimingTransitionProgress: number): void {
        if (!this.camera || !this.tank || !this.tank.chassis || !this.scene) return;
        
        // Только для обычной камеры (не в режиме прицеливания)
        const t = aimingTransitionProgress || 0;
        if (t > 0.01) return; // В режиме прицеливания не применяем
        
        const tankPos = this.tank.chassis.getAbsolutePosition();
        const cameraPos = this.camera.position;
        
        // Направление от танка к камере
        const direction = cameraPos.subtract(tankPos.add(new Vector3(0, 1.0, 0)));
        const distance = direction.length();
        direction.normalize();
        
        // Минимальное расстояние до камеры
        const minDistance = 2.0;
        
        // Проверяем коллизию с мешами
        const ray = new Ray(tankPos.add(new Vector3(0, 1.0, 0)), direction);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || 
                mesh === this.tank?.chassis || 
                mesh === this.tank?.turret || 
                mesh === this.tank?.barrel) {
                return false;
            }
            // Игнорируем эффекты, частицы и другие невидимые объекты
            if (mesh.name.includes("particle") || mesh.name.includes("effect") || 
                mesh.name.includes("trail") || mesh.name.includes("bullet")) {
                return false;
            }
            return true;
        });
        
        if (hit && hit.hit && hit.distance !== null && hit.distance < distance) {
            // Есть коллизия - перемещаем камеру ближе к танку
            const safeDistance = Math.max(minDistance, hit.distance - 0.5);
            const newCameraPos = tankPos.add(new Vector3(0, 1.0, 0)).add(direction.clone().scale(safeDistance));
            
            // Плавно перемещаем камеру к безопасной позиции
            this.camera.position = Vector3.Lerp(cameraPos, newCameraPos, 0.3);
        }
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

