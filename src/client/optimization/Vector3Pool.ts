/**
 * @module optimization/Vector3Pool
 * @description Object Pool для Vector3 - переиспользование объектов для снижения GC нагрузки
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Vector3Pool - пул объектов Vector3 для переиспользования
 * 
 * Критично для производительности: избегает создания новых объектов каждый кадр,
 * что снижает нагрузку на Garbage Collector и устраняет лаги
 */
export class Vector3Pool {
    private pool: Vector3[] = [];
    private maxSize: number;
    private totalCreated = 0;
    private totalReused = 0;

    constructor(maxSize: number = 50) {
        this.maxSize = maxSize;
    }

    /**
     * Получить Vector3 из пула или создать новый
     */
    acquire(x: number = 0, y: number = 0, z: number = 0): Vector3 {
        const vec = this.pool.pop();
        if (vec) {
            this.totalReused++;
            vec.set(x, y, z);
            return vec;
        }
        this.totalCreated++;
        return new Vector3(x, y, z);
    }

    /**
     * Вернуть Vector3 в пул для переиспользования
     */
    release(vec: Vector3): void {
        if (!vec) return;
        
        // Очищаем вектор
        vec.set(0, 0, 0);
        
        // Добавляем в пул если есть место
        if (this.pool.length < this.maxSize) {
            this.pool.push(vec);
        }
    }

    /**
     * Получить статистику использования пула
     */
    getStats(): { totalCreated: number; totalReused: number; poolSize: number; reuseRate: number } {
        const total = this.totalCreated + this.totalReused;
        const reuseRate = total > 0 ? (this.totalReused / total) * 100 : 0;
        return {
            totalCreated: this.totalCreated,
            totalReused: this.totalReused,
            poolSize: this.pool.length,
            reuseRate
        };
    }

    /**
     * Очистить пул
     */
    clear(): void {
        this.pool.length = 0;
    }
}

/**
 * Глобальный экземпляр пула Vector3
 * Используется во всем приложении для переиспользования векторов
 */
export const vector3Pool = new Vector3Pool(50);
