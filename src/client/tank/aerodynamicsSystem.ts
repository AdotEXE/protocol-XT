/**
 * @module tank/aerodynamicsSystem
 * @description Система аэродинамических сил для реалистичного полёта
 * 
 * Реализует:
 * - Lift (подъёмная сила) с учётом угла атаки
 * - Drag (сопротивление) паразитное и индуцированное
 * - Thrust (тяга) двигателя
 * - Stall detection (обнаружение сваливания)
 */

import { Vector3 } from "@babylonjs/core";
import type { AerodynamicsConfig } from "../config/aircraftPhysicsConfig";

/**
 * Система аэродинамических сил
 */
export class AerodynamicsSystem {
    private config: AerodynamicsConfig;

    /** Текущий процент тяги (0-1) */
    private throttlePercentage: number = 0.0;

    /** Текущая плотность воздуха */
    private currentAirDensity: number;

    constructor(config: AerodynamicsConfig) {
        this.config = config;
        this.currentAirDensity = config.airDensitySeaLevel;
    }

    /**
     * Обновить плотность воздуха на основе высоты
     * @param altitude Высота над уровнем моря (м)
     */
    updateAirDensity(altitude: number): void {
        // Экспоненциальное уменьшение плотности с высотой
        this.currentAirDensity = this.config.airDensitySeaLevel *
            Math.exp(-this.config.airDensityDecay * altitude);
    }

    /**
     * Вычислить подъёмную силу (Lift)
     * @param velocity Скорость самолёта (м/с)
     * @param angleOfAttack Угол атаки (радианы)
     * @param forwardDirection Направление "вперёд" самолёта
     */
    calculateLift(
        velocity: number,
        angleOfAttack: number,
        forwardDirection: Vector3
    ): Vector3 {
        // Защитные проверки
        if (!isFinite(velocity) || velocity < 0 || !isFinite(angleOfAttack)) {
            return Vector3.Zero();
        }

        // Коэффициент подъёмной силы зависит от угла атаки
        const liftCoefficient = this.calculateLiftCoefficient(angleOfAttack);

        // Проверяем коэффициент на валидность
        if (!isFinite(liftCoefficient)) {
            return Vector3.Zero();
        }

        // Формула подъёмной силы: L = 0.5 * ρ * v² * A * Cl
        const liftMagnitude = 0.5 *
            this.currentAirDensity *
            velocity * velocity *
            this.config.wingArea *
            liftCoefficient;

        // Проверяем величину на валидность
        if (!isFinite(liftMagnitude) || liftMagnitude < 0) {
            return Vector3.Zero();
        }

        // Направление подъёмной силы перпендикулярно скорости и направлению вперёд
        // Вычисляем направление "вверх" относительно самолёта (локальное пространство)
        // В мировом пространстве это будет зависеть от ориентации самолёта
        // Для упрощения используем локальный "вверх" самолёта, который будет преобразован в мировое пространство
        const liftDirection = Vector3.Up(); // Это будет локальное направление

        // Используем clone() чтобы не мутировать Vector3.Up()
        const liftVector = liftDirection.clone().scale(liftMagnitude);

        // Проверяем результат
        if (liftVector && isFinite(liftVector.x) && isFinite(liftVector.y) && isFinite(liftVector.z)) {
            return liftVector;
        }
        return Vector3.Zero();
    }

    /**
     * Вычислить коэффициент подъёмной силы на основе угла атаки
     * @param angleOfAttack Угол атаки (радианы)
     */
    private calculateLiftCoefficient(angleOfAttack: number): number {
        const alpha = angleOfAttack;
        const criticalAlpha = this.config.criticalAngleOfAttack;

        if (Math.abs(alpha) < criticalAlpha) {
            // Линейная зависимость для малых углов
            return this.config.baseLiftCoefficient +
                (this.config.maxLiftCoefficient - this.config.baseLiftCoefficient) *
                (alpha / criticalAlpha);
        } else {
            // Сваливание: резкое падение подъёмной силы
            // Используем более реалистичную модель сваливания
            const excessAlpha = Math.abs(alpha) - criticalAlpha;
            const stallSeverity = Math.min(1.0, excessAlpha / (Math.PI / 2 - criticalAlpha));

            // Коэффициент падает экспоненциально при сваливании
            const stallFactor = Math.exp(-stallSeverity * 3.0);
            return this.config.maxLiftCoefficient * stallFactor * Math.sign(alpha);
        }
    }

