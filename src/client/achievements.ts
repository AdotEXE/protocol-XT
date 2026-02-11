// Achievements System for TX Tank Game

import { safeLocalStorage } from "./utils/safeLocalStorage";
import { logger } from "./utils/logger";

export interface Achievement {
    id: string;
    name: string;
    nameEn: string;
    description: string;
    descriptionEn: string;
    icon: string;
    requirement: number;
    reward?: {
        type: "experience" | "currency" | "unlock";
        amount?: number;
        unlockId?: string;
    };
    category: "combat" | "exploration" | "survival" | "special" | "multiplayer";
    hidden?: boolean;
}

export interface AchievementProgress {
    id: string;
    current: number;
    completed: boolean;
    completedAt?: number;
    claimed?: boolean;
}

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
    // Combat achievements
    {
        id: "first_blood",
        name: "Первая кровь",
        nameEn: "First Blood",
        description: "Уничтожить первого врага",
        descriptionEn: "Destroy your first enemy",
        icon: "💀",
        requirement: 1,
        reward: { type: "experience", amount: 50 },
        category: "combat"
    },
    {
        id: "tank_hunter",
        name: "Охотник на танки",
        nameEn: "Tank Hunter",
        description: "Уничтожить 10 вражеских танков",
        descriptionEn: "Destroy 10 enemy tanks",
        icon: "🎯",
        requirement: 10,
        reward: { type: "experience", amount: 200 },
        category: "combat"
    },
    {
        id: "tank_ace",
        name: "Танковый ас",
        nameEn: "Tank Ace",
        description: "Уничтожить 50 вражеских танков",
        descriptionEn: "Destroy 50 enemy tanks",
        icon: "🏆",
        requirement: 50,
        reward: { type: "experience", amount: 500 },
        category: "combat"
    },
    {
        id: "sharpshooter",
        name: "Снайпер",
        nameEn: "Sharpshooter",
        description: "Нанести 10 критических попаданий",
        descriptionEn: "Land 10 critical hits",
        icon: "🎯",
        requirement: 10,
        reward: { type: "experience", amount: 150 },
        category: "combat"
    },
    {
        id: "damage_dealer",
        name: "Машина смерти",
        nameEn: "Damage Dealer",
        description: "Нанести 10000 урона",
        descriptionEn: "Deal 10,000 damage",
        icon: "💥",
        requirement: 10000,
        reward: { type: "experience", amount: 300 },
        category: "combat"
    },
    {
        id: "supply_runner",
        name: "Снабженец",
        nameEn: "Supply Runner",
        description: "Подобрать 20 припасов с поля боя",
        descriptionEn: "Pick up 20 consumables from the battlefield",
        icon: "📦",
        requirement: 20,
        reward: { type: "currency", amount: 150 },
        category: "exploration"
    },
    {
        id: "season_warrior",
        name: "Сезонный боец",
        nameEn: "Season Warrior",
        description: "Заработать 5000 опыта боевого пропуска за сезон",
        descriptionEn: "Earn 5000 battle pass experience in a season",
        icon: "🎖️",
        requirement: 5000,
        reward: { type: "experience", amount: 400 },
        category: "special"
    },

    // Survival achievements
    {
        id: "survivor",
        name: "Выживший",
        nameEn: "Survivor",
        description: "Выжить 5 минут без смерти",
        descriptionEn: "Survive for 5 minutes",
        icon: "⏱️",
        requirement: 300, // seconds
        reward: { type: "experience", amount: 100 },
        category: "survival"
    },
    {
        id: "iron_will",
        name: "Железная воля",
        nameEn: "Iron Will",
        description: "Выжить с HP ниже 10%",
        descriptionEn: "Survive with HP below 10%",
        icon: "❤️",
        requirement: 1,
        reward: { type: "experience", amount: 75 },
        category: "survival"
    },
    {
        id: "comeback",
        name: "Камбэк",
        nameEn: "Comeback",
        description: "Убить врага имея менее 20% HP",
        descriptionEn: "Kill an enemy with less than 20% HP",
        icon: "🔥",
        requirement: 1,
        reward: { type: "experience", amount: 100 },
        category: "survival"
    },
    
    // Exploration achievements
    {
        id: "explorer",
        name: "Исследователь",
        nameEn: "Explorer",
        description: "Посетить все типы карт",
        descriptionEn: "Visit all map types",
        icon: "🗺️",
        requirement: 4,
        reward: { type: "experience", amount: 200 },
        category: "exploration"
    },
    {
        id: "garage_master",
        name: "Мастер гаражей",
        nameEn: "Garage Master",
        description: "Захватить 5 гаражей",
        descriptionEn: "Capture 5 garages",
        icon: "🔧",
        requirement: 5,
        reward: { type: "experience", amount: 150 },
        category: "exploration"
    },
    
    // POI achievements
    {
        id: "poi_first_capture",
        name: "Первый захват",
        nameEn: "First Capture",
        description: "Захватить первую точку интереса",
        descriptionEn: "Capture your first POI",
        icon: "⚑",
        requirement: 1,
        reward: { type: "experience", amount: 50 },
        category: "exploration"
    },
    {
        id: "poi_conqueror",
        name: "Завоеватель",
        nameEn: "Conqueror",
        description: "Захватить 10 точек интереса",
        descriptionEn: "Capture 10 POIs",
        icon: "🏴",
        requirement: 10,
        reward: { type: "experience", amount: 200 },
        category: "exploration"
    },
    {
        id: "poi_warlord",
        name: "Полководец",
        nameEn: "Warlord",
        description: "Захватить 50 точек интереса",
        descriptionEn: "Capture 50 POIs",
        icon: "👑",
        requirement: 50,
        reward: { type: "experience", amount: 500 },
        category: "exploration"
    },
    {
        id: "ammo_collector",
        name: "Сборщик припасов",
        nameEn: "Ammo Collector",
        description: "Получить 100 снарядов со складов",
        descriptionEn: "Collect 100 ammo from depots",
        icon: "🔫",
        requirement: 100,
        reward: { type: "experience", amount: 100 },
        category: "exploration"
    },
    {
        id: "repair_addict",
        name: "Ремонтник",
        nameEn: "Repair Addict",
        description: "Восстановить 500 HP на ремонтных станциях",
        descriptionEn: "Heal 500 HP at repair stations",
        icon: "🔧",
        requirement: 500,
        reward: { type: "experience", amount: 100 },
        category: "exploration"
    },
    {
        id: "fuel_tanker",
        name: "Заправщик",
        nameEn: "Fuel Tanker",
        description: "Заправить 1000 литров топлива",
        descriptionEn: "Refuel 1000 liters",
        icon: "⛽",
        requirement: 1000,
        reward: { type: "experience", amount: 100 },
        category: "exploration"
    },
    {
        id: "explosives_expert",
        name: "Сапёр",
        nameEn: "Explosives Expert",
        description: "Взорвать 5 топливных складов",
        descriptionEn: "Blow up 5 fuel depots",
        icon: "💥",
        requirement: 5,
        reward: { type: "experience", amount: 150 },
        category: "combat"
    },
    {
        id: "radar_operator",
        name: "Оператор радара",
        nameEn: "Radar Operator",
        description: "Обнаружить 50 врагов с помощью радара",
        descriptionEn: "Detect 50 enemies with radar",
        icon: "📡",
        requirement: 50,
        reward: { type: "experience", amount: 150 },
        category: "exploration"
    },
    {
        id: "contested_victory",
        name: "Спорная победа",
        nameEn: "Contested Victory",
        description: "Выиграть контест на точке захвата",
        descriptionEn: "Win a contested capture point",
        icon: "⚔️",
        requirement: 1,
        reward: { type: "experience", amount: 75 },
        category: "combat"
    },
    {
        id: "domination",
        name: "Доминация",
        nameEn: "Domination",
        description: "Владеть 5 точками одновременно",
        descriptionEn: "Own 5 POIs at the same time",
        icon: "🌟",
        requirement: 1,
        reward: { type: "experience", amount: 300 },
        category: "special",
        hidden: true
    },
    
    // Special achievements
    {
        id: "tutorial_complete",
        name: "Новобранец",
        nameEn: "Recruit",
        description: "Пройти обучение",
        descriptionEn: "Complete the tutorial",
        icon: "📚",
        requirement: 1,
        reward: { type: "experience", amount: 25 },
        category: "special"
    },
    {
        id: "dedication",
        name: "Преданность",
        nameEn: "Dedication",
        description: "Играть 10 сессий",
        descriptionEn: "Play 10 sessions",
        icon: "⭐",
        requirement: 10,
        reward: { type: "experience", amount: 250 },
        category: "special"
    },
    
    // === CHASSIS MASTERY ACHIEVEMENTS ===
    {
        id: "chassis_light_master",
        name: "Мастер легких танков",
        nameEn: "Light Tank Master",
        description: "Уничтожить 50 врагов на Light корпусе",
        descriptionEn: "Destroy 50 enemies with Light chassis",
        icon: "⚡",
        requirement: 50,
        reward: { type: "currency", amount: 500 },
        category: "combat"
    },
    {
        id: "chassis_heavy_master",
        name: "Мастер тяжелых танков",
        nameEn: "Heavy Tank Master",
        description: "Уничтожить 50 врагов на Heavy корпусе",
        descriptionEn: "Destroy 50 enemies with Heavy chassis",
        icon: "🛡️",
        requirement: 50,
        reward: { type: "currency", amount: 500 },
        category: "combat"
    },
    {
        id: "chassis_stealth_master",
        name: "Мастер стелса",
        nameEn: "Stealth Master",
        description: "Использовать способность Stealth 100 раз",
        descriptionEn: "Use Stealth ability 100 times",
        icon: "👻",
        requirement: 100,
        reward: { type: "currency", amount: 600 },
        category: "special"
    },
    {
        id: "chassis_hover_master",
        name: "Мастер ховера",
        nameEn: "Hover Master",
        description: "Проехать 10 км на Hover корпусе",
        descriptionEn: "Travel 10 km with Hover chassis",
        icon: "🚁",
        requirement: 10000,
        reward: { type: "currency", amount: 800 },
        category: "exploration"
    },
    {
        id: "chassis_siege_master",
        name: "Мастер осады",
        nameEn: "Siege Master",
        description: "Выжить 30 минут на Siege корпусе",
        descriptionEn: "Survive 30 minutes with Siege chassis",
        icon: "🏰",
        requirement: 1800,
        reward: { type: "currency", amount: 1000 },
        category: "survival"
    },
    {
        id: "chassis_racer_master",
        name: "Гонщик",
        nameEn: "Racer",
        description: "Достичь максимальной скорости на Racer корпусе",
        descriptionEn: "Reach max speed with Racer chassis",
        icon: "🏎️",
        requirement: 1,
        reward: { type: "currency", amount: 250 },
        category: "special"
    },
    {
        id: "chassis_shield_master",
        name: "Мастер щита",
        nameEn: "Shield Master",
        description: "Заблокировать 1000 урона щитом",
        descriptionEn: "Block 1000 damage with Shield",
        icon: "🛡️",
        requirement: 1000,
        reward: { type: "currency", amount: 650 },
        category: "survival"
    },
    {
        id: "chassis_drone_master",
        name: "Мастер дронов",
        nameEn: "Drone Master",
        description: "Выпустить 200 дронов",
        descriptionEn: "Deploy 200 drones",
        icon: "🤖",
        requirement: 200,
        reward: { type: "currency", amount: 600 },
        category: "combat"
    },
    {
        id: "chassis_command_master",
        name: "Командир",
        nameEn: "Commander",
        description: "Использовать способность Command 50 раз",
        descriptionEn: "Use Command ability 50 times",
        icon: "🎖️",
        requirement: 50,
        reward: { type: "currency", amount: 750 },
        category: "multiplayer"
    },
    {
        id: "chassis_collector",
        name: "Коллекционер корпусов",
        nameEn: "Chassis Collector",
        description: "Разблокировать все 15 типов корпусов",
        descriptionEn: "Unlock all 15 chassis types",
        icon: "📦",
        requirement: 15,
        reward: { type: "currency", amount: 2000 },
        category: "special"
    },
    
    // === CANNON MASTERY ACHIEVEMENTS ===
    {
        id: "cannon_sniper_master",
        name: "Снайпер-мастер",
        nameEn: "Sniper Master",
        description: "Убить 100 врагов с Sniper пушкой",
        descriptionEn: "Kill 100 enemies with Sniper cannon",
        icon: "🎯",
        requirement: 100,
        reward: { type: "currency", amount: 800 },
        category: "combat"
    },
    {
        id: "cannon_gatling_master",
        name: "Мастер гатлинга",
        nameEn: "Gatling Master",
        description: "Сделать 10000 выстрелов из Gatling",
        descriptionEn: "Fire 10000 shots with Gatling",
        icon: "⚙️",
        requirement: 10000,
        reward: { type: "currency", amount: 900 },
        category: "combat"
    },
    {
        id: "cannon_railgun_master",
        name: "Мастер рельсотрона",
        nameEn: "Railgun Master",
        description: "Убить 50 врагов с Railgun",
        descriptionEn: "Kill 50 enemies with Railgun",
        icon: "⚡",
        requirement: 50,
        reward: { type: "currency", amount: 1000 },
        category: "combat"
    },
    {
        id: "cannon_plasma_master",
        name: "Мастер плазмы",
        nameEn: "Plasma Master",
        description: "Нанести 50000 урона плазмой",
        descriptionEn: "Deal 50000 damage with Plasma",
        icon: "💜",
        requirement: 50000,
        reward: { type: "currency", amount: 1000 },
        category: "combat"
    },
    {
        id: "cannon_laser_master",
        name: "Мастер лазера",
        nameEn: "Laser Master",
        description: "Попасть 500 раз лазером",
        descriptionEn: "Hit 500 times with Laser",
        icon: "🔴",
        requirement: 500,
        reward: { type: "currency", amount: 650 },
        category: "combat"
    },
    {
        id: "cannon_tesla_master",
        name: "Мастер Теслы",
        nameEn: "Tesla Master",
        description: "Поразить 200 врагов цепной молнией",
        descriptionEn: "Hit 200 enemies with chain lightning",
        icon: "⚡",
        requirement: 200,
        reward: { type: "currency", amount: 600 },
        category: "combat"
    },
    {
        id: "cannon_mortar_master",
        name: "Мастер миномета",
        nameEn: "Mortar Master",
        description: "Убить 75 врагов минометом",
        descriptionEn: "Kill 75 enemies with Mortar",
        icon: "💣",
        requirement: 75,
        reward: { type: "currency", amount: 750 },
        category: "combat"
    },
    {
        id: "cannon_cluster_master",
        name: "Мастер кластера",
        nameEn: "Cluster Master",
        description: "Поразить 300 врагов кластерными снарядами",
        descriptionEn: "Hit 300 enemies with cluster shells",
        icon: "💥",
        requirement: 300,
        reward: { type: "currency", amount: 550 },
        category: "combat"
    },
    {
        id: "cannon_flamethrower_master",
        name: "Мастер огнемета",
        nameEn: "Flamethrower Master",
        description: "Сжечь 100 врагов",
        descriptionEn: "Burn 100 enemies",
        icon: "🔥",
        requirement: 100,
        reward: { type: "currency", amount: 500 },
        category: "combat"
    },
    {
        id: "cannon_acid_master",
        name: "Мастер кислоты",
        nameEn: "Acid Master",
        description: "Отравить 150 врагов кислотой",
        descriptionEn: "Corrode 150 enemies with acid",
        icon: "🧪",
        requirement: 150,
        reward: { type: "currency", amount: 550 },
        category: "combat"
    },
    {
        id: "cannon_freeze_master",
        name: "Мастер заморозки",
        nameEn: "Freeze Master",
        description: "Заморозить 200 врагов",
        descriptionEn: "Freeze 200 enemies",
        icon: "❄️",
        requirement: 200,
        reward: { type: "currency", amount: 550 },
        category: "combat"
    },
    {
        id: "cannon_emp_master",
        name: "Мастер ЭМИ",
        nameEn: "EMP Master",
        description: "Отключить способности 100 врагов",
        descriptionEn: "Disable 100 enemy abilities",
        icon: "📡",
        requirement: 100,
        reward: { type: "currency", amount: 800 },
        category: "combat"
    },
    {
        id: "cannon_homing_master",
        name: "Мастер самонаведения",
        nameEn: "Homing Master",
        description: "Убить 80 врагов самонаводящимися ракетами",
        descriptionEn: "Kill 80 enemies with homing missiles",
        icon: "🎯",
        requirement: 80,
        reward: { type: "currency", amount: 700 },
        category: "combat"
    },
    {
        id: "cannon_piercing_master",
        name: "Мастер пробития",
        nameEn: "Piercing Master",
        description: "Пронзить 150 врагов одним выстрелом",
        descriptionEn: "Pierce 150 enemies with one shot",
        icon: "⚔️",
        requirement: 150,
        reward: { type: "currency", amount: 650 },
        category: "combat"
    },
    {
        id: "cannon_support_master",
        name: "Мастер поддержки",
        nameEn: "Support Master",
        description: "Вылечить 5000 HP союзников",
        descriptionEn: "Heal 5000 HP of allies",
        icon: "💚",
        requirement: 5000,
        reward: { type: "currency", amount: 600 },
        category: "multiplayer"
    },
    {
        id: "cannon_collector",
        name: "Коллекционер пушек",
        nameEn: "Cannon Collector",
        description: "Разблокировать все 26 типов пушек",
        descriptionEn: "Unlock all 26 cannon types",
        icon: "🔫",
        requirement: 26,
        reward: { type: "currency", amount: 3000 },
        category: "special"
    },
    
    // === ADVANCED COMBAT ACHIEVEMENTS ===
    {
        id: "kill_streak_20",
        name: "Неудержимый",
        nameEn: "Unstoppable",
        description: "Убить 20 врагов подряд без смерти",
        descriptionEn: "Kill 20 enemies in a row",
        icon: "🔥",
        requirement: 20,
        reward: { type: "currency", amount: 1000 },
        category: "combat"
    },
    {
        id: "kill_streak_50",
        name: "Легенда",
        nameEn: "Legend",
        description: "Убить 50 врагов подряд без смерти",
        descriptionEn: "Kill 50 enemies in a row",
        icon: "👑",
        requirement: 50,
        reward: { type: "currency", amount: 5000 },
        category: "combat",
        hidden: true
    },
    {
        id: "damage_100k",
        name: "Разрушитель",
        nameEn: "Destroyer",
        description: "Нанести 100000 урона",
        descriptionEn: "Deal 100,000 damage",
        icon: "💀",
        requirement: 100000,
        reward: { type: "currency", amount: 1500 },
        category: "combat"
    },
    {
        id: "damage_1m",
        name: "Апокалипсис",
        nameEn: "Apocalypse",
        description: "Нанести 1000000 урона",
        descriptionEn: "Deal 1,000,000 damage",
        icon: "☠️",
        requirement: 1000000,
        reward: { type: "currency", amount: 10000 },
        category: "combat",
        hidden: true
    },
    {
        id: "kills_1000",
        name: "Ветеран",
        nameEn: "Veteran",
        description: "Уничтожить 1000 врагов",
        descriptionEn: "Destroy 1000 enemies",
        icon: "🎖️",
        requirement: 1000,
        reward: { type: "currency", amount: 5000 },
        category: "combat"
    },
    {
        id: "kills_5000",
        name: "Элита",
        nameEn: "Elite",
        description: "Уничтожить 5000 врагов",
        descriptionEn: "Destroy 5000 enemies",
        icon: "⭐",
        requirement: 5000,
        reward: { type: "currency", amount: 25000 },
        category: "combat",
        hidden: true
    },
    {
        id: "accuracy_80",
        name: "Снайпер-ас",
        nameEn: "Sniper Ace",
        description: "Достичь точности 80%",
        descriptionEn: "Achieve 80% accuracy",
        icon: "🎯",
        requirement: 80,
        reward: { type: "currency", amount: 2000 },
        category: "combat"
    },
    {
        id: "headshot_master",
        name: "Мастер выстрелов в голову",
        nameEn: "Headshot Master",
        description: "Сделать 100 критических попаданий",
        descriptionEn: "Land 100 critical hits",
        icon: "💀",
        requirement: 100,
        reward: { type: "currency", amount: 1500 },
        category: "combat"
    },
    
    // === SURVIVAL ACHIEVEMENTS ===
    {
        id: "survive_30min",
        name: "Выживший-мастер",
        nameEn: "Survival Master",
        description: "Выжить 30 минут без смерти",
        descriptionEn: "Survive 30 minutes",
        icon: "⏱️",
        requirement: 1800,
        reward: { type: "currency", amount: 1000 },
        category: "survival"
    },
    {
        id: "survive_1hour",
        name: "Несокрушимый",
        nameEn: "Indestructible",
        description: "Выжить 1 час без смерти",
        descriptionEn: "Survive 1 hour",
        icon: "🛡️",
        requirement: 3600,
        reward: { type: "currency", amount: 3000 },
        category: "survival"
    },
    {
        id: "low_hp_survivor",
        name: "Живучий",
        nameEn: "Tough",
        description: "Выжить с HP ниже 5%",
        descriptionEn: "Survive with HP below 5%",
        icon: "❤️",
        requirement: 1,
        reward: { type: "currency", amount: 500 },
        category: "survival"
    },
    {
        id: "comeback_king",
        name: "Король камбэков",
        nameEn: "Comeback King",
        description: "Убить 10 врагов с HP ниже 20%",
        descriptionEn: "Kill 10 enemies with HP below 20%",
        icon: "👑",
        requirement: 10,
        reward: { type: "currency", amount: 1200 },
        category: "survival"
    },
    
    // === EXPLORATION ACHIEVEMENTS ===
    {
        id: "garage_king",
        name: "Король гаражей",
        nameEn: "Garage King",
        description: "Захватить 20 гаражей",
        descriptionEn: "Capture 20 garages",
        icon: "🔧",
        requirement: 20,
        reward: { type: "currency", amount: 1500 },
        category: "exploration"
    },
    {
        id: "poi_emperor",
        name: "Император",
        nameEn: "Emperor",
        description: "Захватить 100 точек интереса",
        descriptionEn: "Capture 100 POIs",
        icon: "👑",
        requirement: 100,
        reward: { type: "currency", amount: 5000 },
        category: "exploration"
    },
    {
        id: "explorer_master",
        name: "Мастер-исследователь",
        nameEn: "Master Explorer",
        description: "Посетить все типы локаций",
        descriptionEn: "Visit all location types",
        icon: "🗺️",
        requirement: 8,
        reward: { type: "currency", amount: 2000 },
        category: "exploration"
    },
    {
        id: "distance_traveler",
        name: "Путешественник",
        nameEn: "Traveler",
        description: "Проехать 100 км",
        descriptionEn: "Travel 100 km",
        icon: "🚗",
        requirement: 100000,
        reward: { type: "currency", amount: 1500 },
        category: "exploration"
    },
    
    // === MULTIPLAYER ACHIEVEMENTS ===
    {
        id: "team_player",
        name: "Командный игрок",
        nameEn: "Team Player",
        description: "Вылечить 10000 HP союзников",
        descriptionEn: "Heal 10000 HP of allies",
        icon: "🤝",
        requirement: 10000,
        reward: { type: "currency", amount: 2000 },
        category: "multiplayer"
    },
    {
        id: "support_legend",
        name: "Легенда поддержки",
        nameEn: "Support Legend",
        description: "Использовать способность Command 100 раз",
        descriptionEn: "Use Command ability 100 times",
        icon: "🎖️",
        requirement: 100,
        reward: { type: "currency", amount: 3000 },
        category: "multiplayer"
    },
    
    // === SPECIAL ACHIEVEMENTS ===
    {
        id: "perfectionist",
        name: "Перфекционист",
        nameEn: "Perfectionist",
        description: "Разблокировать все достижения",
        descriptionEn: "Unlock all achievements",
        icon: "🌟",
        requirement: 1,
        reward: { type: "currency", amount: 50000 },
        category: "special",
        hidden: true
    },
    {
        id: "veteran_player",
        name: "Ветеран игры",
        nameEn: "Veteran Player",
        description: "Играть 100 сессий",
        descriptionEn: "Play 100 sessions",
        icon: "⭐",
        requirement: 100,
        reward: { type: "currency", amount: 5000 },
        category: "special"
    },
    {
        id: "playtime_master",
        name: "Мастер времени",
        nameEn: "Time Master",
        description: "Играть 100 часов",
        descriptionEn: "Play 100 hours",
        icon: "⏰",
        requirement: 360000,
        reward: { type: "currency", amount: 10000 },
        category: "special"
    }
];

