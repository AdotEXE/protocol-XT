/**
 * @module tank/combat/TankAiming
 * @description Система прицеливания танка
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Конфигурация прицеливания
 */
export interface AimingConfig {
    /** Базовая точность (разброс в градусах) */
    baseAccuracy: number;
    /** Штраф точности при движении */
    movementPenalty: number;
    /** Штраф точности при вращении башни */
    turretRotationPenalty: number;
    /** Скорость сведения (сек) */
    aimTime: number;
    /** Максимальный разброс */
    maxDispersion: number;
    /** Минимальный разброс (полное сведение) */
    minDispersion: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_AIMING_CONFIG: AimingConfig = {
    baseAccuracy: 0.35,
    movementPenalty: 0.15,
    turretRotationPenalty: 0.1,
    aimTime: 2.0,
    maxDispersion: 1.0,
    minDispersion: 0.05
};

/**
 * Состояние прицеливания
 */
export interface AimingState {
    /** Текущий разброс */
    currentDispersion: number;
    /** Целевой разброс */
    targetDispersion: number;
    /** Идёт ли прицеливание */
    isAiming: boolean;
    /** Время прицеливания */
    aimProgress: number;
    /** Позиция цели */
    targetPosition: Vector3 | null;
    /** Расстояние до цели */
    targetDistance: number;
    /** Угол наводки по вертикали */
    pitch: number;
    /** Угол наводки по горизонтали */
    yaw: number;
}

/**
 * Результат расчёта траектории
 */
export interface TrajectoryResult {
    /** Точка попадания */
    hitPoint: Vector3;
    /** Время полёта */
    flightTime: number;
    /** Угол падения */
    impactAngle: number;
    /** Попадёт ли снаряд */
    willHit: boolean;
}

/**
 * Система прицеливания танка
 */
export class TankAiming {
    private config: AimingConfig;
    private state: AimingState;
    
    private isMoving: boolean = false;
    private isTurretRotating: boolean = false;
    private lastTurretAngle: number = 0;
    
    constructor(config: Partial<AimingConfig> = {}) {
        this.config = { ...DEFAULT_AIMING_CONFIG, ...config };
        this.state = {
            currentDispersion: this.config.maxDispersion,
            targetDispersion: this.config.baseAccuracy,
            isAiming: false,
            aimProgress: 0,
            targetPosition: null,
            targetDistance: 0,
            pitch: 0,
            yaw: 0
        };
    }
    
    /**
     * Начать прицеливание
     */
    startAiming(): void {
        this.state.isAiming = true;
    }
    
    /**
     * Остановить прицеливание
     */
    stopAiming(): void {
        this.state.isAiming = false;
        this.state.currentDispersion = this.config.maxDispersion;
        this.state.aimProgress = 0;
    }
    
    /**
     * Обновление
     * @param deltaTime - Время кадра
     * @param tankSpeed - Скорость танка
     * @param turretAngle - Угол башни
     */
    update(deltaTime: number, tankSpeed: number, turretAngle: number): void {
        // Определить состояние движения
        this.isMoving = Math.abs(tankSpeed) > 0.5;
        
        // Определить вращение башни
        const turretDelta = Math.abs(turretAngle - this.lastTurretAngle);
        this.isTurretRotating = turretDelta > 0.01;
        this.lastTurretAngle = turretAngle;
        
        // Рассчитать целевой разброс
        this.state.targetDispersion = this.config.baseAccuracy;
        
        if (this.isMoving) {
            this.state.targetDispersion += this.config.movementPenalty;
        }
        
        if (this.isTurretRotating) {
            this.state.targetDispersion += this.config.turretRotationPenalty;
        }
        
        // Ограничить разброс
        this.state.targetDispersion = Math.min(
            this.config.maxDispersion,
            Math.max(this.config.minDispersion, this.state.targetDispersion)
        );
        
        // Интерполяция разброса
        if (this.state.isAiming) {
            // Сведение
            const aimSpeed = 1.0 / this.config.aimTime;
            this.state.aimProgress = Math.min(1, this.state.aimProgress + deltaTime * aimSpeed);
            
            // Плавное уменьшение разброса
            const targetMin = Math.max(this.config.minDispersion, this.state.targetDispersion);
            this.state.currentDispersion = this.lerp(
                this.state.currentDispersion,
                targetMin,
                deltaTime * 3
            );
        } else {
            // Рассведение
            this.state.aimProgress = 0;
            this.state.currentDispersion = this.lerp(
                this.state.currentDispersion,
                this.state.targetDispersion,
                deltaTime * 2
            );
        }
    }
    