    /**
     * Вычислить сопротивление (Drag)
     * @param velocity Скорость самолёта (м/с)
     * @param angleOfAttack Угол атаки (радианы)
     * @param velocityDirection Направление скорости
     */
    calculateDrag(
        velocity: number,
        angleOfAttack: number,
        velocityDirection: Vector3
    ): Vector3 {
        // Защитные проверки
        if (!velocityDirection || !isFinite(velocity) || velocity < 0) {
            return Vector3.Zero();
        }

        // Паразитное сопротивление (не зависит от подъёмной силы)
        const parasiticDrag = 0.5 *
            this.currentAirDensity *
            velocity * velocity *
            this.config.wingArea *
            this.config.zeroLiftDragCoefficient;

        // Индуцированное сопротивление (зависит от подъёмной силы)
        const liftCoefficient = this.calculateLiftCoefficient(angleOfAttack);
        const inducedDrag = 0.5 *
            this.currentAirDensity *
            velocity * velocity *
            this.config.wingArea *
            this.config.inducedDragFactor *
            liftCoefficient * liftCoefficient;

        // Общее сопротивление
        const totalDrag = parasiticDrag + inducedDrag;

        // Проверяем на валидность
        if (!isFinite(totalDrag) || totalDrag < 0) {
            return Vector3.Zero();
        }

        // Направление сопротивления противоположно скорости
        // Создаём новый вектор вместо clone().scale() для безопасности
        const dragVector = new Vector3(
            velocityDirection.x * -totalDrag,
            velocityDirection.y * -totalDrag,
            velocityDirection.z * -totalDrag
        );

        // Проверяем результат
        if (dragVector && isFinite(dragVector.x) && isFinite(dragVector.y) && isFinite(dragVector.z)) {
            return dragVector;
        }
        return Vector3.Zero();
    }

    /**
     * Вычислить тягу (Thrust)
     * @param forwardDirection Направление "вперёд" самолёта
     */
    calculateThrust(forwardDirection: Vector3): Vector3 {
        // Защитные проверки
        if (!forwardDirection) {
            return Vector3.Zero();
        }

        // Тяга зависит от процента газа
        const thrustMagnitude = this.config.minThrust +
            (this.config.maxThrust - this.config.minThrust) *
            this.throttlePercentage;

        // Проверяем на валидность
        if (!isFinite(thrustMagnitude) || thrustMagnitude < 0) {
            return Vector3.Zero();
        }

        // Создаём новый вектор вместо clone().scale() для безопасности
        const thrustVector = new Vector3(
            forwardDirection.x * thrustMagnitude,
            forwardDirection.y * thrustMagnitude,
            forwardDirection.z * thrustMagnitude
        );

        // Проверяем результат
        if (thrustVector && isFinite(thrustVector.x) && isFinite(thrustVector.y) && isFinite(thrustVector.z)) {
            return thrustVector;
        }
        return Vector3.Zero();
    }

    /**
     * Увеличить тягу
     * @param dt Время с последнего обновления (секунды)
     */
    increaseThrottle(dt: number): void {
        const rate = this.config.throttleRate * dt;
        this.throttlePercentage = Math.min(1.0, this.throttlePercentage + rate);
    }

    /**
     * Уменьшить тягу
     * @param dt Время с последнего обновления (секунды)
     */
    decreaseThrottle(dt: number): void {
        const rate = this.config.throttleRate * dt;
        this.throttlePercentage = Math.max(0.0, this.throttlePercentage - rate);
    }

    /**
     * Установить процент тяги напрямую
     * @param percentage Процент тяги (0-1)
     */
    setThrottle(percentage: number): void {
        this.throttlePercentage = Math.max(0.0, Math.min(1.0, percentage));
    }

    /**
     * Получить текущий процент тяги
     */
    getThrottle(): number {
        return this.throttlePercentage;
    }

    /**
     * Вычислить угол атаки
     * @param forwardDirection Направление "вперёд" самолёта
     * @param velocityDirection Направление скорости
     */
    calculateAngleOfAttack(
        forwardDirection: Vector3,
        velocityDirection: Vector3
    ): number {
        // Угол атаки - это угол между направлением вперёд и направлением скорости
        const dot = Vector3.Dot(forwardDirection, velocityDirection);
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const angle = Math.acos(clampedDot);

        // Определяем знак угла атаки (положительный = нос вверх)
        const cross = Vector3.Cross(forwardDirection, velocityDirection);
        const sign = Math.sign(Vector3.Dot(cross, Vector3.Right()));

        return angle * sign;
    }

    /**
     * Проверить, находится ли самолёт в сваливании
     * @param angleOfAttack Угол атаки (радианы)
     */
    isStalling(angleOfAttack: number): boolean {
        return Math.abs(angleOfAttack) > this.config.criticalAngleOfAttack;
    }

    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<AerodynamicsConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

