/**
 * @module tank/combat
 * @description Модуль вооружения танка
 * 
 * Включает:
 * - TankWeaponConfig - конфигурация боеприпасов
 * - TankAiming - система прицеливания
 * - TankDamage - система урона
 * - RicochetSystem - система рикошета
 */

// Конфигурация оружия
export { AMMO_TYPES, AMMO_PARAMS, DEFAULT_AMMO_COUNT } from './TankWeaponConfig';
export type { WeaponParams, WeaponState, AmmoType } from './TankWeaponConfig';

// Система прицеливания
export { TankAiming, DEFAULT_AIMING_CONFIG } from './TankAiming';
export type { AimingConfig, AimingState, TrajectoryResult } from './TankAiming';

// Система урона
export { TankDamage, DAMAGE_TYPES, DEFAULT_ARMOR_CONFIG, VULNERABLE_MODULES } from './TankDamage';
export type { DamageType, DamageData, DamageResult, ArmorConfig } from './TankDamage';

// Система рикошета
export { 
    RicochetSystem, 
    ricochetSystem,
    SURFACE_RICOCHET_CONFIG as RICOCHET_SURFACE_CONFIG,
    DEFAULT_RICOCHET_CONFIG,
    RICOCHET_CANNON_CONFIG 
} from './RicochetSystem';
export type { 
    SurfaceMaterial, 
    SurfaceRicochetParams,
    RicochetConfig, 
    RicochetParams, 
    RicochetResult 
} from './RicochetSystem';

