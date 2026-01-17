/**
 * @module tank/combat/RicochetSystem
 * @description Реалистичная система рикошета снарядов
 * 
 * Учитывает:
 * - Тип снаряда и его ricochetAngle
 * - Материал поверхности (metal, concrete, ground, armor, water)
 * - Угол попадания
 * - Потерю скорости при каждом отскоке
 * - Случайный разброс направления отскока
 * - Управление видимостью трейла
 */

import { Vector3, Quaternion } from "@babylonjs/core";

// ============================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// ============================================

/**
 * Тип материала поверхности
 */
export type SurfaceMaterial = "metal" | "concrete" | "ground" | "water" | "armor";

/**
 * Параметры рикошета для материала
 */
export interface SurfaceRicochetParams {
    /** Сохранение скорости (0.0 - 1.0) */
    speedRetention: number;
    /** Разброс угла отскока (градусы) */
    deflectionSpread: number;
    /** Бонус/штраф к углу рикошета (градусы) */
    ricochetBonus: number;
    /** Звук при рикошете */
    sound: "metal" | "stone" | "soft" | "water";
}

/**
 * Конфигурация рикошета для снаряда
 */
export interface RicochetConfig {
    /** Максимальное количество рикошетов */
    maxRicochets: number;
    /** Базовая потеря скорости за отскок (0.0 - 1.0) */
    speedLossPerBounce: number;
    /** Минимальная скорость для рикошета (м/с) */
    minSpeedForRicochet: number;
    /** Минимальная скорость для отображения трейла (м/с) */
    minSpeedForTrail: number;
    /** Базовый угол рикошета (градусы) - из типа снаряда */
    baseRicochetAngle: number;
    /** Сохранение скорости при рикошете для конкретной пушки */
    ricochetSpeedRetention?: number;
}

/**
 * Параметры для расчёта рикошета
 */
export interface RicochetParams {
    /** Текущая скорость снаряда (вектор) */
    velocity: Vector3;
    /** Точка попадания */
    hitPoint: Vector3;
    /** Нормаль поверхности в точке попадания */
    hitNormal: Vector3;
    /** Материал поверхности */
    surfaceMaterial: SurfaceMaterial;
    /** Текущее количество рикошетов */
    currentRicochetCount: number;
    /** Тип снаряда (для определения, показывать ли трейл всегда) */
    projectileType?: string;
}

/**
 * Результат расчёта рикошета
 */
export interface RicochetResult {
    /** Произошёл ли рикошет */
    shouldRicochet: boolean;
    /** Новый вектор скорости (если рикошет произошёл) */
    newVelocity: Vector3;
    /** Новая скорость (скаляр) */
    newSpeed: number;
    /** Новое количество рикошетов */
    ricochetCount: number;
    /** Показывать ли трейл */
    showTrail: boolean;
    /** Угол попадания (градусы) */
    impactAngle: number;
    /** Звук для воспроизведения */
    sound: "metal" | "stone" | "soft" | "water" | null;
}

// ============================================
// КОНФИГУРАЦИЯ МАТЕРИАЛОВ
// ============================================

/**
 * Параметры рикошета для разных материалов поверхностей
 */
export const SURFACE_RICOCHET_CONFIG: Record<SurfaceMaterial, SurfaceRicochetParams> = {
    metal: {
        speedRetention: 0.85,
        deflectionSpread: 3,
        ricochetBonus: 5,
        sound: "metal"
    },
    concrete: {
        speedRetention: 0.75,
        deflectionSpread: 8,
        ricochetBonus: 0,
        sound: "stone"
    },
    ground: {
        speedRetention: 0.55,
        deflectionSpread: 15,
        ricochetBonus: -10,
        sound: "soft"
    },
    armor: {
        speedRetention: 0.0,  // No bounce - explode
        deflectionSpread: 0,
        ricochetBonus: -90,   // NEVER ricochet off tanks - always penetrate/explode
        sound: "metal"
    },
    water: {
        speedRetention: 0.30,
        deflectionSpread: 20,
        ricochetBonus: -20,
        sound: "water"
    }
};

/**
 * Конфигурация рикошета по умолчанию
 */
export const DEFAULT_RICOCHET_CONFIG: RicochetConfig = {
    maxRicochets: 3,
    speedLossPerBounce: 0.15,
    minSpeedForRicochet: 15,
    minSpeedForTrail: 50,
    baseRicochetAngle: 70
};

