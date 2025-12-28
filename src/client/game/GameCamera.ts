// ═══════════════════════════════════════════════════════════════════════════
// GAME CAMERA - Управление камерами и режимами обзора
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, ArcRotateCamera, UniversalCamera, Ray } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { Scene } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { AimingSystem } from "../aimingSystem";
import { GameProjectile } from "./GameProjectile";

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
    
    // Ссылки на системы
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected aimingSystem: AimingSystem | undefined;
    protected isSpectating = false;
    protected spectatingPlayerId: string | null = null;
    protected gameProjectile: GameProjectile | undefined;
    
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

