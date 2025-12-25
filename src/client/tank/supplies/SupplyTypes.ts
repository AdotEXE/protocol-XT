/**
 * Интерфейс типа припаса танка
 */
export interface SupplyType {
    id: string;
    name: string;
    description: string;
    cost: number;
    unlocked: boolean;
    type: "supply";
    stats: {
        health?: number;
        speed?: number;
        armor?: number;
        damage?: number;
    };
}

/**
 * Предустановленные типы припасов
 */
export const SUPPLY_PRESETS: SupplyType[] = [
    { 
        id: "medkit", 
        name: "Repair Kit", 
        description: "Restore 30 HP", 
        cost: 50, 
        unlocked: true, 
        type: "supply", 
        stats: { health: 30 } 
    },
    { 
        id: "speed_boost", 
        name: "Nitro", 
        description: "+50% speed 5s", 
        cost: 75, 
        unlocked: true, 
        type: "supply", 
        stats: { speed: 0.5 } 
    },
    { 
        id: "shield", 
        name: "Shield", 
        description: "Block 50 dmg", 
        cost: 100, 
        unlocked: false, 
        type: "supply", 
        stats: { armor: 50 } 
    },
];

