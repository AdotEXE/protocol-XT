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

// 5 типов корпусов
export const CHASSIS_TYPES: ChassisType[] = [
    {
        id: "light",
        name: "Лёгкий",
        width: 1.8,
        height: 0.7,
        depth: 3.0,
        mass: 1000,
        maxHealth: 80,
        moveSpeed: 15,
        turnSpeed: 3.0,
        acceleration: 10000,
        color: "#4a9eff",
        description: "Быстрый и манёвренный, но слабая броня"
    },
    {
        id: "medium",
        name: "Средний",
        width: 2.2,
        height: 0.8,
        depth: 3.5,
        mass: 1500,
        maxHealth: 100,
        moveSpeed: 12,
        turnSpeed: 2.5,
        acceleration: 8000,
        color: "#00ff00",
        description: "Сбалансированный танк"
    },
    {
        id: "heavy",
        name: "Тяжёлый",
        width: 2.6,
        height: 0.9,
        depth: 4.0,
        mass: 2000,
        maxHealth: 150,
        moveSpeed: 9,
        turnSpeed: 2.0,
        acceleration: 6000,
        color: "#8b4513",
        description: "Медленный, но очень прочный"
    },
    {
        id: "assault",
        name: "Штурмовой",
        width: 2.4,
        height: 0.85,
        depth: 3.8,
        mass: 1700,
        maxHealth: 120,
        moveSpeed: 11,
        turnSpeed: 2.3,
        acceleration: 7500,
        color: "#ff4444",
        description: "Хорошая скорость и защита"
    },
    {
        id: "scout",
        name: "Разведчик",
        width: 1.6,
        height: 0.6,
        depth: 2.8,
        mass: 800,
        maxHealth: 60,
        moveSpeed: 18,
        turnSpeed: 3.5,
        acceleration: 12000,
        color: "#ffff00",
        description: "Очень быстрый, но хрупкий"
    }
];

// 5 типов пушек
export const CANNON_TYPES: CannonType[] = [
    {
        id: "rapid",
        name: "Быстрая",
        barrelLength: 2.0,
        barrelWidth: 0.15,
        damage: 15,
        cooldown: 1000,
        projectileSpeed: 80,
        projectileSize: 0.15,
        color: "#888888",
        description: "Быстрая стрельба, низкий урон"
    },
    {
        id: "standard",
        name: "Стандартная",
        barrelLength: 2.5,
        barrelWidth: 0.2,
        damage: 25,
        cooldown: 2000,
        projectileSpeed: 100,
        projectileSize: 0.2,
        color: "#666666",
        description: "Сбалансированная пушка"
    },
    {
        id: "heavy",
        name: "Тяжёлая",
        barrelLength: 3.0,
        barrelWidth: 0.25,
        damage: 40,
        cooldown: 3500,
        projectileSpeed: 120,
        projectileSize: 0.25,
        color: "#444444",
        description: "Медленная, но мощная"
    },
    {
        id: "sniper",
        name: "Снайперская",
        barrelLength: 3.5,
        barrelWidth: 0.18,
        damage: 50,
        cooldown: 4000,
        projectileSpeed: 150,
        projectileSize: 0.18,
        color: "#222222",
        description: "Высокий урон, дальний бой"
    },
    {
        id: "gatling",
        name: "Гатлинг",
        barrelLength: 2.2,
        barrelWidth: 0.22,
        damage: 10,
        cooldown: 300,
        projectileSpeed: 90,
        projectileSize: 0.12,
        color: "#aaaaaa",
        description: "Очень быстрая стрельба"
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

