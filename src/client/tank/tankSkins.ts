/**
 * Tank Skins System
 * Система скинов для танков с пресетами и кастомизацией
 * Подобно системе скинов в Minecraft
 */

import { Color3, StandardMaterial } from "@babylonjs/core";

/**
 * Интерфейс для скина танка
 */
export interface TankSkin {
    id: string;
    name: string;
    description: string;
    chassisColor: string; // Hex цвет корпуса
    turretColor: string; // Hex цвет башни
    accentColor?: string; // Hex цвет акцентов (опционально)
    barrelColor?: string; // Hex цвет пушки (опционально)
    pattern?: SkinPattern; // Паттерн/стиль (опционально)
}

/**
 * Типы паттернов для скинов
 */
export enum SkinPattern {
    SOLID = "solid",           // Однотонный
    CAMOUFLAGE = "camouflage", // Камуфляж
    STRIPES = "stripes",       // Полосы
    METALLIC = "metallic",     // Металлик
    RUSTIC = "rustic",         // Ржавчина/военный стиль
    NEON = "neon",             // Неоновый стиль
    STEALTH = "stealth"        // Стелс/темный
}

/**
 * Пресеты скинов (предопределенные скины)
 */
export const SKIN_PRESETS: TankSkin[] = [
    // === Базовые скины ===
    {
        id: "default",
        name: "По умолчанию",
        description: "Стандартный цвет танка",
        chassisColor: "#00ff00",
        turretColor: "#888888"
    },
    {
        id: "classic-green",
        name: "Классический зелёный",
        description: "Стандартный военный зелёный",
        chassisColor: "#4a5d23",
        turretColor: "#3a4d13",
        pattern: SkinPattern.CAMOUFLAGE
    },
    {
        id: "desert-tan",
        name: "Песочный",
        description: "Пустынный камуфляж",
        chassisColor: "#d2b48c",
        turretColor: "#c4a473",
        pattern: SkinPattern.CAMOUFLAGE
    },
    {
        id: "snow-white",
        name: "Белый снег",
        description: "Зимний камуфляж",
        chassisColor: "#f5f5f5",
        turretColor: "#e0e0e0",
        pattern: SkinPattern.CAMOUFLAGE
    },
    
    // === Металлические скины ===
    {
        id: "chrome",
        name: "Хром",
        description: "Блестящий хромированный",
        chassisColor: "#c0c0c0",
        turretColor: "#a0a0a0",
        pattern: SkinPattern.METALLIC
    },
    {
        id: "gold",
        name: "Золотой",
        description: "Золотистый металлик",
        chassisColor: "#ffd700",
        turretColor: "#ffc800",
        pattern: SkinPattern.METALLIC
    },
    {
        id: "steel",
        name: "Стальной",
        description: "Серый металл",
        chassisColor: "#71797e",
        turretColor: "#61696e",
        pattern: SkinPattern.METALLIC
    },
    
    // === Яркие/неоновые скины ===
    {
        id: "neon-blue",
        name: "Неоновый синий",
        description: "Яркий неоновый синий",
        chassisColor: "#00ffff",
        turretColor: "#00ccff",
        pattern: SkinPattern.NEON,
        accentColor: "#0099ff"
    },
    {
        id: "neon-pink",
        name: "Неоновый розовый",
        description: "Яркий неоновый розовый",
        chassisColor: "#ff00ff",
        turretColor: "#ff00cc",
        pattern: SkinPattern.NEON,
        accentColor: "#ff0099"
    },
    {
        id: "neon-green",
        name: "Неоновый зелёный",
        description: "Яркий неоновый зелёный",
        chassisColor: "#00ff00",
        turretColor: "#00cc00",
        pattern: SkinPattern.NEON,
        accentColor: "#009900"
    },
    
    // === Военные/боевые скины ===
    {
        id: "rusty",
        name: "Ржавый",
        description: "Изношенный ржавый вид",
        chassisColor: "#8b4513",
        turretColor: "#7b3513",
        pattern: SkinPattern.RUSTIC
    },
    {
        id: "stealth-black",
        name: "Стелс чёрный",
        description: "Тёмный стелс стиль",
        chassisColor: "#1a1a1a",
        turretColor: "#0f0f0f",
        pattern: SkinPattern.STEALTH,
        accentColor: "#333333"
    },
    {
        id: "olive-drab",
        name: "Оливковый",
        description: "Военный оливковый",
        chassisColor: "#556b2f",
        turretColor: "#45562f",
        pattern: SkinPattern.CAMOUFLAGE
    },
    
    // === Полосатые скины ===
    {
        id: "racing-red",
        name: "Гоночный красный",
        description: "Красный с полосами",
        chassisColor: "#ff0000",
        turretColor: "#cc0000",
        pattern: SkinPattern.STRIPES,
        accentColor: "#ffffff"
    },
    {
        id: "racing-blue",
        name: "Гоночный синий",
        description: "Синий с полосами",
        chassisColor: "#0000ff",
        turretColor: "#0000cc",
        pattern: SkinPattern.STRIPES,
        accentColor: "#ffffff"
    },
    
    // === Специальные скины ===
    {
        id: "fire",
        name: "Огненный",
        description: "Красно-оранжевый градиент",
        chassisColor: "#ff4500",
        turretColor: "#ff3300",
        pattern: SkinPattern.STRIPES,
        accentColor: "#ff6600"
    },
    {
        id: "ice",
        name: "Ледяной",
        description: "Голубой кристаллический",
        chassisColor: "#b0e0e6",
        turretColor: "#87ceeb",
        pattern: SkinPattern.METALLIC,
        accentColor: "#4682b4"
    },
    {
        id: "toxic",
        name: "Токсичный",
        description: "Ядовитый зелёный",
        chassisColor: "#00ff00",
        turretColor: "#00cc00",
        pattern: SkinPattern.NEON,
        accentColor: "#00ff88"
    },
    
    // === Дополнительные премиум скины ===
    {
        id: "platinum",
        name: "Платиновый",
        description: "Блестящий платиновый",
        chassisColor: "#e5e4e2",
        turretColor: "#c9c8c6",
        pattern: SkinPattern.METALLIC
    },
    {
        id: "bronze",
        name: "Бронзовый",
        description: "Античная бронза",
        chassisColor: "#cd7f32",
        turretColor: "#b87333",
        pattern: SkinPattern.METALLIC
    },
    {
        id: "crimson",
        name: "Алый",
        description: "Яркий алый красный",
        chassisColor: "#dc143c",
        turretColor: "#b01030",
        pattern: SkinPattern.SOLID
    },
    {
        id: "royal-purple",
        name: "Королевский фиолетовый",
        description: "Благородный фиолетовый",
        chassisColor: "#7851a9",
        turretColor: "#663399",
        pattern: SkinPattern.METALLIC
    },
    {
        id: "midnight",
        name: "Полночь",
        description: "Тёмно-синий ночной",
        chassisColor: "#191970",
        turretColor: "#000080",
        pattern: SkinPattern.STEALTH
    },
    {
        id: "sunset",
        name: "Закат",
        description: "Оранжево-красный закат",
        chassisColor: "#ff6347",
        turretColor: "#ff4500",
        pattern: SkinPattern.STRIPES,
        accentColor: "#ff8c00"
    }
];