/**
 * Конфигурация для пушки Ricochet
 */
export const RICOCHET_CANNON_CONFIG: RicochetConfig = {
    maxRicochets: 5,
    speedLossPerBounce: 0.10,
    minSpeedForRicochet: 10,
    minSpeedForTrail: 40,
    baseRicochetAngle: 55,
    ricochetSpeedRetention: 0.90
};

// ============================================
// СИСТЕМА РИКОШЕТА
// ============================================

/**
 * Система расчёта рикошета
 */
export class RicochetSystem {
    private config: RicochetConfig;

    constructor(config: Partial<RicochetConfig> = {}) {
        this.config = { ...DEFAULT_RICOCHET_CONFIG, ...config };
    }

    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<RicochetConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Получить текущую конфигурацию
     */
    getConfig(): RicochetConfig {
        return { ...this.config };
    }

    /**
     * Рассчитать угол попадания (угол между направлением снаряда и нормалью поверхности)
     * Возвращает угол в градусах (0° = перпендикулярный удар, 90° = скользящий удар)
     */
    calculateImpactAngle(velocity: Vector3, hitNormal: Vector3): number {
        const direction = velocity.normalize();
        // Угол между направлением и нормалью
        const dot = Math.abs(Vector3.Dot(direction, hitNormal));
        // Угол от поверхности (0° = перпендикулярно, 90° = параллельно)
        const angleFromNormal = Math.acos(Math.min(1, dot)) * (180 / Math.PI);
        // ВОЗВРАЩАЕМ УГОЛ ОТ НОРМАЛИ (0° = прямой удар)
        return angleFromNormal;
    }

    /**
     * Проверить, должен ли произойти рикошет
     */
    shouldRicochet(
        impactAngle: number,
        surfaceMaterial: SurfaceMaterial,
        currentSpeed: number,
        currentRicochetCount: number
    ): boolean {
        // Проверка количества рикошетов
        if (currentRicochetCount >= this.config.maxRicochets) {
            return false;
        }

        // Проверка минимальной скорости
        if (currentSpeed < this.config.minSpeedForRicochet) {
            return false;
        }

        // Получаем параметры материала
        const surfaceParams = SURFACE_RICOCHET_CONFIG[surfaceMaterial];

        // Эффективный угол рикошета = базовый + бонус материала
        const effectiveRicochetAngle = this.config.baseRicochetAngle + surfaceParams.ricochetBonus;

        // Рикошет происходит если угол попадания больше угла рикошета
        // (чем острее угол, тем вероятнее рикошет)
        return impactAngle > effectiveRicochetAngle;
    }

    /**
     * Рассчитать отражённый вектор скорости
     */
    calculateReflection(
        velocity: Vector3,
        hitNormal: Vector3,
        surfaceMaterial: SurfaceMaterial,
        currentRicochetCount: number
    ): { newVelocity: Vector3; newSpeed: number } {
        const direction = velocity.normalize();
        const speed = velocity.length();
        const surfaceParams = SURFACE_RICOCHET_CONFIG[surfaceMaterial];

        // Базовое отражение: V' = V - 2(V·N)N
        const dot = Vector3.Dot(direction, hitNormal);
        const reflection = direction.subtract(hitNormal.scale(2 * dot));

        // Добавляем случайный разброс
        const spreadRadians = (surfaceParams.deflectionSpread * Math.PI) / 180;
        const randomSpread = (Math.random() - 0.5) * 2 * spreadRadians;

        // Создаём случайную ось для вращения (перпендикулярно отражению)
        const randomAxis = Vector3.Cross(reflection, Vector3.Up());
        if (randomAxis.length() < 0.001) {
            randomAxis.copyFrom(Vector3.Right());
        }
        randomAxis.normalize();

        // Вращаем вектор отражения на случайный угол
        const rotationQuat = Quaternion.RotationAxis(randomAxis, randomSpread);
        const finalDirection = reflection.applyRotationQuaternion(rotationQuat);
        finalDirection.normalize();

        // Рассчитываем новую скорость
        // Учитываем: сохранение скорости материала, потерю за каждый рикошет, и бонус пушки
        const baseRetention = this.config.ricochetSpeedRetention ?? surfaceParams.speedRetention;
        const ricochetPenalty = 1 - (currentRicochetCount * 0.05); // -5% за каждый предыдущий рикошет
        const newSpeed = speed * baseRetention * ricochetPenalty;

        return {
            newVelocity: finalDirection.scale(newSpeed),
            newSpeed
        };
    }

