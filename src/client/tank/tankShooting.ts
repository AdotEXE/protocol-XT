/**
 * @module tank/tankShooting
 * @description Система стрельбы танка - конфигурация, типы и вспомогательные функции
 * 
 * Этот модуль содержит:
 * - Типы и интерфейсы для стрельбы
 * - Конфигурацию оружия
 * - Вспомогательные функции для баллистики
 */

import { Vector3 } from "@babylonjs/core";

// ============================================
// ТИПЫ СНАРЯДОВ
// ============================================

export type ProjectileType = 
    | "ap"           // Armor-Piercing (бронебойный)
    | "he"           // High-Explosive (осколочный)
    | "heat"         // High-Explosive Anti-Tank (кумулятивный)
    | "apcr"         // Armor-Piercing Composite Rigid (подкалиберный)
    | "hesh"         // High-Explosive Squash Head
    | "tracer"       // Трассирующий
    | "incendiary"   // Зажигательный
    | "smoke"        // Дымовой
    | "guided";      // Управляемый

/**
 * Данные снаряда
 */
export interface ProjectileData {
    type: ProjectileType;
    damage: number;
    penetration: number;       // Пробитие (мм)
    speed: number;             // Скорость (м/с)
    gravity: number;           // Влияние гравитации
    explosionRadius: number;   // Радиус взрыва (для HE)
    ricochetAngle: number;     // Угол рикошета (градусы)
    normalizeAngle: number;    // Угол нормализации
    tracerColor?: string;      // Цвет трассера
}

/**
 * Результат выстрела
 */
export interface ShotResult {
    hit: boolean;
    position: Vector3;
    normal: Vector3;
    targetId?: string;
    damage: number;
    penetrated: boolean;
    ricochet: boolean;
    criticalHit: boolean;
}

// ============================================
// КОНФИГУРАЦИЯ СНАРЯДОВ
// ============================================

export const PROJECTILE_CONFIGS: Record<ProjectileType, ProjectileData> = {
    ap: {
        type: "ap",
        damage: 100,
        penetration: 150,
        speed: 800,
        gravity: 0.3,
        explosionRadius: 0,
        ricochetAngle: 70,
        normalizeAngle: 5,
        tracerColor: "#ffaa00"
    },
    he: {
        type: "he",
        damage: 120,
        penetration: 30,
        speed: 600,
        gravity: 0.5,
        explosionRadius: 5,
        ricochetAngle: 85,
        normalizeAngle: 0,
        tracerColor: "#ff6600"
    },
    heat: {
        type: "heat",
        damage: 130,
        penetration: 200,
        speed: 700,
        gravity: 0.2,
        explosionRadius: 2,
        ricochetAngle: 60,
        normalizeAngle: 0,
        tracerColor: "#ff0000"
    },
    apcr: {
        type: "apcr",
        damage: 90,
        penetration: 220,
        speed: 1000,
        gravity: 0.2,
        explosionRadius: 0,
        ricochetAngle: 60,
        normalizeAngle: 3,
        tracerColor: "#ffff00"
    },
    hesh: {
        type: "hesh",
        damage: 150,
        penetration: 100,
        speed: 500,
        gravity: 0.6,
        explosionRadius: 3,
        ricochetAngle: 80,
        normalizeAngle: 0,
        tracerColor: "#00ff00"
    },
    tracer: {
        type: "tracer",
        damage: 80,
        penetration: 120,
        speed: 850,
        gravity: 0.3,
        explosionRadius: 0,
        ricochetAngle: 70,
        normalizeAngle: 5,
        tracerColor: "#00ffff"
    },
    incendiary: {
        type: "incendiary",
        damage: 60,
        penetration: 50,
        speed: 600,
        gravity: 0.4,
        explosionRadius: 4,
        ricochetAngle: 85,
        normalizeAngle: 0,
        tracerColor: "#ff4400"
    },
    smoke: {
        type: "smoke",
        damage: 0,
        penetration: 0,
        speed: 400,
        gravity: 0.8,
        explosionRadius: 10,
        ricochetAngle: 90,
        normalizeAngle: 0,
        tracerColor: "#888888"
    },
    guided: {
        type: "guided",
        damage: 200,
        penetration: 250,
        speed: 300,
        gravity: 0,
        explosionRadius: 3,
        ricochetAngle: 0,
        normalizeAngle: 0,
        tracerColor: "#ff00ff"
    }
};

