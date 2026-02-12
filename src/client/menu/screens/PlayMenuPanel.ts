/**
 * @module menu/screens/PlayMenuPanel
 * @description Панель выбора режима игры - типы, конфигурация и вспомогательные функции
 * 
 * Этот модуль содержит:
 * - Типы игровых режимов
 * - Конфигурацию матчмейкинга
 * - Вспомогательные функции для работы с режимами
 */

// ============================================
// ТИПЫ ИГРОВЫХ РЕЖИМОВ
// ============================================

/**
 * Тип игрового режима
 */
export type GameModeId = 
    | "singleplayer"
    | "coop"
    | "multiplayer_ffa"
    | "multiplayer_tdm"
    | "multiplayer_ctf"
    | "multiplayer_br"
    | "multiplayer_control"
    | "multiplayer_escort"
    | "survival"
    | "raid"
    | "training";

/**
 * Категория игрового режима
 */
export type GameModeCategory = "singleplayer" | "coop" | "multiplayer" | "special";

/**
 * Игровой режим
 */
export interface GameMode {
    id: GameModeId;
    name: string;
    description: string;
    category: GameModeCategory;
    icon: string;
    minPlayers: number;
    maxPlayers: number;
    teamBased: boolean;
    ranked: boolean;
    available: boolean;
    comingSoon?: boolean;
    requirements?: GameModeRequirement[];
}

/**
 * Требование для режима
 */
export interface GameModeRequirement {
    type: "level" | "tank" | "achievement" | "premium";
    value: string | number;
    description: string;
}

// ============================================
// СПИСОК РЕЖИМОВ
// ============================================

export const GAME_MODES: GameMode[] = [
    {
        id: "singleplayer",
        name: "Одиночная игра",
        description: "Бой против AI противников",
        category: "singleplayer",
        icon: "🎮",
        minPlayers: 1,
        maxPlayers: 1,
        teamBased: false,
        ranked: false,
        available: true
    },
    {
        id: "coop",
        name: "Кооператив",
        description: "Совместная игра против AI",
        category: "coop",
        icon: "👥",
        minPlayers: 2,
        maxPlayers: 4,
        teamBased: true,
        ranked: false,
        available: true
    },
    {
        id: "multiplayer_ffa",
        name: "Все против всех",
        description: "Свободная битва, каждый сам за себя",
        category: "multiplayer",
        icon: "⚔️",
        minPlayers: 2,
        maxPlayers: 16,
        teamBased: false,
        ranked: true,
        available: true
    },
    {
        id: "multiplayer_tdm",
        name: "Командный бой",
        description: "Команда против команды",
        category: "multiplayer",
        icon: "🎯",
        minPlayers: 4,
        maxPlayers: 20,
        teamBased: true,
        ranked: true,
        available: true
    },
    {
        id: "multiplayer_ctf",
        name: "Захват флага",
        description: "Захватите флаг противника и защитите свой",
        category: "multiplayer",
        icon: "🏁",
        minPlayers: 4,
        maxPlayers: 16,
        teamBased: true,
        ranked: true,
        available: true
    },
    {
        id: "multiplayer_br",
        name: "Королевская битва",
        description: "Выживите в сужающейся зоне",
        category: "multiplayer",
        icon: "👑",
        minPlayers: 10,
        maxPlayers: 50,
        teamBased: false,
        ranked: true,
        available: false, // КРИТИЧНО: Режим в разработке
        comingSoon: true
    },
    {
        id: "multiplayer_control",
        name: "Контрольные точки",
        description: "Захватывайте и удерживайте точки",
        category: "multiplayer",
        icon: "🔲",
        minPlayers: 4,
        maxPlayers: 20,
        teamBased: true,
        ranked: true,
        available: true
    },
    {
        id: "multiplayer_escort",
        name: "Сопровождение",
        description: "Защищайте или атакуйте конвой",
        category: "multiplayer",
        icon: "🚛",
        minPlayers: 4,
        maxPlayers: 16,
        teamBased: true,
        ranked: false,
        available: true
    },
    {
        id: "survival",
        name: "Выживание",
        description: "Отбивайте волны врагов как можно дольше",
        category: "special",
        icon: "🛡️",
        minPlayers: 1,
        maxPlayers: 4,
        teamBased: true,
        ranked: false,
        available: true
    },
    {
        id: "raid",
        name: "Рейд",
        description: "Сложные боссы и награды",
        category: "special",
        icon: "🐉",
        minPlayers: 4,
        maxPlayers: 8,
        teamBased: true,
        ranked: false,
        available: true,
        requirements: [
            { type: "level", value: 10, description: "Требуется 10 уровень" }
        ]
    },
    {
        id: "training",
        name: "Тренировка",
        description: "Обучение и тестирование",
        category: "singleplayer",
        icon: "📚",
        minPlayers: 1,
        maxPlayers: 1,
        teamBased: false,
        ranked: false,
        available: true
    }
];

// ============================================
// КАТЕГОРИИ РЕЖИМОВ
// ============================================

export const MODE_CATEGORIES = [
    { id: "singleplayer", name: "Одиночная", icon: "🎮" },
    { id: "coop", name: "Кооператив", icon: "👥" },
    { id: "multiplayer", name: "Мультиплеер", icon: "🌐" },
    { id: "special", name: "Особые", icon: "⭐" }
] as const;

// ============================================
// КОНФИГУРАЦИЯ МАТЧМЕЙКИНГА
// ============================================

