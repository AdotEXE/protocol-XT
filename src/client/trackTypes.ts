// Система типов гусениц/шасси для танков

export interface TrackType {
    id: string;
    name: string;
    description: string;
    width: number;      // Ширина гусеницы
    height: number;     // Высота гусеницы
    depth: number;      // Длина гусеницы (глубина)
    color: string;      // Hex цвет гусеницы
    style: "standard" | "wide" | "narrow" | "reinforced" | "lightweight" | "heavy";
    stats: {
        speedBonus?: number;      // Бонус к скорости (множитель)
        durabilityBonus?: number;  // Бонус к прочности (множитель)
        armorBonus?: number;       // Бонус к броне (множитель)
    };
    cost: number;
}

export const TRACK_TYPES: TrackType[] = [
    {
        id: "standard",
        name: "Standard Tracks",
        description: "Balanced tracks for all terrain",
        width: 0.4,     // Уменьшено с 0.5 для избежания глитчей
        height: 0.5,    // Уменьшено с 0.6 для избежания глитчей
        depth: 3.4,     // Уменьшено с 3.8 для избежания глитчей
        color: "#1a1a1a",
        style: "standard",
        stats: {},
        cost: 0
    },
    {
        id: "wide",
        name: "Wide Tracks",
        description: "Wider tracks for better terrain handling",
        width: 0.55,    // Уменьшено с 0.7
        height: 0.55,   // Уменьшено с 0.65
        depth: 3.5,     // Уменьшено с 3.9
        color: "#2a2a2a",
        style: "wide",
        stats: {
            durabilityBonus: 0.1
        },
        cost: 300
    },
    {
        id: "narrow",
        name: "Narrow Tracks",
        description: "Lightweight narrow tracks for speed",
        width: 0.3,     // Уменьшено с 0.35
        height: 0.45,   // Уменьшено с 0.55
        depth: 3.3,     // Уменьшено с 3.7
        color: "#151515",
        style: "narrow",
        stats: {
            speedBonus: 0.15
        },
        cost: 400
    },
    {
        id: "reinforced",
        name: "Reinforced Tracks",
        description: "Heavy-duty tracks with extra durability",
        width: 0.5,     // Уменьшено с 0.6
        height: 0.6,    // Уменьшено с 0.7
        depth: 3.6,     // Уменьшено с 4.0
        color: "#3a3a3a",
        style: "reinforced",
        stats: {
            durabilityBonus: 0.25,
            armorBonus: 0.1
        },
        cost: 500
    },
    {
        id: "lightweight",
        name: "Lightweight Tracks",
        description: "Ultra-light tracks for maximum speed",
        width: 0.35,    // Уменьшено с 0.4
        height: 0.4,    // Уменьшено с 0.5
        depth: 3.2,     // Уменьшено с 3.6
        color: "#0f0f0f",
        style: "lightweight",
        stats: {
            speedBonus: 0.25
        },
        cost: 450
    },
    {
        id: "heavy",
        name: "Heavy Tracks",
        description: "Massive armored tracks for maximum protection",
        width: 0.65,    // Уменьшено с 0.8
        height: 0.65,   // Уменьшено с 0.75
        depth: 3.8,     // Уменьшено с 4.2
        color: "#4a4a4a",
        style: "heavy",
        stats: {
            armorBonus: 0.2,
            durabilityBonus: 0.3
        },
        cost: 600
    }
];

// Получить гусеницу по ID (из json_models или fallback на хардкод)
export function getTrackById(id: string): TrackType {
    // Пытаемся использовать модели из json_models (из кэша)
    try {
        const { getTrackByIdSync } = require('./utils/modelLoader');
        const result = getTrackByIdSync(id);
        if (result) {
            return result;
        }
    } catch (e) {
        // Если modelLoader не загружен, используем fallback
    }
    // Fallback на хардкод если json_models не загружен
    const track = TRACK_TYPES.find(t => t.id === id);
    if (!track) {
        console.warn(`[TrackTypes] Track type "${id}" not found, using standard`);
        return TRACK_TYPES[0]!;
    }
    return track;
}



