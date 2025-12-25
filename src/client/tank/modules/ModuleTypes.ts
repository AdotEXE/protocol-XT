/**
 * Интерфейс типа модуля танка
 */
export interface ModuleType {
    id: string;
    name: string;
    description: string;
    cost: number;
    unlocked: boolean;
    type: "module";
    stats: {
        armor?: number;
        speed?: number;
        reload?: number;
        damage?: number;
    };
}

/**
 * Предустановленные типы модулей
 */
export const MODULE_PRESETS: ModuleType[] = [
    { 
        id: "armor_plate", 
        name: "Armor Plate", 
        description: "+15% armor", 
        cost: 300, 
        unlocked: false, 
        type: "module", 
        stats: { armor: 0.15 } 
    },
    { 
        id: "engine_boost", 
        name: "Engine Boost", 
        description: "+10% speed", 
        cost: 350, 
        unlocked: false, 
        type: "module", 
        stats: { speed: 0.1 } 
    },
    { 
        id: "reload_system", 
        name: "Auto-Loader", 
        description: "-15% reload", 
        cost: 400, 
        unlocked: false, 
        type: "module", 
        stats: { reload: -0.15 } 
    },
    { 
        id: "targeting", 
        name: "Targeting CPU", 
        description: "+10% damage", 
        cost: 450, 
        unlocked: false, 
        type: "module", 
        stats: { damage: 0.1 } 
    },
];