/**
 * Получить скин по ID
 */
export function getSkinById(skinId: string): TankSkin | null {
    return SKIN_PRESETS.find(skin => skin.id === skinId) || null;
}

/**
 * Получить скин по умолчанию
 */
export function getDefaultSkin(): TankSkin {
    return SKIN_PRESETS[0] || {
        id: "default",
        name: "По умолчанию",
        description: "Стандартный цвет танка",
        chassisColor: "#00ff00",
        turretColor: "#888888"
    };
}

/**
 * Применить скин к танку (возвращает цвета для применения)
 */
export function applySkinToTank(skin: TankSkin): {
    chassisColor: Color3;
    turretColor: Color3;
    accentColor?: Color3;
    barrelColor?: Color3;
} {
    return {
        chassisColor: Color3.FromHexString(skin.chassisColor),
        turretColor: Color3.FromHexString(skin.turretColor),
        accentColor: skin.accentColor ? Color3.FromHexString(skin.accentColor) : undefined,
        barrelColor: skin.barrelColor ? Color3.FromHexString(skin.barrelColor) : undefined
    };
}

/**
 * Применить цвет скина к материалу (с размораживанием/замораживанием)
 * Babylon.js замораживает материалы для оптимизации, поэтому нужно
 * размораживать их перед изменением цвета
 */
export function applySkinColorToMaterial(material: StandardMaterial | null | undefined, color: Color3): void {
    if (!material) {
        console.warn("[SKIN] applySkinColorToMaterial: material is null/undefined");
        return;
    }
    
    // Размораживаем материал для возможности изменения
    material.unfreeze();
    
    // Применяем новый цвет
    material.diffuseColor = color;
    
    // Замораживаем обратно для оптимизации производительности
    material.freeze();
}

/**
 * Сохранить выбранный скин в localStorage
 */
export function saveSelectedSkin(skinId: string): void {
    try {
        localStorage.setItem("selectedTankSkin", skinId);
    } catch (e) {
        console.error("[SKIN] Failed to save selected skin:", e);
    }
}

/**
 * Загрузить выбранный скин из localStorage
 */
export function loadSelectedSkin(): string | null {
    try {
        return localStorage.getItem("selectedTankSkin");
    } catch (e) {
        console.warn("Failed to load selected skin:", e);
        return null;
    }
}

/**
 * Создать кастомный скин из цветов
 */
export function createCustomSkin(
    chassisColor: string,
    turretColor: string,
    accentColor?: string,
    barrelColor?: string
): TankSkin {
    return {
        id: `custom_${Date.now()}`,
        name: "Кастомный",
        description: "Пользовательский скин",
        chassisColor,
        turretColor,
        accentColor,
        barrelColor,
        pattern: SkinPattern.SOLID
    };
}