export class AchievementsSystem {
    private progress: Map<string, AchievementProgress> = new Map();
    private onAchievementUnlocked: ((achievement: Achievement) => void) | null = null;
    private language: "ru" | "en" = "ru";
    
    constructor() {
        this.loadProgress();
    }
    
    setLanguage(lang: "ru" | "en"): void {
        this.language = lang;
    }
    
    setOnAchievementUnlocked(callback: (achievement: Achievement) => void): void {
        this.onAchievementUnlocked = callback;
    }
    
    // Get achievement name based on language
    getAchievementName(achievement: Achievement): string {
        return this.language === "en" ? achievement.nameEn : achievement.name;
    }
    
    getAchievementDescription(achievement: Achievement): string {
        return this.language === "en" ? achievement.descriptionEn : achievement.description;
    }
    
    // Update progress for an achievement
    updateProgress(achievementId: string, amount: number = 1): void {
        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (!achievement) return;
        
        let progress = this.progress.get(achievementId);
        if (!progress) {
            progress = { id: achievementId, current: 0, completed: false };
            this.progress.set(achievementId, progress);
        }
        
        if (progress.completed) return; // Already completed
        
        progress.current += amount;
        
        // Check if completed
        if (progress.current >= achievement.requirement) {
            progress.completed = true;
            progress.completedAt = Date.now();
            logger.log(`[Achievements] Unlocked: ${achievement.name}!`);
            
            if (this.onAchievementUnlocked) {
                this.onAchievementUnlocked(achievement);
            }
        }
        
        this.saveProgress();
    }
    