    /**
     * Определить, показывать ли трейл
     */
    shouldShowTrail(currentSpeed: number, projectileType?: string): boolean {
        // Трассеры всегда показывают трейл
        if (projectileType === "tracer") {
            return true;
        }
        // Остальные - только при достаточной скорости
        return currentSpeed > this.config.minSpeedForTrail;
    }

    /**
     * Основной метод расчёта рикошета
     */
    calculate(params: RicochetParams): RicochetResult {
        const {
            velocity,
            hitNormal,
            surfaceMaterial,
            currentRicochetCount,
            projectileType
        } = params;

        const currentSpeed = velocity.length();
        const impactAngle = this.calculateImpactAngle(velocity, hitNormal);
        const surfaceParams = SURFACE_RICOCHET_CONFIG[surfaceMaterial];

        // Проверяем, должен ли произойти рикошет
        const shouldRicochetResult = this.shouldRicochet(
            impactAngle,
            surfaceMaterial,
            currentSpeed,
            currentRicochetCount
        );

        if (!shouldRicochetResult) {
            return {
                shouldRicochet: false,
                newVelocity: Vector3.Zero(),
                newSpeed: 0,
                ricochetCount: currentRicochetCount,
                showTrail: false,
                impactAngle,
                sound: null
            };
        }

        // Рассчитываем отражение
        const { newVelocity, newSpeed } = this.calculateReflection(
            velocity,
            hitNormal,
            surfaceMaterial,
            currentRicochetCount
        );

        return {
            shouldRicochet: true,
            newVelocity,
            newSpeed,
            ricochetCount: currentRicochetCount + 1,
            showTrail: this.shouldShowTrail(newSpeed, projectileType),
            impactAngle,
            sound: surfaceParams.sound
        };
    }

    /**
     * Определить материал поверхности по метаданным меша
     */
    static detectSurfaceMaterial(meshMetadata: any, meshName: string): SurfaceMaterial {
        // Проверяем метаданные
        if (meshMetadata?.surfaceMaterial) {
            return meshMetadata.surfaceMaterial as SurfaceMaterial;
        }

        // Проверяем тип объекта
        if (meshMetadata?.type === "playerTank" || meshMetadata?.type === "enemyTank") {
            return "armor";
        }

        if (meshMetadata?.type === "protectiveWall" || meshMetadata?.type === "enemyWall") {
            return "metal";
        }

        // Определяем по имени меша
        const nameLower = meshName.toLowerCase();

        if (nameLower.includes("metal") || nameLower.includes("steel") || nameLower.includes("iron")) {
            return "metal";
        }

        if (nameLower.includes("concrete") || nameLower.includes("stone") || nameLower.includes("brick") || nameLower.includes("wall") || nameLower.includes("building")) {
            return "concrete";
        }

        if (nameLower.includes("water") || nameLower.includes("lake") || nameLower.includes("river")) {
            return "water";
        }

        if (nameLower.includes("tank") || nameLower.includes("armor") || nameLower.includes("turret")) {
            return "armor";
        }

        // По умолчанию - земля
        return "ground";
    }

    /**
     * Создать конфигурацию для конкретного типа пушки
     */
    static createConfigForCannon(cannonId: string, cannonData?: any): RicochetConfig {
        // Специальная конфигурация для пушки Ricochet
        if (cannonId === "ricochet") {
            return { ...RICOCHET_CANNON_CONFIG };
        }

        // Для остальных пушек используем базовую конфигурацию
        // с учётом ricochetAngle из данных снаряда если есть
        const config = { ...DEFAULT_RICOCHET_CONFIG };

        if (cannonData?.ricochetAngle) {
            config.baseRicochetAngle = cannonData.ricochetAngle;
        }

        if (cannonData?.maxRicochets) {
            config.maxRicochets = cannonData.maxRicochets;
        }

        if (cannonData?.ricochetSpeedRetention) {
            config.ricochetSpeedRetention = cannonData.ricochetSpeedRetention;
        }

        return config;
    }
}

// Экспорт синглтона для глобального использования
export const ricochetSystem = new RicochetSystem();

