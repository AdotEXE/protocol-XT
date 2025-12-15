// Система типов корпусов и пушек для танков

export interface ChassisType {
    id: string;
    name: string;
    width: number;
    height: number;
    depth: number;
    mass: number;
    maxHealth: number;
    moveSpeed: number;
    turnSpeed: number;
    acceleration: number;
    color: string; // Hex цвет
    description: string;
    specialAbility?: string; // Специальная способность
}

export interface CannonType {
    id: string;
    name: string;
    barrelLength: number;
    barrelWidth: number;
    damage: number;
    cooldown: number; // мс
    projectileSpeed: number;
    projectileSize: number;
    color: string; // Hex цвет
    description: string;
}

// 5 chassis types
export const CHASSIS_TYPES: ChassisType[] = [
    {
        id: "light",
        name: "Light",
        width: 1.8,
        height: 0.7,
        depth: 3.0,
        mass: 1250,
        maxHealth: 80,
        moveSpeed: 30,
        turnSpeed: 3.0,
        acceleration: 12500,
        color: "#4a9eff",
        description: "Fast and agile, but weak armor"
    },
    {
        id: "medium",
        name: "Medium",
        width: 2.2,
        height: 0.8,
        depth: 3.5,
        mass: 1875,
        maxHealth: 100,
        moveSpeed: 24,
        turnSpeed: 2.5,
        acceleration: 10000,
        color: "#00ff00",
        description: "Balanced tank"
    },
    {
        id: "heavy",
        name: "Heavy",
        width: 2.6,
        height: 0.9,
        depth: 4.0,
        mass: 2500,
        maxHealth: 150,
        moveSpeed: 18,
        turnSpeed: 2.0,
        acceleration: 7500,
        color: "#8b4513",
        description: "Slow but very durable"
    },
    {
        id: "assault",
        name: "Assault",
        width: 2.4,
        height: 0.85,
        depth: 3.8,
        mass: 2125,
        maxHealth: 120,
        moveSpeed: 22,
        turnSpeed: 2.3,
        acceleration: 9375,
        color: "#ff4444",
        description: "Good speed and protection"
    },
    {
        id: "scout",
        name: "Scout",
        width: 1.6,
        height: 0.6,
        depth: 2.8,
        mass: 1000,
        maxHealth: 60,
        moveSpeed: 36,
        turnSpeed: 3.5,
        acceleration: 15000,
        color: "#ffff00",
        description: "Very fast but fragile"
    },
    
    // === NEW 10 CHASSIS TYPES ===
    
    {
        id: "stealth",
        name: "Stealth",
        width: 1.9,
        height: 0.65,
        depth: 3.2,
        mass: 1100,
        maxHealth: 70,
        moveSpeed: 28,
        turnSpeed: 3.2,
        acceleration: 13000,
        color: "#333333",
        description: "Can become invisible temporarily",
        specialAbility: "stealth"
    },
    {
        id: "hover",
        name: "Hover",
        width: 2.0,
        height: 0.75,
        depth: 3.3,
        mass: 1400,
        maxHealth: 85,
        moveSpeed: 32,
        turnSpeed: 3.8,
        acceleration: 14000,
        color: "#00aaff",
        description: "Hover technology, smooth movement",
        specialAbility: "hover"
    },
    {
        id: "siege",
        name: "Siege",
        width: 3.0,
        height: 1.1,
        depth: 4.5,
        mass: 3500,
        maxHealth: 200,
        moveSpeed: 12,
        turnSpeed: 1.5,
        acceleration: 5000,
        color: "#654321",
        description: "Extremely durable, siege weapon",
        specialAbility: "siege"
    },
    {
        id: "racer",
        name: "Racer",
        width: 1.5,
        height: 0.55,
        depth: 2.6,
        mass: 900,
        maxHealth: 50,
        moveSpeed: 42,
        turnSpeed: 4.0,
        acceleration: 18000,
        color: "#ff0000",
        description: "Maximum speed, racing design",
        specialAbility: "racer"
    },
    {
        id: "amphibious",
        name: "Amphibious",
        width: 2.1,
        height: 0.8,
        depth: 3.6,
        mass: 1600,
        maxHealth: 95,
        moveSpeed: 26,
        turnSpeed: 2.8,
        acceleration: 11000,
        color: "#0088ff",
        description: "Can operate on land and water",
        specialAbility: "amphibious"
    },
    {
        id: "shield",
        name: "Shield",
        width: 2.3,
        height: 0.9,
        depth: 3.7,
        mass: 2000,
        maxHealth: 110,
        moveSpeed: 20,
        turnSpeed: 2.2,
        acceleration: 9000,
        color: "#88ff88",
        description: "Energy shield protection",
        specialAbility: "shield"
    },
    {
        id: "drone",
        name: "Drone Carrier",
        width: 2.2,
        height: 0.85,
        depth: 3.5,
        mass: 1800,
        maxHealth: 90,
        moveSpeed: 25,
        turnSpeed: 2.6,
        acceleration: 10500,
        color: "#aa00ff",
        description: "Deploys combat drones",
        specialAbility: "drone"
    },
    {
        id: "artillery",
        name: "Artillery",
        width: 2.8,
        height: 1.0,
        depth: 4.2,
        mass: 2800,
        maxHealth: 130,
        moveSpeed: 16,
        turnSpeed: 1.8,
        acceleration: 6500,
        color: "#8b4513",
        description: "Long-range artillery support",
        specialAbility: "artillery"
    },
    {
        id: "destroyer",
        name: "Tank Destroyer",
        width: 2.5,
        height: 0.95,
        depth: 4.0,
        mass: 2200,
        maxHealth: 105,
        moveSpeed: 21,
        turnSpeed: 2.4,
        acceleration: 8500,
        color: "#ff8800",
        description: "High damage, tank hunter",
        specialAbility: "destroyer"
    },
    {
        id: "command",
        name: "Command",
        width: 2.4,
        height: 0.88,
        depth: 3.9,
        mass: 1950,
        maxHealth: 115,
        moveSpeed: 23,
        turnSpeed: 2.5,
        acceleration: 9500,
        color: "#ffd700",
        description: "Command vehicle, buffs allies",
        specialAbility: "command"
    }
];

