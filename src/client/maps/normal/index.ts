/**
 * Normal Map Generator
 * Полностью случайная генерация с разнообразными биомами, дорогами и природой
 */

export const NORMAL_MAP_INFO = {
    id: "normal" as const,
    name: "Нормальная карта",
    description: "Полностью случайная генерация с разнообразными биомами, дорогами и природой"
};

/**
 * Типы биомов для normal карты
 */
export type BiomeType = "city" | "industrial" | "residential" | "park" | "wasteland" | "military";

/**
 * Вероятности биомов
 */
export const BIOME_WEIGHTS: Record<BiomeType, number> = {
    city: 0.20,
    industrial: 0.15,
    residential: 0.25,
    park: 0.15,
    wasteland: 0.15,
    military: 0.10
};

