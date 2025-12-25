/**
 * Тип снаряда для арсенала танка
 */
export type ShellTypeId = "tracer" | "ap" | "apcr" | "he" | "apds";

/**
 * Интерфейс типа снаряда
 */
export interface ShellType {
    id: ShellTypeId;
    name: string;
    label: string;
    icon: string;
    color: string;
    description: string;
    damageMultiplier: number;
    penetrationBonus: number;
    explosionRadius?: number;
}

/**
 * Предустановленные типы снарядов
 */
export const SHELL_TYPES: ShellType[] = [
    {
        id: "tracer",
        name: "Tracer",
        label: "TRC",
        icon: "⦿",
        color: "#f80",
        description: "Стандартный трассирующий снаряд. Базовый урон, хорошая видимость траектории.",
        damageMultiplier: 1.0,
        penetrationBonus: 0
    },
    {
        id: "ap",
        name: "Armor-Piercing",
        label: "AP",
        icon: "◆",
        color: "#0ff",
        description: "Бронебойный снаряд. Увеличенное пробитие, стандартный урон.",
        damageMultiplier: 1.0,
        penetrationBonus: 0.3
    },
    {
        id: "apcr",
        name: "Armor-Piercing Composite Rigid",
        label: "APCR",
        icon: "◈",
        color: "#0af",
        description: "Подкалиберный снаряд с повышенной скоростью. Высокое пробитие, сниженный урон.",
        damageMultiplier: 0.8,
        penetrationBonus: 0.5
    },
    {
        id: "he",
        name: "High-Explosive",
        label: "HE",
        icon: "⬟",
        color: "#f60",
        description: "Фугасный снаряд. Урон по площади, эффективен против легкой брони.",
        damageMultiplier: 1.2,
        penetrationBonus: -0.2,
        explosionRadius: 3
    },
    {
        id: "apds",
        name: "Armor-Piercing Discarding Sabot",
        label: "APDS",
        icon: "◉",
        color: "#0fa",
        description: "Подкалиберный оперенный снаряд. Максимальное пробитие, высокая скорость.",
        damageMultiplier: 1.1,
        penetrationBonus: 0.7
    }
];

/**
 * Получить тип снаряда по ID
 */
export function getShellTypeById(id: ShellTypeId): ShellType {
    const shell = SHELL_TYPES.find(s => s.id === id);
    if (!shell) {
        console.warn(`[Arsenal] Shell type "${id}" not found, using tracer`);
        return SHELL_TYPES[0]!;
    }
    return shell;
}

