/**
 * @module optimization/ProjectilePool
 * @description Object Pool для снарядов - переиспользование объектов для снижения GC нагрузки
 * 
 * КРИТИЧНО для производительности: избегает создания/удаления мешей каждый кадр,
 * что снижает нагрузку на Garbage Collector и устраняет лаги при интенсивной стрельбе
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, PhysicsBody, PhysicsShape, PhysicsShapeType, PhysicsMotionType, Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Конфигурация пула снарядов
 */
export interface ProjectilePoolConfig {
    initialSize: number;      // Начальный размер пула
    maxSize: number;          // Максимальный размер пула
    bulletSize: number;       // Размер снаряда
    bulletDepth: number;      // Глубина снаряда
    filterMembershipMask?: number; // Physics membership mask (default 8 = player projectile)
}

const DEFAULT_CONFIG: ProjectilePoolConfig = {
    initialSize: 20,
    maxSize: 100,
    bulletSize: 0.3,
    bulletDepth: 1.2
};

/**
 * Данные снаряда в пуле
 */
interface PooledProjectile {
    mesh: Mesh;
    physicsBody: PhysicsBody | null;
    isActive: boolean;
    createdAt: number;
}

/**
 * ProjectilePool - пул объектов снарядов для переиспользования
 */
export class ProjectilePool {
    private scene: Scene;
    private config: ProjectilePoolConfig;
    private pool: PooledProjectile[] = [];
    private activeProjectiles: Set<PooledProjectile> = new Set();
    private baseMaterial: StandardMaterial | null = null;
    
    // Статистика
    private totalCreated = 0;
    private totalReused = 0;
    private totalDisposed = 0;

    constructor(scene: Scene, config: Partial<ProjectilePoolConfig> = {}) {
        this.scene = scene;
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // Создаем базовый материал для снарядов
        this.baseMaterial = new StandardMaterial("projectilePoolMat", scene);
        this.baseMaterial.disableLighting = true;
        
        // Предзаполняем пул
        this.preallocate();
    }

    /**
     * Предзаполнение пула
     */
    private preallocate(): void {
        for (let i = 0; i < this.config.initialSize; i++) {
            const projectile = this.createProjectile();
            this.pool.push(projectile);
        }
    }

