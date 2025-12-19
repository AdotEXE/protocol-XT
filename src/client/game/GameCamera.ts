// ═══════════════════════════════════════════════════════════════════════════
// GAME CAMERA - Управление камерами и режимами обзора
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, ArcRotateCamera, UniversalCamera } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { Scene } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { AimingSystem } from "../aimingSystem";

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
    
    // Mouse control for aiming
    aimMouseSensitivity = 0.00015;
    aimMouseSensitivityVertical = 0.00015;
    aimMaxMouseSpeed = 25;
    aimPitchSmoothing = 0.12;
    aimYawSmoothing = 0.18;
    targetAimPitch = 0;
    targetAimYaw = 0;
    isPointerLocked = false;
    aimYaw = 0;
    aimPitch = 0;
    
    // Zoom
    aimZoom = 0;
    minZoom = 0;
    maxZoom = 4.0;
    zoomStep = 0.5;
    
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
    
    // Ссылки на системы
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected aimingSystem: AimingSystem | undefined;
    protected isSpectating = false;
    protected spectatingPlayerId: string | null = null;
    
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
        aimingSystem: AimingSystem | undefined
    ): void {
        this.scene = scene;
        this.tank = tank;
        this.hud = hud;
        this.aimingSystem = aimingSystem;
        
        // Создаем основную камеру
        const cameraPos = tank?.chassis?.position || new Vector3(0, 2, 0);
        this.camera = new ArcRotateCamera("camera1", -Math.PI / 2, this.cameraBeta, 12, cameraPos, scene);
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 25;
        this.camera.lowerBetaLimit = 0.1;
        this.camera.upperBetaLimit = Math.PI / 2.1;
        this.camera.inputs.clear();
        
        // Создаем камеру прицеливания
        this.aimCamera = new UniversalCamera("aimCamera", new Vector3(0, 0, 0), scene);
        this.aimCamera.fov = this.aimFOV;
        this.aimCamera.inputs.clear();
        this.aimCamera.setEnabled(false);
        
        // Устанавливаем камеру как активную
        scene.activeCamera = this.camera;
        
        logger.log("[GameCamera] Cameras initialized");
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
     */
    private updateAimingMode(): void {
        if (!this.camera || !this.tank) return;
        
        // Плавно переходим в режим прицеливания
        this.aimingTransitionProgress = Math.min(1.0, this.aimingTransitionProgress + this.aimingTransitionSpeed);
        
        // Плавная интерполяция горизонтального прицеливания
        let yawDiff = this.targetAimYaw - this.aimYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.aimYaw += yawDiff * this.aimYawSmoothing;
        
        // Нормализуем aimYaw
        while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
        while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
        
        // Плавная интерполяция вертикального прицеливания
        const pitchDiff = this.targetAimPitch - this.aimPitch;
        this.aimPitch += pitchDiff * this.aimPitchSmoothing;
        
        // Синхронизируем aimPitch с танком для стрельбы
        this.tank.aimPitch = this.aimPitch;
        
        // Обновляем индикатор дальности в HUD
        if (this.hud && this.tank.barrel) {
            const barrelHeight = this.tank.barrel.getAbsolutePosition().y;
            const projectileSpeed = this.tank.projectileSpeed;
            const range = this.calculateProjectileRange(this.aimPitch, projectileSpeed, barrelHeight);
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
        
        // Применяем зум
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
            const shakeX = (Math.random() - 0.5) * this.cameraShakeIntensity;
            const shakeY = (Math.random() - 0.5) * this.cameraShakeIntensity;
            const shakeZ = (Math.random() - 0.5) * this.cameraShakeIntensity;
            
            this.cameraShakeOffset = new Vector3(shakeX, shakeY, shakeZ);
            this.cameraShakeIntensity *= this.cameraShakeDecay;
        } else {
            this.cameraShakeIntensity = 0;
            this.cameraShakeOffset = Vector3.Zero();
        }
    }
    
    /**
     * Добавить тряску камеры
     */
    addCameraShake(intensity: number, _duration: number = 0.3): void {
        this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
    }
    
    /**
     * Вычисляет дальность полёта снаряда
     */
    calculateProjectileRange(pitch: number, projectileSpeed: number, barrelHeight: number): number {
        const gravity = 9.81;
        const dt = 0.02;
        const maxTime = 10;
        
        let x = 0;
        let y = barrelHeight;
        const vx = projectileSpeed * Math.cos(pitch);
        let vy = projectileSpeed * Math.sin(pitch);
        
        let time = 0;
        while (y > 0 && time < maxTime) {
            x += vx * dt;
            y += vy * dt;
            vy -= gravity * dt;
            time += dt;
        }
        
        return Math.max(0, x);
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
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.aimingSystem !== undefined) this.aimingSystem = callbacks.aimingSystem;
        if (callbacks.isSpectating !== undefined) this.isSpectating = callbacks.isSpectating;
        if (callbacks.spectatingPlayerId !== undefined) this.spectatingPlayerId = callbacks.spectatingPlayerId;
        if (callbacks.onSwitchSpectatorTarget !== undefined) this.onSwitchSpectatorTarget = callbacks.onSwitchSpectatorTarget;
        if (callbacks.getSpectatingPlayerPosition !== undefined) this.getSpectatingPlayerPosition = callbacks.getSpectatingPlayerPosition;
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

