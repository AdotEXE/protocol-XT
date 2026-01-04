// ═══════════════════════════════════════════════════════════════════════════
// GAME STATS - Overlay статистики (Tab key)
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { ExperienceSystem } from "../experienceSystem";
import type { CurrencyManager } from "../currencyManager";
import type { RealtimeStatsTracker } from "../realtimeStats";
import type { MultiplayerManager } from "../multiplayer";
import type { EnemyTank } from "../enemyTank";
import type { EnemyManager } from "../enemy";

/**
 * Интерфейс для доступа к системам игры
 */
export interface StatsSystemsAccess {
    playerProgression?: PlayerProgressionSystem;
    experienceSystem?: ExperienceSystem;
    currencyManager?: CurrencyManager;
    realtimeStatsTracker?: RealtimeStatsTracker;
    multiplayerManager?: MultiplayerManager;
    enemyTanks: EnemyTank[];
    enemyManager?: EnemyManager;
    getIsMultiplayer: () => boolean; // Геттер для актуального значения isMultiplayer
    currentMapType?: string;
}

/**
 * GameStats - Overlay статистики
 * 
 * Отвечает за:
 * - Отображение K/D, убийств, смертей, кредитов
 * - Лидерборд в мультиплеере
 * - Список ботов в одиночной игре
 */
export class GameStats {
    private statsOverlay: HTMLDivElement | null = null;
    private statsOverlayVisible = false;
    private systems: StatsSystemsAccess | null = null;
    
    /**
     * Инициализация
     */
    initialize(systems: StatsSystemsAccess): void {
        this.systems = systems;
        logger.log("[GameStats] Initialized");
    }
    
    /**
     * Обновление ссылок на системы
     */
    updateSystems(systems: StatsSystemsAccess): void {
        this.systems = systems;
    }
    
    /**
     * Показать overlay статистики (Tab зажат)
     */
    show(): void {
        if (!this.statsOverlay) {
            this.createOverlay();
        }
        
        if (this.statsOverlay && !this.statsOverlayVisible) {
            this.statsOverlayVisible = true;
            this.statsOverlay.style.display = "flex";
            this.statsOverlay.style.visibility = "visible";
            this.update();
        }
    }
    
    /**
     * Скрыть overlay статистики (Tab отпущен)
     */
    hide(): void {
        if (this.statsOverlay) {
            this.statsOverlayVisible = false;
            this.statsOverlay.style.display = "none";
            this.statsOverlay.style.visibility = "hidden";
        }
    }
    
    /**
     * Проверка видимости
     */
    isVisible(): boolean {
        return this.statsOverlayVisible;
    }
    