// ============================================
// КОНФИГУРАЦИЯ ОТДАЧИ
// ============================================

export interface RecoilConfig {
    force: number;
    torque: number;
    recovery: number;
    maxDisplacement: number;
    pattern: "linear" | "random" | "spiral";
}

export const DEFAULT_RECOIL_CONFIG: RecoilConfig = {
    force: 15000,
    torque: 200,
    recovery: 0.1,
    maxDisplacement: 0.5,
    pattern: "linear"
};

// ============================================
// КОНФИГУРАЦИЯ ПЕРЕЗАРЯДКИ
// ============================================

export interface ReloadConfig {
    baseTime: number;           // Базовое время перезарядки (мс)
    magazineSize: number;       // Размер магазина
    autoReload: boolean;        // Авто-перезарядка
    canInterrupt: boolean;      // Можно прервать
    soundOnComplete: boolean;   // Звук по завершении
}

export const DEFAULT_RELOAD_CONFIG: ReloadConfig = {
    baseTime: 3000,
    magazineSize: 1,
    autoReload: true,
    canInterrupt: false,
    soundOnComplete: true
};

// ============================================
// СОСТОЯНИЕ СТРЕЛЬБЫ
// ============================================

export interface ShootingState {
    isReloading: boolean;
    reloadProgress: number;     // 0-1
    lastShotTime: number;
    currentAmmo: number;
    maxAmmo: number;
    ammoType: ProjectileType;
    consecutiveShots: number;
    accuracy: number;           // Текущая точность (0-1)
    heatLevel: number;          // Перегрев (0-1)
}

