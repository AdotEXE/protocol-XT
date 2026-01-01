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
        health?: number;
        critChance?: number;
        evasion?: number;
        fuelEfficiency?: number;
        repairRate?: number;
    };
    icon?: string;  // Иконка модуля для UI
    rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";  // Редкость модуля
}

/**
 * Предустановленные типы модулей
 */
export const MODULE_PRESETS: ModuleType[] = [
    // ================= БАЗОВЫЕ МОДУЛИ =================
    { 
        id: "armor_plate", 
        name: "Броневая пластина", 
        description: "+15% брони", 
        cost: 300, 
        unlocked: false, 
        type: "module", 
        stats: { armor: 0.15 },
        icon: "🛡️",
        rarity: "common"
    },
    { 
        id: "engine_boost", 
        name: "Турбо-двигатель", 
        description: "+10% скорости", 
        cost: 350, 
        unlocked: false, 
        type: "module", 
        stats: { speed: 0.1 },
        icon: "🚀",
        rarity: "common"
    },
    { 
        id: "reload_system", 
        name: "Авто-заряжание", 
        description: "-15% время перезарядки", 
        cost: 400, 
        unlocked: false, 
        type: "module", 
        stats: { reload: -0.15 },
        icon: "⚡",
        rarity: "common"
    },
    { 
        id: "targeting", 
        name: "Прицельный ЦПУ", 
        description: "+10% урона", 
        cost: 450, 
        unlocked: false, 
        type: "module", 
        stats: { damage: 0.1 },
        icon: "🎯",
        rarity: "uncommon"
    },
    
    // ================= НОВЫЕ МОДУЛИ =================
    
    // 1. Модуль "Реактивная броня"
    { 
        id: "reactive_armor", 
        name: "Реактивная броня", 
        description: "+25% брони, +10% здоровья", 
        cost: 650, 
        unlocked: false, 
        type: "module", 
        stats: { armor: 0.25, health: 0.1 },
        icon: "🔰",
        rarity: "rare"
    },
    
    // 2. Модуль "Нитро-инжектор"
    { 
        id: "nitro_injector", 
        name: "Нитро-инжектор", 
        description: "+20% скорости, -10% расход топлива", 
        cost: 700, 
        unlocked: false, 
        type: "module", 
        stats: { speed: 0.2, fuelEfficiency: 0.1 },
        icon: "💨",
        rarity: "rare"
    },
    
    // 3. Модуль "Критический калибратор"
    { 
        id: "crit_calibrator", 
        name: "Критический калибратор", 
        description: "+15% шанс крита, +5% урона", 
        cost: 800, 
        unlocked: false, 
        type: "module", 
        stats: { critChance: 0.15, damage: 0.05 },
        icon: "💥",
        rarity: "epic"
    },
    
    // 4. Модуль "Голографический уклонитель"
    { 
        id: "holo_evader", 
        name: "Голографический уклонитель", 
        description: "+12% уклонения, +5% скорости", 
        cost: 750, 
        unlocked: false, 
        type: "module", 
        stats: { evasion: 0.12, speed: 0.05 },
        icon: "👻",
        rarity: "epic"
    },
    
    // 5. Модуль "Нано-ремонтный комплекс"
    { 
        id: "nano_repair", 
        name: "Нано-ремонтный комплекс", 
        description: "+3% авто-ремонт/сек, +5% здоровья", 
        cost: 900, 
        unlocked: false, 
        type: "module", 
        stats: { repairRate: 0.03, health: 0.05 },
        icon: "🔧",
        rarity: "legendary"
    },
];

