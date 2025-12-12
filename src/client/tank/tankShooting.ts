// Модуль управления стрельбой танка
// Пока содержит делегирование к основному классу из-за сложности логики
import { Vector3 } from "@babylonjs/core";
import type { ITankController } from "./types";

export class TankShootingModule {
    private tank: ITankController;
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    /**
     * Основной метод стрельбы
     * Делегирует вызов основному классу из-за сложности логики (554 строки)
     * TODO: В будущем можно перенести логику в модуль
     */
    fire(): void {
        // Делегируем вызов основному классу
        // Метод fire() слишком большой и сложный для переноса на данном этапе
        // В будущем можно разбить на подметоды и перенести в модуль
        (this.tank as any).fire?.();
    }
    
    /**
     * Выстрел трассирующим снарядом
     */
    fireTracer(): void {
        (this.tank as any).fireTracer?.();
    }
    
    /**
     * Настройка обнаружения попаданий для снаряда
     */
    setupProjectileHitDetection(ball: any, body: any): void {
        (this.tank as any).setupProjectileHitDetection?.(ball, body);
    }
    
    /**
     * Создание стандартного снаряда
     */
    createStandardProjectile(pos: Vector3, dir: Vector3, damage: number, cannonType: string): any {
        return (this.tank as any).createStandardProjectile?.(pos, dir, damage, cannonType);
    }
    
    /**
     * Выстрел дробовиком (разлет)
     */
    fireShotgunSpread(muzzlePos: Vector3, direction: Vector3): void {
        (this.tank as any).fireShotgunSpread?.(muzzlePos, direction);
    }
    
    /**
     * Выстрел кластерными снарядами
     */
    fireClusterProjectiles(muzzlePos: Vector3, direction: Vector3): void {
        (this.tank as any).fireClusterProjectiles?.(muzzlePos, direction);
    }
}