export function createInitialShootingState(): ShootingState {
    return {
        isReloading: false,
        reloadProgress: 0,
        lastShotTime: 0,
        currentAmmo: 30,
        maxAmmo: 30,
        ammoType: "ap",
        consecutiveShots: 0,
        accuracy: 1.0,
        heatLevel: 0
    };
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Вычислить позицию дула
 */
export function calculateMuzzlePosition(
    barrelPosition: Vector3,
    barrelDirection: Vector3,
    barrelLength: number
): Vector3 {
    return barrelPosition.add(barrelDirection.scale(barrelLength));
}

/**
 * Вычислить направление выстрела с учётом разброса
 */
export function calculateSpreadDirection(
    baseDirection: Vector3,
    spreadAngle: number,
    accuracy: number = 1.0
): Vector3 {
    const effectiveSpread = spreadAngle * (1 - accuracy);
    
    if (effectiveSpread <= 0) return baseDirection.clone();
    
    // Случайное отклонение в сферических координатах
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * effectiveSpread * (Math.PI / 180);
    
    // Создаём базис
    const up = Math.abs(baseDirection.y) < 0.9 
        ? Vector3.Up() 
        : Vector3.Right();
    const right = Vector3.Cross(baseDirection, up).normalize();
    const actualUp = Vector3.Cross(right, baseDirection).normalize();
    
    // Применяем отклонение
    const spreadX = Math.sin(phi) * Math.cos(theta);
    const spreadY = Math.sin(phi) * Math.sin(theta);
    
    return baseDirection.add(
        right.scale(spreadX).add(actualUp.scale(spreadY))
    ).normalize();
}

/**
 * Вычислить траекторию снаряда
 */
export function calculateTrajectory(
    startPosition: Vector3,
    direction: Vector3,
    speed: number,
    gravity: number,
    time: number
): Vector3 {
    const displacement = direction.scale(speed * time);
    displacement.y -= 0.5 * gravity * 9.81 * time * time;
    return startPosition.add(displacement);
}

/**
 * Вычислить время полёта до цели
 */
export function calculateFlightTime(
    distance: number,
    speed: number,
    gravity: number,
    heightDiff: number = 0
): number {
    // Упрощённая формула для плоской траектории
    const horizontalTime = distance / speed;
    
    // Корректировка на гравитацию
    if (gravity > 0 && heightDiff !== 0) {
        const g = gravity * 9.81;
        const discriminant = speed * speed - 2 * g * heightDiff;
        if (discriminant > 0) {
            return (speed - Math.sqrt(discriminant)) / g;
        }
    }
    
    return horizontalTime;
}

/**
 * Проверить пробитие брони
 */
export function checkPenetration(
    penetration: number,
    armorThickness: number,
    hitAngle: number,
    normalizeAngle: number
): { penetrated: boolean; effectiveArmor: number } {
    // Нормализация угла
    const effectiveAngle = Math.max(0, hitAngle - normalizeAngle);
    
    // Эффективная толщина брони
    const effectiveArmor = armorThickness / Math.cos(effectiveAngle * Math.PI / 180);
    
    return {
        penetrated: penetration > effectiveArmor,
        effectiveArmor
    };
}

/**
 * Проверить рикошет
 */
export function checkRicochet(
    hitAngle: number,
    ricochetAngle: number
): boolean {
    return hitAngle > ricochetAngle;
}

/**
 * Вычислить урон после пробития
 */
export function calculateDamageAfterPenetration(
    baseDamage: number,
    penetration: number,
    effectiveArmor: number,
    criticalMultiplier: number = 1.0
): number {
    // Коэффициент пробития
    const penetrationRatio = penetration / effectiveArmor;
    
    // Урон уменьшается если пробитие близко к толщине брони
    let damageMultiplier = Math.min(1.0, penetrationRatio);
    
    // Бонус за избыточное пробитие
    if (penetrationRatio > 1.2) {
        damageMultiplier = 1.0 + (penetrationRatio - 1.2) * 0.1;
    }
    
    return baseDamage * damageMultiplier * criticalMultiplier;
}

/**
 * Вычислить перегрев орудия
 */
export function calculateHeatLevel(
    currentHeat: number,
    shotFired: boolean,
    deltaTime: number,
    coolingRate: number = 0.1,
    heatPerShot: number = 0.15
): number {
    let newHeat = currentHeat;
    
    if (shotFired) {
        newHeat = Math.min(1.0, newHeat + heatPerShot);
    }
    
    // Охлаждение со временем
    newHeat = Math.max(0, newHeat - coolingRate * deltaTime);
    
    return newHeat;
}

/**
 * Получить штраф к точности от перегрева
 */
export function getHeatAccuracyPenalty(heatLevel: number): number {
    if (heatLevel < 0.5) return 1.0;
    if (heatLevel < 0.8) return 1.0 - (heatLevel - 0.5) * 0.3;
    return 0.85 - (heatLevel - 0.8) * 0.5;
}

/**
 * Получить штраф к точности от движения
 */
export function getMovementAccuracyPenalty(
    linearSpeed: number,
    angularSpeed: number,
    baseAccuracy: number = 1.0
): number {
    const linearPenalty = Math.min(0.3, linearSpeed * 0.02);
    const angularPenalty = Math.min(0.2, angularSpeed * 0.1);
    return Math.max(0.5, baseAccuracy - linearPenalty - angularPenalty);
}

/**
 * Получить данные о снаряде по типу
 */
export function getProjectileData(type: ProjectileType): ProjectileData {
    return { ...PROJECTILE_CONFIGS[type] };
}

/**
 * Форматировать время перезарядки
 */
export function formatReloadTime(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Форматировать урон
 */
export function formatDamage(damage: number): string {
    return Math.round(damage).toString();
}

/**
 * Форматировать пробитие
 */
export function formatPenetration(penetration: number): string {
    return `${Math.round(penetration)}mm`;
}

export default {
    PROJECTILE_CONFIGS,
    DEFAULT_RECOIL_CONFIG,
    DEFAULT_RELOAD_CONFIG
};
