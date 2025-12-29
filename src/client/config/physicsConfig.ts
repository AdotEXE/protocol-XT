/**
 * @module config/physicsConfig
 * @description Централизованная конфигурация всех параметров физики игры
 * 
 * Все параметры физики танков, снарядов, модулей и мира находятся здесь.
 * Редактор физики (Ctrl+0) позволяет изменять эти параметры в реальном времени.
 */

import { Vector3 } from "@babylonjs/core";

// ========== ИНТЕРФЕЙСЫ ==========

export interface TurretConfig {
    turret: {
        speed: number;
        baseSpeed: number;
        lerpSpeed: number;
        mouseSensitivity: number;
    };
    barrel: {
        pitchSpeed: number;
        pitchLerpSpeed: number;
    };
}

export interface ModulesConfig {
    module6: {
        maxWalls: number;
        wallMaxHealth: number;
        cooldown: number;
    };
    module7: {
        cooldown: number;
    };
    module8: {
        cooldown: number;
    };
    module9: {
        cooldown: number;
    };
    module0: {
        cooldown: number;
        basePower: number;
        maxPower: number;
        maxChargeTime: number;
    };
}

export interface FuelConfig {
    maxFuel: number;
    fuelConsumptionRate: number;
}

export interface TracerConfig {
    count: number;
    damage: number;
    markDuration: number;
}

export interface ConstantsConfig {
    hitRadiusTank: number;
    hitRadiusTurret: number;
    projectileMaxDistance: number;
}

export interface EnemyProjectilesConfig {
    baseDamage: number;
    impulse: number;
}

export interface PhysicsConfig {
    world: {
        gravity: Vector3;
        substeps: number;
        fixedTimeStep: number;
        trajectoryGravity: number;
        trajectoryTimeStep: number;
        trajectoryMaxTime: number;
    };
    tank: {
        basic: {
            mass: number;
            hoverHeight: number;
            moveSpeed: number;
            turnSpeed: number;
            acceleration: number;
            maxReverseForce: number;
            maxHealth: number;
        };
        stability: {
            hoverStiffness: number;
            hoverDamping: number;
            linearDamping: number;
            angularDamping: number;
            suspensionCompression: number;
            uprightForce: number;
            uprightDamp: number;
            stabilityForce: number;
            emergencyForce: number;
            liftForce: number;
            downForce: number;
        };
        movement: {
            turnAccel: number;
            stabilityTorque: number;
            yawDamping: number;
            sideFriction: number;
            sideDrag: number;
            fwdDrag: number;
            angularDrag: number;
        };
        climbing: {
            climbAssistForce: number;
            maxClimbHeight: number;
            slopeBoostMax: number;
            frontClimbForce: number;
            wallPushForce: number;
            climbTorque: number;
        };
        verticalWalls: {
            verticalWallThreshold: number;
            wallAttachmentForce: number;
            wallAttachmentDistance: number;
            wallFrictionCoefficient: number;
            wallSlideGravityMultiplier: number;
            wallMinHorizontalSpeed: number;
            wallAttachmentSmoothing: number;
            wallBaseAttachmentForce: number;
            wallAngularDamping: number;
        };
        speedLimits: {
            maxUpwardSpeed: number;
            maxDownwardSpeed: number;
            maxAngularSpeed: number;
        };
        centerOfMass: Vector3;
        collisionMaterials: {
            centerBoxFriction: number;
            centerBoxRestitution: number;
            frontCylinderFriction: number;
            frontCylinderRestitution: number;
            backCylinderFriction: number;
            backCylinderRestitution: number;
            defaultFriction: number;
            defaultRestitution: number;
        };
        collisionFilters: {
            membershipMask: number;
            collideMask: number;
        };
        arcade: {
            antiRollFactor: number;
            downforceFactor: number;
            airControl: number;
            angularDragAir: number;
        };
    };
    turret: TurretConfig;
    shooting: {
        basic: {
            damage: number;
            cooldown: number;
            baseCooldown: number;
            projectileSpeed: number;
            projectileSize: number;
        };
        recoil: {
            force: number;
            torque: number;
            barrelRecoilSpeed: number;
            barrelRecoilAmount: number;
            applicationPoint: "center" | "muzzle";
            impactForceMultiplier: number;
        };
        projectiles: {
            mass: number;
            linearDamping: number;
            impulseMultiplier: number;
            physicsExtents: {
                width: number;
                height: number;
                depth: number;
            };
            filterMembershipMask: number;
            filterCollideMask: number;
            useCCD: boolean;
            gravityScale: number;
            ricochetMode: "restitution" | "manual";
            ricochetSpeedLoss: number;
            explosionForce: number;
        };
    };
    enemyTank: {
        basic: {
            mass: number;
            hoverHeight: number;
            moveSpeed: number;
            turnSpeed: number;
            acceleration: number;
        };
        stability: {
            hoverStiffness: number;
            hoverDamping: number;
            linearDamping: number;
            angularDamping: number;
            uprightForce: number;
            uprightDamp: number;
            emergencyForce: number;
        };
        climbing: {
            climbAssistForce: number;
            maxClimbHeight: number;
            slopeBoostMax: number;
            frontClimbForce: number;
            wallPushForce: number;
            climbTorque: number;
        };
        centerOfMass: Vector3;
        collisionFilters: {
            membershipMask: number;
            collideMask: number;
        };
        arcade: {
            antiRollFactor: number;
            downforceFactor: number;
            airControl: number;
            angularDragAir: number;
            uprightForce: number;
            uprightDamp: number;
            emergencyForce: number;
        };
        projectiles: EnemyProjectilesConfig;
    };
    modules: ModulesConfig;
    fuel: FuelConfig;
    tracer: TracerConfig;
    constants: ConstantsConfig;
}

