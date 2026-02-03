// Система типов корпусов и пушек для танков

import { applyChassisModifiers, applyCannonModifiers } from "./config/vehiclePhysicsConfig";

export interface ChassisType {
    id: string;
    name: string;
    width: number;
    height: number;
    depth: number;
    mass: number;
    maxHealth: number;
    moveSpeed: number;
    turnSpeed: number;
    acceleration: number;
    color: string; // Hex цвет
    description: string;
    specialAbility?: string; // Специальная способность
}

export interface CannonType {
    id: string;
    name: string;
    barrelLength: number;
    barrelWidth: number;
    damage: number;
    cooldown: number; // мс
    projectileSpeed: number;
    projectileSize: number;
    color: string; // Hex цвет
    description: string;
    recoilMultiplier: number; // Множитель силы отдачи (1.0 = стандартная)
    // Параметры рикошета (опционально)
    maxRicochets?: number; // Максимальное количество рикошетов
    ricochetSpeedRetention?: number; // Сохранение скорости при рикошете (0.0-1.0)
    ricochetAngle?: number; // Угол рикошета (градусы)
    maxRange?: number; // Максимальная дальность выстрела (м) - рассчитывается автоматически если не указано
    dps?: number; // Damage Per Second (рассчитывается автоматически)
}

/**
 * Тип для расчета DPS - поддерживает CannonType или объект с уроном и перезарядкой
 */
type DPSCalculable = CannonType | { damage: number | { total: number }, cooldown: number | { total: number }, dps?: number };

/**
 * Рассчитывает DPS (Damage Per Second) для пушки
 * @param cannon - Тип пушки или данные о пушке
 * @returns DPS в единицах урона в секунду
 */
export function calculateDPS(cannon: DPSCalculable): number {
    if (cannon.dps !== undefined) {
        return cannon.dps;
    }
    // Извлекаем значения урона и перезарядки (поддерживаем и StatWithBonus, и обычные числа)
    const damage = typeof cannon.damage === 'object' && 'total' in cannon.damage ? cannon.damage.total : (cannon.damage as number);
    const cooldown = typeof cannon.cooldown === 'object' && 'total' in cannon.cooldown ? cannon.cooldown.total : (cannon.cooldown as number);

    // DPS = damage / (cooldown / 1000)
    const cooldownSeconds = cooldown / 1000;
    return damage / cooldownSeconds;
}

