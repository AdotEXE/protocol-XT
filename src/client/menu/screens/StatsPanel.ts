/**
 * @module menu/screens/StatsPanel
 * @description Панель статистики игрока - типы, конфигурация и вспомогательные функции
 * 
 * Этот модуль содержит:
 * - Типы для статистики игрока
 * - Вспомогательные функции для расчётов и форматирования
 * - Конфигурацию отображения статистики
 */

// ============================================
// ТИПЫ СТАТИСТИКИ
// ============================================

/**
 * Основная статистика игрока
 */
export interface PlayerStats {
    // Общая статистика
    totalBattles: number;
    victories: number;
    defeats: number;
    draws: number;
    
    // Боевая статистика
    totalKills: number;
    totalDeaths: number;
    assists: number;
    damageDealt: number;
    damageReceived: number;
    
    // Рекорды
    maxKillStreak: number;
    maxDamageInBattle: number;
    longestSurvivalTime: number;
    
    // Точность
    shotsHit: number;
    shotsMissed: number;
    criticalHits: number;
    
    // Прогресс
    totalExperience: number;
    totalCredits: number;
    playTime: number;              // В секундах
    
    // Временные метки
    firstBattleDate: number;
    lastBattleDate: number;
    
    // По типам техники
    tankStats: Map<string, TankSpecificStats>;
}

/**
 * Статистика по конкретному танку
 */
export interface TankSpecificStats {
    tankId: string;
    battles: number;
    victories: number;
    kills: number;
    deaths: number;
    damageDealt: number;
    damageReceived: number;
    accuracy: number;
    avgDamagePerBattle: number;
    avgKillsPerBattle: number;
    winRate: number;
}

/**
 * Статистика за сессию
 */
export interface SessionStats {
    battles: number;
    victories: number;
    kills: number;
    deaths: number;
    damageDealt: number;
    experienceEarned: number;
    creditsEarned: number;
    startTime: number;
}

/**
 * Статистика за период
 */
export interface PeriodStats {
    period: "day" | "week" | "month" | "all";
    battles: number;
    victories: number;
    kills: number;
    deaths: number;
    damageDealt: number;
    winRate: number;
    kd: number;
    avgDamage: number;
}

// ============================================
// ТИПЫ ДОСТИЖЕНИЙ
// ============================================

/**
 * Достижение игрока
 */
export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
    unlockedAt?: number;
    progress?: number;
    maxProgress?: number;
}

/**
 * Категория достижений
 */
export interface AchievementCategory {
    id: string;
    name: string;
    achievements: Achievement[];
}

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

/**
 * Конфигурация отображения статистики
 */
export interface StatsPanelConfig {
    primaryColor: string;
    secondaryColor: string;
    positiveColor: string;
    negativeColor: string;
    neutralColor: string;
    backgroundColor: string;
    showComparison: boolean;
    comparisonPeriod: "day" | "week" | "month";
}

export const DEFAULT_STATS_PANEL_CONFIG: StatsPanelConfig = {
    primaryColor: "#00ff00",
    secondaryColor: "#00aa00",
    positiveColor: "#00ff00",
    negativeColor: "#ff0000",
    neutralColor: "#888888",
    backgroundColor: "rgba(0, 20, 0, 0.9)",
    showComparison: true,
    comparisonPeriod: "week"
};

/**
 * Категории статистики для отображения
 */
export const STATS_CATEGORIES = [
    { id: "general", label: "Общая", icon: "📊" },
    { id: "combat", label: "Бой", icon: "⚔️" },
    { id: "records", label: "Рекорды", icon: "🏆" },
    { id: "accuracy", label: "Точность", icon: "🎯" },
    { id: "progress", label: "Прогресс", icon: "📈" },
    { id: "tanks", label: "Техника", icon: "🚀" }
] as const;

export type StatsCategoryId = typeof STATS_CATEGORIES[number]["id"];

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Вычислить процент побед
 */
export function calculateWinRate(victories: number, totalBattles: number): number {
    if (totalBattles === 0) return 0;
    return (victories / totalBattles) * 100;
}

/**
 * Вычислить K/D ratio
 */
export function calculateKD(kills: number, deaths: number): number {
    if (deaths === 0) return kills;
    return kills / deaths;
}

/**
 * Вычислить среднюю точность
 */
export function calculateAccuracy(hits: number, totalShots: number): number {
    if (totalShots === 0) return 0;
    return (hits / totalShots) * 100;
}

/**
 * Вычислить средний урон за бой
 */
export function calculateAvgDamage(totalDamage: number, battles: number): number {
    if (battles === 0) return 0;
    return totalDamage / battles;
}

/**
 * Вычислить средние убийства за бой
 */
export function calculateAvgKills(kills: number, battles: number): number {
    if (battles === 0) return 0;
    return kills / battles;
}

/**
 * Форматировать процент побед
 */
export function formatWinRate(winRate: number): string {
    return `${winRate.toFixed(1)}%`;
}

/**
 * Форматировать K/D
 */
export function formatKD(kd: number): string {
    return kd.toFixed(2);
}

/**
 * Форматировать точность
 */
export function formatAccuracy(accuracy: number): string {
    return `${accuracy.toFixed(1)}%`;
}

/**
 * Форматировать урон
 */
