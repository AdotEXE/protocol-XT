// ═══════════════════════════════════════════════════════════════════════════
// SKILL TREE CONFIGURATION - Конфигурация дерева навыков
// ═══════════════════════════════════════════════════════════════════════════

export interface SkillNode {
    id: string;
    title: string;
    desc: string;
    icon: string;
    row: number;
    col: number;
    type: "hub" | "skill" | "module" | "meta";
    badge?: string;
    skillId?: keyof {
        tankMastery: number;
        combatExpert: number;
        survivalInstinct: number;
        resourcefulness: number;
        tacticalGenius: number;
    };
    moduleId?: string; // ID модуля, который разблокируется
    parentId?: string; // ID родительского узла для линейной разблокировки
    branchColor?: string; // Цвет ветки
    cost?: number; // Стоимость в очках (если не указано, используется растущая)
    maxLevel?: number; // Максимальный уровень (по умолчанию 5)
    effects?: string[]; // Описание эффектов
}

export interface SkillEdge {
    from: string;
    to: string;
}

export interface SkillBranch {
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
}

export const SKILL_BRANCHES: SkillBranch[] = [
    { id: "mobility", name: "Мобильность", icon: "🏃", color: "#0ff", description: "Прыжки, скорость, манёвры" },
    { id: "ultimate", name: "Ультимативные", icon: "💥", color: "#f0f", description: "Мощные способности" },
    { id: "tech", name: "Технологии", icon: "🔧", color: "#ff0", description: "Дроны, инженерка" },
    { id: "support", name: "Поддержка", icon: "💚", color: "#0f0", description: "Бафы союзникам" },
    { id: "stealth", name: "Скрытность", icon: "👁️", color: "#888", description: "Невидимость, маскировка" },
    { id: "utility", name: "Утилиты", icon: "🛠️", color: "#fa0", description: "Стенки, ловушки" },
    { id: "firepower", name: "Огневая мощь", icon: "⚔️", color: "#f00", description: "Урон, стрельба" },
    { id: "defense", name: "Защита", icon: "🛡️", color: "#00f", description: "Броня, щиты" },
    { id: "supply", name: "Экономика", icon: "💰", color: "#ff0", description: "Ресурсы, кредиты" },
    { id: "commander", name: "Командование", icon: "🎖️", color: "#faf", description: "Ауры, тактика" }
];

// Функция для расчёта стоимости (растущая: 1, 2, 3, 4, 5)
export function getSkillCost(level: number, baseCost: number = 1): number {
    return baseCost + (level - 1);
}

// Центральный узел
const COMMAND_CORE: SkillNode = {
    id: "commandCore",
    title: "Командный штаб",
    desc: "Центральный протокол, который питает все ветки дерева.",
    icon: "🛰️",
    row: 0,
    col: 5,
    type: "hub",
    badge: "Центр"
};

