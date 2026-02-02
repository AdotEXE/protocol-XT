/**
 * @module tank/pidController
 * @description PID (Proportional-Integral-Derivative) контроллер для плавного управления самолётом
 * 
 * Используется для управления pitch, yaw, roll с плавной интерполяцией
 * и предотвращением осцилляций.
 */

import type { PIDConfig } from "../config/aircraftPhysicsConfig";

/**
 * PID контроллер для одной оси
 */
class PIDAxis {
    private kp: number;
    private ki: number;
    private kd: number;
    private maxIntegral: number;
    
    private integral: number = 0;
    private lastError: number = 0;
    private lastTime: number = 0;
    
    constructor(kp: number, ki: number, kd: number, maxIntegral: number) {
        this.kp = kp;
        this.ki = ki;
        this.kd = kd;
        this.maxIntegral = maxIntegral;
    }
    
    /**
     * Вычислить выходное значение PID контроллера
     * @param error Текущая ошибка
     * @param dt Время с последнего обновления (секунды)
     */
    compute(error: number, dt: number): number {
        if (dt <= 0) dt = 0.016; // Fallback на 60 FPS
        
        // Proportional term
        const p = this.kp * error;
        
        // Integral term (с ограничением для предотвращения windup)
        this.integral += error * dt;
        this.integral = Math.max(-this.maxIntegral, Math.min(this.maxIntegral, this.integral));
        const i = this.ki * this.integral;
        
        // Derivative term (скорость изменения ошибки)
        const derivative = (error - this.lastError) / dt;
        const d = this.kd * derivative;
        
        // Сохраняем текущую ошибку и время
        this.lastError = error;
        this.lastTime += dt;
        
        // Суммируем все компоненты
        return p + i + d;
    }
    
    /**
     * Сбросить состояние контроллера
     */
    reset(): void {
        this.integral = 0;
        this.lastError = 0;
        this.lastTime = 0;
    }
    
    /**
     * Обновить коэффициенты
     */
    updateCoefficients(kp: number, ki: number, kd: number): void {
        this.kp = kp;
        this.ki = ki;
        this.kd = kd;
    }
}

/**
 * PID контроллер для управления самолётом (pitch, yaw, roll)
 */
export class PIDController {
    private pitchPID: PIDAxis;
    private yawPID: PIDAxis;
    private rollPID: PIDAxis;
    
    constructor(config: PIDConfig) {
        this.pitchPID = new PIDAxis(
            config.pitchKp,
            config.pitchKi,
            config.pitchKd,
            config.maxIntegral
        );
        this.yawPID = new PIDAxis(
            config.yawKp,
            config.yawKi,
            config.yawKd,
            config.maxIntegral
        );
        this.rollPID = new PIDAxis(
            config.rollKp,
            config.rollKi,
            config.rollKd,
            config.maxIntegral
        );
    }
    
    /**
     * Вычислить управляющие моменты для всех осей
     * @param pitchError Ошибка по pitch (радианы)
     * @param yawError Ошибка по yaw (радианы)
     * @param rollError Ошибка по roll (радианы)
     * @param dt Время с последнего обновления (секунды)
     */
    compute(
        pitchError: number,
        yawError: number,
        rollError: number,
        dt: number
    ): { pitch: number; yaw: number; roll: number } {
        return {
            pitch: this.pitchPID.compute(pitchError, dt),
            yaw: this.yawPID.compute(yawError, dt),
            roll: this.rollPID.compute(rollError, dt)
        };
    }
    
    /**
     * Сбросить все контроллеры
     */
    reset(): void {
        this.pitchPID.reset();
        this.yawPID.reset();
        this.rollPID.reset();
    }
    
    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<PIDConfig>): void {
        if (config.pitchKp !== undefined || config.pitchKi !== undefined || config.pitchKd !== undefined) {
            this.pitchPID.updateCoefficients(
                config.pitchKp ?? 8.0,
                config.pitchKi ?? 0.5,
                config.pitchKd ?? 12.0
            );
        }
        if (config.yawKp !== undefined || config.yawKi !== undefined || config.yawKd !== undefined) {
            this.yawPID.updateCoefficients(
                config.yawKp ?? 6.0,
                config.yawKi ?? 0.3,
                config.yawKd ?? 10.0
            );
        }
        if (config.rollKp !== undefined || config.rollKi !== undefined || config.rollKd !== undefined) {
            this.rollPID.updateCoefficients(
                config.rollKp ?? 10.0,
                config.rollKi ?? 0.4,
                config.rollKd ?? 15.0
            );
        }
    }
}