// ========== ОСНОВНОЙ КОНФИГ ==========

export const PHYSICS_CONFIG: PhysicsConfig = {
    world: {
        gravity: new Vector3(0, -19.6, 0),
        substeps: 2,
        fixedTimeStep: 1 / 60,
        trajectoryGravity: 9.81,
        trajectoryTimeStep: 0.02,
        trajectoryMaxTime: 10,
    },
    tank: {
        basic: {
            mass: 3500,
            hoverHeight: 1.0,
            moveSpeed: 24,
            turnSpeed: 2.5,
            acceleration: 40000,
            maxReverseForce: 20000,
            maxHealth: 100,
        },
        stability: {
            hoverStiffness: 7000,
            hoverDamping: 18000,
            linearDamping: 0.8,
            angularDamping: 4.0,
            suspensionCompression: 4.0,
            uprightForce: 12000,
            uprightDamp: 8000,
            stabilityForce: 3000,
            emergencyForce: 18000,
            liftForce: 0,
            downForce: 1500,
        },
        movement: {
            turnAccel: 11000,
            stabilityTorque: 2000,
            yawDamping: 4500,
            sideFriction: 17000,
            sideDrag: 8000,
            fwdDrag: 7000,
            angularDrag: 5000,
        },
        climbing: {
            climbAssistForce: 40000,
            maxClimbHeight: 1.5,
            slopeBoostMax: 1.8,
            frontClimbForce: 60000,
            wallPushForce: 25000,
            climbTorque: 12000,
        },
        verticalWalls: {
            verticalWallThreshold: 0.34,
            wallAttachmentForce: 15000,
            wallAttachmentDistance: 2.0,
            wallFrictionCoefficient: 0.8,
            wallSlideGravityMultiplier: 1.2,
            wallMinHorizontalSpeed: 0.5,
            wallAttachmentSmoothing: 0.2,
            wallBaseAttachmentForce: 8000,
            wallAngularDamping: 0.85,
        },
        speedLimits: {
            maxUpwardSpeed: 4.0,
            maxDownwardSpeed: 35,
            maxAngularSpeed: 2.5,
        },
        centerOfMass: new Vector3(0, -0.55, -0.3),
        collisionMaterials: {
            centerBoxFriction: 0.1,
            centerBoxRestitution: 0.0,
            frontCylinderFriction: 0.15,
            frontCylinderRestitution: 0.0,
            backCylinderFriction: 0.15,
            backCylinderRestitution: 0.0,
            defaultFriction: 0.1,
            defaultRestitution: 0.0,
        },
        collisionFilters: {
            membershipMask: 1,
            collideMask: 2 | 32,
        },
        arcade: {
            antiRollFactor: 0,
            downforceFactor: 2.0,
            airControl: 0.4,
            angularDragAir: 5.0,
        },
    },
    turret: {
        turret: {
            speed: 0.05,
            baseSpeed: 0.03,
            lerpSpeed: 0.15,
            mouseSensitivity: 0.003,
        },
        barrel: {
            pitchSpeed: 0.03,
            pitchLerpSpeed: 0.15,
        },
    },
    shooting: {
        basic: {
            damage: 25,
            cooldown: 1800,
            baseCooldown: 2000,
            projectileSpeed: 200,
            projectileSize: 0.2,
        },
        recoil: {
            force: 2500,
            torque: 10000,
            barrelRecoilSpeed: 0.3,
            barrelRecoilAmount: -1.6,
            applicationPoint: "center",
            impactForceMultiplier: 1.0,
        },
        projectiles: {
            mass: 0.001,
            linearDamping: 0.01,
            impulseMultiplier: 0.018,
            physicsExtents: {
                width: 0.75,
                height: 0.75,
                depth: 2.0,
            },
            filterMembershipMask: 4,
            filterCollideMask: 2 | 8 | 32,
            useCCD: false,
            gravityScale: 1.0,
            ricochetMode: "restitution",
            ricochetSpeedLoss: 0.0,
            explosionForce: 5000,
        },
    },
    enemyTank: {
        // СИНХРОНИЗИРОВАНО С ИГРОКОМ: параметры физики теперь идентичны tank!
        basic: {
            mass: 3500, // СИНХРОНИЗИРОВАНО (было 3000)
            hoverHeight: 1.0,
            moveSpeed: 24, // УЛУЧШЕНО: Идентично игроку для максимальной скорости (было 22)
            turnSpeed: 2.5, // УЛУЧШЕНО: Идентично игроку для максимальной манёвренности (было 2.3)
            acceleration: 40000, // Такой же как у игрока
        },
        stability: {
            hoverStiffness: 7000, // СИНХРОНИЗИРОВАНО с игроком
            hoverDamping: 18000, // СИНХРОНИЗИРОВАНО с игроком
            linearDamping: 0.8, // СИНХРОНИЗИРОВАНО (было 0.5)
            angularDamping: 4.0, // СИНХРОНИЗИРОВАНО (было 3.0)
            uprightForce: 15000, // ДОБАВЛЕНО
            uprightDamp: 8000, // ДОБАВЛЕНО
            emergencyForce: 25000, // ДОБАВЛЕНО
        },
        climbing: {
            climbAssistForce: 40000, // СИНХРОНИЗИРОВАНО с игроком (было 120000)
            maxClimbHeight: 1.5, // СИНХРОНИЗИРОВАНО с игроком (было 3.0)
            slopeBoostMax: 1.8, // СИНХРОНИЗИРОВАНО с игроком (было 2.5)
            frontClimbForce: 60000, // СИНХРОНИЗИРОВАНО с игроком (было 180000)
            wallPushForce: 25000, // СИНХРОНИЗИРОВАНО с игроком (было 80000)
            climbTorque: 12000, // СИНХРОНИЗИРОВАНО с игроком (было 25000)
        },
        centerOfMass: new Vector3(0, -0.55, -0.3),
        collisionFilters: {
            membershipMask: 8,
            collideMask: 2 | 4 | 32,
        },
        arcade: {
            // ВКЛЮЧЕНО: Аркадные параметры теперь работают как у игрока!
            antiRollFactor: 0.3, // ВКЛЮЧЕНО (было 0)
            downforceFactor: 2.0, // ВКЛЮЧЕНО (было 0)
            airControl: 0.4, // ВКЛЮЧЕНО (было 0)
            angularDragAir: 5.0, // ВКЛЮЧЕНО (было 0)
            uprightForce: 15000, // ДОБАВЛЕНО
            uprightDamp: 8000, // ДОБАВЛЕНО
            emergencyForce: 25000, // ДОБАВЛЕНО
        },
        projectiles: {
            baseDamage: 20,
            impulse: 5,
        },
    },
    modules: {
        module6: {
            maxWalls: 5,
            wallMaxHealth: 200,
            cooldown: 15000,
        },
        module7: {
            cooldown: 20000,
        },
        module8: {
            cooldown: 25000,
        },
        module9: {
            cooldown: 10000,
        },
        module0: {
            cooldown: 5000,
            basePower: 30000,
            maxPower: 500000,
            maxChargeTime: 3000,
        },
    },
    fuel: {
        maxFuel: 500,
        fuelConsumptionRate: 0.5,
    },
    tracer: {
        count: 5,
        damage: 15,
        markDuration: 10000,
    },
    constants: {
        hitRadiusTank: 3.5,
        hitRadiusTurret: 2.0,
        projectileMaxDistance: 2000,
    },
};