// Ветка 1: Мобильность
const MOBILITY_BRANCH: SkillNode[] = [
    {
        id: "mobilityHub",
        title: "Ветка мобильности",
        desc: "Прыжки, скорость и манёвры.",
        icon: "🏃",
        row: 1,
        col: 0,
        type: "hub",
        badge: "Ветка",
        branchColor: "#0ff",
        parentId: "commandCore"
    },
    {
        id: "mobility1",
        title: "Базовая скорость",
        desc: "+2% скорости движения за уровень.",
        icon: "⚡",
        row: 2,
        col: 0,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobilityHub",
        maxLevel: 5,
        effects: ["+2% скорость"]
    },
    {
        id: "mobility2",
        title: "Улучшенные прыжки",
        desc: "Прыжок: -0.5с кулдаун за уровень.",
        icon: "🚀",
        row: 3,
        col: 0,
        type: "module",
        moduleId: "jump",
        parentId: "mobility1",
        maxLevel: 5,
        effects: ["-0.5с кулдаун прыжка"]
    },
    {
        id: "mobility3",
        title: "Манёвренность",
        desc: "+3% скорость поворота за уровень.",
        icon: "🌀",
        row: 4,
        col: 0,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "mobility2",
        maxLevel: 5,
        effects: ["+3% скорость поворота"]
    },
    {
        id: "mobility4",
        title: "Активное маневрирование",
        desc: "Модуль маневрирования: +1с длительность за уровень.",
        icon: "🎯",
        row: 5,
        col: 0,
        type: "module",
        moduleId: "maneuver",
        parentId: "mobility3",
        maxLevel: 5,
        effects: ["+1с длительность маневрирования"]
    },
    {
        id: "mobility5",
        title: "Турбо-режим",
        desc: "+5% максимальная скорость за уровень.",
        icon: "💨",
        row: 6,
        col: 0,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobility4",
        maxLevel: 5,
        effects: ["+5% максимальная скорость"]
    },
    {
        id: "mobility6",
        title: "Ускорение реакции",
        desc: "+2% скорость ускорения за уровень.",
        icon: "⚡",
        row: 7,
        col: 0,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "mobility5",
        maxLevel: 5,
        effects: ["+2% скорость ускорения"]
    },
    {
        id: "mobility7",
        title: "Двойной прыжок",
        desc: "Модуль: возможность второго прыжка в воздухе.",
        icon: "🦘",
        row: 8,
        col: 0,
        type: "module",
        moduleId: "doubleJump",
        parentId: "mobility6",
        maxLevel: 5,
        effects: ["Двойной прыжок"]
    },
    {
        id: "mobility8",
        title: "Максимальная скорость",
        desc: "+3% максимальная скорость за уровень.",
        icon: "🏎️",
        row: 9,
        col: 0,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobility7",
        maxLevel: 5,
        effects: ["+3% максимальная скорость"]
    }
];

// Ветка 2: Ультимативные
const ULTIMATE_BRANCH: SkillNode[] = [
    {
        id: "ultimateHub",
        title: "Ветка ультимативных",
        desc: "Мощные способности и перезарядки.",
        icon: "💥",
        row: 1,
        col: 1,
        type: "hub",
        badge: "Ветка",
        branchColor: "#f0f",
        parentId: "commandCore"
    },
    {
        id: "ultimate1",
        title: "Боевая ярость",
        desc: "+1.5% урона за уровень.",
        icon: "⚡",
        row: 2,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimateHub",
        maxLevel: 5,
        effects: ["+1.5% урон"]
    },
    {
        id: "ultimate2",
        title: "Ускоренная стрельба",
        desc: "Модуль: +0.5с длительность за уровень.",
        icon: "🔥",
        row: 3,
        col: 1,
        type: "module",
        moduleId: "rapidFire",
        parentId: "ultimate1",
        maxLevel: 5,
        effects: ["+0.5с длительность ускоренной стрельбы"]
    },
    {
        id: "ultimate3",
        title: "Критический удар",
        desc: "+2% шанс крита за уровень.",
        icon: "💀",
        row: 4,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate2",
        maxLevel: 5,
        effects: ["+2% шанс крита"]
    },
    {
        id: "ultimate4",
        title: "Автонаводка",
        desc: "Модуль: +1с длительность за уровень.",
        icon: "🎯",
        row: 5,
        col: 1,
        type: "module",
        moduleId: "autoAim",
        parentId: "ultimate3",
        maxLevel: 5,
        effects: ["+1с длительность автонаводки"]
    },
    {
        id: "ultimate5",
        title: "Абсолютная мощь",
        desc: "+3% общий урон за уровень.",
        icon: "💣",
        row: 6,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate4",
        maxLevel: 5,
        effects: ["+3% общий урон"]
    },
    {
        id: "ultimate6",
        title: "Разрушительный удар",
        desc: "+4% урон по броне за уровень.",
        icon: "💥",
        row: 7,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate5",
        maxLevel: 5,
        effects: ["+4% урон по броне"]
    },
    {
        id: "ultimate7",
        title: "Огненный шторм",
        desc: "Модуль: множественные выстрелы одновременно.",
        icon: "🌪️",
        row: 8,
        col: 1,
        type: "module",
        moduleId: "firestorm",
        parentId: "ultimate6",
        maxLevel: 5,
        effects: ["Множественные выстрелы"]
    },
    {
        id: "ultimate8",
        title: "Абсолютное превосходство",
        desc: "+5% общий урон за уровень.",
        icon: "👑",
        row: 9,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate7",
        maxLevel: 5,
        effects: ["+5% общий урон"]
    }
];

