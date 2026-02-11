/**
 * @module utils/exportBaseTankTypes
 * @description Экспорт базовых типов танков в JSON файлы
 * 
 * Экспортирует CHASSIS_TYPES, CANNON_TYPES, TRACK_TYPES с валидацией.
 */

import { CHASSIS_TYPES, CANNON_TYPES, ChassisType, CannonType } from '../tankTypes';
import { TRACK_TYPES, TrackType } from '../trackTypes';
import { validateBaseTankType } from './modelValidator';
import { saveBaseTankType } from './modelFileSaver';
import { logger } from './logger';

/**
 * Экспортирует все базовые типы танков
 */
export async function exportBaseTankTypes(): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Экспорт корпусов
    try {
        // Валидируем каждый тип перед сохранением
        const validChassis: ChassisType[] = [];
        for (const chassis of CHASSIS_TYPES) {
            const validation = validateBaseTankType(chassis, 'chassis');
            if (validation.valid) {
                validChassis.push(chassis);
            } else {
                errors.push(`Invalid chassis ${chassis.id}: ${validation.errors.join(', ')}`);
            }
        }

        if (validChassis.length > 0) {
            const result = await saveBaseTankType('base-chassis-types', validChassis, 'chassis');
            if (!result.success) {
                errors.push(`Failed to save chassis types: ${result.error}`);
            } else {
                logger.log(`[ExportBaseTypes] Exported ${validChassis.length} chassis types`);
            }
        }
    } catch (e) {
        errors.push(`Error exporting chassis types: ${e}`);
    }

    // Экспорт пушек
    try {
        const validCannons: CannonType[] = [];
        for (const cannon of CANNON_TYPES) {
            const validation = validateBaseTankType(cannon, 'cannon');
            if (validation.valid) {
                validCannons.push(cannon);
            } else {
                errors.push(`Invalid cannon ${cannon.id}: ${validation.errors.join(', ')}`);
            }
        }

        if (validCannons.length > 0) {
            const result = await saveBaseTankType('base-cannon-types', validCannons, 'cannon');
            if (!result.success) {
                errors.push(`Failed to save cannon types: ${result.error}`);
            } else {
                logger.log(`[ExportBaseTypes] Exported ${validCannons.length} cannon types`);
            }
        }
    } catch (e) {
        errors.push(`Error exporting cannon types: ${e}`);
    }

    // Экспорт гусениц
    try {
        const validTracks: TrackType[] = [];
        for (const track of TRACK_TYPES) {
            const validation = validateBaseTankType(track, 'track');
            if (validation.valid) {
                validTracks.push(track);
            } else {
                errors.push(`Invalid track ${track.id}: ${validation.errors.join(', ')}`);
            }
        }

        if (validTracks.length > 0) {
            const result = await saveBaseTankType('base-track-types', validTracks, 'track');
            if (!result.success) {
                errors.push(`Failed to save track types: ${result.error}`);
            } else {
                logger.log(`[ExportBaseTypes] Exported ${validTracks.length} track types`);
            }
        }
    } catch (e) {
        errors.push(`Error exporting track types: ${e}`);
    }

    // Создаем индексный файл
    try {
        const index = {
            chassis: CHASSIS_TYPES.map(c => ({ id: c.id, name: c.name })),
            cannons: CANNON_TYPES.map(c => ({ id: c.id, name: c.name })),
            tracks: TRACK_TYPES.map(t => ({ id: t.id, name: t.name })),
            exportedAt: Date.now(),
            version: '1.0'
        };

        const { saveModelToFile } = await import('./modelFileSaver');
        const result = await saveModelToFile('base-types-index', index, 'base-types', false);
        if (!result.success) {
            errors.push(`Failed to save index: ${result.error}`);
        }
    } catch (e) {
        errors.push(`Error creating index: ${e}`);
    }

    return {
        success: errors.length === 0,
        errors
    };
}

/**
 * Экспортирует базовые типы при инициализации (если нужно)
 */
export function exportBaseTankTypesOnInit(): void {
    // Экспортируем асинхронно, не блокируя инициализацию
    exportBaseTankTypes().then(result => {
        if (result.success) {
            logger.log('[ExportBaseTypes] Base tank types exported successfully');
        } else {
            logger.warn('[ExportBaseTypes] Export completed with errors:', result.errors);
        }
    }).catch(e => {
        logger.error('[ExportBaseTypes] Failed to export base tank types:', e);
    });
}

/**
 * Экспортирует все части танка (каждую модель отдельно) при инициализации
 */
export function exportAllTankPartsOnInit(): void {
    // Импортируем динамически чтобы избежать циклических зависимостей
    import('./exportAllTankParts').then(module => {
        module.exportAllTankPartsOnInit();
    }).catch(e => {
        logger.error('[ExportBaseTypes] Failed to import exportAllTankParts:', e);
    });
}