// 25 cannon types (5 original + 20 new)
export const CANNON_TYPES: CannonType[] = [
    // === ORIGINAL 5 ===
    {
        id: "rapid",
        name: "Rapid",
        barrelLength: 1.7,
        barrelWidth: 0.15,
        damage: 15,
        cooldown: 1000,
        projectileSpeed: 160,
        projectileSize: 0.15,
        color: "#888888",
        description: "Fast fire rate, low damage"
    },
    {
        id: "standard",
        name: "Standard",
        barrelLength: 2.1,
        barrelWidth: 0.2,
        damage: 25,
        cooldown: 2000,
        projectileSpeed: 200,
        projectileSize: 0.2,
        color: "#666666",
        description: "Balanced cannon"
    },
    {
        id: "heavy",
        name: "Heavy",
        barrelLength: 2.5,
        barrelWidth: 0.25,
        damage: 40,
        cooldown: 3500,
        projectileSpeed: 240,
        projectileSize: 0.25,
        color: "#444444",
        description: "Slow but powerful"
    },
    {
        id: "sniper",
        name: "Sniper",
        barrelLength: 3.0,
        barrelWidth: 0.18,
        damage: 50,
        cooldown: 4000,
        projectileSpeed: 300,
        projectileSize: 0.18,
        color: "#222222",
        description: "High damage, long range"
    },
    {
        id: "gatling",
        name: "Gatling",
        barrelLength: 1.9,
        barrelWidth: 0.22,
        damage: 10,
        cooldown: 300,
        projectileSpeed: 180,
        projectileSize: 0.12,
        color: "#aaaaaa",
        description: "Very fast fire rate"
    },
    
    // === NEW 20 CANNONS ===
    
    // === ENERGY WEAPONS ===
    {
        id: "plasma",
        name: "Plasma Cannon",
        barrelLength: 2.3,
        barrelWidth: 0.28,
        damage: 35,
        cooldown: 2500,
        projectileSpeed: 220,
        projectileSize: 0.22,
        color: "#ff00ff",
        description: "Energy-based weapon, medium damage"
    },
    {
        id: "laser",
        name: "Laser Beam",
        barrelLength: 2.8,
        barrelWidth: 0.16,
        damage: 30,
        cooldown: 1500,
        projectileSpeed: 400,
        projectileSize: 0.14,
        color: "#ff0000",
        description: "Instant hit, high speed"
    },
    {
        id: "tesla",
        name: "Tesla Coil",
        barrelLength: 1.8,
        barrelWidth: 0.32,
        damage: 20,
        cooldown: 1800,
        projectileSpeed: 190,
        projectileSize: 0.20,
        color: "#00ffff",
        description: "Electric damage, chain effect"
    },
    {
        id: "railgun",
        name: "Railgun",
        barrelLength: 3.5,
        barrelWidth: 0.20,
        damage: 60,
        cooldown: 5000,
        projectileSpeed: 500,
        projectileSize: 0.16,
        color: "#0088ff",
        description: "Extreme damage, very slow reload"
    },
    
    // === EXPLOSIVE WEAPONS ===
    {
        id: "rocket",
        name: "Rocket Launcher",
        barrelLength: 2.2,
        barrelWidth: 0.30,
        damage: 45,
        cooldown: 3000,
        projectileSpeed: 150,
        projectileSize: 0.28,
        color: "#ff8800",
        description: "Explosive rounds, area damage"
    },
    {
        id: "mortar",
        name: "Mortar",
        barrelLength: 1.5,
        barrelWidth: 0.35,
        damage: 55,
        cooldown: 4500,
        projectileSpeed: 100,
        projectileSize: 0.32,
        color: "#8b4513",
        description: "High arc, massive damage"
    },
    {
        id: "cluster",
        name: "Cluster Launcher",
        barrelLength: 2.0,
        barrelWidth: 0.26,
        damage: 25,
        cooldown: 2800,
        projectileSpeed: 170,
        projectileSize: 0.24,
        color: "#ff4444",
        description: "Splits into multiple projectiles"
    },
    {
        id: "explosive",
        name: "Explosive Cannon",
        barrelLength: 2.4,
        barrelWidth: 0.28,
        damage: 42,
        cooldown: 3200,
        projectileSpeed: 180,
        projectileSize: 0.26,
        color: "#ff6600",
        description: "Explosive shells, splash damage"
    },
    
    // === SPECIAL EFFECT WEAPONS ===
    {
        id: "flamethrower",
        name: "Flamethrower",
        barrelLength: 1.6,
        barrelWidth: 0.24,
        damage: 12,
        cooldown: 200,
        projectileSpeed: 120,
        projectileSize: 0.18,
        color: "#ff3300",
        description: "Continuous fire, burn effect"
    },
    {
        id: "acid",
        name: "Acid Launcher",
        barrelLength: 2.1,
        barrelWidth: 0.22,
        damage: 18,
        cooldown: 2200,
        projectileSpeed: 140,
        projectileSize: 0.20,
        color: "#00ff00",
        description: "Corrosive damage over time"
    },
    {
        id: "freeze",
        name: "Cryo Cannon",
        barrelLength: 2.0,
        barrelWidth: 0.20,
        damage: 22,
        cooldown: 2400,
        projectileSpeed: 160,
        projectileSize: 0.19,
        color: "#00ccff",
        description: "Freezes enemies, slows movement"
    },
    {
        id: "poison",
        name: "Toxin Launcher",
        barrelLength: 1.9,
        barrelWidth: 0.21,
        damage: 16,
        cooldown: 2100,
        projectileSpeed: 150,
        projectileSize: 0.17,
        color: "#9900ff",
        description: "Poison damage, DoT effect"
    },
    {
        id: "emp",
        name: "EMP Blaster",
        barrelLength: 2.2,
        barrelWidth: 0.25,
        damage: 15,
        cooldown: 3500,
        projectileSpeed: 200,
        projectileSize: 0.23,
        color: "#ffff00",
        description: "Disables systems, low damage"
    },
    
    // === MULTI-SHOT WEAPONS ===
    {
        id: "shotgun",
        name: "Shotgun",
        barrelLength: 1.4,
        barrelWidth: 0.34,
        damage: 8,
        cooldown: 1200,
        projectileSpeed: 130,
        projectileSize: 0.10,
        color: "#cc6600",
        description: "Multiple pellets, close range"
    },
    {
        id: "multishot",
        name: "Multi-Barrel",
        barrelLength: 2.1,
        barrelWidth: 0.38,
        damage: 14,
        cooldown: 1600,
        projectileSpeed: 175,
        projectileSize: 0.13,
        color: "#8888aa",
        description: "Fires 3 shots at once"
    },
    
    // === ADVANCED WEAPONS ===
    {
        id: "homing",
        name: "Homing Missile",
        barrelLength: 2.3,
        barrelWidth: 0.27,
        damage: 38,
        cooldown: 3800,
        projectileSpeed: 180,
        projectileSize: 0.25,
        color: "#ff0088",
        description: "Tracks targets automatically"
    },
    {
        id: "piercing",
        name: "Piercing Rail",
        barrelLength: 3.2,
        barrelWidth: 0.18,
        damage: 32,
        cooldown: 2800,
        projectileSpeed: 350,
        projectileSize: 0.12,
        color: "#cccccc",
        description: "Penetrates through enemies"
    },
    {
        id: "shockwave",
        name: "Shockwave Cannon",
        barrelLength: 2.6,
        barrelWidth: 0.32,
        damage: 28,
        cooldown: 3000,
        projectileSpeed: 110,
        projectileSize: 0.30,
        color: "#ffaa00",
        description: "Area effect, knockback"
    },
    {
        id: "beam",
        name: "Beam Cannon",
        barrelLength: 2.7,
        barrelWidth: 0.19,
        damage: 26,
        cooldown: 1900,
        projectileSpeed: 380,
        projectileSize: 0.15,
        color: "#ff00aa",
        description: "Continuous beam damage"
    },
    {
        id: "vortex",
        name: "Vortex Launcher",
        barrelLength: 2.5,
        barrelWidth: 0.29,
        damage: 33,
        cooldown: 3600,
        projectileSpeed: 160,
        projectileSize: 0.27,
        color: "#aa00ff",
        description: "Pulls enemies, area damage"
    },
    {
        id: "support",
        name: "Support Beam",
        barrelLength: 2.2,
        barrelWidth: 0.24,
        damage: 20,
        cooldown: 1500,
        projectileSpeed: 250,
        projectileSize: 0.20,
        color: "#00ff88",
        description: "Repairs allies, damages enemies"
    }
];

// Получить корпус по ID
export function getChassisById(id: string): ChassisType {
    return CHASSIS_TYPES.find(c => c.id === id) || CHASSIS_TYPES[1]; // По умолчанию средний
}

// Получить пушку по ID
export function getCannonById(id: string): CannonType {
    return CANNON_TYPES.find(c => c.id === id) || CANNON_TYPES[1]; // По умолчанию стандартная
}