// Ветка 3: Технологии
const TECH_BRANCH: SkillNode[] = [
    {
        id: "techHub",
        title: "Ветка технологий",
        desc: "Дроны, инженерка и автоматизация.",
        icon: "🔧",
        row: 1,
        col: 2,
        type: "hub",
        badge: "Ветка",
        branchColor: "#ff0",
        parentId: "commandCore"
    },
    {
        id: "tech1",
        title: "Базовые системы",
        desc: "+1% скорость перезарядки за уровень.",
        icon: "⚙️",
        row: 2,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "techHub",
        maxLevel: 5,
        effects: ["+1% скорость перезарядки"]
    },
    {
        id: "tech2",
        title: "Ремонтный дрон",
        desc: "Модуль: +5 HP/сек регенерации за уровень.",
        icon: "🤖",
        row: 3,
        col: 2,
        type: "module",
        moduleId: "repairDrone",
        parentId: "tech1",
        maxLevel: 5,
        effects: ["+5 HP/сек регенерации"]
    },
    {
        id: "tech3",
        title: "Улучшенная электроника",
        desc: "+2% точность за уровень.",
        icon: "📡",
        row: 4,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech2",
        maxLevel: 5,
        effects: ["+2% точность"]
    },
    {
        id: "tech4",
        title: "Боевой дрон",
        desc: "Модуль: дрон атакует врагов.",
        icon: "🛸",
        row: 5,
        col: 2,
        type: "module",
        moduleId: "combatDrone",
        parentId: "tech3",
        maxLevel: 5,
        effects: ["Дрон наносит урон врагам"]
    },
    {
        id: "tech5",
        title: "Автоматизация",
        desc: "+1.5% скорость всех систем за уровень.",
        icon: "🔬",
        row: 6,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech4",
        maxLevel: 5,
        effects: ["+1.5% скорость всех систем"]
    },
    {
        id: "tech6",
        title: "Улучшенные дроны",
        desc: "+10% эффективность дронов за уровень.",
        icon: "🤖",
        row: 7,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech5",
        maxLevel: 5,
        effects: ["+10% эффективность дронов"]
    },
    {
        id: "tech7",
        title: "Ракетная система",
        desc: "Модуль: запуск управляемых ракет.",
        icon: "🚀",
        row: 8,
        col: 2,
        type: "module",
        moduleId: "missileSystem",
        parentId: "tech6",
        maxLevel: 5,
        effects: ["Управляемые ракеты"]
    },
    {
        id: "tech8",
        title: "Квантовая синхронизация",
        desc: "+2% скорость всех систем за уровень.",
        icon: "⚛️",
        row: 9,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech7",
        maxLevel: 5,
        effects: ["+2% скорость всех систем"]
    }
];

