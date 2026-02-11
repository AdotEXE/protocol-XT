/**
 * @module tank/mouseAimSystem
 * @description Mouse-Aim система для управления самолётом (Fly-by-Wire)
 * 
 * Реализует:
 * - Unprojection мыши в 3D пространство
 * - Вычисление целевого вектора
 * - Instructor layer (координированные повороты)
 * - Ограничение угла атаки
 */

import { Vector3, Camera, Scene, Ray, Matrix } from "@babylonjs/core";
import type { MouseAimConfig } from "../config/aircraftPhysicsConfig";

/**
 * Mouse-Aim система для управления самолётом
 */
export class MouseAimSystem {
    private scene: Scene;
    private camera: Camera;
    private config: MouseAimConfig;

    /** Текущая позиция мыши на экране (0-1) */
    private mouseScreenPos: Vector3 = new Vector3(0.5, 0.5, 0);

    /** Текущая целевая точка в мировом пространстве */
    private targetPoint: Vector3 = Vector3.Zero();

    /** Текущий целевой вектор направления */
    private targetDirection: Vector3 = Vector3.Forward();

    /** Текущий угол крена для координированного поворота */
    private targetBankAngle: number = 0;

    // Explicit target override (for AI)
    private overrideTarget: Vector3 | null = null;

    constructor(scene: Scene, camera: Camera, config: MouseAimConfig) {
        this.scene = scene;
        this.camera = camera;
        this.config = config;
    }

    /**
     * Обновить позицию мыши на экране
     * @param screenX X координата мыши (0-1)
     * @param screenY Y координата мыши (0-1)
     */
    updateMousePosition(screenX: number, screenY: number): void {
        this.mouseScreenPos.x = Math.max(0, Math.min(1, screenX));
        this.mouseScreenPos.y = Math.max(0, Math.min(1, screenY));
    }

    /**
     * Set explicit target direction override (for AI)
     * @param target Target position or direction (if null, clears override)
     */
    setOverrideTarget(target: Vector3 | null): void {
        this.overrideTarget = target;
    }

    /**
     * Обновить целевую точку и направление на основе позиции мыши
     * @param aircraftPosition Текущая позиция самолёта
     * @param aircraftForward Текущее направление самолёта
     */
    updateTarget(aircraftPosition: Vector3, aircraftForward: Vector3): void {
        // 0. CHECK OVERRIDE (For AI)
        if (this.overrideTarget) {
            // Unproject/calculation skipped, use override
            const direction = this.overrideTarget.subtract(aircraftPosition);
            const distance = direction.length();
            if (distance > 0.01) {
                this.targetDirection = direction.normalize();
                this.targetPoint = this.overrideTarget;
            } else {
                this.targetDirection = aircraftForward.clone();
                this.targetPoint = aircraftPosition.add(aircraftForward.scale(this.config.lookAheadDistance));
            }
            this.calculateBankAngle(aircraftForward);
            return;
        }

        // 1. Unproject мышь в 3D пространство
        const targetPoint = this.unprojectMouse(aircraftPosition);

        // 2. Вычислить направление от самолёта к цели
        const direction = targetPoint.subtract(aircraftPosition);
        const distance = direction.length();

        // 3. Нормализовать направление
        if (distance > 0.01) {
            this.targetDirection = direction.normalize();
            this.targetPoint = targetPoint;
        } else {
            // Если цель слишком близко, используем текущее направление
            this.targetDirection = aircraftForward.clone();
            this.targetPoint = aircraftPosition.add(aircraftForward.scale(this.config.lookAheadDistance));
        }

        // 4. Вычислить целевой угол крена для координированного поворота
        this.calculateBankAngle(aircraftForward);
    }

    /**
     * Unproject позицию мыши в 3D пространство
     * @param aircraftPosition Позиция самолёта для вычисления look-ahead
     */
    private unprojectMouse(aircraftPosition: Vector3): Vector3 {
        // Преобразуем экранные координаты (0-1) в NDC (-1 до 1)
        const ndcX = (this.mouseScreenPos.x * 2) - 1;
        const ndcY = 1 - (this.mouseScreenPos.y * 2); // Инвертируем Y

        // Получаем размеры viewport
        const engine = this.scene.getEngine();
        const width = engine.getRenderWidth();
        const height = engine.getRenderHeight();

        // Используем Vector3.Unproject для преобразования экранных координат в мировые
        // Сначала преобразуем в пиксельные координаты
        const screenX = this.mouseScreenPos.x * width;
        const screenY = this.mouseScreenPos.y * height;

        // Создаём точку на ближней и дальней плоскостях отсечения
        const nearPoint = Vector3.Unproject(
            new Vector3(screenX, screenY, 0),
            width,
            height,
            Matrix.Identity(),
            this.camera.getViewMatrix(),
            this.camera.getProjectionMatrix()
        );

        const farPoint = Vector3.Unproject(
            new Vector3(screenX, screenY, 1),
            width,
            height,
            Matrix.Identity(),
            this.camera.getViewMatrix(),
            this.camera.getProjectionMatrix()
        );

        // Вычисляем направление луча
        const rayDirection = farPoint.subtract(nearPoint).normalize();

        // Вычисляем точку на луче на расстоянии lookAheadDistance
        const lookAheadDistance = Math.max(
            this.config.minLookAheadDistance,
            Math.min(this.config.maxLookAheadDistance, this.config.lookAheadDistance)
        );

        // Используем позицию камеры как начало луча
        const cameraPos = this.camera.position;
        const targetPoint = cameraPos.add(rayDirection.scale(lookAheadDistance));

        return targetPoint;
    }

