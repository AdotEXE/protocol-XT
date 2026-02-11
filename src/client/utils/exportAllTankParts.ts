/**
 * @module utils/exportAllTankParts
 * @description Экспорт всех частей танка и самолёта в отдельные JSON файлы
 * 
 * Экспортирует каждую модель (корпус, башня, ствол, гусеницы, модули, самолёт)
 * в отдельный JSON файл в папку json_models.
 */

import { CHASSIS_TYPES } from '../tankTypes';
import { CANNON_TYPES } from '../tankTypes';
import { TRACK_TYPES } from '../trackTypes';
import { MODULE_PRESETS } from '../tank/modules/ModuleTypes';
import { MODULES } from '../config/moduleRegistry';
import { saveModelToFile } from './modelFileSaver';
import { logger } from './logger';
import { logger } from './logger';

// Импортируем данные модели самолёта из chassisDetails
// Эти данные используются для создания визуальной модели самолёта
const PLANE_MODEL_DATA = [
    { name: "fuselage_main", position: { x: 0, y: 0, z: 0 }, size: { x: 2.0, y: 1.2, z: 10.0 }, color: "#8E9399" },
    { name: "nose_base", position: { x: 0, y: -0.2, z: 6 }, size: { x: 1.2, y: 1.0, z: 2 }, color: "#8E9399" },
    { name: "nose_tip", position: { x: 0, y: -0.2, z: 7.8 }, size: { x: 0.6, y: 0.6, z: 1.6 }, color: "#4A4A4A" },
    { name: "cockpit_front", position: { x: 0, y: 0.6, z: 5.2 }, size: { x: 0.7, y: 0.4, z: 1.2 }, color: "#2A3B4C", alpha: 0.8 },
    { name: "cockpit_rear", position: { x: 0, y: 0.6, z: 4 }, size: { x: 0.7, y: 0.4, z: 1.2 }, color: "#2A3B4C", alpha: 0.8 },
    { name: "intake_left", position: { x: -1.3, y: -0.2, z: 1.5 }, size: { x: 0.8, y: 1.2, z: 4.5 }, color: "#8E9399" },
    { name: "intake_right", position: { x: 1.3, y: -0.2, z: 1.5 }, size: { x: 0.8, y: 1.2, z: 4.5 }, color: "#8E9399" },
    { name: "wing_left_inner", position: { x: -2, y: 0.25, z: 0.5 }, size: { x: 2, y: 0.1, z: 4 }, color: "#8E9399" },
    { name: "wing_right_inner", position: { x: 2, y: 0.25, z: 0.5 }, size: { x: 2, y: 0.1, z: 4 }, color: "#8E9399" },
    { name: "wing_left_outer", position: { x: -4, y: 0.25, z: -1 }, size: { x: 2, y: 0.1, z: 3 }, color: "#8E9399" },
    { name: "wing_right_outer", position: { x: 4, y: 0.25, z: -1 }, size: { x: 2, y: 0.1, z: 3 }, color: "#8E9399" },
    { name: "vertical_fin_left", position: { x: -0.85, y: 1.5, z: -4 }, size: { x: 0.1, y: 1.8, z: 3 }, color: "#8E9399", rotationZ: -5 },
    { name: "vertical_fin_right", position: { x: 0.85, y: 1.5, z: -4 }, size: { x: 0.1, y: 1.8, z: 3 }, color: "#8E9399", rotationZ: 5 },
    { name: "horizontal_tail_left", position: { x: -2.5, y: 0, z: -5.5 }, size: { x: 2, y: 0.1, z: 2.5 }, color: "#8E9399" },
    { name: "horizontal_tail_right", position: { x: 2.5, y: 0, z: -5.5 }, size: { x: 2, y: 0.1, z: 2.5 }, color: "#8E9399" },
    { name: "engine_nozzle_left", position: { x: -0.6, y: -0.2, z: -5.8 }, size: { x: 1.0, y: 1.0, z: 1.8 }, color: "#333333", emissive: "#1a0500" },
    { name: "engine_nozzle_right", position: { x: 0.6, y: -0.2, z: -5.8 }, size: { x: 1.0, y: 1.0, z: 1.8 }, color: "#333333", emissive: "#1a0500" },
    { name: "front_gear", position: { x: 0, y: -1.2, z: 5.5 }, size: { x: 0.3, y: 0.8, z: 0.3 }, color: "#1A1A1A" },
    { name: "rear_gear_left", position: { x: -1.2, y: -1.2, z: -1 }, size: { x: 0.5, y: 0.8, z: 0.5 }, color: "#1A1A1A" },
    { name: "rear_gear_right", position: { x: 1.2, y: -1.2, z: -1 }, size: { x: 0.5, y: 0.8, z: 0.5 }, color: "#1A1A1A" }
];