// Ветка 4: Поддержка
const SUPPORT_BRANCH: SkillNode[] = [
    {
        id: "supportHub",
        title: "Ветка поддержки",
        desc: "Бафы союзникам и командная работа.",
        icon: "💚",
        row: 1,
        col: 3,
        type: "hub",
        badge: "Ветка",
        branchColor: "#0f0",
        parentId: "commandCore"
    },
    {
        id: "support1",
        title: "Базовое здоровье",
        desc: "+8 HP за уровень.",
        icon: "❤️",
        row: 2,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "supportHub",
        maxLevel: 5,
        effects: ["+8 HP"]
    },
    {
        id: "support2",
        title: "Аура исцеления",
        desc: "Модуль: исцеляет союзников рядом.",
        icon: "💚",
        row: 3,
        col: 3,
        type: "module",
        moduleId: "healAura",
        parentId: "support1",
        maxLevel: 5,
        effects: ["Исцеление союзников"]
    },
    {
        id: "support3",
        title: "Усиленная броня",
        desc: "+1.5% броня за уровень.",
        icon: "🛡️",
        row: 4,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support2",
        maxLevel: 5,
        effects: ["+1.5% броня"]
    },
    {
        id: "support4",
        title: "Аура урона",
        desc: "Модуль: увеличивает урон союзникам.",
        icon: "⚔️",
        row: 5,
        col: 3,
        type: "module",
        moduleId: "damageAura",
        parentId: "support3",
        maxLevel: 5,
        effects: ["+урон союзникам"]
    },
    {
        id: "support5",
        title: "Командный дух",
        desc: "+2% все характеристики за уровень.",
        icon: "🎖️",
        row: 6,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support4",
        maxLevel: 5,
        effects: ["+2% все характеристики"]
    },
    {
        id: "support6",
        title: "Массовое исцеление",
        desc: "Модуль: исцеляет всех союзников в радиусе.",
        icon: "💚",
        row: 7,
        col: 3,
        type: "module",
        moduleId: "massHeal",
        parentId: "support5",
        maxLevel: 5,
        effects: ["Массовое исцеление"]
    },
    {
        id: "support7",
        title: "Усиленная поддержка",
        desc: "+2.5% все характеристики за уровень.",
        icon: "⭐",
        row: 8,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support6",
        maxLevel: 5,
        effects: ["+2.5% все характеристики"]
    },
    {
        id: "support8",
        title: "Божественная защита",
        desc: "Модуль: временная неуязвимость для союзников.",
        icon: "✨",
        row: 9,
        col: 3,
        type: "module",
        moduleId: "divineProtection",
        parentId: "support7",
        maxLevel: 5,
        effects: ["Неуязвимость союзников"]
    }
];

// Ветка 5: Скрытность
const STEALTH_BRANCH: SkillNode[] = [
    {
        id: "stealthHub",
        title: "Ветка скрытности",
        desc: "Невидимость, маскировка и уклонение.",
        icon: "👁️",
        row: 1,
        col: 4,
        type: "hub",
        badge: "Ветка",
        branchColor: "#888",
        parentId: "commandCore"
    },
    {
        id: "stealth1",
        title: "Базовое уклонение",
        desc: "+1% шанс уклонения за уровень.",
        icon: "🌀",
        row: 2,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealthHub",
        maxLevel: 5,
        effects: ["+1% уклонение"]
    },
    {
        id: "stealth2",
        title: "Камуфляж",
        desc: "Модуль: временная невидимость.",
        icon: "👻",
        row: 3,
        col: 4,
        type: "module",
        moduleId: "cloak",
        parentId: "stealth1",
        maxLevel: 5,
        effects: ["Невидимость"]
    },
    {
        id: "stealth3",
        title: "Тихий шаг",
        desc: "+2% скорость в стелсе за уровень.",
        icon: "👣",
        row: 4,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth2",
        maxLevel: 5,
        effects: ["+2% скорость в стелсе"]
    },
    {
        id: "stealth4",
        title: "Призрачный удар",
        desc: "Модуль: +50% урон из невидимости.",
        icon: "🗡️",
        row: 5,
        col: 4,
        type: "module",
        moduleId: "stealthStrike",
        parentId: "stealth3",
        maxLevel: 5,
        effects: ["+50% урон из невидимости"]
    },
    {
        id: "stealth5",
        title: "Мастер теней",
        desc: "+1.5с длительность стелса за уровень.",
        icon: "🌑",
        row: 6,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth4",
        maxLevel: 5,
        effects: ["+1.5с длительность стелса"]
    },
    {
        id: "stealth6",
        title: "Фантомный след",
        desc: "Модуль: оставляет ложные следы для врагов.",
        icon: "👻",
        row: 7,
        col: 4,
        type: "module",
        moduleId: "phantomTrail",
        parentId: "stealth5",
        maxLevel: 5,
        effects: ["Ложные следы"]
    },
    {
        id: "stealth7",
        title: "Невидимое присутствие",
        desc: "+2с длительность стелса за уровень.",
        icon: "🌙",
        row: 8,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth6",
        maxLevel: 5,
        effects: ["+2с длительность стелса"]
    },
    {
        id: "stealth8",
        title: "Теневой мастер",
        desc: "Модуль: полная невидимость даже при атаке.",
        icon: "🌌",
        row: 9,
        col: 4,
        type: "module",
        moduleId: "shadowMaster",
        parentId: "stealth7",
        maxLevel: 5,
        effects: ["Невидимость при атаке"]
    }
];