    /**
     * Создать новый снаряд
     */
    private createProjectile(): PooledProjectile {
        const mesh = MeshBuilder.CreateBox(`projectile_pool_${this.totalCreated}`, {
            width: this.config.bulletSize,
            height: this.config.bulletSize,
            depth: this.config.bulletDepth
        }, this.scene);
        
        mesh.isVisible = false;
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        
        // Используем базовый материал (цвет будет меняться динамически)
        mesh.material = this.baseMaterial;
        
        // Создаем физическое тело (но не активируем сразу)
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: { 
                extents: new Vector3(
                    this.config.bulletSize * 0.8, 
                    this.config.bulletSize * 0.8, 
                    this.config.bulletDepth * 0.8
                )
            }
        }, this.scene);
        
        shape.filterMembershipMask = this.config.filterMembershipMask ?? 8; // Projectile (8=player, 16=enemy)
        shape.filterCollideMask = 1 | 2 | 32 | 64; // Player, environment, walls
        shape.material = { friction: 0, restitution: 0.0 };
        
        const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        body.setMassProperties({ mass: 0.001 });
        body.setLinearDamping(0.01);
        
        // Отключаем физику по умолчанию
        body.setMotionType(PhysicsMotionType.STATIC);
        
        return {
            mesh,
            physicsBody: body,
            isActive: false,
            createdAt: Date.now()
        };
    }

    /**
     * Получить снаряд из пула
     */
    acquire(position: Vector3, direction: Vector3, color: Color3, damage: number, owner: any, cannonType?: string): Mesh | null {
        let projectile: PooledProjectile | undefined;
        
        // Пытаемся взять из пула
        if (this.pool.length > 0) {
            projectile = this.pool.pop();
            this.totalReused++;
        } else {
            // Если пул пуст, создаем новый (но не больше maxSize)
            if (this.activeProjectiles.size < this.config.maxSize) {
                projectile = this.createProjectile();
                this.totalCreated++;
            } else {
                // Пул переполнен - возвращаем null
                logger.warn("[ProjectilePool] Pool exhausted, skipping projectile");
                return null;
            }
        }
        
        if (!projectile) return null;
        
        // Активируем снаряд
        projectile.isActive = true;
        projectile.mesh.isVisible = true;
        projectile.mesh.position.copyFrom(position);
        projectile.mesh.lookAt(position.add(direction));
        
        // Обновляем материал (цвет)
        if (projectile.mesh.material instanceof StandardMaterial) {
            projectile.mesh.material.diffuseColor = color;
            projectile.mesh.material.emissiveColor = color.scale(2.0);
        }
        
        // Обновляем метаданные
        projectile.mesh.metadata = {
            type: "bullet",
            owner: owner,
            damage: damage,
            cannonType: cannonType || "standard",
            shootTime: Date.now(),
            fromPool: true
        };
        
        // Активируем физику
        if (projectile.physicsBody) {
            projectile.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
            projectile.physicsBody.applyImpulse(direction.scale(3), position);
        }
        
        this.activeProjectiles.add(projectile);
        
        return projectile.mesh;
    }

    /**
     * Acquire a projectile for enemy use (enemyBullet metadata type).
     * Uses shared material if provided, otherwise falls back to color-based.
     */
    acquireForEnemy(
        position: Vector3,
        direction: Vector3,
        damage: number,
        owner: any,
        cannonType: string,
        impulseMultiplier: number = 1,
        sharedMaterial?: StandardMaterial
    ): Mesh | null {
        let projectile: PooledProjectile | undefined;

        if (this.pool.length > 0) {
            projectile = this.pool.pop();
            this.totalReused++;
        } else {
            if (this.activeProjectiles.size < this.config.maxSize) {
                projectile = this.createProjectile();
                this.totalCreated++;
            } else {
                return null;
            }
        }

        if (!projectile) return null;

        projectile.isActive = true;
        projectile.mesh.isVisible = true;
        projectile.mesh.position.copyFrom(position);
        projectile.mesh.lookAt(position.add(direction));

        // Use shared material if provided
        if (sharedMaterial) {
            projectile.mesh.material = sharedMaterial;
        }

        projectile.mesh.metadata = {
            type: "enemyBullet",
            owner: owner,
            damage: damage,
            cannonType: cannonType,
            shootTime: Date.now(),
            fromPool: true
        };

        if (projectile.physicsBody) {
            projectile.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
            projectile.physicsBody.applyImpulse(direction.scale(3 * impulseMultiplier), position);
        }

        this.activeProjectiles.add(projectile);
        return projectile.mesh;
    }

    /**
     * Вернуть снаряд в пул
     */
    release(mesh: Mesh): void {
        if (!mesh || mesh.isDisposed()) return;
        
        // Находим снаряд в активных
        let projectile: PooledProjectile | undefined;
        for (const proj of this.activeProjectiles) {
            if (proj.mesh === mesh) {
                projectile = proj;
                break;
            }
        }
        
        if (!projectile) {
            // Снаряд не из пула - просто удаляем
            mesh.dispose();
            return;
        }

        // Защита от двойного release
        if (!projectile.isActive) return;
        
        // Деактивируем
        projectile.isActive = false;
        projectile.mesh.isVisible = false;
        projectile.mesh.position.set(0, -1000, 0); // Перемещаем далеко
        
        // Останавливаем физику
        if (projectile.physicsBody) {
            projectile.physicsBody.setMotionType(PhysicsMotionType.STATIC);
            projectile.physicsBody.setLinearVelocity(Vector3.Zero());
            projectile.physicsBody.setAngularVelocity(Vector3.Zero());
        }
        
        // Очищаем метаданные
        projectile.mesh.metadata = {};
        
        // Удаляем из активных
        this.activeProjectiles.delete(projectile);
        
        // Возвращаем в пул
        if (this.pool.length < this.config.maxSize) {
            this.pool.push(projectile);
        } else {
            // Пул переполнен - удаляем
            this.disposeProjectile(projectile);
            this.totalDisposed++;
        }
    }

    /**
     * Удалить снаряд полностью
     */
    private disposeProjectile(projectile: PooledProjectile): void {
        if (projectile.physicsBody) {
            projectile.physicsBody.dispose();
        }
        if (projectile.mesh && !projectile.mesh.isDisposed()) {
            projectile.mesh.dispose();
        }
    }

    /**
     * Очистить все активные снаряды
     */
    clear(): void {
        // Возвращаем все активные в пул
        const active = Array.from(this.activeProjectiles);
        for (const projectile of active) {
            this.release(projectile.mesh);
        }
        
        // Очищаем пул
        for (const projectile of this.pool) {
            this.disposeProjectile(projectile);
        }
        this.pool = [];
    }

    /**
     * Получить статистику
     */
    getStats(): {
        poolSize: number;
        activeCount: number;
        totalCreated: number;
        totalReused: number;
        totalDisposed: number;
        reuseRate: number;
    } {
        const total = this.totalCreated + this.totalReused;
        const reuseRate = total > 0 ? (this.totalReused / total) * 100 : 0;
        
        return {
            poolSize: this.pool.length,
            activeCount: this.activeProjectiles.size,
            totalCreated: this.totalCreated,
            totalReused: this.totalReused,
            totalDisposed: this.totalDisposed,
            reuseRate
        };
    }

    /**
     * Очистить при dispose
     */
    dispose(): void {
        this.clear();
        if (this.baseMaterial) {
            this.baseMaterial.dispose();
            this.baseMaterial = null;
        }
    }
}