// 15 chassis types (ordered as specified: 9, 8, 10, 11, 13, 1, 2, 3, 4, 5, 6, 7, 14, 15, 12)
// Хардкод используется как fallback если json_models не загружен
export const CHASSIS_TYPES: ChassisType[] = [
    // 9 - Racer
    {
        id: "racer",
        name: "Racer",
        width: 1.5,
        height: 0.55,
        depth: 2.6,
        mass: 900,
        maxHealth: 50,
        moveSpeed: 42,
        turnSpeed: 8.0,
        acceleration: 18000,
        color: "#ff0000",
        description: "Гоночный корпус для максимальной скорости. Способность: кратковременное ускорение на 50% (перезарядка 20 сек). Минимальная броня, но самая высокая скорость в игре. Идеален для быстрых рейдов. HP: 50 | Скорость: 42 | Броня: минимальная",
        specialAbility: "racer"
    },
    // 8 - Siege
    {
        id: "siege",
        name: "Siege",
        width: 3.0,
        height: 1.1,
        depth: 4.5,
        mass: 3500,
        maxHealth: 200,
        moveSpeed: 12,
        turnSpeed: 3.0,
        acceleration: 5000,
        color: "#654321",
        description: "Осадный корпус с максимальной защитой. Способность: временное усиление брони на 50% (перезарядка 45 сек). Очень медленный, но практически неуязвимый. Идеален для защиты позиций. HP: 200 | Скорость: 12 | Броня: максимальная",
        specialAbility: "siege"
    },
    // 10 - Amphibious
    {
        id: "amphibious",
        name: "Amphibious",
        width: 2.1,
        height: 0.8,
        depth: 3.6,
        mass: 1600,
        maxHealth: 95,
        moveSpeed: 26,
        turnSpeed: 5.6,
        acceleration: 11000,
        color: "#0088ff",
        description: "Амфибийный корпус для работы на суше и воде. Способность: движение по воде без штрафа к скорости. Универсальный выбор для карт с водоемами. HP: 95 | Скорость: 26 | Броня: средняя",
        specialAbility: "amphibious"
    },
    // 11 - Shield
    {
        id: "shield",
        name: "Shield",
        width: 2.3,
        height: 0.9,
        depth: 3.7,
        mass: 2000,
        maxHealth: 110,
        moveSpeed: 20,
        turnSpeed: 4.4,
        acceleration: 9000,
        color: "#88ff88",
        description: "Корпус с энергетическим щитом. Способность: активация щита, поглощающего 100 урона (перезарядка 40 сек). Баланс между защитой и мобильностью. HP: 110 | Скорость: 20 | Броня: высокая",
        specialAbility: "shield"
    },
    // 13 - Artillery
    {
        id: "artillery",
        name: "Artillery",
        width: 2.8,
        height: 1.0,
        depth: 4.2,
        mass: 2800,
        maxHealth: 130,
        moveSpeed: 16,
        turnSpeed: 3.6,
        acceleration: 6500,
        color: "#8b4513",
        description: "Артиллерийский корпус для дальнего боя. Способность: увеличенная дальность стрельбы на 50%. Медленный, но мощный. Идеален для поддержки с тыла. HP: 130 | Скорость: 16 | Броня: высокая",
        specialAbility: "artillery"
    },
    // 1 - Light
    {
        id: "light",
        name: "Light",
        width: 1.8,
        height: 0.7,
        depth: 3.0,
        mass: 1250,
        maxHealth: 80,
        moveSpeed: 30,
        turnSpeed: 6.0,
        acceleration: 12500,
        color: "#4a9eff",
        description: "Fast and agile, but weak armor"
    },
    // 2 - Medium
    {
        id: "medium",
        name: "Medium",
        width: 2.2,
        height: 0.8,
        depth: 3.5,
        mass: 1875,
        maxHealth: 100,
        moveSpeed: 24,
        turnSpeed: 5.0,
        acceleration: 10000,
        color: "#00ff00",
        description: "Balanced tank"
    },
    // 3 - Heavy
    {
        id: "heavy",
        name: "Heavy",
        width: 2.6,
        height: 0.9,
        depth: 4.0,
        mass: 2500,
        maxHealth: 150,
        moveSpeed: 18,
        turnSpeed: 4.0,
        acceleration: 7500,
        color: "#8b4513",
        description: "Slow but very durable"
    },
    // 4 - Assault
    {
        id: "assault",
        name: "Assault",
        width: 2.4,
        height: 0.85,
        depth: 3.8,
        mass: 2125,
        maxHealth: 120,
        moveSpeed: 22,
        turnSpeed: 4.6,
        acceleration: 9375,
        color: "#ff4444",
        description: "Good speed and protection"
    },
    // 5 - Scout
    {
        id: "scout",
        name: "Scout",
        width: 1.6,
        height: 0.6,
        depth: 2.8,
        mass: 1000,
        maxHealth: 60,
        moveSpeed: 36,
        turnSpeed: 7.0,
        acceleration: 15000,
        color: "#ffff00",
        description: "Very fast but fragile"
    },
    // 6 - Stealth
    {
        id: "stealth",
        name: "Stealth",
        width: 1.9,
        height: 0.65,
        depth: 3.2,
        mass: 1100,
        maxHealth: 70,
        moveSpeed: 28,
        turnSpeed: 6.4,
        acceleration: 13000,
        color: "#333333",
        description: "Стелс-корпус с активной маскировкой. Способность: временная невидимость на 5 секунд (перезарядка 30 сек). Низкий профиль, средняя броня, высокая скорость. Идеален для разведки и внезапных атак. HP: 70 | Скорость: 28 | Броня: средняя",
        specialAbility: "stealth"
    },
    // 7 - Hover
    {
        id: "hover",
        name: "Hover",
        width: 2.0,
        height: 0.75,
        depth: 3.3,
        mass: 1400,
        maxHealth: 85,
        moveSpeed: 32,
        turnSpeed: 7.6,
        acceleration: 14000,
        color: "#00aaff",
        description: "Корпус на воздушной подушке. Способность: увеличенная высота полета, плавное движение по любой местности. Игнорирует мелкие препятствия. Отличная маневренность. HP: 85 | Скорость: 32 | Броня: средняя",
        specialAbility: "hover"
    },
    // 14 - Destroyer
    {
        id: "destroyer",
        name: "Tank Destroyer",
        width: 2.5,
        height: 0.95,
        depth: 4.0,
        mass: 2200,
        maxHealth: 105,
        moveSpeed: 21,
        turnSpeed: 4.8,
        acceleration: 8500,
        color: "#ff8800",
        description: "Истребитель танков с усиленным уроном. Способность: +30% урона к вражеским танкам. Специализируется на уничтожении тяжелых целей. HP: 105 | Скорость: 21 | Броня: средняя",
        specialAbility: "destroyer"
    },
    // 15 - Command
    {
        id: "command",
        name: "Command",
        width: 2.4,
        height: 0.88,
        depth: 3.9,
        mass: 1950,
        maxHealth: 115,
        moveSpeed: 23,
        turnSpeed: 5.0,
        acceleration: 9500,
        color: "#ffd700",
        description: "Командный корпус с поддержкой союзников. Способность: бафф +15% к урону и скорости для всех союзников в радиусе 20м (перезарядка 60 сек). Сила команды. HP: 115 | Скорость: 23 | Броня: высокая",
        specialAbility: "command"
    },
    // 12 - Drone (added at the end as it wasn't in the specified order)
    {
        id: "drone",
        name: "Drone Carrier",
        width: 2.2,
        height: 0.85,
        depth: 3.5,
        mass: 1800,
        maxHealth: 90,
        moveSpeed: 25,
        turnSpeed: 5.2,
        acceleration: 10500,
        color: "#aa00ff",
        description: "Носитель боевых дронов. Способность: выпуск 2 дронов, атакующих врагов (перезарядка 60 сек). Дроны наносят 15 урона каждые 2 секунды. Поддержка в бою. HP: 90 | Скорость: 25 | Броня: средняя",
        specialAbility: "drone"
    },
    // 20 - Plane
    {
        id: "plane",
        name: "Warhawk",
        width: 3.5, // Широкий из-за крыльев
        height: 1.2,
        depth: 4.0,
        mass: 1500,
        maxHealth: 65, // Хрупкий
        moveSpeed: 45, // Очень быстрый
        turnSpeed: 6.5,
        acceleration: 16000,
        color: "#dfeeff",
        description: "Штурмовой самолёт с вертикальным взлётом. Способность: полёт (Q/E). Высокая скорость и манёвренность, но слабая броня. Король воздуха. HP: 65 | Скорость: 45 | Броня: низкая",
        specialAbility: "flight"
    }
];