// Ветка 6: Утилиты
const UTILITY_BRANCH: SkillNode[] = [
    {
        id: "utilityHub",
        title: "Ветка утилит",
        desc: "Стенки, ловушки и тактические инструменты.",
        icon: "🛠️",
        row: 1,
        col: 6,
        type: "hub",
        badge: "Ветка",
        branchColor: "#fa0",
        parentId: "commandCore"
    },
    {
        id: "utility1",
        title: "Тактическое мышление",
        desc: "+1% опыт за уровень.",
        icon: "🧠",
        row: 2,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utilityHub",
        maxLevel: 5,
        effects: ["+1% опыт"]
    },
    {
        id: "utility2",
        title: "Защитная стенка",
        desc: "Модуль: +1 стенка, -1с кулдаун за уровень.",
        icon: "🧱",
        row: 3,
        col: 6,
        type: "module",
        moduleId: "wall",
        parentId: "utility1",
        maxLevel: 5,
        effects: ["+1 стенка", "-1с кулдаун"]
    },
    {
        id: "utility3",
        title: "Ресурсность",
        desc: "+1.5% кредиты за уровень.",
        icon: "💎",
        row: 4,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility2",
        maxLevel: 5,
        effects: ["+1.5% кредиты"]
    },
    {
        id: "utility4",
        title: "Мины",
        desc: "Модуль: установка взрывных мин.",
        icon: "💣",
        row: 5,
        col: 6,
        type: "module",
        moduleId: "mine",
        parentId: "utility3",
        maxLevel: 5,
        effects: ["Установка мин"]
    },
    {
        id: "utility5",
        title: "Тактический гений",
        desc: "+2% опыт и кредиты за уровень.",
        icon: "🎓",
        row: 6,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility4",
        maxLevel: 5,
        effects: ["+2% опыт и кредиты"]
    },
    {
        id: "utility6",
        title: "Улучшенные мины",
        desc: "Модуль: мины наносят больше урона.",
        icon: "💣",
        row: 7,
        col: 6,
        type: "module",
        moduleId: "enhancedMines",
        parentId: "utility5",
        maxLevel: 5,
        effects: ["+урон мин"]
    },
    {
        id: "utility7",
        title: "Тактическое превосходство",
        desc: "+2.5% опыт и кредиты за уровень.",
        icon: "🧠",
        row: 8,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility6",
        maxLevel: 5,
        effects: ["+2.5% опыт и кредиты"]
    },
    {
        id: "utility8",
        title: "Телепорт",
        desc: "Модуль: кратковременная телепортация.",
        icon: "🌀",
        row: 9,
        col: 6,
        type: "module",
        moduleId: "teleport",
        parentId: "utility7",
        maxLevel: 5,
        effects: ["Телепортация"]
    }
];

// Ветка 7: Огневая мощь
const FIREPOWER_BRANCH: SkillNode[] = [
    {
        id: "firepowerHub",
        title: "Ветка огневой мощи",
        desc: "Урон, стрельба и разрушение.",
        icon: "⚔️",
        row: 1,
        col: 7,
        type: "hub",
        badge: "Ветка",
        branchColor: "#f00",
        parentId: "commandCore"
    },
    {
        id: "firepower1",
        title: "Базовый урон",
        desc: "+2 урона за уровень.",
        icon: "💥",
        row: 2,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepowerHub",
        maxLevel: 5,
        effects: ["+2 урон"]
    },
    {
        id: "firepower2",
        title: "Скорострельность",
        desc: "-10мс перезарядка за уровень.",
        icon: "🔥",
        row: 3,
        col: 7,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "firepower1",
        maxLevel: 5,
        effects: ["-10мс перезарядка"]
    },
    {
        id: "firepower3",
        title: "Пробивная сила",
        desc: "+1.5% пробивание брони за уровень.",
        icon: "⚡",
        row: 4,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower2",
        maxLevel: 5,
        effects: ["+1.5% пробивание"]
    },
    {
        id: "firepower4",
        title: "Залп",
        desc: "Модуль: выстрел несколькими снарядами.",
        icon: "🎆",
        row: 5,
        col: 7,
        type: "module",
        moduleId: "burst",
        parentId: "firepower3",
        maxLevel: 5,
        effects: ["Залп снарядами"]
    },
    {
        id: "firepower5",
        title: "Артиллерист",
        desc: "+3 урон за уровень.",
        icon: "💣",
        row: 6,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower4",
        maxLevel: 5,
        effects: ["+3 урон"]
    },
    {
        id: "firepower6",
        title: "Снайперская точность",
        desc: "+5% точность за уровень.",
        icon: "🎯",
        row: 7,
        col: 7,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "firepower5",
        maxLevel: 5,
        effects: ["+5% точность"]
    },
    {
        id: "firepower7",
        title: "Плазменный залп",
        desc: "Модуль: залп плазменных снарядов.",
        icon: "⚡",
        row: 8,
        col: 7,
        type: "module",
        moduleId: "plasmaBurst",
        parentId: "firepower6",
        maxLevel: 5,
        effects: ["Плазменный залп"]
    },
    {
        id: "firepower8",
        title: "Абсолютное разрушение",
        desc: "+4 урон за уровень.",
        icon: "💀",
        row: 9,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower7",
        maxLevel: 5,
        effects: ["+4 урон"]
    }
];

