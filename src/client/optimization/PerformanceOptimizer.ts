/**
 * @module optimization/PerformanceOptimizer
 * @description Централизованный оптимизатор производительности
 */

import { Scene, Mesh, Vector3, AbstractMesh, TransformNode } from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Конфигурация оптимизатора
 */
export interface OptimizerConfig {
    // LOD расстояния
    lodNearDistance: number;    // Полная детализация
    lodMediumDistance: number;  // Средняя детализация
    lodFarDistance: number;     // Минимальная детализация
    lodCullDistance: number;    // Скрытие объекта
    
    // Обновление
    updateInterval: number;     // Интервал обновления LOD (мс)
    maxObjectsPerFrame: number; // Максимум объектов на кадр
    
    // Пулинг
    maxPoolSize: number;
    
    // Тени и эффекты
    shadowDistance: number;
    particleDistance: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
    lodNearDistance: 100,
    lodMediumDistance: 200,
    lodFarDistance: 400,
    lodCullDistance: 600,
    updateInterval: 100,
    maxObjectsPerFrame: 50,
    maxPoolSize: 100,
    shadowDistance: 150,
    particleDistance: 200
};

/**
 * LOD уровень
 */
export type LODLevel = "high" | "medium" | "low" | "culled";

/**
 * Данные оптимизации объекта
 */
interface OptimizedObjectData {
    mesh: AbstractMesh;
    originalVisibility: number;
    currentLOD: LODLevel;
    lastUpdate: number;
    distanceSquared: number;
}

/**
 * PerformanceOptimizer - Оптимизатор производительности
 * 
 * Отвечает за:
 * - LOD управление (Level of Detail)
 * - Culling далёких объектов
 * - Пулинг объектов
 * - Оптимизация обновлений
 */
export class PerformanceOptimizer {
    private scene: Scene;
    private config: OptimizerConfig;
    
    // Отслеживаемые объекты
    private trackedObjects: Map<string, OptimizedObjectData> = new Map();
    
    // Позиция камеры/игрока
    private referencePosition: Vector3 = Vector3.Zero();
    
    // Пул объектов
    private objectPools: Map<string, AbstractMesh[]> = new Map();
    
    // Статистика
    private stats = {
        totalObjects: 0,
        visibleObjects: 0,
        culledObjects: 0,
        lastUpdateTime: 0
    };
    
    // Индекс для batch обработки
    private updateIndex = 0;
    private objectKeys: string[] = [];
    
    constructor(scene: Scene, config: Partial<OptimizerConfig> = {}) {
        this.scene = scene;
        this.config = { ...DEFAULT_OPTIMIZER_CONFIG, ...config };
        
        logger.log("[PerformanceOptimizer] Initialized");
    }
    
    /**
     * Обновление позиции референса (камера/игрок)
     */
    setReferencePosition(position: Vector3): void {
        this.referencePosition = position.clone();
    }
    
    /**
     * Регистрация объекта для оптимизации
     */
    registerObject(mesh: AbstractMesh, id?: string): void {
        const objId = id || mesh.uniqueId.toString();
        
        if (this.trackedObjects.has(objId)) return;
        
        this.trackedObjects.set(objId, {
            mesh,
            originalVisibility: mesh.visibility,
            currentLOD: "high",
            lastUpdate: 0,
            distanceSquared: 0
        });
        
        // Обновляем список ключей для batch обработки
        this.objectKeys = Array.from(this.trackedObjects.keys());
        this.stats.totalObjects = this.trackedObjects.size;
    }
    
    /**
     * Массовая регистрация
     */
    registerObjects(meshes: AbstractMesh[]): void {
        for (const mesh of meshes) {
            this.registerObject(mesh);
        }
    }
    
    /**
     * Удаление объекта из отслеживания
     */
    unregisterObject(id: string): void {
        this.trackedObjects.delete(id);
        this.objectKeys = Array.from(this.trackedObjects.keys());
        this.stats.totalObjects = this.trackedObjects.size;
    }
    
    /**
     * Обновление LOD для всех объектов (batch)
     */
    update(): void {
        // ОПТИМИЗАЦИЯ: Кэшируем Date.now() результат на несколько кадров
        const now = Date.now();
        if (now - this.stats.lastUpdateTime < this.config.updateInterval) return;
        this.stats.lastUpdateTime = now;
        
        const objectCount = this.objectKeys.length;
        if (objectCount === 0) return;
        
        // Обрабатываем batch объектов за кадр
        const batchSize = Math.min(this.config.maxObjectsPerFrame, objectCount);
        let processed = 0;
        let visible = 0;
        let culled = 0;
        
        while (processed < batchSize) {
            const key = this.objectKeys[this.updateIndex];
            if (!key) break; // Защита от undefined
            
            const data = this.trackedObjects.get(key);
            
            if (data && data.mesh && !data.mesh.isDisposed()) {
                const lodLevel = this.updateObjectLOD(data);
                
                if (lodLevel === "culled") {
                    culled++;
                } else {
                    visible++;
                }
            } else if (data) {
                // Объект удалён - очищаем
                this.trackedObjects.delete(key);
            }
            
            this.updateIndex = (this.updateIndex + 1) % objectCount;
            processed++;
        }
        
        // ОПТИМИЗАЦИЯ: Обновляем ключи только если действительно были удаления
        // Используем более эффективный способ вместо Array.from
        if (this.trackedObjects.size !== objectCount) {
            this.objectKeys.length = 0; // Очищаем массив
            for (const key of this.trackedObjects.keys()) {
                this.objectKeys.push(key);
            }
        }
        
        this.stats.visibleObjects = visible;
        this.stats.culledObjects = culled;
    }
    
