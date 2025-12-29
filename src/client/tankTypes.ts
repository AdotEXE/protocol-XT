// Система типов корпусов и пушек для танков

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
}

// 5 chassis types
export const CHASSIS_TYPES: ChassisType[] = [
    {
        id: "light",
        name: "Light",
        width: 1.8,
        height: 0.7,
        depth: 3.0,
        mass: 1250,
        maxHealth: 80,
        moveSpeed: 30,
        turnSpeed: 3.0,
        acceleration: 12500,
        color: "#4a9eff",
        description: "Fast and agile, but weak armor"
    },
    {
        id: "medium",
        name: "Medium",
        width: 2.2,
        height: 0.8,
        depth: 3.5,
        mass: 1875,
        maxHealth: 100,
        moveSpeed: 24,
        turnSpeed: 2.5,
        acceleration: 10000,
        color: "#00ff00",
        description: "Balanced tank"
    },
    {
        id: "heavy",
        name: "Heavy",
        width: 2.6,
        height: 0.9,
        depth: 4.0,
        mass: 2500,
        maxHealth: 150,
        moveSpeed: 18,
        turnSpeed: 2.0,
        acceleration: 7500,
        color: "#8b4513",
        description: "Slow but very durable"
    },
    {
        id: "assault",
        name: "Assault",
        width: 2.4,
        height: 0.85,
        depth: 3.8,
        mass: 2125,
        maxHealth: 120,
        moveSpeed: 22,
        turnSpeed: 2.3,
        acceleration: 9375,
        color: "#ff4444",
        description: "Good speed and protection"
    },
    {
        id: "scout",
        name: "Scout",
        width: 1.6,
        height: 0.6,
        depth: 2.8,
        mass: 1000,
        maxHealth: 60,
        moveSpeed: 36,
        turnSpeed: 3.5,
        acceleration: 15000,
        color: "#ffff00",
        description: "Very fast but fragile"
    },
    
    // === NEW 10 CHASSIS TYPES ===
    
    {
        id: "stealth",
        name: "Stealth",
        width: 1.9,
        height: 0.65,
        depth: 3.2,
        mass: 1100,
        maxHealth: 70,
        moveSpeed: 28,
        turnSpeed: 3.2,
        acceleration: 13000,
        color: "#333333",
        description: "Стелс-корпус с активной маскировкой. Способность: временная невидимость на 5 секунд (перезарядка 30 сек). Низкий профиль, средняя броня, высокая скорость. Идеален для разведки и внезапных атак. HP: 70 | Скорость: 28 | Броня: средняя",
        specialAbility: "stealth"
    },
    {
        id: "hover",
        name: "Hover",
        width: 2.0,
        height: 0.75,
        depth: 3.3,
        mass: 1400,
        maxHealth: 85,
        moveSpeed: 32,
        turnSpeed: 3.8,
        acceleration: 14000,
        color: "#00aaff",
        description: "Корпус на воздушной подушке. Способность: увеличенная высота полета, плавное движение по любой местности. Игнорирует мелкие препятствия. Отличная маневренность. HP: 85 | Скорость: 32 | Броня: средняя",
        specialAbility: "hover"
    },
    {
        id: "siege",
        name: "Siege",
        width: 3.0,
        height: 1.1,
        depth: 4.5,
        mass: 3500,
        maxHealth: 200,
        moveSpeed: 12,
        turnSpeed: 1.5,
        acceleration: 5000,
        color: "#654321",
        description: "Осадный корпус с максимальной защитой. Способность: временное усиление брони на 50% (перезарядка 45 сек). Очень медленный, но практически неуязвимый. Идеален для защиты позиций. HP: 200 | Скорость: 12 | Броня: максимальная",
        specialAbility: "siege"
    },
    {
        id: "racer",
        name: "Racer",
        width: 1.5,
        height: 0.55,
        depth: 2.6,
        mass: 900,
        maxHealth: 50,
        moveSpeed: 42,
        turnSpeed: 4.0,
        acceleration: 18000,
        color: "#ff0000",
        description: "Гоночный корпус для максимальной скорости. Способность: кратковременное ускорение на 50% (перезарядка 20 сек). Минимальная броня, но самая высокая скорость в игре. Идеален для быстрых рейдов. HP: 50 | Скорость: 42 | Броня: минимальная",
        specialAbility: "racer"
    },
    {
        id: "amphibious",
        name: "Amphibious",
        width: 2.1,
        height: 0.8,
        depth: 3.6,
        mass: 1600,
        maxHealth: 95,
        moveSpeed: 26,
        turnSpeed: 2.8,
        acceleration: 11000,
        color: "#0088ff",
        description: "Амфибийный корпус для работы на суше и воде. Способность: движение по воде без штрафа к скорости. Универсальный выбор для карт с водоемами. HP: 95 | Скорость: 26 | Броня: средняя",
        specialAbility: "amphibious"
    },
    {
        id: "shield",
        name: "Shield",
        width: 2.3,
        height: 0.9,
        depth: 3.7,
        mass: 2000,
        maxHealth: 110,
        moveSpeed: 20,
        turnSpeed: 2.2,
        acceleration: 9000,
        color: "#88ff88",
        description: "Корпус с энергетическим щитом. Способность: активация щита, поглощающего 100 урона (перезарядка 40 сек). Баланс между защитой и мобильностью. HP: 110 | Скорость: 20 | Броня: высокая",
        specialAbility: "shield"
    },
    {
        id: "drone",
        name: "Drone Carrier",
        width: 2.2,
        height: 0.85,
        depth: 3.5,
        mass: 1800,
        maxHealth: 90,
        moveSpeed: 25,
        turnSpeed: 2.6,
        acceleration: 10500,
        color: "#aa00ff",
        description: "Носитель боевых дронов. Способность: выпуск 2 дронов, атакующих врагов (перезарядка 60 сек). Дроны наносят 15 урона каждые 2 секунды. Поддержка в бою. HP: 90 | Скорость: 25 | Броня: средняя",
        specialAbility: "drone"
    },
    {
        id: "artillery",
        name: "Artillery",
        width: 2.8,
        height: 1.0,
        depth: 4.2,
        mass: 2800,
        maxHealth: 130,
        moveSpeed: 16,
        turnSpeed: 1.8,
        acceleration: 6500,
        color: "#8b4513",
        description: "Артиллерийский корпус для дальнего боя. Способность: увеличенная дальность стрельбы на 50%. Медленный, но мощный. Идеален для поддержки с тыла. HP: 130 | Скорость: 16 | Броня: высокая",
        specialAbility: "artillery"
    },
    {
        id: "destroyer",
        name: "Tank Destroyer",
        width: 2.5,
        height: 0.95,
        depth: 4.0,
        mass: 2200,
        maxHealth: 105,
        moveSpeed: 21,
        turnSpeed: 2.4,
        acceleration: 8500,
        color: "#ff8800",
        description: "Истребитель танков с усиленным уроном. Способность: +30% урона к вражеским танкам. Специализируется на уничтожении тяжелых целей. HP: 105 | Скорость: 21 | Броня: средняя",
        specialAbility: "destroyer"
    },
    {
        id: "command",
        name: "Command",
        width: 2.4,
        height: 0.88,
        depth: 3.9,
        mass: 1950,
        maxHealth: 115,
        moveSpeed: 23,
        turnSpeed: 2.5,
        acceleration: 9500,
        color: "#ffd700",
        description: "Командный корпус с поддержкой союзников. Способность: бафф +15% к урону и скорости для всех союзников в радиусе 20м (перезарядка 60 сек). Сила команды. HP: 115 | Скорость: 23 | Броня: высокая",
        specialAbility: "command"
    }
];

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
        recoilMultiplier: 0.5 // Лёгкая отдача
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
        recoilMultiplier: 1.0 // Стандартная отдача
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
        recoilMultiplier: 1.8 // Сильная отдача
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
        recoilMultiplier: 2.0 // Мощная отдача
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
        recoilMultiplier: 0.25 // Минимальная отдача (скорострельность)
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
        recoilMultiplier: 0.8 // Энергетическое оружие - меньше отдачи
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
        recoilMultiplier: 0.3 // Лазер - почти нет отдачи
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
        recoilMultiplier: 0.4 // Электрическое оружие - слабая отдача
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
        recoilMultiplier: 2.5 // Максимальная отдача!
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
        recoilMultiplier: 1.6 // Ракетная отдача
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
        recoilMultiplier: 2.2 // Тяжёлый миномёт - сильная отдача
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
        recoilMultiplier: 1.2 // Средняя отдача
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
        recoilMultiplier: 1.7 // Взрывная отдача
    },
    
    // === SPECIAL EFFECT WEAPONS ===
    {
        id: "flamethrower",
        name: "Flamethrower",
        barrelLength: 1.6,
        barrelWidth: 0.24,
        damage: 12,
        cooldown: 200,
        projectileSpeed: 120,
        projectileSize: 0.18,
        color: "#ff3300",
        description: "Огнемет с непрерывным огнем. Урон: 12 | Перезарядка: 0.2с | Эффект: горение 5 сек (5 урона/сек). Ближний бой, высокая DPS.",
        recoilMultiplier: 0.15 // Огнемёт - почти нет отдачи
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
        recoilMultiplier: 0.6 // Жидкость - слабая отдача
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
        recoilMultiplier: 0.7 // Криогенная - умеренная отдача
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
        recoilMultiplier: 0.5 // Инжектор - слабая отдача
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
        recoilMultiplier: 0.4 // ЭМИ - электромагнитное, слабая отдача
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
        recoilMultiplier: 1.4 // Дробовик - ощутимая отдача
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
        recoilMultiplier: 1.1 // Многоствольная - суммарная отдача
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
        recoilMultiplier: 1.5 // Ракета - заметная отдача
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
        recoilMultiplier: 1.8 // Бронебойная - сильная отдача
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
        recoilMultiplier: 1.3 // Ударная волна - средняя отдача
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
        recoilMultiplier: 0.35 // Лучевая - минимальная отдача
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
        recoilMultiplier: 1.4 // Вихрь - заметная отдача
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
        description: "Ремонтный луч, лечит союзников. Урон: 20 | Перезарядка: 1.5с | Лечит союзников на 30 HP, наносит урон врагам. Поддержка команды.",
        recoilMultiplier: 0.3 // Ремонтный луч - минимальная отдача
    }
];

// Получить корпус по ID
export function getChassisById(id: string): ChassisType {
    const result = CHASSIS_TYPES.find(c => c.id === id) ?? CHASSIS_TYPES[1]!;
    return result;
}

// Получить пушку по ID
export function getCannonById(id: string): CannonType {
    const result = CANNON_TYPES.find(c => c.id === id) ?? CANNON_TYPES[1]!;
    return result;
}

