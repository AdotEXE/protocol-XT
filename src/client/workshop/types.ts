/**
 * @module workshop/types
 * @description TypeScript интерфейсы для Workshop Editor
 * 
 * Все типы данных для кастомных конфигураций танков
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Полная конфигурация кастомного танка
 */
export interface CustomTankConfiguration {
    id: string;
    name: string;
    
    // Базовая модель (из существующих типов)
    baseModel: {
        chassisId: string;
        cannonId: string;
        trackId: string;
    };
    
    // Точки крепления (координаты относительно корпуса)
    turretPivot: { x: number; y: number; z: number };
    barrelMount: { x: number; y: number; z: number };
    
    // Параметры движения
    movement: {
        maxForwardSpeed: number;      // м/с
        maxBackwardSpeed: number;     // м/с
        acceleration: number;         // м/с²
        deceleration: number;         // м/с²
        turnSpeed: number;            // град/с
        pivotTurnMultiplier: number;  // Множитель поворота на месте
        friction?: number;            // Трение (опционально)
    };
    
    // Параметры боя
    combat: {
        damage: number;               // Урон
        cooldown: number;             // мс перезарядки
        projectileSpeed: number;      // м/с
        projectileSize: number;        // Размер снаряда
        maxRange: number;             // м дальность
        recoilForce?: number;         // Н сила отдачи (опционально)
        recoilTorque?: number;        // Н·м крутящий момент отдачи (опционально)
    };
    
    // Физические параметры
    physics: {
        mass: number;                 // кг
        hoverHeight: number;          // м
        hoverStiffness: number;       // Жесткость подвески
        hoverDamping?: number;        // Демпфирование (опционально)
        linearDamping?: number;       // Линейное демпфирование (опционально)
        angularDamping?: number;      // Угловое демпфирование (опционально)
        uprightForce?: number;        // Н сила выравнивания (опционально)
        stabilityForce?: number;      // Н сила стабильности (опционально)
    };
    
    // Параметры башни
    turret: {
        turretSpeed: number;          // рад/кадр скорость поворота
        baseTurretSpeed?: number;     // Базовая скорость (опционально)
        turretLerpSpeed?: number;     // Скорость интерполяции (опционально)
        barrelPitchSpeed: number;     // Скорость наклона ствола
        barrelPitchRange?: {          // Диапазон углов (опционально)
            min: number;
            max: number;
        };
    };
    
    // Особые возможности
    special: {
        ability?: string;              // ID способности
        abilityCooldown?: number;      // мс перезарядки способности
        abilityDuration?: number;      // мс длительности способности
        modules: string[];            // Список ID модулей
    };
    
    // Визуальная настройка
    visual: {
        chassisColor: string;          // Hex цвет корпуса
        turretColor: string;           // Hex цвет башни
        barrelColor: string;           // Hex цвет ствола
    };
    
    // Метаданные
    createdAt: number;                // Timestamp создания
    modifiedAt: number;               // Timestamp последнего изменения
}

/**
 * Частичная конфигурация (для редактирования)
 */
export type PartialTankConfiguration = Partial<CustomTankConfiguration>;

/**
 * Параметры по умолчанию для создания новой конфигурации
 */
export function getDefaultConfiguration(
    chassisId: string,
    cannonId: string,
    trackId: string
): Partial<CustomTankConfiguration> {
    return {
        baseModel: {
            chassisId,
            cannonId,
            trackId
        },
        turretPivot: { x: 0, y: 0, z: 0 },
        barrelMount: { x: 0, y: 0, z: 0 },
        movement: {
            maxForwardSpeed: 24,
            maxBackwardSpeed: 12,
            acceleration: 20,
            deceleration: 30,
            turnSpeed: 60,
            pivotTurnMultiplier: 1.5
        },
        combat: {
            damage: 25,
            cooldown: 1000,
            projectileSpeed: 50,
            projectileSize: 0.2,
            maxRange: 200
        },
        physics: {
            mass: 50000,
            hoverHeight: 1.0,
            hoverStiffness: 7000
        },
        turret: {
            turretSpeed: 0.08,
            barrelPitchSpeed: 0.05
        },
        special: {
            modules: []
        },
        visual: {
            chassisColor: '#00ff00',
            turretColor: '#00ff00',
            barrelColor: '#888888'
        }
    };
}

/**
 * Конвертирует Vector3 в объект координат
 */
export function vector3ToCoords(v: Vector3): { x: number; y: number; z: number } {
    return { x: v.x, y: v.y, z: v.z };
}

/**
 * Конвертирует объект координат в Vector3
 */
export function coordsToVector3(coords: { x: number; y: number; z: number }): Vector3 {
    return new Vector3(coords.x, coords.y, coords.z);
}

