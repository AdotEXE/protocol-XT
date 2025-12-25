// ═══════════════════════════════════════════════════════════════════════════
// GAME PERSISTENCE - Сохранение и загрузка данных игры
// ═══════════════════════════════════════════════════════════════════════════

import { Timestamp } from "firebase/firestore";
import { logger } from "../utils/logger";
import { firebaseService, type MatchHistory } from "../firebaseService";
import type { MultiplayerManager } from "../multiplayer";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { CurrencyManager } from "../currencyManager";
import type { ConsumablesManager } from "../consumables";
import type { MissionSystem } from "../missionSystem";
import type { AchievementsSystem } from "../achievements";

/**
 * GamePersistence - Сохранение и загрузка данных игры
 * 
 * Отвечает за:
 * - Сохранение статистики матчей в Firebase
 * - Автосохранение при закрытии окна
 * - Сохранение всех данных игры
 */
export class GamePersistence {
    // Ссылки на системы
    protected multiplayerManager: MultiplayerManager | undefined;
    protected playerProgression: PlayerProgressionSystem | undefined;
    protected currencyManager: CurrencyManager | undefined;
    protected consumablesManager: ConsumablesManager | undefined;
    protected missionSystem: MissionSystem | undefined;
    protected achievementsSystem: AchievementsSystem | undefined;
    
    /**
     * Инициализация системы сохранения
     */
    initialize(
        multiplayerManager?: MultiplayerManager,
        playerProgression?: PlayerProgressionSystem,
        currencyManager?: CurrencyManager,
        consumablesManager?: ConsumablesManager,
        missionSystem?: MissionSystem,
        achievementsSystem?: AchievementsSystem
    ): void {
        this.multiplayerManager = multiplayerManager;
        this.playerProgression = playerProgression;
        this.currencyManager = currencyManager;
        this.consumablesManager = consumablesManager;
        this.missionSystem = missionSystem;
        this.achievementsSystem = achievementsSystem;
        
        // Настраиваем автосохранение при закрытии окна
        this.setupAutoSaveOnUnload();
        
        logger.log("[GamePersistence] Persistence system initialized");
    }
    
    /**
     * Сохранение статистики матча
     */
    async saveMatchStatistics(matchData: any): Promise<void> {
        if (!firebaseService.isInitialized()) {
            logger.warn("[GamePersistence] Firebase not initialized, skipping match statistics save");
            return;
        }
        
        try {
            const playerId = firebaseService.getUserId();
            if (!playerId) {
                logger.warn("[GamePersistence] No user ID, skipping match statistics save");
                return;
            }
            
            // Получаем текущую статистику игрока
            const currentStats = await firebaseService.getPlayerStats();
            if (!currentStats) {
                logger.warn("[GamePersistence] Could not get current stats");
                return;
            }
            
            // Получаем данные игрока из матча
            const players = matchData.players || [];
            const localPlayer = players.find((p: any) => p.id === this.multiplayerManager?.getPlayerId());
            
            if (!localPlayer) {
                logger.warn("[GamePersistence] Local player not found in match data");
                return;
            }
            
            // Вычисляем длительность матча
            const matchDuration = matchData.duration || (Date.now() - (matchData.startTime || Date.now())) / 1000;
            
            // Определяем результат матча
            const isWinner = matchData.winner === localPlayer.id || 
                            (matchData.winnerTeam && matchData.winnerTeam === localPlayer.team);
            const result: "win" | "loss" | "draw" = isWinner ? "win" : 
                                                      matchData.winner ? "loss" : "draw";
            
            // Обновляем статистику
            const statsUpdates: any = {
                kills: currentStats.kills + (localPlayer.kills || 0),
                deaths: currentStats.deaths + (localPlayer.deaths || 0),
                assists: currentStats.assists + (localPlayer.assists || 0),
                matchesPlayed: currentStats.matchesPlayed + 1,
                timePlayed: currentStats.timePlayed + matchDuration,
                shotsFired: currentStats.shotsFired + (localPlayer.shotsFired || 0),
                shotsHit: currentStats.shotsHit + (localPlayer.shotsHit || 0),
                damageDealt: currentStats.damageDealt + (localPlayer.damageDealt || 0),
                damageTaken: currentStats.damageTaken + (localPlayer.damageTaken || 0),
            };
            
            // Обновляем победы/поражения
            if (result === "win") {
                statsUpdates.wins = currentStats.wins + 1;
                const mode = matchData.mode || "ffa";
                if (mode === "ffa") statsUpdates.ffaWins = (currentStats.ffaWins || 0) + 1;
                else if (mode === "tdm") statsUpdates.tdmWins = (currentStats.tdmWins || 0) + 1;
                else if (mode === "coop") statsUpdates.coopWins = (currentStats.coopWins || 0) + 1;
                else if (mode === "battle_royale") statsUpdates.brWins = (currentStats.brWins || 0) + 1;
                else if (mode === "capture_flag") statsUpdates.ctfWins = (currentStats.ctfWins || 0) + 1;
            } else if (result === "loss") {
                statsUpdates.losses = currentStats.losses + 1;
            } else {
                statsUpdates.draws = currentStats.draws + 1;
            }
            
            // Обновляем серию убийств
            if (localPlayer.kills > 0) {
                const newStreak = (currentStats.currentKillStreak || 0) + localPlayer.kills;
                statsUpdates.currentKillStreak = newStreak;
                if (newStreak > (currentStats.longestKillStreak || 0)) {
                    statsUpdates.longestKillStreak = newStreak;
                }
            } else {
                statsUpdates.currentKillStreak = 0;
            }
            
            // Сохраняем обновлённую статистику
            await firebaseService.updatePlayerStats(statsUpdates);
            
            // Сохраняем историю матча
            const matchHistory: MatchHistory = {
                matchId: matchData.matchId || `match_${Date.now()}`,
                mode: matchData.mode || "ffa",
                result: result,
                kills: localPlayer.kills || 0,
                deaths: localPlayer.deaths || 0,
                assists: localPlayer.assists || 0,
                damageDealt: localPlayer.damageDealt || 0,
                damageTaken: localPlayer.damageTaken || 0,
                duration: matchDuration,
                timestamp: Timestamp.fromMillis(Date.now()),
                players: players.length,
                team: localPlayer.team
            };
            
            await firebaseService.saveMatchHistory(matchHistory);
            
            logger.log("[GamePersistence] Match statistics saved to Firebase");
        } catch (error) {
            logger.error("[GamePersistence] Failed to save match statistics:", error);
        }
    }
    