    /**
     * Обновление LOD для одного объекта
     */
    private updateObjectLOD(data: OptimizedObjectData): LODLevel {
        const mesh = data.mesh;
        
        // ОПТИМИЗАЦИЯ: Используем position вместо absolutePosition для производительности
        // Для статических объектов position уже в мировых координатах
        // Для динамических объектов (с родителем) используем position, который синхронизирован с физикой
        // Это избегает дорогого вычисления мировых матриц через absolutePosition
        const meshPos = mesh.position;
        
        // Вычисляем квадрат расстояния (быстрее чем корень)
        const dx = meshPos.x - this.referencePosition.x;
        const dy = meshPos.y - this.referencePosition.y;
        const dz = meshPos.z - this.referencePosition.z;
        data.distanceSquared = dx * dx + dy * dy + dz * dz;
        
        // Определяем LOD уровень
        const nearSq = this.config.lodNearDistance * this.config.lodNearDistance;
        const mediumSq = this.config.lodMediumDistance * this.config.lodMediumDistance;
        const farSq = this.config.lodFarDistance * this.config.lodFarDistance;
        const cullSq = this.config.lodCullDistance * this.config.lodCullDistance;
        
        let newLOD: LODLevel;
        
        if (data.distanceSquared > cullSq) {
            newLOD = "culled";
        } else if (data.distanceSquared > farSq) {
            newLOD = "low";
        } else if (data.distanceSquared > mediumSq) {
            newLOD = "medium";
        } else {
            newLOD = "high";
        }
        
        // Применяем изменения только если LOD изменился
        if (newLOD !== data.currentLOD) {
            this.applyLOD(data, newLOD);
            data.currentLOD = newLOD;
        }
        
        return newLOD;
    }
    
    /**
     * Применение LOD настроек к объекту
     */
    private applyLOD(data: OptimizedObjectData, level: LODLevel): void {
        const mesh = data.mesh;
        
        switch (level) {
            case "high":
                mesh.isVisible = true;
                mesh.visibility = data.originalVisibility;
                if (mesh instanceof Mesh) {
                    mesh.simplify([]);
                }
                break;
                
            case "medium":
                mesh.isVisible = true;
                mesh.visibility = data.originalVisibility;
                break;
                
            case "low":
                mesh.isVisible = true;
                mesh.visibility = data.originalVisibility * 0.8;
                break;
                
            case "culled":
                mesh.isVisible = false;
                break;
        }
    }
    
    /**
     * Оптимизация статического меша
     */
    optimizeStaticMesh(mesh: Mesh): void {
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
        mesh.cullingStrategy = Mesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
        
        // Замораживаем материал
        if (mesh.material && !mesh.material.isFrozen) {
            mesh.material.freeze();
        }
    }
    
    /**
     * Оптимизация всех статических мешей в сцене
     */
    optimizeAllStaticMeshes(): number {
        let count = 0;
        
        for (const mesh of this.scene.meshes) {
            if (mesh instanceof Mesh) {
                const meta = mesh.metadata;
                
                // Оптимизируем статические объекты (здания, террейн и т.д.)
                if (meta?.type === "static" || 
                    mesh.name.includes("ground") || 
                    mesh.name.includes("building") ||
                    mesh.name.includes("wall")) {
                    
                    this.optimizeStaticMesh(mesh);
                    count++;
                }
            }
        }
        
        logger.log(`[PerformanceOptimizer] Optimized ${count} static meshes`);
        return count;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // OBJECT POOLING
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Получение объекта из пула или создание нового
     */
    getFromPool<T extends AbstractMesh>(
        poolName: string, 
        createFn: () => T
    ): T {
        const pool = this.objectPools.get(poolName);
        
        if (pool && pool.length > 0) {
            const obj = pool.pop() as T;
            obj.isVisible = true;
            obj.setEnabled(true);
            return obj;
        }
        
        return createFn();
    }
    
    /**
     * Возврат объекта в пул
     */
    returnToPool(poolName: string, mesh: AbstractMesh): boolean {
        let pool = this.objectPools.get(poolName);
        
        if (!pool) {
            pool = [];
            this.objectPools.set(poolName, pool);
        }
        
        if (pool.length >= this.config.maxPoolSize) {
            // Пул полон - удаляем объект
            mesh.dispose();
            return false;
        }
        
        mesh.isVisible = false;
        mesh.setEnabled(false);
        pool.push(mesh);
        
        return true;
    }
    
    /**
     * Очистка пула
     */
    clearPool(poolName: string): void {
        const pool = this.objectPools.get(poolName);
        if (pool) {
            for (const mesh of pool) {
                mesh.dispose();
            }
            pool.length = 0;
        }
    }
    
    /**
     * Очистка всех пулов
     */
    clearAllPools(): void {
        for (const [name] of this.objectPools) {
            this.clearPool(name);
        }
        this.objectPools.clear();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STATISTICS
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Получение статистики
     */
    getStats(): {
        totalObjects: number;
        visibleObjects: number;
        culledObjects: number;
        pooledObjects: number;
    } {
        let pooledCount = 0;
        for (const pool of this.objectPools.values()) {
            pooledCount += pool.length;
        }
        
        return {
            ...this.stats,
            pooledObjects: pooledCount
        };
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        this.clearAllPools();
        this.trackedObjects.clear();
        this.objectKeys = [];
        
        logger.log("[PerformanceOptimizer] Disposed");
    }
}

