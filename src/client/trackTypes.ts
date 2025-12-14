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
        width: 0.5,
        height: 0.6,
        depth: 3.8,
        color: "#1a1a1a",
        style: "standard",
        stats: {},
        cost: 0
    },
    {
        id: "wide",
        name: "Wide Tracks",
        description: "Wider tracks for better terrain handling",
        width: 0.7,
        height: 0.65,
        depth: 3.9,
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
        width: 0.35,
        height: 0.55,
        depth: 3.7,
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
        width: 0.6,
        height: 0.7,
        depth: 4.0,
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
        width: 0.4,
        height: 0.5,
        depth: 3.6,
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
        width: 0.8,
        height: 0.75,
        depth: 4.2,
        color: "#4a4a4a",
        style: "heavy",
        stats: {
            armorBonus: 0.2,
            durabilityBonus: 0.3
        },
        cost: 600
    }
];

export function getTrackById(id: string): TrackType {
    const track = TRACK_TYPES.find(t => t.id === id);
    if (!track) {
        console.warn(`[TrackTypes] Track type "${id}" not found, using standard`);
        return TRACK_TYPES[0];
    }
    return track;
}