export interface MatchmakingConfig {
    maxWaitTime: number;          // Максимальное время ожидания (мс)
    searchRadius: number;         // Радиус поиска по рейтингу
    expandIntervalMs: number;     // Интервал расширения поиска
    expandStep: number;           // Шаг расширения рейтинга
    maxExpansions: number;        // Макс. количество расширений
    minPlayersToStart: number;    // Мин. игроков для старта
    fillWithBots: boolean;        // Заполнять ботами
    regionPriority: string[];     // Приоритет регионов
}

export const DEFAULT_MATCHMAKING_CONFIG: MatchmakingConfig = {
    maxWaitTime: 180000,          // 3 минуты
    searchRadius: 100,
    expandIntervalMs: 15000,
    expandStep: 50,
    maxExpansions: 5,
    minPlayersToStart: 4,
    fillWithBots: true,
    regionPriority: ["ru", "eu", "auto"]
};

// ============================================
// СТАТУС МАТЧМЕЙКИНГА
// ============================================

export type MatchmakingStatus = 
    | "idle"
    | "searching"
    | "found"
    | "joining"
    | "error"
    | "cancelled";

export interface MatchmakingState {
    status: MatchmakingStatus;
    mode: GameModeId | null;
    startTime: number;
    playersFound: number;
    playersNeeded: number;
    estimatedWait: number;
    currentRegion: string;
    errorMessage?: string;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Получить режим по ID
 */
export function getGameMode(id: GameModeId): GameMode | undefined {
    return GAME_MODES.find(mode => mode.id === id);
}

/**
 * Получить режимы по категории
 */
export function getModesByCategory(category: GameModeCategory): GameMode[] {
    return GAME_MODES.filter(mode => mode.category === category);
}

/**
 * Получить доступные режимы
 */
export function getAvailableModes(): GameMode[] {
    return GAME_MODES.filter(mode => mode.available && !mode.comingSoon);
}

/**
 * Получить ранговые режимы
 */
export function getRankedModes(): GameMode[] {
    return GAME_MODES.filter(mode => mode.ranked && mode.available);
}

/**
 * Проверить требования режима
 */
export function checkModeRequirements(
    mode: GameMode,
    playerLevel: number,
    unlockedTanks: string[],
    achievements: string[],
    isPremium: boolean
): { canPlay: boolean; missingRequirements: GameModeRequirement[] } {
    if (!mode.requirements || mode.requirements.length === 0) {
        return { canPlay: true, missingRequirements: [] };
    }
    
    const missing: GameModeRequirement[] = [];
    
    for (const req of mode.requirements) {
        switch (req.type) {
            case "level":
                if (playerLevel < (req.value as number)) {
                    missing.push(req);
                }
                break;
            case "tank":
                if (!unlockedTanks.includes(req.value as string)) {
                    missing.push(req);
                }
                break;
            case "achievement":
                if (!achievements.includes(req.value as string)) {
                    missing.push(req);
                }
                break;
            case "premium":
                if (!isPremium) {
                    missing.push(req);
                }
                break;
        }
    }
    
    return { canPlay: missing.length === 0, missingRequirements: missing };
}

/**
 * Форматировать время ожидания
 */
export function formatWaitTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `0:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Получить оценку времени ожидания
 */
export function getEstimatedWaitTime(mode: GameModeId, playerCount: number): number {
    // Базовое время
    let baseTime = 30000; // 30 секунд
    
    // Множитель по режиму
    const modeMultipliers: Partial<Record<GameModeId, number>> = {
        "multiplayer_br": 2.0,
        "raid": 2.5,
        "multiplayer_ffa": 0.8,
        "multiplayer_tdm": 1.0
    };
    
    const multiplier = modeMultipliers[mode] || 1.0;
    
    // Множитель по количеству игроков онлайн
    const playerMultiplier = playerCount > 100 ? 0.5 : playerCount > 50 ? 0.8 : 1.2;
    
    return Math.round(baseTime * multiplier * playerMultiplier);
}

/**
 * Создать начальное состояние матчмейкинга
 */
export function createInitialMatchmakingState(): MatchmakingState {
    return {
        status: "idle",
        mode: null,
        startTime: 0,
        playersFound: 0,
        playersNeeded: 0,
        estimatedWait: 0,
        currentRegion: "auto"
    };
}

/**
 * Получить описание статуса матчмейкинга
 */
export function getMatchmakingStatusText(state: MatchmakingState): string {
    switch (state.status) {
        case "idle":
            return "Готов к поиску";
        case "searching":
            return `Поиск... (${state.playersFound}/${state.playersNeeded})`;
        case "found":
            return "Игра найдена!";
        case "joining":
            return "Подключение...";
        case "error":
            return state.errorMessage || "Ошибка";
        case "cancelled":
            return "Поиск отменён";
        default:
            return "";
    }
}

/**
 * Получить цвет статуса матчмейкинга
 */
export function getMatchmakingStatusColor(status: MatchmakingStatus): string {
    switch (status) {
        case "idle": return "#888888";
        case "searching": return "#ffff00";
        case "found": return "#00ff00";
        case "joining": return "#00aaff";
        case "error": return "#ff0000";
        case "cancelled": return "#ff8800";
        default: return "#ffffff";
    }
}

export default {
    GAME_MODES,
    MODE_CATEGORIES,
    DEFAULT_MATCHMAKING_CONFIG
};