/**
 * Экспортирует все корпуса танков
 */
async function exportAllChassis(): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let successCount = 0;

    for (const chassis of CHASSIS_TYPES) {
        try {
            const filename = `chassis-${chassis.id}.json`;
            const result = await saveModelToFile(filename, chassis, 'base-types', false);
            
            if (result.success) {
                successCount++;
                logger.log(`[ExportAllParts] Exported chassis: ${chassis.id}`);
            } else {
                errors.push(`Failed to export chassis ${chassis.id}: ${result.error}`);
            }
        } catch (e) {
            errors.push(`Error exporting chassis ${chassis.id}: ${e}`);
        }
    }

    return { success: successCount, errors };
}

/**
 * Экспортирует все пушки
 */
async function exportAllCannons(): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let successCount = 0;

    for (const cannon of CANNON_TYPES) {
        try {
            const filename = `cannon-${cannon.id}.json`;
            const result = await saveModelToFile(filename, cannon, 'base-types', false);
            
            if (result.success) {
                successCount++;
                logger.log(`[ExportAllParts] Exported cannon: ${cannon.id}`);
            } else {
                errors.push(`Failed to export cannon ${cannon.id}: ${result.error}`);
            }
        } catch (e) {
            errors.push(`Error exporting cannon ${cannon.id}: ${e}`);
        }
    }

    return { success: successCount, errors };
}

/**
 * Экспортирует все гусеницы
 */
async function exportAllTracks(): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let successCount = 0;

    for (const track of TRACK_TYPES) {
        try {
            const filename = `track-${track.id}.json`;
            const result = await saveModelToFile(filename, track, 'base-types', false);
            
            if (result.success) {
                successCount++;
                logger.log(`[ExportAllParts] Exported track: ${track.id}`);
            } else {
                errors.push(`Failed to export track ${track.id}: ${result.error}`);
            }
        } catch (e) {
            errors.push(`Error exporting track ${track.id}: ${e}`);
        }
    }

    return { success: successCount, errors };
}

/**
 * Экспортирует все модули (из MODULE_PRESETS и MODULES)
 */
async function exportAllModules(): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let successCount = 0;
    const exportedIds = new Set<string>();

    // Экспортируем модули из MODULE_PRESETS
    for (const module of MODULE_PRESETS) {
        if (exportedIds.has(module.id)) continue; // Пропускаем дубликаты
        
        try {
            const filename = `module-${module.id}.json`;
            const result = await saveModelToFile(filename, module, 'base-types', false);
            
            if (result.success) {
                successCount++;
                exportedIds.add(module.id);
                logger.log(`[ExportAllParts] Exported module: ${module.id}`);
            } else {
                errors.push(`Failed to export module ${module.id}: ${result.error}`);
            }
        } catch (e) {
            errors.push(`Error exporting module ${module.id}: ${e}`);
        }
    }

    // Экспортируем модули из MODULES (если они отличаются)
    for (const module of MODULES) {
        if (exportedIds.has(module.id)) continue; // Пропускаем дубликаты
        
        try {
            const filename = `module-${module.id}.json`;
            const result = await saveModelToFile(filename, module, 'base-types', false);
            
            if (result.success) {
                successCount++;
                exportedIds.add(module.id);
                logger.log(`[ExportAllParts] Exported module: ${module.id}`);
            } else {
                errors.push(`Failed to export module ${module.id}: ${result.error}`);
            }
        } catch (e) {
            errors.push(`Error exporting module ${module.id}: ${e}`);
        }
    }

    return { success: successCount, errors };
}

/**
 * Экспортирует модель самолёта
 */
