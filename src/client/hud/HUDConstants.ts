/**
 * Константы для HUD системы
 */

/**
 * Цвета HUD
 */
export const HUD_COLORS = {
    // Основные
    PRIMARY: "#00ff00",
    SECONDARY: "#0f0",
    ACCENT: "#00ffff",
    WARNING: "#ffff00",
    DANGER: "#ff0000",
    
    // Фоны
    BG_DARK: "#000000",
    BG_PANEL: "#0a0a0a",
    BG_OVERLAY: "rgba(0, 0, 0, 0.8)",
    
    // Здоровье
    HEALTH_FULL: "#00ff00",
    HEALTH_MEDIUM: "#ffff00",
    HEALTH_LOW: "#ff0000",
    HEALTH_CRITICAL: "#ff0000",
    
    // Арсенал
    ARSENAL_ACTIVE: "#00ff00",
    ARSENAL_INACTIVE: "#666666",
    ARSENAL_COOLDOWN: "#ff6600",
    
    // Типы боеприпасов
    AMMO_TRACER: "#f80",
    AMMO_AP: "#0ff",
    AMMO_APCR: "#0af",
    AMMO_HE: "#f60",
    AMMO_APDS: "#0fa",
    
    // Эффекты
    EFFECT_POSITIVE: "#00ff00",
    EFFECT_NEGATIVE: "#ff0000",
    EFFECT_NEUTRAL: "#ffffff",
    
    // Миникарта
    MINIMAP_BG: "#0a0a0a",
    MINIMAP_PLAYER: "#00ff00",
    MINIMAP_ENEMY: "#ff0000",
    MINIMAP_ALLY: "#00ffff",
    MINIMAP_POI: "#ffff00",
    
    // Топливо
    FUEL_FULL: "#00cc00",
    FUEL_WARNING: "#ffcc00",
    FUEL_CRITICAL: "#ff3300",
    
    // Броня
    ARMOR_FULL: "#3399ff",
    ARMOR_DAMAGED: "#ff9900",
    
    // Прицел (дополнительные)
    crosshair: "#00ff00",
    crosshairGlow: "#00ff0066",
    hitMarker: "#ff0000",
    critical: "#ff0000",
    background: "#000000",
    border: "#00ff00",
    health: "#00ff00",
    lowHealth: "#ff0000"
};

/**
 * Размеры элементов HUD
 */
export const HUD_SIZES = {
    // Полосы
    HEALTH_BAR_WIDTH: 200,
    HEALTH_BAR_HEIGHT: 20,
    RELOAD_BAR_WIDTH: 150,
    RELOAD_BAR_HEIGHT: 8,
    
    // Миникарта
    MINIMAP_SIZE: 180,
    MINIMAP_MARGIN: 10,
    
    // Арсенал
    ARSENAL_SLOT_SIZE: 50,
    ARSENAL_SLOT_MARGIN: 5,
    
    // Прицел
    CROSSHAIR_SIZE: 20,
    CROSSHAIR_GAP: 4,
    CROSSHAIR_THICKNESS: 2,
    
    // Текст
    FONT_SIZE_SMALL: 12,
    FONT_SIZE_MEDIUM: 16,
    FONT_SIZE_LARGE: 24,
    FONT_SIZE_TITLE: 32,
    
    // Отступы
    PADDING_SMALL: 5,
    PADDING_MEDIUM: 10,
    PADDING_LARGE: 20
};

/**
 * Шрифты HUD
 */
export const HUD_FONTS = {
    PRIMARY: "'Consolas', 'Monaco', monospace",
    SECONDARY: "'Arial', sans-serif",
    DIGITAL: "'Orbitron', 'Consolas', monospace"
};

/**
 * Анимации HUD
 */
export const HUD_ANIMATIONS = {
    FADE_DURATION: 300,     // мс
    PULSE_DURATION: 500,    // мс
    HIT_MARKER_DURATION: 200, // мс
    DAMAGE_FLASH_DURATION: 150, // мс
    COMBO_FADE_DURATION: 1000 // мс
};

/**
 * Z-индексы для слоёв HUD
 */
export const HUD_Z_INDEX = {
    BACKGROUND: 0,
    MINIMAP: 10,
    BARS: 20,
    CROSSHAIR: 30,
    EFFECTS: 40,
    NOTIFICATIONS: 50,
    MODAL: 100,
    DEATH_SCREEN: 200
};

/**
 * Пороговые значения
 */
export const HUD_THRESHOLDS = {
    HEALTH_LOW: 0.3,        // 30% здоровья = низкое
    HEALTH_CRITICAL: 0.15,  // 15% здоровья = критическое
    FUEL_LOW: 0.2,          // 20% топлива = низкое
    AMMO_LOW: 3             // 3 или меньше = низкий боезапас
};

