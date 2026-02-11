/**
 * @module config/aircraftVehicleConfig
 * @description Единая точка конфигурации авиационной физики с поддержкой модификаторов.
 * Используется в AircraftPhysics и AircraftCameraSystem.
 * В консоли: window.aircraftVehicleConfig
 */

import {
    DEFAULT_AIRCRAFT_PHYSICS_CONFIG,
    type AircraftPhysicsConfig
} from "./aircraftPhysicsConfig";

/** Модификаторы, накладываемые на дефолтную конфигурацию самолёта */
export const AIRCRAFT_MODIFIERS: Partial<AircraftPhysicsConfig> = {
    // Пример: maxSpeed: 85, aerodynamics: { maxThrust: 80000 },
};

// Кэш результата после применения модификаторов (оптимизация производительности)
let cachedAircraftConfig: AircraftPhysicsConfig | null = null;
let cachedModifiersHash: string | null = null;

/**
 * Вычисляет хэш модификаторов для проверки изменений
 */
function getModifiersHash(modifiers: Partial<AircraftPhysicsConfig>): string {
    return JSON.stringify(modifiers);
}

/**
 * Возвращает итоговую конфигурацию авиационной физики (база + модификаторы).
 * Используйте в AircraftPhysics и для camera — в AircraftCameraSystem.
 * Результат кэшируется для производительности.
 */
export function getAircraftPhysicsConfig(): AircraftPhysicsConfig {
    const currentHash = getModifiersHash(AIRCRAFT_MODIFIERS);

    // Если модификаторы не изменились и есть кэш - возвращаем кэш
    if (cachedAircraftConfig && cachedModifiersHash === currentHash) {
        return cachedAircraftConfig;
    }

    // Вычисляем и кэшируем результат
    cachedAircraftConfig = deepMergeAircraftConfig(DEFAULT_AIRCRAFT_PHYSICS_CONFIG, AIRCRAFT_MODIFIERS);
    cachedModifiersHash = currentHash;

    return cachedAircraftConfig;
}

/**
 * Слияние конфигов: вложенные объекты (pid, aerodynamics, mouseAim, keyboard, camera)
 * мержатся по полям, остальное перезаписывается из patch.
 */
function deepMergeAircraftConfig(
    base: AircraftPhysicsConfig,
    patch: Partial<AircraftPhysicsConfig>
): AircraftPhysicsConfig {
    const result = { ...base };
    for (const key of Object.keys(patch) as (keyof AircraftPhysicsConfig)[]) {
        const val = patch[key];
        if (val === undefined) continue;
        const baseVal = base[key];
        if (
            baseVal !== null && typeof baseVal === "object" && !Array.isArray(baseVal) &&
            val !== null && typeof val === "object" && !Array.isArray(val)
        ) {
            (result as Record<string, unknown>)[key as string] = { ...(baseVal as object), ...(val as object) };
        } else {
            (result as Record<string, unknown>)[key as string] = val;
        }
    }
    return result;
}

/**
 * Очищает кэш конфигурации (вызывать при изменении AIRCRAFT_MODIFIERS)
 */
export function clearAircraftConfigCache(): void {
    cachedAircraftConfig = null;
    cachedModifiersHash = null;
}

declare global {
    interface Window {
        aircraftVehicleConfig?: {
            AIRCRAFT_MODIFIERS: Partial<AircraftPhysicsConfig>;
            getAircraftPhysicsConfig: typeof getAircraftPhysicsConfig;
            clearAircraftConfigCache: () => void;
        };
    }
}

if (typeof window !== "undefined") {
    (window as Window).aircraftVehicleConfig = {
        AIRCRAFT_MODIFIERS,
        getAircraftPhysicsConfig,
        clearAircraftConfigCache
    };
}
