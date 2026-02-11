/**
 * @module hud/MultiplayerHUD
 * @description Менеджер мультиплеерного HUD - скорборд, Battle Royale, CTF и другие режимы
 * 
 * Этот модуль содержит:
 * - Конфигурацию мультиплеерного UI
 * - Типы для игровых режимов
 * - Вспомогательные функции для форматирования
 */

import { Rectangle, TextBlock, StackPanel, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

// ============================================
// ТИПЫ ИГРОВЫХ РЕЖИМОВ
// ============================================

export type GameModeType = "ffa" | "tdm" | "coop" | "battle_royale" | "ctf";

export interface TeamData {
    id: string;
    name: string;
    color: string;
    score: number;
    players: PlayerScoreData[];
}

export interface PlayerScoreData {
    id: string;
    name: string;
    kills: number;
    deaths: number;
    score: number;
    ping?: number;
    team?: string;
    isLocal?: boolean;
}

// ============================================
// BATTLE ROYALE ТИПЫ
// ============================================

export interface BattleRoyaleInfo {
    phase: "waiting" | "shrinking" | "stable" | "final";
    playersAlive: number;
    totalPlayers: number;
    zoneRadius: number;
    nextZoneRadius: number;
    timeUntilShrink: number;
    isInZone: boolean;
    distanceToZone: number;
    damagePerSecond: number;
}

export interface BattleRoyaleConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    safeColor: string;
    dangerColor: string;
    warningColor: string;
}

export const DEFAULT_BR_CONFIG: BattleRoyaleConfig = {
    containerWidth: 250,
    containerHeight: 120,
    backgroundColor: "rgba(0, 20, 0, 0.8)",
    safeColor: "#00ff00",
    dangerColor: "#ff0000",
    warningColor: "#ffff00"
};

// ============================================
// CTF ТИПЫ
// ============================================

export interface CTFState {
    redFlagStatus: "base" | "carried" | "dropped";
    blueFlagStatus: "base" | "carried" | "dropped";
    redFlagCarrier?: string;
    blueFlagCarrier?: string;
    redScore: number;
    blueScore: number;
    maxScore: number;
}

export interface CTFConfig {
    flagIconSize: number;
    scoreSize: number;
    containerWidth: number;
}

export const DEFAULT_CTF_CONFIG: CTFConfig = {
    flagIconSize: 32,
    scoreSize: 48,
    containerWidth: 300
};

// ============================================
// SCOREBOARD КОНФИГУРАЦИЯ
// ============================================

export interface ScoreboardConfig {
    maxVisiblePlayers: number;
    rowHeight: number;
    headerHeight: number;
    width: number;
    backgroundColor: string;
    headerColor: string;
    localPlayerColor: string;
    alternateRowColor: string;
}

export const DEFAULT_SCOREBOARD_CONFIG: ScoreboardConfig = {
    maxVisiblePlayers: 10,
    rowHeight: 24,
    headerHeight: 32,
    width: 400,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    headerColor: "rgba(0, 40, 0, 0.9)",
    localPlayerColor: "rgba(0, 100, 0, 0.5)",
    alternateRowColor: "rgba(0, 20, 0, 0.3)"
};

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Форматирует K/D ratio
 */
export function formatKDRatio(kills: number, deaths: number): string {
    if (deaths === 0) return kills > 0 ? `${kills}.00` : "0.00";
    return (kills / deaths).toFixed(2);
}

/**
 * Форматирует время в MM:SS
 */
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Форматирует расстояние
 */
export function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Получает цвет команды
 */
export function getTeamColor(team: string): string {
    switch (team.toLowerCase()) {
        case "red": return "#ff4444";
        case "blue": return "#4444ff";
        case "green": return "#44ff44";
        case "yellow": return "#ffff44";
        default: return "#ffffff";
    }
}

/**
 * Сортирует игроков по счёту
 */
export function sortPlayersByScore(players: PlayerScoreData[]): PlayerScoreData[] {
    return [...players].sort((a, b) => {
        // Сначала по счёту
        if (b.score !== a.score) return b.score - a.score;
        // Затем по убийствам
        if (b.kills !== a.kills) return b.kills - a.kills;
        // Затем по смертям (меньше лучше)
        return a.deaths - b.deaths;
    });
}

/**
 * Получает позицию игрока в рейтинге
 */
export function getPlayerRank(playerId: string, players: PlayerScoreData[]): number {
    const sorted = sortPlayersByScore(players);
    const index = sorted.findIndex(p => p.id === playerId);
    return index + 1;
}