export function formatDamage(damage: number): string {
    if (damage >= 1000000) {
        return `${(damage / 1000000).toFixed(1)}M`;
    }
    if (damage >= 1000) {
        return `${(damage / 1000).toFixed(1)}K`;
    }
    return damage.toString();
}

/**
 * Форматировать время игры
 */
export function formatPlayTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
}

/**
 * Форматировать дату
 */
export function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

/**
 * Получить цвет для процента побед
 */
export function getWinRateColor(winRate: number, config: StatsPanelConfig = DEFAULT_STATS_PANEL_CONFIG): string {
    if (winRate >= 55) return config.positiveColor;
    if (winRate >= 48) return config.neutralColor;
    return config.negativeColor;
}

/**
 * Получить цвет для K/D
 */
export function getKDColor(kd: number, config: StatsPanelConfig = DEFAULT_STATS_PANEL_CONFIG): string {
    if (kd >= 1.5) return config.positiveColor;
    if (kd >= 1.0) return config.neutralColor;
    return config.negativeColor;
}

/**
 * Получить цвет для точности
 */
export function getAccuracyColor(accuracy: number, config: StatsPanelConfig = DEFAULT_STATS_PANEL_CONFIG): string {
    if (accuracy >= 50) return config.positiveColor;
    if (accuracy >= 35) return config.neutralColor;
    return config.negativeColor;
}

/**
 * Получить цвет редкости достижения
 */
export function getAchievementRarityColor(rarity: Achievement["rarity"]): string {
    switch (rarity) {
        case "common": return "#ffffff";
        case "uncommon": return "#00ff00";
        case "rare": return "#0088ff";
        case "epic": return "#aa00ff";
        case "legendary": return "#ffaa00";
        default: return "#888888";
    }
}

/**
 * Получить название редкости
 */
export function getAchievementRarityName(rarity: Achievement["rarity"]): string {
    const names: Record<Achievement["rarity"], string> = {
        common: "Обычное",
        uncommon: "Необычное",
        rare: "Редкое",
        epic: "Эпическое",
        legendary: "Легендарное"
    };
    return names[rarity] || "Неизвестно";
}

/**
 * Сравнить статистику за два периода
 */
export function compareStats(current: PeriodStats, previous: PeriodStats): {
    winRateDiff: number;
    kdDiff: number;
    avgDamageDiff: number;
    battlesDiff: number;
} {
    return {
        winRateDiff: current.winRate - previous.winRate,
        kdDiff: current.kd - previous.kd,
        avgDamageDiff: current.avgDamage - previous.avgDamage,
        battlesDiff: current.battles - previous.battles
    };
}

/**
 * Форматировать разницу (с + или -)
 */
export function formatDiff(diff: number, decimals: number = 1): string {
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${diff.toFixed(decimals)}`;
}

/**
 * Получить цвет для разницы
 */
export function getDiffColor(diff: number, config: StatsPanelConfig = DEFAULT_STATS_PANEL_CONFIG): string {
    if (diff > 0) return config.positiveColor;
    if (diff < 0) return config.negativeColor;
    return config.neutralColor;
}

/**
 * Сортировать танки по статистике
 */
export function sortTanksByStats(
    tanks: TankSpecificStats[],
    sortBy: keyof TankSpecificStats,
    ascending: boolean = false
): TankSpecificStats[] {
    return [...tanks].sort((a, b) => {
        const aVal = a[sortBy] as number;
        const bVal = b[sortBy] as number;
        return ascending ? aVal - bVal : bVal - aVal;
    });
}

/**
 * Фильтровать танки по минимальному количеству боёв
 */
export function filterTanksByBattles(tanks: TankSpecificStats[], minBattles: number): TankSpecificStats[] {
    return tanks.filter(t => t.battles >= minBattles);
}

/**
 * Получить топ танки по определённому показателю
 */
export function getTopTanks(
    tanks: TankSpecificStats[],
    sortBy: keyof TankSpecificStats,
    count: number = 5,
    minBattles: number = 10
): TankSpecificStats[] {
    const filtered = filterTanksByBattles(tanks, minBattles);
    const sorted = sortTanksByStats(filtered, sortBy);
    return sorted.slice(0, count);
}

/**
 * Создать пустую статистику игрока
 */
export function createEmptyPlayerStats(): PlayerStats {
    return {
        totalBattles: 0,
        victories: 0,
        defeats: 0,
        draws: 0,
        totalKills: 0,
        totalDeaths: 0,
        assists: 0,
        damageDealt: 0,
        damageReceived: 0,
        maxKillStreak: 0,
        maxDamageInBattle: 0,
        longestSurvivalTime: 0,
        shotsHit: 0,
        shotsMissed: 0,
        criticalHits: 0,
        totalExperience: 0,
        totalCredits: 0,
        playTime: 0,
        firstBattleDate: Date.now(),
        lastBattleDate: Date.now(),
        tankStats: new Map()
    };
}

/**
 * Создать пустую статистику сессии
 */
export function createEmptySessionStats(): SessionStats {
    return {
        battles: 0,
        victories: 0,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        experienceEarned: 0,
        creditsEarned: 0,
        startTime: Date.now()
    };
}

export default {
    STATS_CATEGORIES,
    DEFAULT_STATS_PANEL_CONFIG
};

