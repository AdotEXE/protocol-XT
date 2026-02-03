/**
 * @module tank/aircraftCameraSystem
 * @description Продвинутая chase camera для самолёта с spring arm dynamics
 * 
 * Реализует:
 * - Spring arm с плавным следованием
 * - Lag effects при резких манёврах
 * - FOV изменения при ускорении
 * - World-up или aircraft-up alignment
 */

import { Vector3, Camera, ArcRotateCamera } from "@babylonjs/core";
import type { AircraftCameraConfig } from "../config/aircraftPhysicsConfig";

/**
 * Система камеры для самолёта
 */
export class AircraftCameraSystem {
    private camera: ArcRotateCamera;
    private config: AircraftCameraConfig;

    // Состояние spring arm
    private currentCameraPosition: Vector3 = Vector3.Zero();
    private targetCameraPosition: Vector3 = Vector3.Zero();
    private cameraVelocity: Vector3 = Vector3.Zero();

    // Состояние FOV
    private currentFOV: number = 0.8;
    private targetFOV: number = 0.8;

    // Кэш
    private lastAircraftPosition: Vector3 = Vector3.Zero();
    private lastAircraftForward: Vector3 = Vector3.Forward();

    constructor(camera: ArcRotateCamera, config: AircraftCameraConfig) {
        this.camera = camera;
        this.config = config;
        this.currentFOV = camera.fov || 0.8;
        this.targetFOV = this.currentFOV;

        // Инициализируем позицию камеры
        if (camera.position) {
            this.currentCameraPosition = new Vector3(camera.position.x, camera.position.y, camera.position.z);
        }

        // Отключаем стандартные входы камеры для самолёта (управление через AircraftCameraSystem)
        camera.inputs.clear();
        camera.detachControl();
    }

    /**
     * Обновить камеру
     * @param aircraftPosition Позиция самолёта
     * @param aircraftForward Направление "вперёд" самолёта
     * @param aircraftUp Направление "вверх" самолёта
     * @param aircraftSpeed Скорость самолёта (м/с)
     * @param dt Время с последнего обновления
     */
    update(
        aircraftPosition: Vector3,
        aircraftForward: Vector3,
        aircraftUp: Vector3,
        aircraftSpeed: number,
        dt: number
    ): void {
        if (!aircraftPosition || !aircraftForward) return;

        // ПРОСТАЯ КАМЕРА - позади и выше самолёта (из конфига)
        const dist = this.config.chaseDistance;
        const height = this.config.chaseHeight;

        // Позиция камеры: позади самолёта + вверх
        const cameraPos = new Vector3(
            aircraftPosition.x - aircraftForward.x * dist,
            aircraftPosition.y + height,
            aircraftPosition.z - aircraftForward.z * dist
        );

        // Устанавливаем камеру
        this.camera.position = cameraPos;

        // Камера смотрит ПРЯМО на самолёт
        this.camera.setTarget(aircraftPosition);

        // World-up для стабильности
        this.camera.upVector = Vector3.Up();
    }

    /**
     * Вычислить идеальную позицию камеры
     */
    private calculateIdealPosition(
        aircraftPosition: Vector3,
        aircraftForward: Vector3,
        aircraftUp: Vector3
    ): Vector3 {
        // Позиция позади самолёта (создаём новый вектор)
        const behindOffset = new Vector3(
            aircraftForward.x * -this.config.chaseDistance,
            aircraftForward.y * -this.config.chaseDistance,
            aircraftForward.z * -this.config.chaseDistance
        );

        // Позиция выше самолёта (создаём новый вектор)
        const upOffset = this.config.worldUpAlignment
            ? new Vector3(0, this.config.chaseHeight, 0)
            : new Vector3(
                aircraftUp.x * this.config.chaseHeight,
                aircraftUp.y * this.config.chaseHeight,
                aircraftUp.z * this.config.chaseHeight
            );

        // Создаём новый вектор для результата
        return new Vector3(
            aircraftPosition.x + behindOffset.x + upOffset.x,
            aircraftPosition.y + behindOffset.y + upOffset.y,
            aircraftPosition.z + behindOffset.z + upOffset.z
        );
    }

