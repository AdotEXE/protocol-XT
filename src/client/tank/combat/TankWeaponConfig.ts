/**
 * @module tank/combat/TankWeaponConfig
 * @description Конфигурация вооружения танка
 */

/**
 * Параметры орудия
 */
export interface WeaponParams {
    /** Урон снаряда */
    damage: number;
    /** Скорость снаряда */
    projectileSpeed: number;
    /** Время перезарядки (сек) */
    reloadTime: number;
    /** Радиус разброса (градусов) */
    accuracy: number;
    /** Бронепробиваемость (мм) */
    penetration: number;
    /** Радиус взрыва (для ОФ) */
    explosionRadius?: number;
}

/**
 * Типы боеприпасов
 */
export const AMMO_TYPES = {
    TRACER: "tracer",
    AP: "ap",
    APCR: "apcr",
    HE: "he",
    APDS: "apds"
} as const;

export type AmmoType = typeof AMMO_TYPES[keyof typeof AMMO_TYPES];

/**
 * Параметры для разных типов снарядов
 */
export const AMMO_PARAMS: Record<AmmoType, Partial<WeaponParams>> = {
    [AMMO_TYPES.TRACER]: {
        damage: 80,
        projectileSpeed: 800,
        accuracy: 0.5,
        penetration: 100
    },
    [AMMO_TYPES.AP]: {
        damage: 120,
        projectileSpeed: 700,
        accuracy: 0.8,
        penetration: 150
    },
    [AMMO_TYPES.APCR]: {
        damage: 100,
        projectileSpeed: 900,
        accuracy: 0.6,
        penetration: 200
    },
    [AMMO_TYPES.HE]: {
        damage: 150,
        projectileSpeed: 500,
        accuracy: 1.2,
        penetration: 50,
        explosionRadius: 5
    },
    [AMMO_TYPES.APDS]: {
        damage: 130,
        projectileSpeed: 1000,
        accuracy: 0.4,
        penetration: 250
    }
};

/**
 * Состояние вооружения
 */
export interface WeaponState {
    /** Текущий тип снаряда */
    currentAmmoType: AmmoType;
    /** Прогресс перезарядки (0-1) */
    reloadProgress: number;
    /** Готово ли орудие к стрельбе */
    isReady: boolean;
    /** Идёт ли перезарядка */
    isReloading: boolean;
    /** Количество снарядов по типам */
    ammoCount: Record<AmmoType, number>;
}

/**
 * Начальное количество снарядов
 */
export const DEFAULT_AMMO_COUNT: Record<AmmoType, number> = {
    [AMMO_TYPES.TRACER]: 999,
    [AMMO_TYPES.AP]: 20,
    [AMMO_TYPES.APCR]: 10,
    [AMMO_TYPES.HE]: 15,
    [AMMO_TYPES.APDS]: 5
};

export default { AMMO_TYPES, AMMO_PARAMS, DEFAULT_AMMO_COUNT };