    // Set exact value (for tracking things like survival time)
    setProgress(achievementId: string, value: number): void {
        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (!achievement) return;
        
        let progress = this.progress.get(achievementId);
        if (!progress) {
            progress = { id: achievementId, current: 0, completed: false };
            this.progress.set(achievementId, progress);
        }
        
        if (progress.completed) return;
        
        progress.current = value;
        
        if (progress.current >= achievement.requirement) {
            progress.completed = true;
            progress.completedAt = Date.now();
            logger.log(`[Achievements] Unlocked: ${achievement.name}!`);
            
            if (this.onAchievementUnlocked) {
                this.onAchievementUnlocked(achievement);
            }
        }
        
        this.saveProgress();
    }
    
    // Get progress for an achievement
    getProgress(achievementId: string): AchievementProgress | undefined {
        return this.progress.get(achievementId);
    }
    
    // Get all achievements with progress
    getAllAchievements(): Array<{ achievement: Achievement, progress: AchievementProgress }> {
        return ACHIEVEMENTS.map(achievement => ({
            achievement,
            progress: this.progress.get(achievement.id) || { id: achievement.id, current: 0, completed: false }
        }));
    }
    
    // Get completed achievements count
    getCompletedCount(): number {
        let count = 0;
        this.progress.forEach(p => { if (p.completed) count++; });
        return count;
    }
    
