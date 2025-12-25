/**
 * Интерфейс типа двигателя танка
 */
export interface EngineType {
    id: string;
    name: string;
    description: string;
    power: number;          // Мощность в л.с.
    acceleration: number;   // Ускорение (множитель)
    maxSpeed: number;       // Максимальная скорость (множитель)
    fuelConsumption: number; // Расход топлива
    cost: number;
    unlocked: boolean;
}

/**
 * Предустановленные типы двигателей
 */
export const ENGINE_PRESETS: EngineType[] = [
    {
        id: "standard",
        name: "Standard Engine",
        description: "Стандартный двигатель для базовых нужд",
        power: 500,
        acceleration: 1.0,
        maxSpeed: 1.0,
        fuelConsumption: 1.0,
        cost: 0,
        unlocked: true
    },
    {
        id: "turbo",
        name: "Turbo Engine",
        description: "Турбо двигатель с увеличенным ускорением",
        power: 650,
        acceleration: 1.3,
        maxSpeed: 1.1,
        fuelConsumption: 1.2,
        cost: 500,
        unlocked: false
    },
    {
        id: "diesel",
        name: "Heavy Diesel",
        description: "Тяжёлый дизель для надёжной работы",
        power: 750,
        acceleration: 0.9,
        maxSpeed: 0.95,
        fuelConsumption: 0.8,
        cost: 400,
        unlocked: false
    },
    {
        id: "hybrid",
        name: "Hybrid Powerplant",
        description: "Гибридная установка с электромотором",
        power: 600,
        acceleration: 1.2,
        maxSpeed: 1.15,
        fuelConsumption: 0.7,
        cost: 800,
        unlocked: false
    },
    {
        id: "racing",
        name: "Racing Engine",
        description: "Гоночный двигатель для максимальной скорости",
        power: 900,
        acceleration: 1.5,
        maxSpeed: 1.3,
        fuelConsumption: 1.5,
        cost: 1200,
        unlocked: false
    }
];

/**
 * Получить тип двигателя по ID
 */
export function getEngineById(id: string): EngineType {
    const engine = ENGINE_PRESETS.find(e => e.id === id);
    if (!engine) {
        console.warn(`[Engines] Engine type "${id}" not found, using standard`);
        return ENGINE_PRESETS[0]!;
    }
    return engine;
}

