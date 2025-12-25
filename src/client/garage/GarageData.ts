/**
 * Данные для гаража - генерация частей танка из типов
 */

import { TankPart } from "./GarageTypes";
import { CHASSIS_TYPES, CANNON_TYPES } from "../tankTypes";
import { TRACK_TYPES } from "../trackTypes";
import { MODULE_PRESETS } from "../tank/modules";
import { SUPPLY_PRESETS } from "../tank/supplies";

/**
 * Бонусы за специальные способности шасси
 */
const ABILITY_BONUSES: Record<string, number> = {
    stealth: 150,    // Stealth is very useful
    hover: 100,      // Hover is useful for mobility
    siege: 200,      // Siege mode is powerful
    racer: 50,       // Speed boost is nice
    amphibious: 80,  // Water movement is situational
    shield: 120,     // Shield is defensive
    drone: 140,      // Drones are offensive support
    artillery: 100,  // Range boost is useful
    destroyer: 80,   // Damage boost is good
    command: 150     // Team buff is powerful
};

/**
 * Бонусы за специальные эффекты пушек
 */
const CANNON_SPECIAL_BONUSES: Record<string, number> = {
    // Energy weapons (high tech)
    plasma: 200,
    laser: 180,
    tesla: 220,
    railgun: 300,
    // Explosive weapons
    rocket: 150,
    mortar: 170,
    cluster: 160,
    explosive: 130,
    // Effect weapons
    flamethrower: 120,
    acid: 140,
    freeze: 150,
    poison: 130,
    emp: 200,
    // Multi-shot
    shotgun: 100,
    multishot: 140,
    // Advanced
    homing: 250,
    piercing: 180,
    shockwave: 190,
    beam: 160,
    vortex: 220,
    support: 200
};

/**
 * Генерирует массив TankPart для шасси
 */
export function generateChassisParts(): TankPart[] {
    return CHASSIS_TYPES.map(chassis => {
        const baseCost = 0;
        const hpMultiplier = 3;
        const speedMultiplier = 10;
        
        let cost = baseCost + (chassis.maxHealth * hpMultiplier) + (chassis.moveSpeed * speedMultiplier);
        if (chassis.specialAbility) {
            const bonus = ABILITY_BONUSES[chassis.specialAbility];
            if (bonus) cost += bonus;
        }
        
        // Round to nearest 50 for cleaner prices
        cost = Math.round(cost / 50) * 50;
        
        // Special cases for starter chassis
        if (chassis.id === "medium") {
            cost = 0; // Free starter
        } else if (chassis.id === "light") {
            cost = Math.min(cost, 400);
        } else if (chassis.id === "scout") {
            cost = Math.min(cost, 500);
        }
        
        const abilityText = chassis.specialAbility ? ` [Ability: ${chassis.specialAbility}]` : "";
        return {
            id: chassis.id, 
            name: chassis.name, 
            description: chassis.description + abilityText,
            cost: cost, 
            unlocked: chassis.id === "medium",
            type: "chassis" as const,
            stats: { 
                health: chassis.maxHealth, 
                speed: chassis.moveSpeed, 
                armor: chassis.maxHealth / 50 
            }
        };
    });
}

/**
 * Генерирует массив TankPart для пушек
 */
export function generateCannonParts(): TankPart[] {
    return CANNON_TYPES.map(cannon => {
        const baseCost = 0;
        const damageMultiplier = 8;
        const dpsMultiplier = 50;
        
        // Calculate DPS (damage per second)
        const dps = (cannon.damage / (cannon.cooldown / 1000));
        
        let cost = baseCost + (cannon.damage * damageMultiplier) + (dps * dpsMultiplier);
        
        // Add special effect bonus
        const specialBonus = CANNON_SPECIAL_BONUSES[cannon.id];
        if (specialBonus) {
            cost += specialBonus;
        }
        
        // Round to nearest 50 for cleaner prices
        cost = Math.round(cost / 50) * 50;
        
        // Special cases for starter cannons
        if (cannon.id === "standard") {
            cost = 0; // Free starter
        } else if (cannon.id === "rapid") {
            cost = Math.min(cost, 350);
        } else if (cannon.id === "gatling") {
            cost = Math.min(cost, 450);
        }
        
        return {
            id: cannon.id,
            name: cannon.name,
            description: cannon.description,
            cost: cost,
            unlocked: cannon.id === "standard",
            type: "turret" as const,
            stats: {
                damage: cannon.damage,
                firepower: cannon.projectileSpeed / 5,
                reload: 100 / (cannon.cooldown / 1000)
            }
        };
    });
}

/**
 * Генерирует массив TankPart для гусениц
 */
export function generateTrackParts(): TankPart[] {
    return TRACK_TYPES.map(track => {
        return {
            id: track.id,
            name: track.name,
            description: track.description,
            cost: track.cost,
            unlocked: track.id === "standard",
            type: "chassis" as const, // Tracks are chassis type for UI
            stats: {
                speed: track.stats.speedBonus ? track.stats.speedBonus * 100 : 0,
                armor: track.stats.armorBonus ? track.stats.armorBonus * 100 : 0,
                health: track.stats.durabilityBonus ? track.stats.durabilityBonus * 100 : 0
            }
        };
    });
}

/**
 * Генерирует массив TankPart для модулей
 */
export function generateModuleParts(): TankPart[] {
    return MODULE_PRESETS.map(module => ({
        id: module.id,
        name: module.name,
        description: module.description,
        cost: module.cost,
        unlocked: module.unlocked,
        type: "module" as const,
        stats: {
            armor: module.stats.armor ? module.stats.armor * 100 : undefined,
            speed: module.stats.speed ? module.stats.speed * 100 : undefined,
            reload: module.stats.reload ? Math.abs(module.stats.reload) * 100 : undefined,
            damage: module.stats.damage ? module.stats.damage * 100 : undefined
        }
    }));
}

/**
 * Генерирует массив TankPart для припасов
 */
export function generateSupplyParts(): TankPart[] {
    return SUPPLY_PRESETS.map(supply => ({
        id: supply.id,
        name: supply.name,
        description: supply.description,
        cost: supply.cost,
        unlocked: supply.unlocked,
        type: "supply" as const,
        stats: {
            health: supply.stats.health,
            speed: supply.stats.speed ? supply.stats.speed * 100 : undefined,
            armor: supply.stats.armor,
            damage: supply.stats.damage ? supply.stats.damage * 100 : undefined
        }
    }));
}

/**
 * Все данные гаража
 */
export interface GarageDataStore {
    chassisParts: TankPart[];
    cannonParts: TankPart[];
    trackParts: TankPart[];
    moduleParts: TankPart[];
    supplyParts: TankPart[];
}

/**
 * Инициализирует все данные гаража
 */
export function initializeGarageData(): GarageDataStore {
    return {
        chassisParts: generateChassisParts(),
        cannonParts: generateCannonParts(),
        trackParts: generateTrackParts(),
        moduleParts: generateModuleParts(),
        supplyParts: generateSupplyParts()
    };
}