/**
 * Функция расчёта максимальной дальности выстрела на основе длины ствола
 * Чем длиннее ствол, тем дальше может стрелять пушка
 */
function calculateMaxRange(barrelLength: number, projectileSpeed: number): number {
    // Базовая дальность зависит от длины ствола (больше ствол = больше дальность)
    // Также учитывается скорость снаряда для более точного расчёта
    const baseRange = barrelLength * 80; // Базовый множитель: 1м ствола = 80м дальности
    const speedBonus = projectileSpeed * 0.5; // Бонус от скорости снаряда
    return Math.round(baseRange + speedBonus);
}

// 25 cannon types (5 original + 20 new)
export const CANNON_TYPES: CannonType[] = [
    // === ORIGINAL 5 ===
    {
        id: "rapid",
        name: "Rapid",
        barrelLength: 1.7,
        barrelWidth: 0.15,
        damage: 15,
        cooldown: 1000,
        projectileSpeed: 160,
        projectileSize: 0.15,
        color: "#888888",
        description: "Fast fire rate, low damage",
        recoilMultiplier: 1.0 // Лёгкая отдача (x2)
    },
    {
        id: "standard",
        name: "Standard",
        barrelLength: 2.1,
        barrelWidth: 0.2,
        damage: 25,
        cooldown: 2000,
        projectileSpeed: 200,
        projectileSize: 0.2,
        color: "#666666",
        description: "Balanced cannon",
        recoilMultiplier: 2.0, // Стандартная отдача (x2)
        maxRange: calculateMaxRange(2.1, 200)
    },
    {
        id: "heavy",
        name: "Heavy",
        barrelLength: 2.5,
        barrelWidth: 0.25,
        damage: 40,
        cooldown: 3500,
        projectileSpeed: 240,
        projectileSize: 0.25,
        color: "#444444",
        description: "Slow but powerful",
        recoilMultiplier: 3.6, // Сильная отдача (x2)
        maxRange: calculateMaxRange(2.5, 240)
    },
    {
        id: "sniper",
        name: "Sniper",
        barrelLength: 3.0,
        barrelWidth: 0.18,
        damage: 50,
        cooldown: 4000,
        projectileSpeed: 300,
        projectileSize: 0.18,
        color: "#222222",
        description: "High damage, long range",
        recoilMultiplier: 4.0, // Мощная отдача (x2)
        maxRange: calculateMaxRange(3.0, 300)
    },
    {
        id: "gatling",
        name: "Gatling",
        barrelLength: 1.9,
        barrelWidth: 0.22,
        damage: 10,
        cooldown: 300,
        projectileSpeed: 180,
        projectileSize: 0.12,
        color: "#aaaaaa",
        description: "Very fast fire rate",
        recoilMultiplier: 0.5, // Минимальная отдача (скорострельность) (x2)
        maxRange: calculateMaxRange(1.9, 180)
    },

    // === NEW 20 CANNONS ===

    // === ENERGY WEAPONS ===
    {
        id: "plasma",
        name: "Plasma Cannon",
        barrelLength: 2.3,
        barrelWidth: 0.28,
        damage: 35,
        cooldown: 2500,
        projectileSpeed: 220,
        projectileSize: 0.22,
        color: "#ff00ff",
        description: "Плазменная пушка с энергетическими снарядами. Урон: 35 | Перезарядка: 2.5с | Скорость снаряда: 220 м/с. Средний урон, средняя скорость перезарядки. Эффективна против легкой брони.",
        recoilMultiplier: 1.6, // Энергетическое оружие - меньше отдачи (x2)
        maxRange: calculateMaxRange(2.3, 220)
    },
    {
        id: "laser",
        name: "Laser Beam",
        barrelLength: 2.8,
        barrelWidth: 0.16,
        damage: 30,
        cooldown: 1500,
        projectileSpeed: 400,
        projectileSize: 0.14,
        color: "#ff0000",
        description: "Лазерный луч мгновенного попадания. Урон: 30 | Перезарядка: 1.5с | Скорость: 400 м/с (мгновенно). Высокая точность, нет задержки попадания. Идеален для быстрых целей.",
        recoilMultiplier: 0.6, // Лазер - почти нет отдачи (x2)
        maxRange: calculateMaxRange(2.8, 400)
    },
    {
        id: "tesla",
        name: "Tesla Coil",
        barrelLength: 1.8,
        barrelWidth: 0.32,
        damage: 20,
        cooldown: 1800,
        projectileSpeed: 190,
        projectileSize: 0.20,
        color: "#00ffff",
        description: "Катушка Тесла с цепной молнией. Урон: 20 | Перезарядка: 1.8с | Эффект: урон переходит на 2 ближайших врагов (50% урона). Отлично против групп.",
        recoilMultiplier: 0.8, // Электрическое оружие - слабая отдача (x2)
        maxRange: calculateMaxRange(1.8, 190)
    },
    {
        id: "railgun",
        name: "Railgun",
        barrelLength: 3.5,
        barrelWidth: 0.20,
        damage: 60,
        cooldown: 5000,
        projectileSpeed: 500,
        projectileSize: 0.16,
        color: "#0088ff",
        description: "Рельсотрон с экстремальным уроном. Урон: 60 | Перезарядка: 5.0с | Скорость: 500 м/с. Самый высокий урон, но очень медленная перезарядка. Один выстрел - одно убийство.",
        recoilMultiplier: 5.0, // Максимальная отдача! (x2)
        maxRange: calculateMaxRange(3.5, 500)
    },

    // === EXPLOSIVE WEAPONS ===
    {
        id: "rocket",
        name: "Rocket Launcher",
        barrelLength: 2.2,
        barrelWidth: 0.30,
        damage: 45,
        cooldown: 3000,
        projectileSpeed: 150,
        projectileSize: 0.28,
        color: "#ff8800",
        description: "Ракетная установка с взрывным уроном. Урон: 45 | Перезарядка: 3.0с | Радиус взрыва: 3м. Эффективна против групп врагов.",
        recoilMultiplier: 3.2, // Ракетная отдача (x2)
        maxRange: calculateMaxRange(2.2, 150)
    },
    {
        id: "mortar",
        name: "Mortar",
        barrelLength: 1.5,
        barrelWidth: 0.35,
        damage: 55,
        cooldown: 4500,
        projectileSpeed: 100,
        projectileSize: 0.32,
        color: "#8b4513",
        description: "Миномет с высокой дугой траектории. Урон: 55 | Перезарядка: 4.5с | Радиус взрыва: 5м. Стреляет через препятствия, массивный урон по области.",
        recoilMultiplier: 4.4, // Тяжёлый миномёт - сильная отдача (x2)
        maxRange: calculateMaxRange(1.5, 100)
    },
    {
        id: "cluster",
        name: "Cluster Launcher",
        barrelLength: 2.0,
        barrelWidth: 0.26,
        damage: 25,
        cooldown: 2800,
        projectileSpeed: 170,
        projectileSize: 0.24,
        color: "#ff4444",
        description: "Кластерная установка, разделяющиеся снаряды. Урон: 25 | Перезарядка: 2.8с | Разделяется на 5 снарядов. Покрывает большую площадь.",
        recoilMultiplier: 2.4, // Средняя отдача (x2)
        maxRange: calculateMaxRange(2.0, 170)
    },
    {
        id: "explosive",
        name: "Explosive Cannon",
        barrelLength: 2.4,
        barrelWidth: 0.28,
        damage: 42,
        cooldown: 3200,
        projectileSpeed: 180,
        projectileSize: 0.26,
        color: "#ff6600",
        description: "Взрывная пушка со сплэш-уроном. Урон: 42 | Перезарядка: 3.2с | Радиус взрыва: 4м. Баланс между уроном и перезарядкой.",
        recoilMultiplier: 3.4, // Взрывная отдача (x2)
        maxRange: calculateMaxRange(2.4, 180)
    },

    // === SPECIAL EFFECT WEAPONS ===
    {
        id: "flamethrower",
        name: "Flamethrower",
        barrelLength: 1.6,
        barrelWidth: 0.24,
        damage: 8,      // НЕРФ: Было 12. Снижение урона в 1.5 раза.
        cooldown: 150,  // НЕРФ: Было 100. Снижение скорострельности в 1.5 раза.
        projectileSpeed: 120,
        projectileSize: 0.18,
        color: "#ff3300",
        description: "Огнемет с непрерывным огнем. Урон: 12 | Перезарядка: 0.1с | Эффект: горение 5 сек (5 урона/сек). Ближний бой, высокая DPS. Самая скорострельная пушка!",
        recoilMultiplier: 0.3, // Огнемёт - почти нет отдачи (x2)
        maxRange: calculateMaxRange(1.6, 120)
    },
    {
        id: "acid",
        name: "Acid Launcher",
        barrelLength: 2.1,
        barrelWidth: 0.22,
        damage: 18,
        cooldown: 2200,
        projectileSpeed: 140,
        projectileSize: 0.20,
        color: "#00ff00",
        description: "Кислотный распылитель с коррозией. Урон: 18 | Перезарядка: 2.2с | Эффект: коррозия 8 сек (3 урона/сек), снижает броню на 20%.",
        recoilMultiplier: 1.2, // Жидкость - слабая отдача (x2)
        maxRange: calculateMaxRange(2.1, 140)
    },
    {
        id: "freeze",
        name: "Cryo Cannon",
        barrelLength: 2.0,
        barrelWidth: 0.20,
        damage: 22,
        cooldown: 2400,
        projectileSpeed: 160,
        projectileSize: 0.19,
        color: "#00ccff",
        description: "Криогенная пушка с замораживанием. Урон: 22 | Перезарядка: 2.4с | Эффект: замедление на 50% на 4 сек. Контроль врагов.",
        recoilMultiplier: 1.4, // Криогенная - умеренная отдача (x2)
        maxRange: calculateMaxRange(2.0, 160)
    },
    {
        id: "poison",
        name: "Toxin Launcher",
        barrelLength: 1.9,
        barrelWidth: 0.21,
        damage: 16,
        cooldown: 2100,
        projectileSpeed: 150,
        projectileSize: 0.17,
        color: "#9900ff",
        description: "Токсичный инжектор с отравлением. Урон: 16 | Перезарядка: 2.1с | Эффект: яд 10 сек (2 урона/сек). Долгий DoT.",
        recoilMultiplier: 1.0, // Инжектор - слабая отдача (x2)
        maxRange: calculateMaxRange(1.9, 150)
    },
    {
        id: "emp",
        name: "EMP Blaster",
        barrelLength: 2.2,
        barrelWidth: 0.25,
        damage: 15,
        cooldown: 3500,
        projectileSpeed: 200,
        projectileSize: 0.23,
        color: "#ffff00",
        description: "ЭМИ бластер, отключает системы. Урон: 15 | Перезарядка: 3.5с | Эффект: отключение способностей на 6 сек. Тактическое оружие.",
        recoilMultiplier: 0.8, // ЭМИ - электромагнитное, слабая отдача (x2)
        maxRange: calculateMaxRange(2.2, 200)
    },

    // === MULTI-SHOT WEAPONS ===
    {
        id: "shotgun",
        name: "Shotgun",
        barrelLength: 1.4,
        barrelWidth: 0.34,
        damage: 8,
        cooldown: 1200,
        projectileSpeed: 130,
        projectileSize: 0.10,
        color: "#cc6600",
        description: "Дробовик с множественными снарядами. Урон: 8 (×10 снарядов) | Перезарядка: 1.2с | Эффективен вблизи, разброс урона.",
        recoilMultiplier: 2.8, // Дробовик - ощутимая отдача (x2)
        maxRange: calculateMaxRange(1.4, 130)
    },
    {
        id: "multishot",
        name: "Multi-Barrel",
        barrelLength: 2.1,
        barrelWidth: 0.38,
        damage: 14,
        cooldown: 1600,
        projectileSpeed: 175,
        projectileSize: 0.13,
        color: "#8888aa",
        description: "Многоствольная пушка, 3 выстрела одновременно. Урон: 14×3 | Перезарядка: 1.6с | Три снаряда параллельно, хороший DPS.",
        recoilMultiplier: 2.2, // Многоствольная - суммарная отдача (x2)
        maxRange: calculateMaxRange(2.1, 175)
    },

    // === ADVANCED WEAPONS ===
    {
        id: "homing",
        name: "Homing Missile",
        barrelLength: 2.3,
        barrelWidth: 0.27,
        damage: 38,
        cooldown: 3800,
        projectileSpeed: 180,
        projectileSize: 0.25,
        color: "#ff0088",
        description: "Самонаводящаяся ракета, преследует цели. Урон: 38 | Перезарядка: 3.8с | Автоматическое наведение, игнорирует уклонение.",
        recoilMultiplier: 3.0, // Ракета - заметная отдача (x2)
        maxRange: calculateMaxRange(2.3, 180)
    },
    {
        id: "piercing",
        name: "Piercing Rail",
        barrelLength: 3.2,
        barrelWidth: 0.18,
        damage: 32,
        cooldown: 2800,
        projectileSpeed: 350,
        projectileSize: 0.12,
        color: "#cccccc",
        description: "Бронебойная пушка, пронзает врагов. Урон: 32 | Перезарядка: 2.8с | Проходит через 3 врагов, снижение урона на 20% за цель.",
        recoilMultiplier: 3.6, // Бронебойная - сильная отдача (x2)
        maxRange: calculateMaxRange(3.2, 350)
    },
    {
        id: "shockwave",
        name: "Shockwave Cannon",
        barrelLength: 2.6,
        barrelWidth: 0.32,
        damage: 28,
        cooldown: 3000,
        projectileSpeed: 110,
        projectileSize: 0.30,
        color: "#ffaa00",
        description: "Ударная волна с отбрасыванием. Урон: 28 | Перезарядка: 3.0с | Радиус: 4м, отбрасывает врагов, контроль территории.",
        recoilMultiplier: 2.6, // Ударная волна - средняя отдача (x2)
        maxRange: calculateMaxRange(2.6, 110)
    },
    {
        id: "beam",
        name: "Beam Cannon",
        barrelLength: 2.7,
        barrelWidth: 0.19,
        damage: 26,
        cooldown: 1900,
        projectileSpeed: 380,
        projectileSize: 0.15,
        color: "#ff00aa",
        description: "Лучовая пушка с непрерывным лучом. Урон: 26 | Перезарядка: 1.9с | Непрерывный луч 2 сек, накапливающийся урон.",
        recoilMultiplier: 0.7, // Лучевая - минимальная отдача (x2)
        maxRange: calculateMaxRange(2.7, 380)
    },
    {
        id: "vortex",
        name: "Vortex Launcher",
        barrelLength: 2.5,
        barrelWidth: 0.29,
        damage: 33,
        cooldown: 3600,
        projectileSpeed: 160,
        projectileSize: 0.27,
        color: "#aa00ff",
        description: "Вихревой генератор, притягивает врагов. Урон: 33 | Перезарядка: 3.6с | Притягивает врагов к центру взрыва, радиус 5м.",
        recoilMultiplier: 2.8, // Вихрь - заметная отдача (x2)
        maxRange: calculateMaxRange(2.5, 160)
    },
    {
        id: "support",
        name: "Support Beam",
        barrelLength: 2.2,
        barrelWidth: 0.24,
        damage: 20,
        cooldown: 1500,
        projectileSpeed: 250,
        projectileSize: 0.20,
        color: "#00ff88",
        description: "Ремонтный луч, лечит союзников. Урон: 20 | Перезарядка: 1.5с | Лечит союзников на 30 HP, наносит урон врагов. Поддержка команды.",
        recoilMultiplier: 0.6, // Ремонтный луч - минимальная отдача (x2)
        maxRange: calculateMaxRange(2.2, 250)
    },

    // === RICOCHET CANNON ===
    {
        id: "ricochet",
        name: "Ricochet Master",
        barrelLength: 2.4,
        barrelWidth: 0.22,
        damage: 28,
        cooldown: 2200,
        projectileSpeed: 250,
        projectileSize: 0.18,
        color: "#ffd700", // Золотой
        description: "Мастер рикошетов! До 5 отскоков на базовом уровне. Урон: 28 | Перезарядка: 2.2с | Идеален для стрельбы из-за углов и непрямого урона. Снаряды сохраняют 90% скорости при отскоке.",
        recoilMultiplier: 1.8,
        maxRicochets: 5,
        ricochetSpeedRetention: 0.90,
        ricochetAngle: 55, // Более пологий угол для рикошета
        maxRange: calculateMaxRange(2.4, 250)
    }
];

