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
    }
];

// 5 cannon types
export const CANNON_TYPES: CannonType[] = [
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