// Ветка 8: Защита
const DEFENSE_BRANCH: SkillNode[] = [
    {
        id: "defenseHub",
        title: "Ветка защиты",
        desc: "Броня, щиты и выживаемость.",
        icon: "🛡️",
        row: 1,
        col: 8,
        type: "hub",
        badge: "Ветка",
        branchColor: "#00f",
        parentId: "commandCore"
    },
    {
        id: "defense1",
        title: "Базовая броня",
        desc: "+10 HP за уровень.",
        icon: "🛡️",
        row: 2,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defenseHub",
        maxLevel: 5,
        effects: ["+10 HP"]
    },
    {
        id: "defense2",
        title: "Энергетический щит",
        desc: "Модуль: временный щит поглощает урон.",
        icon: "🔰",
        row: 3,
        col: 8,
        type: "module",
        moduleId: "shield",
        parentId: "defense1",
        maxLevel: 5,
        effects: ["Энергетический щит"]
    },
    {
        id: "defense3",
        title: "Усиленная броня",
        desc: "+2% сопротивление урону за уровень.",
        icon: "⚙️",
        row: 4,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense2",
        maxLevel: 5,
        effects: ["+2% сопротивление"]
    },
    {
        id: "defense4",
        title: "Регенерация",
        desc: "Модуль: +2 HP/сек регенерация за уровень.",
        icon: "💚",
        row: 5,
        col: 8,
        type: "module",
        moduleId: "regeneration",
        parentId: "defense3",
        maxLevel: 5,
        effects: ["+2 HP/сек регенерация"]
    },
    {
        id: "defense5",
        title: "Несокрушимость",
        desc: "+3% максимальное HP за уровень.",
        icon: "💎",
        row: 6,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense4",
        maxLevel: 5,
        effects: ["+3% максимальное HP"]
    },
    {
        id: "defense6",
        title: "Усиленный щит",
        desc: "Модуль: щит поглощает больше урона.",
        icon: "🔰",
        row: 7,
        col: 8,
        type: "module",
        moduleId: "enhancedShield",
        parentId: "defense5",
        maxLevel: 5,
        effects: ["+прочность щита"]
    },
    {
        id: "defense7",
        title: "Броневая пластина",
        desc: "+3.5% максимальное HP за уровень.",
        icon: "🛡️",
        row: 8,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense6",
        maxLevel: 5,
        effects: ["+3.5% максимальное HP"]
    },
    {
        id: "defense8",
        title: "Абсолютная защита",
        desc: "Модуль: временная неуязвимость.",
        icon: "💫",
        row: 9,
        col: 8,
        type: "module",
        moduleId: "absoluteDefense",
        parentId: "defense7",
        maxLevel: 5,
        effects: ["Временная неуязвимость"]
    }
];

