/**
 * @module utils/modelValidator
 * @description Валидация моделей для совместимости с игрой
 * 
 * Проверяет корректность кастомных конфигураций танков и базовых типов
 * перед сохранением и загрузкой.
 */

import { CustomTankConfiguration } from '../workshop/types';
import { getChassisById, getCannonById, ChassisType, CannonType } from '../tankTypes';
import { getTrackById, TrackType } from '../trackTypes';

/**
 * Результат валидации
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Валидирует кастомную конфигурацию танка
 */
export function validateCustomTankConfig(config: CustomTankConfiguration): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Проверка обязательных полей
    if (!config.id || typeof config.id !== 'string') {
        errors.push('Missing or invalid id field');
    }

    if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
        errors.push('Missing or invalid name field');
    }

    // Проверка baseModel
    if (!config.baseModel) {
        errors.push('Missing baseModel field');
    } else {
        // Проверка существования chassisId
        if (!config.baseModel.chassisId || typeof config.baseModel.chassisId !== 'string') {
            errors.push('Missing or invalid baseModel.chassisId');
        } else {
            try {
                const chassis = getChassisById(config.baseModel.chassisId);
                if (!chassis) {
                    errors.push(`Chassis type "${config.baseModel.chassisId}" does not exist`);
                }
            } catch (e) {
                errors.push(`Invalid chassis type "${config.baseModel.chassisId}": ${e}`);
            }
        }

        // Проверка существования cannonId
        if (!config.baseModel.cannonId || typeof config.baseModel.cannonId !== 'string') {
            errors.push('Missing or invalid baseModel.cannonId');
        } else {
            try {
                const cannon = getCannonById(config.baseModel.cannonId);
                if (!cannon) {
                    errors.push(`Cannon type "${config.baseModel.cannonId}" does not exist`);
                }
            } catch (e) {
                errors.push(`Invalid cannon type "${config.baseModel.cannonId}": ${e}`);
            }
        }

        // Проверка существования trackId
        if (!config.baseModel.trackId || typeof config.baseModel.trackId !== 'string') {
            errors.push('Missing or invalid baseModel.trackId');
        } else {
            try {
                const track = getTrackById(config.baseModel.trackId);
                if (!track) {
                    errors.push(`Track type "${config.baseModel.trackId}" does not exist`);
                }
            } catch (e) {
                errors.push(`Invalid track type "${config.baseModel.trackId}": ${e}`);
            }
        }
    }

    // Проверка turretPivot
    if (!config.turretPivot) {
        errors.push('Missing turretPivot field');
    } else {
        if (!isValidCoordinate(config.turretPivot)) {
            errors.push('Invalid turretPivot coordinates');
        }
    }

    // Проверка barrelMount
    if (!config.barrelMount) {
        errors.push('Missing barrelMount field');
    } else {
        if (!isValidCoordinate(config.barrelMount)) {
            errors.push('Invalid barrelMount coordinates');
        }
    }

    // Валидация movement
    if (!config.movement) {
        errors.push('Missing movement field');
    } else {
        validateMovement(config.movement, errors, warnings);
    }

    // Валидация combat
    if (!config.combat) {
        errors.push('Missing combat field');
    } else {
        validateCombat(config.combat, errors, warnings);
    }

    // Валидация physics
    if (!config.physics) {
        errors.push('Missing physics field');
    } else {
        validatePhysics(config.physics, errors, warnings);
    }

    // Валидация turret
    if (!config.turret) {
        errors.push('Missing turret field');
    } else {
        validateTurret(config.turret, errors, warnings);
    }

    // Валидация special
    if (!config.special) {
        errors.push('Missing special field');
    } else {
        if (!Array.isArray(config.special.modules)) {
            errors.push('special.modules must be an array');
        }
    }

    // Валидация visual
    if (!config.visual) {
        errors.push('Missing visual field');
    } else {
        validateVisual(config.visual, errors, warnings);
    }

    // Проверка метаданных
    if (typeof config.createdAt !== 'number' || config.createdAt <= 0) {
        warnings.push('Invalid or missing createdAt timestamp');
    }

    if (typeof config.modifiedAt !== 'number' || config.modifiedAt <= 0) {
        warnings.push('Invalid or missing modifiedAt timestamp');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Валидирует базовый тип танка (chassis, cannon, track)
 */
export function validateBaseTankType(
    type: ChassisType | CannonType | TrackType,
    typeName: 'chassis' | 'cannon' | 'track'
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!type.id || typeof type.id !== 'string') {
        errors.push(`Missing or invalid ${typeName} id`);
    }

    if (!type.name || typeof type.name !== 'string') {
        errors.push(`Missing or invalid ${typeName} name`);
    }

    // Валидация специфичных полей для каждого типа
    if (typeName === 'chassis') {
        const chassis = type as ChassisType;
        if (typeof chassis.width !== 'number' || chassis.width <= 0) {
            errors.push('Invalid chassis width');
        }
        if (typeof chassis.height !== 'number' || chassis.height <= 0) {
            errors.push('Invalid chassis height');
        }
        if (typeof chassis.depth !== 'number' || chassis.depth <= 0) {
            errors.push('Invalid chassis depth');
        }
        if (typeof chassis.mass !== 'number' || chassis.mass <= 0) {
            errors.push('Invalid chassis mass');
        }
        if (typeof chassis.maxHealth !== 'number' || chassis.maxHealth <= 0) {
            errors.push('Invalid chassis maxHealth');
        }
        if (typeof chassis.moveSpeed !== 'number' || chassis.moveSpeed < 0 || chassis.moveSpeed > 100) {
            warnings.push('Chassis moveSpeed is outside reasonable range (0-100 m/s)');
        }
        if (typeof chassis.turnSpeed !== 'number' || chassis.turnSpeed <= 0) {
            errors.push('Invalid chassis turnSpeed');
        }
    } else if (typeName === 'cannon') {
        const cannon = type as CannonType;
        if (typeof cannon.barrelLength !== 'number' || cannon.barrelLength <= 0) {
            errors.push('Invalid cannon barrelLength');
        }
        if (typeof cannon.barrelWidth !== 'number' || cannon.barrelWidth <= 0) {
            errors.push('Invalid cannon barrelWidth');
        }
        if (typeof cannon.damage !== 'number' || cannon.damage <= 0) {
            errors.push('Invalid cannon damage');
        }
        if (typeof cannon.cooldown !== 'number' || cannon.cooldown <= 0) {
            errors.push('Invalid cannon cooldown');
        }
        if (typeof cannon.projectileSpeed !== 'number' || cannon.projectileSpeed <= 0) {
            errors.push('Invalid cannon projectileSpeed');
        }
    } else if (typeName === 'track') {
        const track = type as TrackType;
        if (typeof track.width !== 'number' || track.width <= 0) {
            errors.push('Invalid track width');
        }
        if (typeof track.height !== 'number' || track.height <= 0) {
            errors.push('Invalid track height');
        }
        if (typeof track.depth !== 'number' || track.depth <= 0) {
            errors.push('Invalid track depth');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Валидирует координаты
 */
function isValidCoordinate(coord: { x: number; y: number; z: number }): boolean {
    return (
        typeof coord.x === 'number' && !isNaN(coord.x) && isFinite(coord.x) &&
        typeof coord.y === 'number' && !isNaN(coord.y) && isFinite(coord.y) &&
        typeof coord.z === 'number' && !isNaN(coord.z) && isFinite(coord.z)
    );
}

/**
 * Валидирует параметры движения
 */
function validateMovement(
    movement: CustomTankConfiguration['movement'],
    errors: string[],
    warnings: string[]
): void {
    if (typeof movement.maxForwardSpeed !== 'number' || movement.maxForwardSpeed < 0 || movement.maxForwardSpeed > 100) {
        warnings.push('maxForwardSpeed is outside reasonable range (0-100 m/s)');
    }
    if (typeof movement.maxBackwardSpeed !== 'number' || movement.maxBackwardSpeed < 0 || movement.maxBackwardSpeed > 100) {
        warnings.push('maxBackwardSpeed is outside reasonable range (0-100 m/s)');
    }
    if (typeof movement.acceleration !== 'number' || movement.acceleration < 0) {
        errors.push('Invalid acceleration (must be >= 0)');
    }
    if (typeof movement.deceleration !== 'number' || movement.deceleration < 0) {
        errors.push('Invalid deceleration (must be >= 0)');
    }
    if (typeof movement.turnSpeed !== 'number' || movement.turnSpeed < 0) {
        errors.push('Invalid turnSpeed (must be >= 0)');
    }
    if (typeof movement.pivotTurnMultiplier !== 'number' || movement.pivotTurnMultiplier <= 0) {
        errors.push('Invalid pivotTurnMultiplier (must be > 0)');
    }
}

/**
 * Валидирует параметры боя
 */
function validateCombat(
    combat: CustomTankConfiguration['combat'],
    errors: string[],
    warnings: string[]
): void {
    if (typeof combat.damage !== 'number' || combat.damage <= 0) {
        errors.push('Invalid damage (must be > 0)');
    }
    if (typeof combat.cooldown !== 'number' || combat.cooldown <= 0) {
        errors.push('Invalid cooldown (must be > 0)');
    }
    if (typeof combat.projectileSpeed !== 'number' || combat.projectileSpeed <= 0) {
        errors.push('Invalid projectileSpeed (must be > 0)');
    }
    if (typeof combat.projectileSize !== 'number' || combat.projectileSize <= 0) {
        errors.push('Invalid projectileSize (must be > 0)');
    }
    if (typeof combat.maxRange !== 'number' || combat.maxRange <= 0) {
        errors.push('Invalid maxRange (must be > 0)');
    }
}

/**
 * Валидирует физические параметры
 */
function validatePhysics(
    physics: CustomTankConfiguration['physics'],
    errors: string[],
    warnings: string[]
): void {
    if (typeof physics.mass !== 'number' || physics.mass <= 0) {
        errors.push('Invalid mass (must be > 0)');
    }
    if (typeof physics.hoverHeight !== 'number' || physics.hoverHeight < 0) {
        errors.push('Invalid hoverHeight (must be >= 0)');
    }
    if (typeof physics.hoverStiffness !== 'number' || physics.hoverStiffness < 0) {
        errors.push('Invalid hoverStiffness (must be >= 0)');
    }
}

/**
 * Валидирует параметры башни
 */
function validateTurret(
    turret: CustomTankConfiguration['turret'],
    errors: string[],
    warnings: string[]
): void {
    if (typeof turret.turretSpeed !== 'number' || turret.turretSpeed <= 0) {
        errors.push('Invalid turretSpeed (must be > 0)');
    }
    if (typeof turret.barrelPitchSpeed !== 'number' || turret.barrelPitchSpeed <= 0) {
        errors.push('Invalid barrelPitchSpeed (must be > 0)');
    }
    if (turret.barrelPitchRange) {
        if (typeof turret.barrelPitchRange.min !== 'number' || typeof turret.barrelPitchRange.max !== 'number') {
            errors.push('Invalid barrelPitchRange (min and max must be numbers)');
        } else if (turret.barrelPitchRange.min >= turret.barrelPitchRange.max) {
            errors.push('Invalid barrelPitchRange (min must be < max)');
        }
    }
}

/**
 * Валидирует визуальные параметры
 */
function validateVisual(
    visual: CustomTankConfiguration['visual'],
    errors: string[],
    warnings: string[]
): void {
    if (!visual.chassisColor || !isValidHexColor(visual.chassisColor)) {
        errors.push('Invalid chassisColor (must be valid hex color)');
    }
    if (!visual.turretColor || !isValidHexColor(visual.turretColor)) {
        errors.push('Invalid turretColor (must be valid hex color)');
    }
    if (!visual.barrelColor || !isValidHexColor(visual.barrelColor)) {
        errors.push('Invalid barrelColor (must be valid hex color)');
    }
}

/**
 * Проверяет валидность hex цвета
 */
function isValidHexColor(color: string): boolean {
    if (typeof color !== 'string') return false;
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexPattern.test(color);
}