/**
 * Форматирует статус флага для CTF
 */
export function formatFlagStatus(status: "base" | "carried" | "dropped", carrierName?: string): string {
    switch (status) {
        case "base": return "🏠 At Base";
        case "carried": return carrierName ? `🏃 ${carrierName}` : "🏃 Carried";
        case "dropped": return "⚠️ Dropped";
        default: return "❓ Unknown";
    }
}

/**
 * Получает цвет статуса зоны BR
 */
export function getBRZoneColor(isInZone: boolean, damagePerSecond: number, config: BattleRoyaleConfig = DEFAULT_BR_CONFIG): string {
    if (isInZone) return config.safeColor;
    if (damagePerSecond > 10) return config.dangerColor;
    return config.warningColor;
}

/**
 * Форматирует статус зоны BR
 */
export function getBRZoneStatus(info: BattleRoyaleInfo): string {
    if (info.isInZone) {
        if (info.phase === "shrinking") {
            return `SAFE - Shrinking in ${formatTime(info.timeUntilShrink)}`;
        }
        return "SAFE ZONE";
    }
    return `DANGER! ${info.damagePerSecond}/s`;
}

// ============================================
// КЛАСС МЕНЕДЖЕРА
// ============================================

/**
 * Менеджер мультиплеерного HUD
 */
export class MultiplayerHUDManager {
    private guiTexture: AdvancedDynamicTexture | null = null;
    private scoreboardConfig: ScoreboardConfig;
    private brConfig: BattleRoyaleConfig;
    private ctfConfig: CTFConfig;
    
    private currentGameMode: GameModeType = "ffa";
    private players: PlayerScoreData[] = [];
    private teams: TeamData[] = [];
    
    constructor(
        scoreboardConfig: Partial<ScoreboardConfig> = {},
        brConfig: Partial<BattleRoyaleConfig> = {},
        ctfConfig: Partial<CTFConfig> = {}
    ) {
        this.scoreboardConfig = { ...DEFAULT_SCOREBOARD_CONFIG, ...scoreboardConfig };
        this.brConfig = { ...DEFAULT_BR_CONFIG, ...brConfig };
        this.ctfConfig = { ...DEFAULT_CTF_CONFIG, ...ctfConfig };
    }
    
    /**
     * Инициализация
     */
    initialize(guiTexture: AdvancedDynamicTexture): void {
        this.guiTexture = guiTexture;
    }
    
    /**
     * Установить игровой режим
     */
    setGameMode(mode: GameModeType): void {
        this.currentGameMode = mode;
    }
    
    /**
     * Получить текущий игровой режим
     */
    getGameMode(): GameModeType {
        return this.currentGameMode;
    }
    
    /**
     * Обновить список игроков
     */
    updatePlayers(players: PlayerScoreData[]): void {
        this.players = players;
    }
    
    /**
     * Обновить команды
     */
    updateTeams(teams: TeamData[]): void {
        this.teams = teams;
    }
    
    /**
     * Получить отсортированных игроков
     */
    getSortedPlayers(): PlayerScoreData[] {
        return sortPlayersByScore(this.players);
    }
    
    /**
     * Получить позицию локального игрока
     */
    getLocalPlayerRank(localPlayerId: string): number {
        return getPlayerRank(localPlayerId, this.players);
    }
    
    /**
     * Проверить, нужен ли HUD для текущего режима
     */
    needsTeamScoreboard(): boolean {
        return this.currentGameMode === "tdm" || this.currentGameMode === "ctf";
    }
    
    /**
     * Проверить, нужен ли BR HUD
     */
    needsBattleRoyaleHUD(): boolean {
        return this.currentGameMode === "battle_royale";
    }
    
    /**
     * Проверить, нужен ли CTF HUD
     */
    needsCTFHUD(): boolean {
        return this.currentGameMode === "ctf";
    }
    
    /**
     * Получить конфигурацию скорборда
     */
    getScoreboardConfig(): ScoreboardConfig {
        return { ...this.scoreboardConfig };
    }
    
    /**
     * Получить конфигурацию BR
     */
    getBRConfig(): BattleRoyaleConfig {
        return { ...this.brConfig };
    }
    
    /**
     * Получить конфигурацию CTF
     */
    getCTFConfig(): CTFConfig {
        return { ...this.ctfConfig };
    }
    
    /**
     * Очистить состояние
     */
    dispose(): void {
        this.players = [];
        this.teams = [];
        this.guiTexture = null;
    }
}

export default MultiplayerHUDManager;

