// Константы для системы танка
// Вынесены из кода для улучшения читаемости и поддержки

export const TANK_CONSTANTS = {
    // Защита от урона
    INVULNERABILITY_DURATION: 3000, // 3 секунды защиты после респавна
    
    // Топливо
    FUEL_CONSUMPTION_RATE: 0.5, // Литров в секунду при движении
    
    // Снижение урона
    SHIELD_DAMAGE_REDUCTION: 0.0, // СУПЕР: Щит ПОЛНОСТЬЮ блокирует урон (100% защита!)
    STEALTH_DAMAGE_REDUCTION: 0.7, // Стелс снижает урон на 30%
    
    // Радиусы попаданий
    HIT_RADIUS_TANK: 4.0,   // Радиус попадания в танк
    HIT_RADIUS_TURRET: 2.5, // Радиус попадания в турель
    
    // Рикошеты
    MAX_RICOCHETS: 3,        // Максимальное количество рикошетов
    RICOCHET_SPEED_RETAIN: 0.8, // Сохранение скорости при рикошете (80%)
    
    // Границы карты
    MAP_BORDER: 1000,        // Граница карты для удаления снарядов
    PROJECTILE_MAX_DISTANCE: 1200, // Максимальное расстояние для снаряда
    
    // Время жизни объектов
    SHELL_CASING_LIFETIME: 5000, // Время жизни гильзы (5 секунд)
    PROJECTILE_LIFETIME: 6000,   // Время жизни снаряда (6 секунд)
    
    // Гильзы
    SHELL_CASING_DIAMETER_MULTIPLIER: 1.0,    // Диаметр гильзы = размер снаряда
    SHELL_CASING_LENGTH_MULTIPLIER: 3.0,      // Длина гильзы = размер снаряда * 3
    SHELL_CASING_POSITION_OFFSET: 0.3,        // Смещение гильзы назад от дула
    SHELL_CASING_SIDE_OFFSET: 0.2,            // Смещение гильзы вбок
    SHELL_CASING_MASS: 0.1,                   // Масса гильзы
    SHELL_CASING_LINEAR_DAMPING: 0.5,         // Линейное затухание
    SHELL_CASING_ANGULAR_DAMPING: 0.8,        // Угловое затухание
    SHELL_CASING_EJECT_SPEED_MIN: 1.5,        // Минимальная скорость выброса (уменьшено)
    SHELL_CASING_EJECT_SPEED_MAX: 3,          // Максимальная скорость выброса (уменьшено)
    SHELL_CASING_ROTATION_MULTIPLIER: 3,      // Множитель случайного вращения (уменьшено)
    SHELL_CASING_PHYSICS_EXTENT_MULTIPLIER: 0.75, // Размер физического тела гильзы
    SHELL_CASING_PHYSICS_HEIGHT_MULTIPLIER: 0.5,  // Высота физического тела гильзы
    SHELL_CASING_FILTER_MEMBERSHIP_MASK: 64,  // Группа фильтра гильз
    SHELL_CASING_FILTER_COLLIDE_MASK: 2,      // Маска коллизий гильз
    SHELL_CASING_DISPOSE_Y_THRESHOLD: -1,     // Порог Y для удаления гильзы
    
    // Отдача
    BARREL_RECOIL_SPEED: 0.3,    // Скорость возврата пушки
    BARREL_RECOIL_AMOUNT: -1.6,  // Величина отката пушки
    RECOIL_FORCE: 2500,          // Сила отдачи
    RECOIL_TORQUE: 10000,        // Сила угловой отдачи
} as const;

// Типы для констант
export type TankConstants = typeof TANK_CONSTANTS;