// Ветка 9: Экономика
const SUPPLY_BRANCH: SkillNode[] = [
    {
        id: "supplyHub",
        title: "Ветка экономики",
        desc: "Ресурсы, кредиты и награды.",
        icon: "💰",
        row: 1,
        col: 9,
        type: "hub",
        badge: "Ветка",
        branchColor: "#ff0",
        parentId: "commandCore"
    },
    {
        id: "supply1",
        title: "Базовый доход",
        desc: "+2% кредиты за уровень.",
        icon: "💵",
        row: 2,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supplyHub",
        maxLevel: 5,
        effects: ["+2% кредиты"]
    },
    {
        id: "supply2",
        title: "Сбор ресурсов",
        desc: "Модуль: автоматический сбор ресурсов.",
        icon: "📦",
        row: 3,
        col: 9,
        type: "module",
        moduleId: "resourceCollector",
        parentId: "supply1",
        maxLevel: 5,
        effects: ["Автосбор ресурсов"]
    },
    {
        id: "supply3",
        title: "Увеличенный опыт",
        desc: "+1.5% опыт за уровень.",
        icon: "📈",
        row: 4,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply2",
        maxLevel: 5,
        effects: ["+1.5% опыт"]
    },
    {
        id: "supply4",
        title: "Бонусные награды",
        desc: "Модуль: +10% награды за убийства.",
        icon: "🎁",
        row: 5,
        col: 9,
        type: "module",
        moduleId: "bonusRewards",
        parentId: "supply3",
        maxLevel: 5,
        effects: ["+10% награды"]
    },
    {
        id: "supply5",
        title: "Магнат",
        desc: "+3% кредиты и опыт за уровень.",
        icon: "💎",
        row: 6,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply4",
        maxLevel: 5,
        effects: ["+3% кредиты и опыт"]
    },
    {
        id: "supply6",
        title: "Автоматический сбор",
        desc: "Модуль: автоматически собирает ресурсы.",
        icon: "📦",
        row: 7,
        col: 9,
        type: "module",
        moduleId: "autoCollect",
        parentId: "supply5",
        maxLevel: 5,
        effects: ["Автосбор ресурсов"]
    },
    {
        id: "supply7",
        title: "Финансовый гений",
        desc: "+3.5% кредиты и опыт за уровень.",
        icon: "💰",
        row: 8,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply6",
        maxLevel: 5,
        effects: ["+3.5% кредиты и опыт"]
    },
    {
        id: "supply8",
        title: "Золотая лихорадка",
        desc: "Модуль: удваивает награды за убийства.",
        icon: "🏆",
        row: 9,
        col: 9,
        type: "module",
        moduleId: "goldRush",
        parentId: "supply7",
        maxLevel: 5,
        effects: ["x2 награды"]
    }
];

