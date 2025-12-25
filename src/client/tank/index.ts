/**
 * @module tank
 * @description Главный файл экспорта компонентов танка
 */

// Шасси
export type { ChassisType } from './chassis';
export { CHASSIS_TYPES, getChassisById } from './chassis';

// Пушки
export type { CannonType } from './cannons';
export { CANNON_TYPES, getCannonById } from './cannons';

// Гусеницы
export type { TrackType } from './tracks';
export { TRACK_TYPES, getTrackById } from './tracks';

// Модули
export type { ModuleType } from './modules';
export { MODULE_PRESETS, getModuleById } from './modules';

// Припасы
export type { SupplyType } from './supplies';
export { SUPPLY_PRESETS, getSupplyById } from './supplies';

// Арсенал (снаряды)
export type { ShellTypeId, ShellType } from './arsenal';
export { SHELL_TYPES, getShellTypeById } from './arsenal';

// Двигатели
export type { EngineType } from './engines';
export { ENGINE_PRESETS, getEngineById } from './engines';

// Движение
export type { TankMovementParams, TankMovementState } from './movement';
export { DEFAULT_MOVEMENT_PARAMS, CHASSIS_MOVEMENT_PARAMS } from './movement';

// Вооружение
export type { WeaponParams, WeaponState, AmmoType } from './combat';
export { AMMO_TYPES, AMMO_PARAMS, DEFAULT_AMMO_COUNT } from './combat';
