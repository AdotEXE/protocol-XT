// ═══════════════════════════════════════════════════════════════════════════
// GAME VISIBILITY - Проверка видимости танков и башен
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, Ray } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { Scene } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { EnemyTank } from "../enemyTank";
import type { HUD } from "../hud";

/**
 * GameVisibility - Проверка видимости танков и башен
 * 
 * Отвечает за:
 * - Проверку видимости танка игрока (за стеной или нет)
 * - Обновление видимости башен врагов
 * - Плавное изменение прозрачности при скрытии за стенами
 */
export class GameVisibility {
    // Состояние видимости танка игрока
    private tankVisibilityState = false; // false = виден, true = за стеной
    private tankVisibilityTarget = false;
    private tankVisibilitySmooth = 0.0; // 0.0 = виден, 1.0 = за стеной
    
    // Ссылки на системы
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected enemyTanks: EnemyTank[] = [];
    
    /**
     * Инициализация системы видимости
     */
    initialize(
        scene: Scene,
        tank: TankController | undefined,
        hud: HUD | undefined,
        enemyTanks: EnemyTank[] = []
    ): void {
        this.scene = scene;
        this.tank = tank;
        this.hud = hud;
        this.enemyTanks = enemyTanks;
        
        logger.log("[GameVisibility] Visibility system initialized");
    }
    
    /**
     * Проверка видимости танка игрока
     */
    checkPlayerTankVisibility(camera: any): void {
        if (!this.tank || !this.tank.chassis || !this.scene || !camera) return;
        
        const tankPos = this.tank.chassis.getAbsolutePosition();
        const cameraPos = camera.position;
        
        // Направление от камеры к танку
        const direction = tankPos.subtract(cameraPos);
        const distance = direction.length();
        direction.normalize();
        
        // Проверяем, есть ли препятствие между камерой и танком
        const ray = new Ray(cameraPos, direction);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            
            // Игнорируем сам танк
            if (mesh === this.tank?.chassis || 
                mesh === this.tank?.turret || 
                mesh === this.tank?.barrel) {
                return false;
            }
            
            // Игнорируем эффекты и частицы
            if (mesh.name.includes("particle") || mesh.name.includes("effect") || 
                mesh.name.includes("trail") || mesh.name.includes("bullet")) {
                return false;
            }
            
            return true;
        });
        
        // Определяем, виден ли танк
        if (hit && hit.hit && hit.distance !== null && hit.distance < distance * 0.95) {
            // Есть препятствие - танк за стеной
            this.tankVisibilityTarget = true;
        } else {
            // Нет препятствия - танк виден
            this.tankVisibilityTarget = false;
        }
        
        // Плавно интерполируем состояние видимости
        const smoothSpeed = 0.15;
        this.tankVisibilitySmooth += (this.tankVisibilityTarget ? 1.0 : 0.0 - this.tankVisibilitySmooth) * smoothSpeed;
        
        // Обновляем видимость танка
        if (this.tankVisibilitySmooth > 0.1) {
            // Танк за стеной - делаем его полупрозрачным
            const alpha = 1.0 - this.tankVisibilitySmooth * 0.7; // До 70% прозрачности
            if (this.tank.chassis && this.tank.chassis.material) {
                (this.tank.chassis.material as any).alpha = alpha;
            }
            if (this.tank.turret && this.tank.turret.material) {
                (this.tank.turret.material as any).alpha = alpha;
            }
            if (this.tank.barrel && this.tank.barrel.material) {
                (this.tank.barrel.material as any).alpha = alpha;
            }
        } else {
            // Танк виден - полностью непрозрачный
            if (this.tank.chassis && this.tank.chassis.material) {
                (this.tank.chassis.material as any).alpha = 1.0;
            }
            if (this.tank.turret && this.tank.turret.material) {
                (this.tank.turret.material as any).alpha = 1.0;
            }
            if (this.tank.barrel && this.tank.barrel.material) {
                (this.tank.barrel.material as any).alpha = 1.0;
            }
        }
        
        this.tankVisibilityState = this.tankVisibilityTarget;
    }
    
    /**
     * Обновление видимости башен врагов
     */
    updateEnemyTurretsVisibility(camera: any): void {
        if (!this.scene || !camera) return;
        
        for (const enemy of this.enemyTanks) {
            if (!enemy || !enemy.isAlive || !enemy.turret) continue;
            
            const turretPos = enemy.turret.getAbsolutePosition();
            const cameraPos = camera.position;
            
            // Направление от камеры к башне
            const direction = turretPos.subtract(cameraPos);
            const distance = direction.length();
            direction.normalize();
            
            // Проверяем, есть ли препятствие
            const ray = new Ray(cameraPos, direction);
            const hit = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled()) return false;
                
                // Игнорируем сам врага
                if (mesh === enemy.chassis || 
                    mesh === enemy.turret || 
                    mesh === enemy.barrel) {
                    return false;
                }
                
                // Игнорируем эффекты
                if (mesh.name.includes("particle") || mesh.name.includes("effect")) {
                    return false;
                }
                
                return true;
            });
            
            // Обновляем видимость башни
            if (hit && hit.hit && hit.distance !== null && hit.distance < distance * 0.95) {
                // Башня за стеной - делаем её полупрозрачной
                if (enemy.turret.material) {
                    (enemy.turret.material as any).alpha = 0.3;
                }
            } else {
                // Башня видна - полностью непрозрачная
                if (enemy.turret.material) {
                    (enemy.turret.material as any).alpha = 1.0;
                }
            }
        }
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        tank?: TankController;
        hud?: HUD;
        enemyTanks?: EnemyTank[];
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.enemyTanks !== undefined) this.enemyTanks = callbacks.enemyTanks;
    }
    
    /**
     * Dispose системы видимости
     */
    dispose(): void {
        this.tank = undefined;
        this.hud = undefined;
        this.enemyTanks = [];
        
        logger.log("[GameVisibility] Visibility system disposed");
    }
}

