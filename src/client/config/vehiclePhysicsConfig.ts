/**
 * @module config/vehiclePhysicsConfig
 * @description Модификаторы параметров корпусов и пушек для разработки и тестов.
 * Базовые значения — в tankTypes.ts; здесь задаются только переопределения по id.
 * В консоли: window.vehiclePhysicsConfig
 */

/** Модификаторы по id корпуса (частичные поля ChassisType) */
export const CHASSIS_MODIFIERS: Record<string, object> = {};

/** Модификаторы по id пушки (частичные поля CannonType) */
export const CANNON_MODIFIERS: Record<string, object> = {};

/**
 * Применяет модификатор корпуса по id. Не мутирует base.
 */
export function applyChassisModifiers<T extends object>(base: T, id: string): T {
    const mod = CHASSIS_MODIFIERS[id];
    return mod ? ({ ...base, ...mod } as T) : base;
}

/**
 * Применяет модификатор пушки по id. Не мутирует base.
 */
export function applyCannonModifiers<T extends object>(base: T, id: string): T {
    const mod = CANNON_MODIFIERS[id];
    return mod ? ({ ...base, ...mod } as T) : base;
}

/**
 * Очищает кэш результатов после применения модификаторов.
 * Вызывать после изменения CHASSIS_MODIFIERS или CANNON_MODIFIERS.
 */
export function clearVehiclePhysicsCache(): void {
    // Импортируем функцию очистки из tankTypes.ts
    const { clearVehiclePhysicsCache: clearCache } = require('../tankTypes');
    clearCache();
}

declare global {
    interface Window {
        vehiclePhysicsConfig?: {
            CHASSIS_MODIFIERS: Record<string, object>;
            CANNON_MODIFIERS: Record<string, object>;
            applyChassisModifiers: typeof applyChassisModifiers;
            applyCannonModifiers: typeof applyCannonModifiers;
            clearVehiclePhysicsCache: typeof clearVehiclePhysicsCache;
        };
    }
}

if (typeof window !== "undefined") {
    (window as Window).vehiclePhysicsConfig = {
        CHASSIS_MODIFIERS,
        CANNON_MODIFIERS,
        applyChassisModifiers,
        applyCannonModifiers,
        clearVehiclePhysicsCache // [Opus 4.6] add missing method
    };
}