// ОПТИМИЗАЦИЯ: Map для быстрого поиска по ID (O(1) вместо O(n))
let chassisTypesMap: Map<string, ChassisType> | null = null;
let cannonTypesMap: Map<string, CannonType> | null = null;

/**
 * Создаёт Map для быстрого поиска корпусов (ленивая инициализация)
 */
function getChassisTypesMap(): Map<string, ChassisType> {
    if (!chassisTypesMap) {
        chassisTypesMap = new Map();
        for (const chassis of CHASSIS_TYPES) {
            chassisTypesMap.set(chassis.id, chassis);
        }
    }
    return chassisTypesMap;
}

/**
 * Создаёт Map для быстрого поиска пушек (ленивая инициализация)
 */
function getCannonTypesMap(): Map<string, CannonType> {
    if (!cannonTypesMap) {
        cannonTypesMap = new Map();
        for (const cannon of CANNON_TYPES) {
            cannonTypesMap.set(cannon.id, cannon);
        }
    }
    return cannonTypesMap;
}

// Кэш результатов после применения модификаторов (оптимизация производительности)
const chassisCacheWithModifiers = new Map<string, ChassisType>();
const cannonCacheWithModifiers = new Map<string, CannonType>();

// Получить корпус по ID (из json_models или fallback на хардкод). Применяются модификаторы из vehiclePhysicsConfig.
export function getChassisById(id: string): ChassisType {
    // Проверяем кэш результатов после применения модификаторов
    const cached = chassisCacheWithModifiers.get(id);
    if (cached) {
        return cached;
    }

    let result: ChassisType;
    try {
        const { getChassisByIdSync } = require('./utils/modelLoader');
        const fromCache = getChassisByIdSync(id);
        if (fromCache) {
            result = fromCache;
        } else {
            // ОПТИМИЗАЦИЯ: Используем Map для O(1) поиска вместо O(n) .find()
            result = getChassisTypesMap().get(id) ?? CHASSIS_TYPES[1]!;
        }
    } catch {
        // ОПТИМИЗАЦИЯ: Используем Map для O(1) поиска вместо O(n) .find()
        result = getChassisTypesMap().get(id) ?? CHASSIS_TYPES[1]!;
    }
    
    // Применяем модификаторы и сохраняем в кэш
    const finalResult = applyChassisModifiers(result, id);
    chassisCacheWithModifiers.set(id, finalResult);
    return finalResult;
}

