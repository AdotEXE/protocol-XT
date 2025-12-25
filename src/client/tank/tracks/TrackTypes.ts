/**
 * Интерфейс типа гусениц танка
 */
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

/**
 * Все типы гусениц
 * Re-export из trackTypes.ts для обратной совместимости
 */
export { TRACK_TYPES, getTrackById } from '../../trackTypes';