    /**
     * Обновить spring arm (плавное следование с физикой)
     */
    private updateSpringArm(targetPosition: Vector3, dt: number): void {
        this.targetCameraPosition = new Vector3(targetPosition.x, targetPosition.y, targetPosition.z);

        // Если камера далеко от цели — мгновенно телепортируем (камера "не на месте")
        const displacement = new Vector3(
            targetPosition.x - this.currentCameraPosition.x,
            targetPosition.y - this.currentCameraPosition.y,
            targetPosition.z - this.currentCameraPosition.z
        );
        if (displacement.length() > 30) {
            this.currentCameraPosition = new Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
            this.cameraVelocity = Vector3.Zero();
            return;
        }

        // Spring-damper — жёсткая пружина чтобы камера быстро занимала место
        const stiffness = 80.0; // Жёсткость — камера сразу сзади
        const damping = 20.0;  // Демпфирование

        // Вычисляем силу пружины (displacement уже вычислен выше)
        const springForce = new Vector3(
            displacement.x * stiffness,
            displacement.y * stiffness,
            displacement.z * stiffness
        );

        // Вычисляем силу демпфирования
        const dampingForce = new Vector3(
            this.cameraVelocity.x * -damping,
            this.cameraVelocity.y * -damping,
            this.cameraVelocity.z * -damping
        );

        // Общая сила
        const totalForce = new Vector3(
            springForce.x + dampingForce.x,
            springForce.y + dampingForce.y,
            springForce.z + dampingForce.z
        );

        // Обновляем скорость
        this.cameraVelocity = new Vector3(
            this.cameraVelocity.x + totalForce.x * dt,
            this.cameraVelocity.y + totalForce.y * dt,
            this.cameraVelocity.z + totalForce.z * dt
        );

        // Применяем lag factor для дополнительной задержки при резких манёврах
        const lagMultiplier = 1.0 - this.config.lagFactor;
        this.cameraVelocity = new Vector3(
            this.cameraVelocity.x * lagMultiplier,
            this.cameraVelocity.y * lagMultiplier,
            this.cameraVelocity.z * lagMultiplier
        );

        // Обновляем позицию
        this.currentCameraPosition = new Vector3(
            this.currentCameraPosition.x + this.cameraVelocity.x * dt,
            this.currentCameraPosition.y + this.cameraVelocity.y * dt,
            this.currentCameraPosition.z + this.cameraVelocity.z * dt
        );
    }

    /**
     * Вычислить точку взгляда (look-ahead для предсказания движения)
     */
    private calculateLookAheadPoint(
        aircraftPosition: Vector3,
        aircraftForward: Vector3,
        aircraftSpeed: number
    ): Vector3 {
        // Защитные проверки
        if (!aircraftPosition || !aircraftForward || !isFinite(aircraftSpeed)) {
            return new Vector3(aircraftPosition.x, aircraftPosition.y, aircraftPosition.z);
        }
        // ИСПРАВЛЕНО: Look-ahead на небольшое расстояние чтобы камера вращалась вокруг самолёта,
        // а не вокруг точки далеко впереди него
        const lookAheadDistance = Math.min(20.0, aircraftSpeed * 0.1);

        // Создаём новый вектор вместо add() и scale()
        return new Vector3(
            aircraftPosition.x + aircraftForward.x * lookAheadDistance,
            aircraftPosition.y + aircraftForward.y * lookAheadDistance,
            aircraftPosition.z + aircraftForward.z * lookAheadDistance
        );
    }

    /**
     * Обновить FOV на основе скорости
     */
    private updateFOV(aircraftSpeed: number, dt: number): void {
        // FOV увеличивается при высокой скорости (эффект "speed lines")
        const baseFOV = 0.8;
        const maxFOV = 1.2;
        const speedFactor = Math.min(1.0, aircraftSpeed / 100.0); // Нормализуем до 100 м/с

        this.targetFOV = baseFOV + (maxFOV - baseFOV) * speedFactor * 0.3; // Максимум 30% увеличения

        // Плавная интерполяция FOV
        const fovDiff = this.targetFOV - this.currentFOV;
        this.currentFOV += fovDiff * this.config.smoothness * dt * 60; // Умножаем на 60 для независимости от FPS

        // Применяем к камере
        this.camera.fov = this.currentFOV;
    }

    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<AircraftCameraConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Сбросить состояние камеры
     */
    reset(aircraftPosition: Vector3, aircraftForward: Vector3): void {
        const idealPos = this.calculateIdealPosition(
            aircraftPosition,
            aircraftForward,
            Vector3.Up()
        );
        // Создаём новые векторы вместо clone()
        this.currentCameraPosition = new Vector3(idealPos.x, idealPos.y, idealPos.z);
        this.targetCameraPosition = new Vector3(idealPos.x, idealPos.y, idealPos.z);
        this.cameraVelocity = Vector3.Zero();
    }
}