// Получить пушку по ID (из json_models или fallback на хардкод). Применяются модификаторы из vehiclePhysicsConfig.
export function getCannonById(id: string): CannonType {
    // Проверяем кэш результатов после применения модификаторов
    const cached = cannonCacheWithModifiers.get(id);
    if (cached) {
        return cached;
    }

    let result: CannonType;
    try {
        const { getCannonByIdSync } = require('./utils/modelLoader');
        const fromCache = getCannonByIdSync(id);
        if (fromCache) {
            result = fromCache;
        } else {
            // ОПТИМИЗАЦИЯ: Используем Map для O(1) поиска вместо O(n) .find()
            result = getCannonTypesMap().get(id) ?? CANNON_TYPES[1]!;
        }
    } catch {
        // ОПТИМИЗАЦИЯ: Используем Map для O(1) поиска вместо O(n) .find()
        result = getCannonTypesMap().get(id) ?? CANNON_TYPES[1]!;
    }
    
    // Применяем модификаторы и сохраняем в кэш
    const finalResult = applyCannonModifiers(result, id);
    cannonCacheWithModifiers.set(id, finalResult);
    return finalResult;
}

/**
 * Очищает кэш результатов после применения модификаторов.
 * Вызывать после изменения модификаторов в vehiclePhysicsConfig.
 */
export function clearVehiclePhysicsCache(): void {
    chassisCacheWithModifiers.clear();
    cannonCacheWithModifiers.clear();
}

export interface TrackType {
    id: string;
    name: string;
    width: number;
    height: number;
    depth: number;
    color: string;
    description: string;
}

export const TRACK_TYPES: TrackType[] = [
    {
        id: "standard",
        name: "Standard",
        width: 0.5,
        height: 0.6,
        depth: 1.0,
        color: "#222222",
        description: "Standard tracks"
    },
    {
        id: "heavy",
        name: "Heavy",
        width: 0.7,
        height: 0.7,
        depth: 1.1,
        color: "#111111",
        description: "Heavy reinforced tracks"
    },
    {
        id: "light",
        name: "Light",
        width: 0.4,
        height: 0.5,
        depth: 0.9,
        color: "#333333",
        description: "Light maneuverable tracks"
    }
];

export function getTrackById(id: string): TrackType {
    const result = TRACK_TYPES.find(t => t.id === id) ?? TRACK_TYPES[0]!;
    return result;
}