    /**
     * Создание overlay
     */
    private createOverlay(): void {
        // Удаляем старый overlay
        const existing = document.getElementById("stats-overlay");
        if (existing) {
            existing.remove();
        }
        
        this.statsOverlay = document.createElement("div");
        this.statsOverlay.id = "stats-overlay";
        this.statsOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.75);
            display: none;
            justify-content: center;
            align-items: flex-start;
            padding-top: 60px;
            z-index: 5000;
            font-family: 'Courier New', monospace;
            visibility: hidden;
        `;
        
        const content = document.createElement("div");
        content.id = "scoreboard-content";
        content.style.cssText = `
            background: linear-gradient(180deg, #0a0a0a 0%, #111 100%);
            border: 1px solid #0f04;
            min-width: 700px;
            max-width: 900px;
        `;
        
        this.statsOverlay.appendChild(content);
        document.body.appendChild(this.statsOverlay);
        
        this.statsOverlayVisible = false;
    }
    
    /**
     * Обновление содержимого overlay
     */
    update(): void {
        if (!this.statsOverlay || !this.systems) return;
        
        const content = document.getElementById("scoreboard-content");
        if (!content) return;
        
        // Получаем данные игрока
        const playerData = this.getPlayerData();
        const xpProgressHTML = this.getXPProgressHTML();
        
        // Мультиплеер или одиночная игра (getIsMultiplayer возвращает актуальное значение)
        if (this.systems.getIsMultiplayer() && this.systems.realtimeStatsTracker) {
            content.innerHTML = this.renderMultiplayerStats(playerData, xpProgressHTML);
        } else {
            content.innerHTML = this.renderSinglePlayerStats(playerData, xpProgressHTML);
        }
    }
    
    /**
     * Получение данных игрока
     */
    private getPlayerData(): {
        kills: number;
        deaths: number;
        credits: number;
        kd: string;
        level: number;
        damage: number;
        accuracy: string;
        playTime: string;
    } {
        let kills = 0, deaths = 0, credits = 0, level = 1, damage = 0;
        let kd = "0.00", accuracy = "0%", playTime = "0h 0m";
        
        if (this.systems?.playerProgression) {
            const stats = this.systems.playerProgression.getStats();
            kills = stats.totalKills || 0;
            deaths = stats.totalDeaths || 0;
            credits = stats.credits || 0;
            level = stats.level || 1;
            damage = Math.round(stats.totalDamageDealt || 0);
            kd = this.systems.playerProgression.getKDRatio();
            accuracy = this.systems.playerProgression.getAccuracy();
            playTime = this.systems.playerProgression.getPlayTimeFormatted();
        }
        
        if (this.systems?.currencyManager) {
            credits = this.systems.currencyManager.getCurrency();
        }
        
        return { kills, deaths, credits, kd, level, damage, accuracy, playTime };
    }
    
    /**
     * HTML для прогресса опыта
     */
    private getXPProgressHTML(): string {
        if (!this.systems?.playerProgression) return '';
        
        const xpProgress = this.systems.playerProgression.getExperienceProgress();
        const rawPercent = xpProgress.required > 0 
            ? Math.min(100, Math.max(0, (xpProgress.current / xpProgress.required) * 100)) 
            : 100;
        const xpPercent = Math.round(rawPercent * 10) / 10;
        
        // Комбо
        let comboInfo = '';
        if (this.systems.experienceSystem) {
            const comboCount = this.systems.experienceSystem.getComboCount();
            if (comboCount >= 2) {
                const comboBonus = Math.min(comboCount / 10, 1) * 100;
                comboInfo = `<span style="color:#ff0; font-size:10px; margin-left:8px">🔥 COMBO x${comboCount} (+${comboBonus.toFixed(0)}%)</span>`;
            }
        }
        
        return `
            <div style="margin-top:6px">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
                    <div style="display:flex; align-items:center">
                        <span style="color:#0aa; font-size:11px; font-weight:bold">EXPERIENCE</span>
                        ${comboInfo}
                    </div>
                    <span style="color:#0ff; font-size:11px; font-weight:bold">${xpProgress.current} / ${xpProgress.required} XP</span>
                </div>
                <div style="width:100%; height:8px; background:#0a0a0a; border-radius:3px; overflow:hidden; border:1px solid #0f04; position:relative; box-shadow:inset 0 0 4px rgba(0,0,0,0.5)">
                    <div style="width:${xpPercent}%; height:100%; background:linear-gradient(90deg, #0f0 0%, #0ff 50%, #0f0 100%); transition:width 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow:0 0 10px rgba(0,255,0,0.6), inset 0 0 5px rgba(0,255,255,0.3)"></div>
                </div>
            </div>
        `;
    }
    
    /**
     * Рендер статистики для одиночной игры
     */
    private renderSinglePlayerStats(
        playerData: { kills: number; deaths: number; credits: number; kd: string; level: number; damage: number; accuracy: string; playTime: string },
        xpProgressHTML: string
    ): string {
        const bots = this.getBotsData();
        
        // Сортируем ботов - живые сверху
        bots.sort((a, b) => {
            if (a.isAlive && !b.isAlive) return -1;
            if (!a.isAlive && b.isAlive) return 1;
            return 0;
        });
        
        // Генерируем HTML ботов
        let botsHTML = "";
        bots.forEach(bot => {
            const statusColor = bot.isAlive ? "#0f0" : "#f00";
            const statusIcon = bot.isAlive ? "●" : "✖";
            const rowOpacity = bot.isAlive ? "1" : "0.5";
            const healthBar = bot.isAlive ? `
                <div style="width:60px; height:4px; background:#333; border-radius:2px; overflow:hidden">
                    <div style="width:${bot.health}%; height:100%; background:${bot.health > 50 ? '#0f0' : bot.health > 25 ? '#ff0' : '#f00'}"></div>
                </div>
            ` : '<span style="color:#f00; font-size:10px">DEAD</span>';
            
            botsHTML += `
                <tr style="opacity:${rowOpacity}; border-bottom:1px solid #222">
                    <td style="padding:8px 12px; color:${statusColor}">${statusIcon}</td>
                    <td style="padding:8px 12px; color:#f80">${bot.name}</td>
                    <td style="padding:8px 12px; text-align:center; color:#0f0">${bot.kills}</td>
                    <td style="padding:8px 12px; text-align:center; color:#f00">${bot.deaths}</td>
                    <td style="padding:8px 12px; text-align:center">${healthBar}</td>
                </tr>
            `;
        });
        
        const mapName = this.getMapDisplayName();
        return `
            <!-- Заголовок -->
            <div style="background:#0f01; padding:12px 20px; border-bottom:1px solid #0f02; display:flex; justify-content:space-between; align-items:center">
                <div style="display:flex; flex-direction:column; gap:4px">
                    <div style="display:flex; align-items:center; gap:15px">
                        <span style="font-size:18px; font-weight:bold; color:#0f0; text-shadow:0 0 10px #0f06">SCOREBOARD</span>
                        <span style="font-size:11px; color:#666">SINGLE PLAYER</span>
                    </div>
                    ${mapName ? `<span style="color:#0aa; font-size:10px">🗺️ ${mapName}</span>` : ''}
                </div>
                <div style="display:flex; gap:20px; font-size:12px">
                    <span style="color:#0f0">LVL ${playerData.level}</span>
                    <span style="color:#fc0">💰 ${playerData.credits}</span>
                    <span style="color:#0ff">⏱️ ${playerData.playTime}</span>
                </div>
            </div>
            
            <!-- Статистика игрока -->
            <div style="padding:12px 20px; background:#0a0a0a; border-bottom:1px solid #222">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <div style="display:flex; gap:25px">
                        <div style="text-align:center">
                            <div style="color:#0f0; font-size:24px; font-weight:bold">${playerData.kills}</div>
                            <div style="color:#666; font-size:10px">KILLS</div>
                        </div>
                        <div style="text-align:center">
                            <div style="color:#f00; font-size:24px; font-weight:bold">${playerData.deaths}</div>
                            <div style="color:#666; font-size:10px">DEATHS</div>
                        </div>
                        <div style="text-align:center">
                            <div style="color:#0ff; font-size:24px; font-weight:bold">${playerData.kd}</div>
                            <div style="color:#666; font-size:10px">K/D</div>
                        </div>
                        <div style="text-align:center">
                            <div style="color:#f80; font-size:24px; font-weight:bold">${playerData.damage}</div>
                            <div style="color:#666; font-size:10px">DAMAGE</div>
                        </div>
                        <div style="text-align:center">
                            <div style="color:#0af; font-size:24px; font-weight:bold">${playerData.accuracy}</div>
                            <div style="color:#666; font-size:10px">ACCURACY</div>
                        </div>
                    </div>
                </div>
                ${xpProgressHTML}
            </div>
            
            <!-- Таблица ботов -->
            <table style="width:100%; border-collapse:collapse">
                <thead>
                    <tr style="background:#111">
                        <th style="padding:8px 12px; text-align:left; color:#666; width:30px">●</th>
                        <th style="padding:8px 12px; text-align:left; color:#666">NAME</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:60px">K</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:60px">D</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:80px">HEALTH</th>
                    </tr>
                </thead>
                <tbody>
                    ${botsHTML || '<tr><td colspan="5" style="padding:20px; text-align:center; color:#666">No bots in game</td></tr>'}
                </tbody>
            </table>
            
            <!-- Футер -->
            <div style="background:#0a0a0a; padding:8px 20px; border-top:1px solid #222; display:flex; justify-content:space-between; font-size:10px; color:#666">
                <span>Bots: ${bots.filter(b => b.isAlive).length}/${bots.length}</span>
                <span>Protocol TX v1.0</span>
            </div>
        `;
    }
    
    /**
     * Рендер статистики для мультиплеера
     */
    private renderMultiplayerStats(
        playerData: { kills: number; deaths: number; credits: number; kd: string; level: number; damage: number; accuracy: string; playTime: string },
        xpProgressHTML: string
    ): string {
        if (!this.systems?.realtimeStatsTracker || !this.systems?.multiplayerManager) {
            return this.renderSinglePlayerStats(playerData, xpProgressHTML);
        }
        
        const leaderboard = this.systems.realtimeStatsTracker.getLeaderboard("score");
        const localStats = this.systems.realtimeStatsTracker.getLocalPlayerStats();
        const matchTime = this.systems.realtimeStatsTracker.getMatchTime();
        const localPlayerId = this.systems.multiplayerManager.getPlayerId();
        
        // Обновляем данные из реального времени
        if (localStats) {
            playerData.kills = localStats.kills;
            playerData.deaths = localStats.deaths;
            playerData.kd = localStats.deaths > 0 
                ? (localStats.kills / localStats.deaths).toFixed(2) 
                : localStats.kills.toFixed(2);
        }
        
        // Форматируем время
        const minutes = Math.floor(matchTime / 60);
        const seconds = Math.floor(matchTime % 60);
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Генерируем HTML лидерборда
        let leaderboardHTML = "";
        leaderboard.forEach((player, index) => {
            const isLocal = player.playerId === localPlayerId;
            const rowBg = isLocal ? "#0f01" : "transparent";
            const nameColor = isLocal ? "#0f0" : "#fff";
            const rankBadge = index < 3 
                ? `<span style="color:${['#fc0', '#aaa', '#c70'][index]}; font-size:14px">${['🥇', '🥈', '🥉'][index]}</span>` 
                : `<span style="color:#666">${index + 1}</span>`;
            
            const kd = player.deaths > 0 
                ? (player.kills / player.deaths).toFixed(2) 
                : player.kills.toFixed(2);
            const score = player.kills * 100 - player.deaths * 50;
            
            leaderboardHTML += `
                <tr style="background:${rowBg}; border-bottom:1px solid #222">
                    <td style="padding:8px 12px; text-align:center">${rankBadge}</td>
                    <td style="padding:8px 12px; color:${nameColor}; font-weight:${isLocal ? 'bold' : 'normal'}">${player.playerName || 'Unknown'}</td>
                    <td style="padding:8px 12px; text-align:center; color:#0f0">${player.kills}</td>
                    <td style="padding:8px 12px; text-align:center; color:#f00">${player.deaths}</td>
                    <td style="padding:8px 12px; text-align:center; color:#0ff">${kd}</td>
                    <td style="padding:8px 12px; text-align:center; color:#fc0">${score}</td>
                </tr>
            `;
        });
        
        return `
            <!-- Заголовок -->
            <div style="background:#0f01; padding:12px 20px; border-bottom:1px solid #0f02; display:flex; justify-content:space-between; align-items:center">
                <div style="display:flex; align-items:center; gap:15px">
                    <span style="font-size:18px; font-weight:bold; color:#0f0; text-shadow:0 0 10px #0f06">LEADERBOARD</span>
                    <span style="font-size:11px; color:#666">MULTIPLAYER</span>
                </div>
                <div style="display:flex; gap:20px; font-size:12px">
                    <span style="color:#0f0">LVL ${playerData.level}</span>
                    <span style="color:#0ff">⏱️ ${timeStr}</span>
                </div>
            </div>
            
            <!-- Статистика игрока -->
            <div style="padding:12px 20px; background:#0a0a0a; border-bottom:1px solid #222">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <div style="display:flex; gap:25px">
                        <div style="text-align:center">
                            <div style="color:#0f0; font-size:24px; font-weight:bold">${playerData.kills}</div>
                            <div style="color:#666; font-size:10px">KILLS</div>
                        </div>
                        <div style="text-align:center">
                            <div style="color:#f00; font-size:24px; font-weight:bold">${playerData.deaths}</div>
                            <div style="color:#666; font-size:10px">DEATHS</div>
                        </div>
                        <div style="text-align:center">
                            <div style="color:#0ff; font-size:24px; font-weight:bold">${playerData.kd}</div>
                            <div style="color:#666; font-size:10px">K/D</div>
                        </div>
                    </div>
                </div>
                ${xpProgressHTML}
            </div>
            
            <!-- Таблица лидерборда -->
            <table style="width:100%; border-collapse:collapse">
                <thead>
                    <tr style="background:#111">
                        <th style="padding:8px 12px; text-align:center; color:#666; width:40px">#</th>
                        <th style="padding:8px 12px; text-align:left; color:#666">PLAYER</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:70px">KILLS</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:70px">DEATHS</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:70px">K/D</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:70px">SCORE</th>
                    </tr>
                </thead>
                <tbody>
                    ${leaderboardHTML || '<tr><td colspan="6" style="padding:20px; text-align:center; color:#666">No players in match</td></tr>'}
                </tbody>
            </table>
            
            <!-- Футер -->
            <div style="background:#0a0a0a; padding:8px 20px; border-top:1px solid #222; display:flex; justify-content:space-between; font-size:10px; color:#666">
                <span>Players: ${leaderboard.length}</span>
                <span>Protocol TX v1.0</span>
            </div>
        `;
    }
    
    /**
     * Получение данных о ботах
     */
    private getBotsData(): { name: string; kills: number; deaths: number; health: number; isAlive: boolean }[] {
        const bots: { name: string; kills: number; deaths: number; health: number; isAlive: boolean }[] = [];
        
        if (!this.systems) return bots;
        
        // Вражеские танки
        this.systems.enemyTanks.forEach((tank, index) => {
            const currentHealth = tank.currentHealth || 0;
            const maxHealth = tank.maxHealth || 100;
            bots.push({
                name: `BOT_${index + 1}`,
                kills: Math.floor(Math.random() * 5), // Боты не отслеживают киллы
                deaths: 0,
                health: Math.round((currentHealth / maxHealth) * 100),
                isAlive: currentHealth > 0
            });
        });
        
        // Турели
        if (this.systems.enemyManager?.turrets) {
            this.systems.enemyManager.turrets.forEach((turret: any, index: number) => {
                const currentHealth = turret.health || 0;
                const maxHealth = 50;
                bots.push({
                    name: `TURRET_${index + 1}`,
                    kills: 0,
                    deaths: 0,
                    health: Math.round((currentHealth / maxHealth) * 100),
                    isAlive: currentHealth > 0
                });
            });
        }
        
        return bots;
    }
    
    /**
     * Получить отображаемое название карты
     */
    private getMapDisplayName(): string {
        if (!this.systems?.currentMapType) return "";
        
        const mapNames: Record<string, string> = {
            "normal": "Эта самая карта",
            "sandbox": "Песочница",
            "polygon": "Полигон",
            "frontline": "Передовая",
            "ruins": "Руины",
            "canyon": "Ущелье",
            "industrial": "Промзона",
            "urban_warfare": "Городские бои",
            "underground": "Подземелье",
            "coastal": "Побережье",
            "tartaria": "Тартария"
        };
        
        return mapNames[this.systems.currentMapType] || this.systems.currentMapType;
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        if (this.statsOverlay) {
            this.statsOverlay.remove();
            this.statsOverlay = null;
        }
        this.statsOverlayVisible = false;
        this.systems = null;
        logger.log("[GameStats] Disposed");
    }
}