async function exportPlaneModel(): Promise<{ success: boolean; error?: string }> {
    try {
        // Конвертируем PLANE_MODEL_DATA в формат CubeElement для совместимости
        const planeModel = PLANE_MODEL_DATA.map((part, index) => ({
            id: `plane_part_${index}_${Date.now()}`,
            name: part.name,
            type: 'cube' as const,
            parentId: null,
            position: part.position,
            size: part.size,
            rotation: { 
                x: 0, 
                y: 0, 
                z: (part as any).rotationZ || 0 
            },
            color: part.color,
            material: {
                roughness: 0.7,
                metalness: 0.1,
                emissive: (part as any).emissive ? 0.3 : 0,
                opacity: (part as any).alpha || 1,
                transparent: (part as any).alpha !== undefined && (part as any).alpha < 1
            },
            visible: true,
            isLocked: false
        }));

        const result = await saveModelToFile('plane-mig31', planeModel, 'generated-models', false);
        
        if (result.success) {
            logger.log('[ExportAllParts] Exported plane model: mig31');
            return { success: true };
        } else {
            return { success: false, error: result.error };
        }
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

/**
 * Экспортирует все части танка и самолёт
 */
export async function exportAllTankParts(): Promise<{
    success: boolean;
    chassis: { success: number; errors: string[] };
    cannons: { success: number; errors: string[] };
    tracks: { success: number; errors: string[] };
    modules: { success: number; errors: string[] };
    plane: { success: boolean; error?: string };
    totalExported: number;
    totalErrors: number;
}> {
    logger.log('═══════════════════════════════════════════════════════════');
    logger.log('[ExportAllParts] 🚀 Starting export of all tank parts...');
    logger.log('[ExportAllParts] 📁 Target folder: json_models/base-types/');
    logger.log('[ExportAllParts] 📊 Exporting:');
    logger.log(`  - ${CHASSIS_TYPES.length} chassis models`);
    logger.log(`  - ${CANNON_TYPES.length} cannon models`);
    logger.log(`  - ${TRACK_TYPES.length} track models`);
    logger.log(`  - ${MODULE_PRESETS.length + MODULES.length} module models`);
    logger.log('  - 1 plane model');
    logger.log('═══════════════════════════════════════════════════════════');

    const [chassis, cannons, tracks, modules, plane] = await Promise.all([
        exportAllChassis(),
        exportAllCannons(),
        exportAllTracks(),
        exportAllModules(),
        exportPlaneModel()
    ]);

    const totalExported = chassis.success + cannons.success + tracks.success + modules.success + (plane.success ? 1 : 0);
    const totalErrors = chassis.errors.length + cannons.errors.length + tracks.errors.length + modules.errors.length + (plane.error ? 1 : 0);

    const allErrors = [
        ...chassis.errors,
        ...cannons.errors,
        ...tracks.errors,
        ...modules.errors,
        ...(plane.error ? [plane.error] : [])
    ];

    logger.log('═══════════════════════════════════════════════════════════');
    if (allErrors.length > 0) {
        logger.warn(`[ExportAllParts] ⚠️ Export completed with ${totalErrors} errors`);
        logger.warn('[ExportAllParts] Errors:', allErrors);
    } else {
        logger.log(`[ExportAllParts] ✅ Successfully exported ${totalExported} models!`);
    }
    logger.log(`[ExportAllParts] 📊 Breakdown:`);
    logger.log(`  ✅ Chassis: ${chassis.success}/${CHASSIS_TYPES.length}`);
    logger.log(`  ✅ Cannons: ${cannons.success}/${CANNON_TYPES.length}`);
    logger.log(`  ✅ Tracks: ${tracks.success}/${TRACK_TYPES.length}`);
    logger.log(`  ✅ Modules: ${modules.success}/${MODULE_PRESETS.length + MODULES.length}`);
    logger.log(`  ${plane.success ? '✅' : '❌'} Plane: ${plane.success ? 'Yes' : 'No'}`);
    logger.log(`[ExportAllParts] 📁 Location: json_models/base-types/`);
    logger.log('═══════════════════════════════════════════════════════════');

    return {
        success: totalErrors === 0,
        chassis,
        cannons,
        tracks,
        modules,
        plane,
        totalExported,
        totalErrors
    };
}

/**
 * Экспортирует все части при инициализации (асинхронно)
 */
export function exportAllTankPartsOnInit(): void {
    // Экспортируем асинхронно, не блокируя инициализацию
    exportAllTankParts().then(result => {
        if (result.success) {
            logger.log(`[ExportAllParts] ✅ All ${result.totalExported} parts exported successfully`);
            logger.log(`[ExportAllParts] 📁 Location: C:\\Users\\dzoblin\\Desktop\\TX\\json_models\\base-types\\`);
            logger.log(`[ExportAllParts] 📊 Breakdown:`);
            logger.log(`  - Chassis: ${result.chassis.success}`);
            logger.log(`  - Cannons: ${result.cannons.success}`);
            logger.log(`  - Tracks: ${result.tracks.success}`);
            logger.log(`  - Modules: ${result.modules.success}`);
            logger.log(`  - Plane: ${result.plane.success ? 'Yes' : 'No'}`);
        } else {
            logger.warn(`[ExportAllParts] ⚠️ Export completed with ${result.totalErrors} errors`);
            if (result.chassis.errors.length > 0) logger.warn('  Chassis errors:', result.chassis.errors);
            if (result.cannons.errors.length > 0) logger.warn('  Cannon errors:', result.cannons.errors);
            if (result.tracks.errors.length > 0) logger.warn('  Track errors:', result.tracks.errors);
            if (result.modules.errors.length > 0) logger.warn('  Module errors:', result.modules.errors);
            if (result.plane.error) logger.warn('  Plane error:', result.plane.error);
        }
    }).catch(e => {
        logger.error('[ExportAllParts] ❌ Failed to export all parts:', e);
    });
}

