// ═══════════════════════════════════════════════════════════════════════════
// GAME PROJECTILE - Расчёт траектории снарядов
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";

/**
 * GameProjectile - Расчёт траектории снарядов
 * 
 * Отвечает за:
 * - Расчёт дальности полёта снаряда
 * - Поиск максимального угла для заданной дальности
 */
export class GameProjectile {
    private readonly GRAVITY = 9.81;
    private readonly DT = 0.02;
    private readonly MAX_TIME = 10;
    
    /**
     * Вычисляет дальность полёта снаряда для заданного угла
     */
    calculateProjectileRange(pitch: number, projectileSpeed: number, barrelHeight: number): number {
        let x = 0;
        let y = barrelHeight;
        const vx = projectileSpeed * Math.cos(pitch);
        let vy = projectileSpeed * Math.sin(pitch);
        
        let time = 0;
        while (y > 0 && time < this.MAX_TIME) {
            x += vx * this.DT;
            y += vy * this.DT;
            vy -= this.GRAVITY * this.DT;
            time += this.DT;
        }
        
        return Math.max(0, x);
    }
    
    /**
     * Находит максимальный угол наклона ствола для заданной дальности
     */
    findMaxPitchForRange(targetRange: number, projectileSpeed: number, barrelHeight: number): number {
        let maxPitch = 0;
        let maxRange = 0;
        
        // Перебираем углы от 0 до 90 градусов
        for (let pitch = 0; pitch <= Math.PI / 2; pitch += 0.01) {
            const range = this.calculateProjectileRange(pitch, projectileSpeed, barrelHeight);
            if (range >= targetRange && range > maxRange) {
                maxRange = range;
                maxPitch = pitch;
            }
        }
        
        return maxPitch;
    }
    
    /**
     * Dispose системы
     */
    dispose(): void {
        logger.log("[GameProjectile] Projectile system disposed");
    }
}