    /**
     * Настройка автосохранения при закрытии окна
     */
    setupAutoSaveOnUnload(): void {
        // Сохраняем данные при закрытии окна
        window.addEventListener("beforeunload", () => {
            this.saveAllGameData();
        });
        
        // Также сохраняем при потере фокуса (опционально)
        window.addEventListener("blur", () => {
            // Можно добавить автосохранение при потере фокуса
            // this.saveAllGameData();
        });
        
        logger.log("[GamePersistence] Auto-save on unload configured");
    }
    
    /**
     * Сохранение всех данных игры
     */
    saveAllGameData(): void {
        try {
            // Сохраняем прогресс игрока
            if (this.playerProgression) {
                const stats = this.playerProgression.getStats();
                localStorage.setItem("playerProgression", JSON.stringify(stats));
            }
            
            // Сохраняем валюту
            if (this.currencyManager) {
                const currency = this.currencyManager.getCurrency();
                localStorage.setItem("playerCurrency", currency.toString());
            }
            
            // Сохраняем припасы
            if (this.consumablesManager) {
                const consumables = this.consumablesManager.getAll();
                localStorage.setItem("playerConsumables", JSON.stringify(consumables));
            }
            
            // Сохраняем миссии
            if (this.missionSystem) {
                const missions = this.missionSystem.getAllMissions();
                localStorage.setItem("playerMissions", JSON.stringify(missions));
            }
            
            // Сохраняем достижения
            if (this.achievementsSystem) {
                const achievements = this.achievementsSystem.getAllAchievements();
                localStorage.setItem("playerAchievements", JSON.stringify(achievements));
            }
            
            logger.log("[GamePersistence] All game data saved to localStorage");
        } catch (error) {
            logger.error("[GamePersistence] Failed to save game data:", error);
        }
    }
    
    /**
     * Загрузка всех данных игры
     */
    loadAllGameData(): {
        progression?: any;
        currency?: number;
        consumables?: any[];
        missions?: any[];
        achievements?: any[];
    } {
        const data: any = {};
        
        try {
            // Загружаем прогресс игрока
            const progressionData = localStorage.getItem("playerProgression");
            if (progressionData) {
                data.progression = JSON.parse(progressionData);
            }
            
            // Загружаем валюту
            const currencyData = localStorage.getItem("playerCurrency");
            if (currencyData) {
                data.currency = parseInt(currencyData, 10);
            }
            
            // Загружаем припасы
            const consumablesData = localStorage.getItem("playerConsumables");
            if (consumablesData) {
                data.consumables = JSON.parse(consumablesData);
            }
            
            // Загружаем миссии
            const missionsData = localStorage.getItem("playerMissions");
            if (missionsData) {
                data.missions = JSON.parse(missionsData);
            }
            
            // Загружаем достижения
            const achievementsData = localStorage.getItem("playerAchievements");
            if (achievementsData) {
                data.achievements = JSON.parse(achievementsData);
            }
            
            logger.log("[GamePersistence] All game data loaded from localStorage");
        } catch (error) {
            logger.error("[GamePersistence] Failed to load game data:", error);
        }
        
        return data;
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        multiplayerManager?: MultiplayerManager;
        playerProgression?: PlayerProgressionSystem;
        currencyManager?: CurrencyManager;
        consumablesManager?: ConsumablesManager;
        missionSystem?: MissionSystem;
        achievementsSystem?: AchievementsSystem;
    }): void {
        if (callbacks.multiplayerManager !== undefined) this.multiplayerManager = callbacks.multiplayerManager;
        if (callbacks.playerProgression !== undefined) this.playerProgression = callbacks.playerProgression;
        if (callbacks.currencyManager !== undefined) this.currencyManager = callbacks.currencyManager;
        if (callbacks.consumablesManager !== undefined) this.consumablesManager = callbacks.consumablesManager;
        if (callbacks.missionSystem !== undefined) this.missionSystem = callbacks.missionSystem;
        if (callbacks.achievementsSystem !== undefined) this.achievementsSystem = callbacks.achievementsSystem;
    }
    
    /**
     * Dispose системы сохранения
     */
    dispose(): void {
        this.multiplayerManager = undefined;
        this.playerProgression = undefined;
        this.currencyManager = undefined;
        this.consumablesManager = undefined;
        this.missionSystem = undefined;
        this.achievementsSystem = undefined;
        
        logger.log("[GamePersistence] Persistence system disposed");
    }
}

