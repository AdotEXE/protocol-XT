// Константы для системы танка
// Вынесены из кода для улучшения читаемости и поддержки

export const TANK_CONSTANTS = {
    // Защита от урона
    INVULNERABILITY_DURATION: 3000, // 3 секунды защиты после респавна
    
    // Топливо
    FUEL_CONSUMPTION_RATE: 0.5, // Литров в секунду при движении
    
    // Снижение урона
    SHIELD_DAMAGE_REDUCTION: 0.5, // Щит снижает урон на 50%
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
    
    // Отдача
    BARREL_RECOIL_SPEED: 0.3,    // Скорость возврата пушки
    BARREL_RECOIL_AMOUNT: -1.6,  // Величина отката пушки
    RECOIL_FORCE: 2500,          // Сила отдачи
    RECOIL_TORQUE: 10000,        // Сила угловой отдачи
} as const;

// Типы для констант
export type TankConstants = typeof TANK_CONSTANTS;

