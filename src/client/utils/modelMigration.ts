/**
 * @module utils/modelMigration
 * @description Миграция старых форматов моделей в новые версии
 * 
 * Обеспечивает обратную совместимость при загрузке старых моделей.
 */

import { CustomTankConfiguration } from '../workshop/types';

/**
 * Мигрирует модель из старой версии в новую
 * 
 * @param data - Данные модели
 * @param fromVersion - Версия исходного формата
 * @param toVersion - Целевая версия формата
 * @returns Мигрированные данные
 */
export function migrateModel(data: any, fromVersion: string, toVersion: string): any {
    // Если версии совпадают, возвращаем как есть
    if (fromVersion === toVersion) {
        return data;
    }

    // Миграция с версии без метаданных (старый формат) в 1.0
    if (fromVersion === '0.0' || !fromVersion) {
        return migrateFromLegacy(data);
    }

    // Миграция с 1.0 в более новые версии (пока нет)
    if (fromVersion === '1.0' && toVersion !== '1.0') {
        // Пока нет новых версий, возвращаем как есть
        return data;
    }

    // Если версия неизвестна, пытаемся определить формат
    if (!data.metadata) {
        // Старый формат без метаданных
        return migrateFromLegacy(data);
    }

    // Неизвестная версия - возвращаем как есть с предупреждением
    console.warn(`[ModelMigration] Unknown version ${fromVersion}, returning as-is`);
    return data;
}

/**
 * Мигрирует из старого формата (без метаданных) в новый
 */
function migrateFromLegacy(data: any): CustomTankConfiguration {
    // Если это уже CustomTankConfiguration, возвращаем как есть
    if (isValidCustomTankConfig(data)) {
        return data as CustomTankConfiguration;
    }

    // Пытаемся восстановить структуру из старого формата
    const migrated: Partial<CustomTankConfiguration> = {
        id: data.id || `legacy_${Date.now()}`,
        name: data.name || 'Legacy Tank',
        baseModel: data.baseModel || {
            chassisId: data.chassisId || 'medium',
            cannonId: data.cannonId || 'standard',
            trackId: data.trackId || 'standard'
        },
        turretPivot: data.turretPivot || { x: 0, y: 0, z: 0 },
        barrelMount: data.barrelMount || { x: 0, y: 0, z: 0 },
        movement: data.movement || {
            maxForwardSpeed: data.maxForwardSpeed || 24,
            maxBackwardSpeed: data.maxBackwardSpeed || 12,
            acceleration: data.acceleration || 20,
            deceleration: data.deceleration || 30,
            turnSpeed: data.turnSpeed || 60,
            pivotTurnMultiplier: data.pivotTurnMultiplier || 1.5
        },
        combat: data.combat || {
            damage: data.damage || 25,
            cooldown: data.cooldown || 1000,
            projectileSpeed: data.projectileSpeed || 50,
            projectileSize: data.projectileSize || 0.2,
            maxRange: data.maxRange || 200
        },
        physics: data.physics || {
            mass: data.mass || 50000,
            hoverHeight: data.hoverHeight || 1.0,
            hoverStiffness: data.hoverStiffness || 7000
        },
        turret: data.turret || {
            turretSpeed: data.turretSpeed || 0.08,
            barrelPitchSpeed: data.barrelPitchSpeed || 0.05
        },
        special: data.special || {
            modules: data.modules || []
        },
        visual: data.visual || {
            chassisColor: data.chassisColor || '#00ff00',
            turretColor: data.turretColor || '#00ff00',
            barrelColor: data.barrelColor || '#888888'
        },
        createdAt: data.createdAt || Date.now(),
        modifiedAt: data.modifiedAt || Date.now()
    };

    return migrated as CustomTankConfiguration;
}

/**
 * Проверяет, является ли объект валидной конфигурацией CustomTankConfiguration
 */
function isValidCustomTankConfig(data: any): boolean {
    return (
        data &&
        typeof data === 'object' &&
        typeof data.id === 'string' &&
        typeof data.name === 'string' &&
        data.baseModel &&
        typeof data.baseModel.chassisId === 'string' &&
        typeof data.baseModel.cannonId === 'string' &&
        typeof data.baseModel.trackId === 'string' &&
        data.movement &&
        data.combat &&
        data.physics &&
        data.turret &&
        data.special &&
        data.visual
    );
}

/**
 * Автоматически определяет версию модели и мигрирует при необходимости
 */
export function autoMigrateModel(data: any): CustomTankConfiguration {
    // Если модель уже имеет метаданные, используем версию из метаданных
    if (data.metadata && data.data) {
        const version = data.metadata.version || '0.0';
        return migrateModel(data.data, version, '1.0') as CustomTankConfiguration;
    }

    // Старый формат без метаданных
    return migrateFromLegacy(data);
}