// Ветка 10: Командование
const COMMANDER_BRANCH: SkillNode[] = [
    {
        id: "commanderHub",
        title: "Ветка командования",
        desc: "Ауры, тактика и лидерство.",
        icon: "🎖️",
        row: 1,
        col: 10,
        type: "hub",
        badge: "Ветка",
        branchColor: "#faf",
        parentId: "commandCore"
    },
    {
        id: "commander1",
        title: "Базовое лидерство",
        desc: "+1% все характеристики за уровень.",
        icon: "⭐",
        row: 2,
        col: 10,
        type: "skill",
        skillId: "tankMastery",
        parentId: "commanderHub",
        maxLevel: 5,
        effects: ["+1% все характеристики"]
    },
    {
        id: "commander2",
        title: "Боевая аура",
        desc: "Модуль: увеличивает урон союзникам рядом.",
        icon: "⚔️",
        row: 3,
        col: 10,
        type: "module",
        moduleId: "combatAura",
        parentId: "commander1",
        maxLevel: 5,
        effects: ["Аура урона"]
    },
    {
        id: "commander3",
        title: "Тактическое превосходство",
        desc: "+1.5% скорость всех действий за уровень.",
        icon: "🎯",
        row: 4,
        col: 10,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "commander2",
        maxLevel: 5,
        effects: ["+1.5% скорость действий"]
    },
    {
        id: "commander4",
        title: "Защитная аура",
        desc: "Модуль: уменьшает урон союзникам рядом.",
        icon: "🛡️",
        row: 5,
        col: 10,
        type: "module",
        moduleId: "defenseAura",
        parentId: "commander3",
        maxLevel: 5,
        effects: ["Аура защиты"]
    },
    {
        id: "commander5",
        title: "Верховный командир",
        desc: "+2% все характеристики за уровень.",
        icon: "👑",
        row: 6,
        col: 10,
        type: "skill",
        skillId: "tankMastery",
        parentId: "commander4",
        maxLevel: 5,
        effects: ["+2% все характеристики"]
    },
    {
        id: "commander6",
        title: "Боевая команда",
        desc: "Модуль: призывает союзников в бой.",
        icon: "👥",
        row: 7,
        col: 10,
        type: "module",
        moduleId: "battleTeam",
        parentId: "commander5",
        maxLevel: 5,
        effects: ["Призыв союзников"]
    },
    {
        id: "commander7",
        title: "Тактическое господство",
        desc: "+2.5% все характеристики за уровень.",
        icon: "🎖️",
        row: 8,
        col: 10,
        type: "skill",
        skillId: "tankMastery",
        parentId: "commander6",
        maxLevel: 5,
        effects: ["+2.5% все характеристики"]
    },
    {
        id: "commander8",
        title: "Имперская воля",
        desc: "Модуль: увеличивает все характеристики союзников на 50%.",
        icon: "👑",
        row: 9,
        col: 10,
        type: "module",
        moduleId: "imperialWill",
        parentId: "commander7",
        maxLevel: 5,
        effects: ["+50% характеристики союзников"]
    }
];

// Мета-узел синергии
const SYNERGY_NODE: SkillNode = {
    id: "commandSynergy",
    title: "Элитные протоколы",
    desc: "Бонусы за общее вложение в дерево.",
    icon: "🚀",
    row: 10,
    col: 5,
    type: "meta",
    parentId: "commandCore"
};

// Собираем все узлы
export const SKILL_TREE_NODES: SkillNode[] = [
    COMMAND_CORE,
    ...MOBILITY_BRANCH,
    ...ULTIMATE_BRANCH,
    ...TECH_BRANCH,
    ...SUPPORT_BRANCH,
    ...STEALTH_BRANCH,
    ...UTILITY_BRANCH,
    ...FIREPOWER_BRANCH,
    ...DEFENSE_BRANCH,
    ...SUPPLY_BRANCH,
    ...COMMANDER_BRANCH,
    SYNERGY_NODE
];

// Генерируем рёбра на основе parentId
export function generateSkillEdges(): SkillEdge[] {
    const edges: SkillEdge[] = [];
    SKILL_TREE_NODES.forEach(node => {
        if (node.parentId) {
            edges.push({ from: node.parentId, to: node.id });
        }
    });
    return edges;
}

export const SKILL_TREE_EDGES = generateSkillEdges();

// Функция для проверки доступности узла (линейная разблокировка)
export function isNodeUnlocked(nodeId: string, stats: { skills: Record<string, number> }): boolean {
    const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
    if (!node) return false;
    
    // Центральный узел всегда доступен
    if (node.id === "commandCore") return true;
    
    // Хабы всегда доступны (они разблокируются от центрального узла)
    if (node.type === "hub") return true;
    
    // Проверяем родителя
    if (node.parentId) {
        const parent = SKILL_TREE_NODES.find(n => n.id === node.parentId);
        if (!parent) return false;
        
        // Если родитель - хаб или центр, узел доступен
        if (parent.type === "hub" || parent.id === "commandCore") return true;
        
        // Если родитель - навык, проверяем что он прокачан хотя бы на 1 уровень
        // (для линейной разблокировки нужно прокачать до максимума)
        if (parent.skillId) {
            const parentLevel = stats.skills[parent.skillId] || 0;
            const parentMaxLevel = parent.maxLevel || 5;
            // Узел разблокируется когда родитель прокачан до максимума
            return parentLevel >= parentMaxLevel;
        }
        
        // Если родитель - модуль, проверяем что родитель разблокирован рекурсивно
        if (parent.moduleId) {
            return isNodeUnlocked(parent.id, stats);
        }
    }
    
    return false;
}