    /**
     * Установить цель
     */
    setTarget(position: Vector3, barrelPosition: Vector3): void {
        this.state.targetPosition = position;
        this.state.targetDistance = Vector3.Distance(barrelPosition, position);
        
        // Рассчитать углы
        const direction = position.subtract(barrelPosition).normalize();
        this.state.pitch = Math.asin(direction.y);
        this.state.yaw = Math.atan2(direction.x, direction.z);
    }
    
    /**
     * Рассчитать траекторию снаряда
     * @param barrelPosition - Позиция ствола
     * @param barrelDirection - Направление ствола
     * @param projectileSpeed - Скорость снаряда
     * @param gravity - Гравитация
     */
    calculateTrajectory(
        barrelPosition: Vector3,
        barrelDirection: Vector3,
        projectileSpeed: number,
        gravity: number = 9.81
    ): TrajectoryResult {
        // Добавить случайный разброс
        const dispersionAngle = this.state.currentDispersion * (Math.PI / 180);
        const randomAngleH = (Math.random() - 0.5) * 2 * dispersionAngle;
        const randomAngleV = (Math.random() - 0.5) * 2 * dispersionAngle;
        
        // Применить разброс к направлению
        const direction = barrelDirection.clone();
        // Упрощённое применение разброса
        direction.x += Math.sin(randomAngleH) * 0.1;
        direction.y += Math.sin(randomAngleV) * 0.1;
        direction.normalize();
        
        // Начальная скорость
        const velocity = direction.scale(projectileSpeed);
        
        // Симуляция траектории (упрощённая)
        let position = barrelPosition.clone();
        let vel = velocity.clone();
        let time = 0;
        const dt = 0.016; // 60 FPS
        const maxTime = 10; // Максимум 10 секунд полёта
        
        while (time < maxTime) {
            // Применить гравитацию
            vel.y -= gravity * dt;
            
            // Обновить позицию
            position.addInPlace(vel.scale(dt));
            time += dt;
            
            // Проверить попадание в землю
            if (position.y <= 0) {
                const impactAngle = Math.atan2(-vel.y, Math.sqrt(vel.x * vel.x + vel.z * vel.z));
                return {
                    hitPoint: position,
                    flightTime: time,
                    impactAngle: impactAngle * (180 / Math.PI),
                    willHit: true
                };
            }
        }
        
        // Не попал в землю за maxTime
        return {
            hitPoint: position,
            flightTime: time,
            impactAngle: 0,
            willHit: false
        };
    }
    
    /**
     * Получить текущий разброс в градусах
     */
    getDispersion(): number {
        return this.state.currentDispersion;
    }
    
    /**
     * Получить прогресс прицеливания (0-1)
     */
    getAimProgress(): number {
        return this.state.aimProgress;
    }
    
    /**
     * Получить состояние
     */
    getState(): AimingState {
        return { ...this.state };
    }
    
    /**
     * Полностью ли сведён прицел
     */
    isFullyAimed(): boolean {
        return this.state.aimProgress >= 0.95 && 
               this.state.currentDispersion <= this.config.minDispersion * 1.1;
    }
    
    /**
     * Линейная интерполяция
     */
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * Math.min(1, Math.max(0, t));
    }
}

export default TankAiming;