    /**
     * Вычислить целевой угол крена для координированного поворота
     * @param aircraftForward Текущее направление самолёта
     */
    private calculateBankAngle(aircraftForward: Vector3): void {
        // Проецируем текущее направление на горизонтальную плоскость
        const forwardHorizontal = new Vector3(aircraftForward.x, 0, aircraftForward.z).normalize();

        // Проецируем целевое направление на горизонтальную плоскость
        const targetHorizontal = new Vector3(this.targetDirection.x, 0, this.targetDirection.z);
        const targetHorizontalLength = targetHorizontal.length();

        if (targetHorizontalLength < 0.01) {
            // Если цель строго вертикальная, не кренимся
            this.targetBankAngle = 0;
            return;
        }

        const targetHorizontalNorm = targetHorizontal.normalize();

        // Вычисляем угол между текущим и целевым направлением в горизонтальной плоскости
        const dot = Vector3.Dot(forwardHorizontal, targetHorizontalNorm);
        const cross = Vector3.Cross(forwardHorizontal, targetHorizontalNorm);

        // Ограничиваем dot для предотвращения NaN
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const yawAngle = Math.acos(clampedDot);

        // Определяем направление поворота (лево/право) по знаку Y компоненты cross
        const turnDirection = Math.sign(cross.y);

        // Вычисляем целевой угол крена на основе угла поворота
        // Больше угол поворота = больше крен (до maxBankAngle)
        const bankAngle = Math.min(
            this.config.maxBankAngle,
            Math.abs(yawAngle) * 1.5 // Коэффициент для более агрессивного крена
        ) * turnDirection;

        this.targetBankAngle = bankAngle;
    }

    /**
     * Получить угловую ошибку между текущим и целевым направлением
     * @param aircraftForward Текущее направление самолёта
     * @param aircraftUp Текущий вектор "вверх" самолёта
     * @param aircraftRight Текущий вектор "вправо" самолёта
     */
    getAngularError(
        aircraftForward: Vector3,
        aircraftUp: Vector3,
        aircraftRight: Vector3
    ): { pitch: number; yaw: number; roll: number } {
        // Pitch error: угол между forward и target в вертикальной плоскости
        const forwardProj = new Vector3(aircraftForward.x, 0, aircraftForward.z).normalize();
        const targetProj = new Vector3(this.targetDirection.x, 0, this.targetDirection.z).normalize();

        const pitchError = Math.asin(Math.max(-1, Math.min(1, this.targetDirection.y))) -
            Math.asin(Math.max(-1, Math.min(1, aircraftForward.y)));

        // Yaw error: угол между forward и target в горизонтальной плоскости
        const dot = Vector3.Dot(forwardProj, targetProj);
        const cross = Vector3.Cross(forwardProj, targetProj);
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const yawAngle = Math.acos(clampedDot);
        const yawError = Math.sign(cross.y) * yawAngle;

        // Roll error: разница между текущим креном и целевым
        // Вычисляем текущий крен через проекцию right на вертикальную плоскость
        // Крен = угол между right и горизонтальной плоскостью
        const rightHorizontal = new Vector3(aircraftRight.x, 0, aircraftRight.z);
        const rightHorizontalLength = rightHorizontal.length();

        let normalizedRollError: number;
        if (rightHorizontalLength > 0.01) {
            // Вычисляем угол крена через atan2 от проекции right
            const currentBankAngle = Math.atan2(aircraftRight.y, rightHorizontalLength);
            const rollError = this.targetBankAngle - currentBankAngle;

            // Нормализуем roll error в диапазон [-PI, PI]
            normalizedRollError = rollError;
            while (normalizedRollError > Math.PI) normalizedRollError -= Math.PI * 2;
            while (normalizedRollError < -Math.PI) normalizedRollError += Math.PI * 2;
        } else {
            // Если right горизонтален, используем целевой крен напрямую
            normalizedRollError = this.targetBankAngle;
        }

        return {
            pitch: pitchError,
            yaw: yawError,
            roll: normalizedRollError
        };
    }

    /**
     * Получить текущую целевую точку
     */
    getTargetPoint(): Vector3 {
        return this.targetPoint.clone();
    }

    /**
     * Получить текущее целевое направление
     */
    getTargetDirection(): Vector3 {
        return this.targetDirection.clone();
    }

    /**
     * Получить целевой угол крена
     */
    getTargetBankAngle(): number {
        return this.targetBankAngle;
    }

    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<MouseAimConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

