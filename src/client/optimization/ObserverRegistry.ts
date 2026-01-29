/**
 * @module optimization/ObserverRegistry
 * @description Реестр для управления Babylon.js observers и предотвращения утечек памяти
 * 
 * ПРОБЛЕМА: 18 вызовов onBeforeRenderObservable.add() могут накапливаться без очистки
 * РЕШЕНИЕ: Централизованный реестр с автоочисткой при dispose
 * 
 * ОЖИДАЕМЫЙ ЭФФЕКТ: +1-2 FPS (предотвращает деградацию производительности со временем)
 */

import type { Scene, Observer, Observable } from "@babylonjs/core";

/**
 * Типы observers которые могут накапливаться
 */
export type ObserverType = 
    | "beforeRender" 
    | "afterRender" 
    | "beforePhysics" 
    | "afterPhysics"
    | "pointerMove"
    | "pointerDown"
    | "pointerUp"
    | "keyDown"
    | "keyUp";

interface RegisteredObserver {
    type: ObserverType;
    observer: Observer<any>;
    observable: Observable<any>;
    owner: string; // Для отладки - кто создал observer
    createdAt: number;
}

/**
 * ObserverRegistry - централизованное управление observers
 * 
 * Использование:
 * ```typescript
 * const registry = ObserverRegistry.getInstance();
 * 
 * // Регистрация observer
 * registry.registerBeforeRender(scene, "EnemyTank", () => {
 *     // callback
 * });
 * 
 * // При уничтожении объекта
 * registry.disposeByOwner("EnemyTank");
 * 
 * // При завершении игры
 * registry.disposeAll();
 * ```
 */
export class ObserverRegistry {
    private static instance: ObserverRegistry;
    private observers: Map<string, RegisteredObserver[]> = new Map();
    private observerIdCounter = 0;

    private constructor() {
        // Singleton
    }

    public static getInstance(): ObserverRegistry {
        if (!ObserverRegistry.instance) {
            ObserverRegistry.instance = new ObserverRegistry();
        }
        return ObserverRegistry.instance;
    }

    /**
     * Регистрирует observer для beforeRender
     */
    registerBeforeRender(scene: Scene, owner: string, callback: () => void): string {
        const observer = scene.onBeforeRenderObservable.add(callback);
        return this.register("beforeRender", observer!, scene.onBeforeRenderObservable, owner);
    }

    /**
     * Регистрирует observer для afterRender
     */
    registerAfterRender(scene: Scene, owner: string, callback: () => void): string {
        const observer = scene.onAfterRenderObservable.add(callback);
        return this.register("afterRender", observer!, scene.onAfterRenderObservable, owner);
    }

    /**
     * Регистрирует observer для beforePhysics
     */
    registerBeforePhysics(scene: Scene, owner: string, callback: () => void): string {
        const observer = scene.onBeforePhysicsObservable?.add(callback);
        if (observer && scene.onBeforePhysicsObservable) {
            return this.register("beforePhysics", observer, scene.onBeforePhysicsObservable, owner);
        }
        return "";
    }

    /**
     * Регистрирует observer для afterPhysics
     */
    registerAfterPhysics(scene: Scene, owner: string, callback: () => void): string {
        const observer = scene.onAfterPhysicsObservable?.add(callback);
        if (observer && scene.onAfterPhysicsObservable) {
            return this.register("afterPhysics", observer, scene.onAfterPhysicsObservable, owner);
        }
        return "";
    }

    /**
     * Внутренний метод регистрации
     */
    private register(
        type: ObserverType, 
        observer: Observer<any>, 
        observable: Observable<any>, 
        owner: string
    ): string {
        const id = `obs_${this.observerIdCounter++}`;
        
        const registered: RegisteredObserver = {
            type,
            observer,
            observable,
            owner,
            createdAt: Date.now()
        };

        if (!this.observers.has(owner)) {
            this.observers.set(owner, []);
        }
        this.observers.get(owner)!.push(registered);

        return id;
    }

    /**
     * Удаляет все observers по владельцу
     */
    disposeByOwner(owner: string): number {
        const ownerObservers = this.observers.get(owner);
        if (!ownerObservers) return 0;

        let disposed = 0;
        for (const reg of ownerObservers) {
            try {
                reg.observable.remove(reg.observer);
                disposed++;
            } catch (e) {
                // Observer уже удалён или observable disposed
            }
        }

        this.observers.delete(owner);
        return disposed;
    }

    /**
     * Удаляет все зарегистрированные observers
     */
    disposeAll(): number {
        let total = 0;
        for (const owner of this.observers.keys()) {
            total += this.disposeByOwner(owner);
        }
        return total;
    }

    /**
     * Удаляет observers по типу
     */
    disposeByType(type: ObserverType): number {
        let disposed = 0;
        for (const [owner, ownerObservers] of this.observers) {
            const remaining: RegisteredObserver[] = [];
            for (const reg of ownerObservers) {
                if (reg.type === type) {
                    try {
                        reg.observable.remove(reg.observer);
                        disposed++;
                    } catch (e) {
                        // Ignore
                    }
                } else {
                    remaining.push(reg);
                }
            }
            if (remaining.length > 0) {
                this.observers.set(owner, remaining);
            } else {
                this.observers.delete(owner);
            }
        }
        return disposed;
    }

    /**
     * Получить статистику по observers
     */
    getStats(): { total: number; byOwner: Map<string, number>; byType: Map<ObserverType, number> } {
        const byOwner = new Map<string, number>();
        const byType = new Map<ObserverType, number>();
        let total = 0;

        for (const [owner, ownerObservers] of this.observers) {
            byOwner.set(owner, ownerObservers.length);
            total += ownerObservers.length;
            
            for (const reg of ownerObservers) {
                byType.set(reg.type, (byType.get(reg.type) || 0) + 1);
            }
        }

        return { total, byOwner, byType };
    }

    /**
     * Найти утёкшие observers (созданы более N секунд назад)
     */
    findLeaks(maxAgeMs: number = 60000): RegisteredObserver[] {
        const now = Date.now();
        const leaks: RegisteredObserver[] = [];

        for (const ownerObservers of this.observers.values()) {
            for (const reg of ownerObservers) {
                if (now - reg.createdAt > maxAgeMs) {
                    leaks.push(reg);
                }
            }
        }

        return leaks;
    }

    /**
     * Логирует статистику в консоль (для отладки)
     */
    logStats(): void {
        const stats = this.getStats();
        console.log(`[ObserverRegistry] Total: ${stats.total}`);
        console.log(`[ObserverRegistry] By owner:`, Object.fromEntries(stats.byOwner));
        console.log(`[ObserverRegistry] By type:`, Object.fromEntries(stats.byType));
    }
}

/**
 * Глобальный экземпляр реестра
 */
export const observerRegistry = ObserverRegistry.getInstance();