    // Get total achievements count
    getTotalCount(): number {
        return ACHIEVEMENTS.length;
    }
    
    // Check if achievement is completed
    isCompleted(achievementId: string): boolean {
        const progress = this.progress.get(achievementId);
        return progress?.completed || false;
    }
    
    // Claim reward for completed achievement
    claimReward(achievementId: string): Achievement["reward"] | null {
        const progress = this.progress.get(achievementId);
        if (!progress || !progress.completed || progress.claimed) return null;
        
        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (!achievement || !achievement.reward) return null;
        
        progress.claimed = true;
        this.saveProgress();
        
        return achievement.reward;
    }
    
    // Save progress to localStorage
    private saveProgress(): void {
        try {
            const data: Record<string, AchievementProgress> = {};
            this.progress.forEach((value, key) => {
                data[key] = value;
            });
            localStorage.setItem('achievements', JSON.stringify(data));
        } catch (e) {
            logger.warn("[Achievements] Failed to save progress:", e);
        }
    }
    
    // Публичный метод для принудительного сохранения
    public forceSave(): void {
        this.saveProgress();
    }
    
    // Load progress from localStorage
    private loadProgress(): void {
        try {
            const saved = localStorage.getItem('achievements');
            if (saved) {
                const data = JSON.parse(saved) as Record<string, AchievementProgress>;
                Object.entries(data).forEach(([key, value]) => {
                    this.progress.set(key, value);
                });
            }
        } catch (e) {
            logger.warn("[Achievements] Failed to load progress:", e);
        }
    }
    
    // Reset all progress (for debugging)
    resetProgress(): void {
        this.progress.clear();
        safeLocalStorage.remove('achievements');
        logger.log("[Achievements] Progress reset");
    }
}