// ========== DEFAULT CONFIG (для сброса) ==========

/**
 * Создаёт глубокую копию конфига для использования как DEFAULT
 */
function createDefaultConfig(): PhysicsConfig {
    return {
        world: {
            gravity: new Vector3(0, -19.6, 0),
            substeps: 2,
            fixedTimeStep: 1 / 60,
            trajectoryGravity: 9.81,
            trajectoryTimeStep: 0.02,
            trajectoryMaxTime: 10,
        },
        tank: {
            basic: {
                mass: 3500,
                hoverHeight: 1.0,
                moveSpeed: 24,
                turnSpeed: 2.5,
                acceleration: 40000,
                maxReverseForce: 20000,
                maxHealth: 100,
            },
            stability: {
                hoverStiffness: 7000,
                hoverDamping: 18000,
                linearDamping: 0.8,
                angularDamping: 4.0,
                suspensionCompression: 4.0,
                uprightForce: 12000,
                uprightDamp: 8000,
                stabilityForce: 3000,
                emergencyForce: 18000,
                liftForce: 0,
                downForce: 1500,
            },
            movement: {
                turnAccel: 11000,
                stabilityTorque: 2000,
                yawDamping: 4500,
                sideFriction: 17000,
                sideDrag: 8000,
                fwdDrag: 7000,
                angularDrag: 5000,
            },
            climbing: {
                climbAssistForce: 40000,
                maxClimbHeight: 1.5,
                slopeBoostMax: 1.8,
                frontClimbForce: 60000,
                wallPushForce: 25000,
                climbTorque: 12000,
            },
            verticalWalls: {
                verticalWallThreshold: 0.34,
                wallAttachmentForce: 15000,
                wallAttachmentDistance: 2.0,
                wallFrictionCoefficient: 0.8,
                wallSlideGravityMultiplier: 1.2,
                wallMinHorizontalSpeed: 0.5,
                wallAttachmentSmoothing: 0.2,
                wallBaseAttachmentForce: 8000,
                wallAngularDamping: 0.85,
            },
            speedLimits: {
                maxUpwardSpeed: 4.0,
                maxDownwardSpeed: 35,
                maxAngularSpeed: 2.5,
            },
            centerOfMass: new Vector3(0, -0.55, -0.3),
            collisionMaterials: {
                centerBoxFriction: 0.1,
                centerBoxRestitution: 0.0,
                frontCylinderFriction: 0.15,
                frontCylinderRestitution: 0.0,
                backCylinderFriction: 0.15,
                backCylinderRestitution: 0.0,
                defaultFriction: 0.1,
                defaultRestitution: 0.0,
            },
            collisionFilters: {
                membershipMask: 1,
                collideMask: 2 | 32,
            },
            arcade: {
                antiRollFactor: 0,
                downforceFactor: 2.0,
                airControl: 0.4,
                angularDragAir: 5.0,
            },
        },
        turret: {
            turret: {
                speed: 0.05,
                baseSpeed: 0.03,
                lerpSpeed: 0.15,
                mouseSensitivity: 0.003,
            },
            barrel: {
                pitchSpeed: 0.03,
                pitchLerpSpeed: 0.15,
            },
        },
        shooting: {
            basic: {
                damage: 25,
                cooldown: 1800,
                baseCooldown: 2000,
                projectileSpeed: 200,
                projectileSize: 0.2,
            },
            recoil: {
                force: 2500,
                torque: 10000,
                barrelRecoilSpeed: 0.3,
                barrelRecoilAmount: -1.6,
                applicationPoint: "center",
                impactForceMultiplier: 1.0,
            },
            projectiles: {
                mass: 0.001,
                linearDamping: 0.01,
                impulseMultiplier: 0.018,
                physicsExtents: {
                    width: 0.75,
                    height: 0.75,
                    depth: 2.0,
                },
                filterMembershipMask: 4,
                filterCollideMask: 2 | 8 | 32,
                useCCD: false,
                gravityScale: 1.0,
                ricochetMode: "restitution",
                ricochetSpeedLoss: 0.0,
                explosionForce: 5000,
            },
        },
        enemyTank: {
            // DEFAULT: Синхронизированные параметры с игроком
            basic: {
                mass: 3500,
                hoverHeight: 1.0,
                moveSpeed: 24, // УЛУЧШЕНО: Идентично игроку
                turnSpeed: 2.5, // УЛУЧШЕНО: Идентично игроку
                acceleration: 40000,
            },
            stability: {
                hoverStiffness: 7000,
                hoverDamping: 18000,
                linearDamping: 0.8,
                angularDamping: 4.0,
                uprightForce: 15000,
                uprightDamp: 8000,
                emergencyForce: 25000,
            },
            climbing: {
                climbAssistForce: 40000,
                maxClimbHeight: 1.5,
                slopeBoostMax: 1.8,
                frontClimbForce: 60000,
                wallPushForce: 25000,
                climbTorque: 12000,
            },
            centerOfMass: new Vector3(0, -0.55, -0.3),
            collisionFilters: {
                membershipMask: 8,
                collideMask: 2 | 4 | 32,
            },
            arcade: {
                antiRollFactor: 0.3,
                downforceFactor: 2.0,
                airControl: 0.4,
                angularDragAir: 5.0,
                uprightForce: 15000,
                uprightDamp: 8000,
                emergencyForce: 25000,
            },
            projectiles: {
                baseDamage: 20,
                impulse: 5,
            },
        },
        modules: {
            module6: {
                maxWalls: 5,
                wallMaxHealth: 200,
                cooldown: 15000,
            },
            module7: {
                cooldown: 20000,
            },
            module8: {
                cooldown: 25000,
            },
            module9: {
                cooldown: 10000,
            },
            module0: {
                cooldown: 5000,
                basePower: 30000,
                maxPower: 500000,
                maxChargeTime: 3000,
            },
        },
        fuel: {
            maxFuel: 500,
            fuelConsumptionRate: 0.5,
        },
        tracer: {
            count: 5,
            damage: 15,
            markDuration: 10000,
        },
        constants: {
            hitRadiusTank: 3.5,
            hitRadiusTurret: 2.0,
            projectileMaxDistance: 2000,
        },
    };
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = createDefaultConfig();

// ========== ФУНКЦИИ УПРАВЛЕНИЯ КОНФИГОМ ==========

const STORAGE_KEY = "tx_physics_config";

/**
 * Применяет изменённую конфигурацию к текущему PHYSICS_CONFIG
 * Изменения применяются в реальном времени
 */
export function applyPhysicsConfig(newConfig: Partial<PhysicsConfig>): void {
    // Deep merge newConfig into PHYSICS_CONFIG
    deepMerge(PHYSICS_CONFIG, newConfig);
}

/**
 * Сбрасывает PHYSICS_CONFIG к значениям по умолчанию
 */
export function resetPhysicsConfig(): void {
    const defaultCfg = createDefaultConfig();
    deepMerge(PHYSICS_CONFIG, defaultCfg);
}

/**
 * Сохраняет текущий PHYSICS_CONFIG в localStorage
 */
export function savePhysicsConfigToStorage(): void {
    try {
        const serializable = serializeConfig(PHYSICS_CONFIG);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
        console.log("[PhysicsConfig] Saved to localStorage");
    } catch (e) {
        console.error("[PhysicsConfig] Failed to save:", e);
    }
}

/**
 * Загружает PHYSICS_CONFIG из localStorage
 */
export function loadPhysicsConfigFromStorage(): boolean {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return false;
        
        const parsed = JSON.parse(stored);
        const deserialized = deserializeConfig(parsed);
        deepMerge(PHYSICS_CONFIG, deserialized);
        console.log("[PhysicsConfig] Loaded from localStorage");
        return true;
    } catch (e) {
        console.error("[PhysicsConfig] Failed to load:", e);
        return false;
    }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

/**
 * Глубокое слияние объектов
 */
function deepMerge(target: any, source: any): void {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Vector3) {
            target[key] = source[key].clone();
        } else if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
}

/**
 * Сериализует конфиг для JSON (конвертирует Vector3 в объекты)
 */
function serializeConfig(config: any): any {
    const result: any = {};
    for (const key of Object.keys(config)) {
        if (config[key] instanceof Vector3) {
            result[key] = { x: config[key].x, y: config[key].y, z: config[key].z, __type: "Vector3" };
        } else if (config[key] && typeof config[key] === "object" && !Array.isArray(config[key])) {
            result[key] = serializeConfig(config[key]);
        } else {
            result[key] = config[key];
        }
    }
    return result;
}

/**
 * Десериализует конфиг из JSON (конвертирует объекты обратно в Vector3)
 */
function deserializeConfig(data: any): any {
    const result: any = {};
    for (const key of Object.keys(data)) {
        if (data[key] && data[key].__type === "Vector3") {
            result[key] = new Vector3(data[key].x, data[key].y, data[key].z);
        } else if (data[key] && typeof data[key] === "object" && !Array.isArray(data[key])) {
            result[key] = deserializeConfig(data[key]);
        } else {
            result[key] = data[key];
        }
    }
    return result;
}
