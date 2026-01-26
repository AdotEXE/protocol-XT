
/**
 * TANK TYPES DEFINITIONS
 * Shared between Client (Workshop) and potentially Server (Validation)
 */

export interface TankComponent {
    id: string;
    name: string;
    description?: string;
    rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";
    icon?: string; // Emoji key or path
}

export interface ChassisType extends TankComponent {
    maxHealth: number;
    moveSpeed: number;
    turnSpeed: number;
    armor: number;
    mass: number;
}

export interface CannonType extends TankComponent {
    damage: number;
    cooldown: number; // ms
    range: number;
    projectileSpeed: number;
    accuracy: number;
}

export interface TrackType extends TankComponent {
    traction: number; // 0-1
    turnRate: number; // Multiplier
    color: string;
    width: number;
    height: number;
    depth: number;
}

export interface ModulePreset extends TankComponent {
    type: "repair" | "shield" | "boost" | "radar";
    duration?: number;
    cooldown?: number;
    value?: number;
}

// ============================================
// DATA DEFINITIONS
// ============================================

export const CHASSIS_TYPES: ChassisType[] = [
    {
        id: "light",
        name: "Light Scout",
        description: "Fast and agile, but fragile. Good for reconnaissance.",
        rarity: "common",
        maxHealth: 800,
        moveSpeed: 25,
        turnSpeed: 3.5,
        armor: 20,
        mass: 1000
    },
    {
        id: "medium",
        name: "Medium Striker",
        description: "Balanced combat tank. Decent armor and speed.",
        rarity: "common",
        maxHealth: 1200,
        moveSpeed: 18,
        turnSpeed: 2.5,
        armor: 50,
        mass: 2500
    },
    {
        id: "heavy",
        name: "Heavy Defender",
        description: "Slow moving fortress. High HP and armor.",
        rarity: "uncommon",
        maxHealth: 2500,
        moveSpeed: 12,
        turnSpeed: 1.5,
        armor: 120,
        mass: 5000
    },
    {
        id: "racer",
        name: "Speed Racer",
        description: "Extremely fast, almost no armor.",
        rarity: "rare",
        maxHealth: 500,
        moveSpeed: 35,
        turnSpeed: 4.5,
        armor: 5,
        mass: 800
    },
    {
        id: "hover",
        name: "Hover Tech",
        description: "Experimental hover chassis. Ignores terrain friction.",
        rarity: "epic",
        maxHealth: 1000,
        moveSpeed: 22,
        turnSpeed: 3.0,
        armor: 30,
        mass: 1500
    }
];

export const CANNON_TYPES: CannonType[] = [
    {
        id: "standard",
        name: "Standard 75mm",
        description: "Reliable all-rounder.",
        rarity: "common",
        damage: 150,
        cooldown: 1500,
        range: 500,
        projectileSpeed: 100,
        accuracy: 0.95
    },
    {
        id: "rapid",
        name: "Rapid Fire 30mm",
        description: "High rate of fire, low damage per shot.",
        rarity: "uncommon",
        damage: 40,
        cooldown: 200,
        range: 300,
        projectileSpeed: 120,
        accuracy: 0.85
    },
    {
        id: "sniper",
        name: "Sniper 120mm",
        description: "High damage, long range, slow reload.",
        rarity: "rare",
        damage: 400,
        cooldown: 3500,
        range: 1000,
        projectileSpeed: 200,
        accuracy: 0.99
    },
    {
        id: "shotgun",
        name: "Flak Cannon",
        description: "Fires multiple projectiles. Deadly at close range.",
        rarity: "epic",
        damage: 80, // per pellet
        cooldown: 2000,
        range: 200,
        projectileSpeed: 80,
        accuracy: 0.6
    }
];

export const TRACK_TYPES: TrackType[] = [
    {
        id: "standard",
        name: "Standard Tracks",
        rarity: "common",
        traction: 1.0,
        turnRate: 1.0,
        color: "#333333",
        width: 0.5,
        height: 0.8,
        depth: 3.5
    },
    {
        id: "reinforced",
        name: "Reinforced Tracks",
        rarity: "uncommon",
        traction: 1.2,
        turnRate: 0.9,
        color: "#554444",
        width: 0.6,
        height: 0.9,
        depth: 3.8
    },
    {
        id: "light",
        name: "Light Tracks",
        rarity: "common",
        traction: 0.9,
        turnRate: 1.2,
        color: "#445544",
        width: 0.4,
        height: 0.7,
        depth: 3.2
    }
];

export const MODULE_PRESETS: ModulePreset[] = [
    {
        id: "repair_kit",
        name: "Repair Kit",
        type: "repair",
        description: "Restores health over time.",
        rarity: "common",
        icon: "🔧",
        value: 500
    },
    {
        id: "shield_gen",
        name: "Shield Generator",
        type: "shield",
        description: "Blocks damage for a short duration.",
        rarity: "rare",
        icon: "🛡️",
        duration: 5000
    },
    {
        id: "turbo",
        name: "Turbo Charger",
        type: "boost",
        description: "Increases speed temporarily.",
        rarity: "uncommon",
        icon: "🚀",
        value: 1.5,
        duration: 3000
    }
];
