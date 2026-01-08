/**
 * GameStatsOverlay - Управление overlay статистики (Tab key)
 * Вынесено из game.ts для уменьшения размера файла
 */

import type { EnemyTank } from "../enemyTank";
import type { EnemyManager } from "../enemy";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { CurrencyManager } from "../currencyManager";
import type { ExperienceSystem } from "../experienceSystem";
import type { RealtimeStatsTracker } from "../realtimeStats";
import type { MultiplayerManager } from "../multiplayer";

export interface StatsOverlayDependencies {
    enemyTanks: EnemyTank[];
    enemyManager?: EnemyManager;
    playerProgression?: PlayerProgressionSystem;
    currencyManager?: CurrencyManager;
    experienceSystem?: ExperienceSystem;
    realtimeStatsTracker?: RealtimeStatsTracker;
    multiplayerManager?: MultiplayerManager;
    getIsMultiplayer: () => boolean; // Геттер для актуального значения isMultiplayer
    currentMapType?: string;
}

/**
 * Класс для управления stats overlay
 */
export class GameStatsOverlay {
    private statsOverlay: HTMLDivElement | null = null;
    private statsOverlayVisible = false;
    private deps: StatsOverlayDependencies;
    
    constructor() {
        this.deps = {
            enemyTanks: [],
            getIsMultiplayer: () => false
        };
    }
    
    /**
     * Обновить зависимости
     */
    updateDependencies(deps: Partial<StatsOverlayDependencies>): void {
        Object.assign(this.deps, deps);
    }
    
    /**
     * Показать stats overlay
     */
    show(): void {
        if (!this.statsOverlay) {
            this.create();
        }
        
        if (this.statsOverlay && !this.statsOverlayVisible) {
            this.statsOverlayVisible = true;
            this.statsOverlay.style.display = "flex";
            this.statsOverlay.style.visibility = "visible";
            this.update();
        }
    }
    
    /**
     * Скрыть stats overlay
     */
    hide(): void {
        if (this.statsOverlay) {
            this.statsOverlayVisible = false;
            this.statsOverlay.style.display = "none";
            this.statsOverlay.style.visibility = "hidden";
        }
    }
    
    /**
     * Проверить видимость
     */
    isVisible(): boolean {
        return this.statsOverlayVisible;
    }
    
    /**
     * Создать overlay
     */
    private create(): void {
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
            font-family: 'Press Start 2P', monospace;
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
     * Обновить содержимое overlay
     */
    update(): void {
        const content = document.getElementById("scoreboard-content");
        if (!content) return;
        
        // Получаем данные игрока
        const playerData = this.getPlayerData();
        const xpProgressHTML = this.getXPProgressHTML();
        
        if (this.deps.getIsMultiplayer() && this.deps.realtimeStatsTracker) {
            this.renderMultiplayerStats(content, playerData, xpProgressHTML);
        } else {
            this.renderSinglePlayerStats(content, playerData, xpProgressHTML);
        }
    }
    
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
        let playerKills = 0;
        let playerDeaths = 0;
        let playerCredits = 0;
        let playerKD = "0.00";
        let playerLevel = 1;
        let playerDamage = 0;
        let playerAccuracy = "0%";
        let playerPlayTime = "0h 0m";
        
        if (this.deps.playerProgression) {
            const stats = this.deps.playerProgression.getStats();
            playerKills = stats.totalKills || 0;
            playerDeaths = stats.totalDeaths || 0;
            playerCredits = stats.credits || 0;
            playerLevel = stats.level || 1;
            playerDamage = Math.round(stats.totalDamageDealt || 0);
            playerKD = this.deps.playerProgression.getKDRatio();
            playerAccuracy = this.deps.playerProgression.getAccuracy();
            playerPlayTime = this.deps.playerProgression.getPlayTimeFormatted();
        }
        
        if (this.deps.currencyManager) {
            playerCredits = this.deps.currencyManager.getCurrency();
        }
        
        return {
            kills: playerKills,
            deaths: playerDeaths,
            credits: playerCredits,
            kd: playerKD,
            level: playerLevel,
            damage: playerDamage,
            accuracy: playerAccuracy,
            playTime: playerPlayTime
        };
    }
    
    private getXPProgressHTML(): string {
        if (!this.deps.playerProgression) return '';
        
        const xpProgress = this.deps.playerProgression.getExperienceProgress();
        const rawPercent = xpProgress.required > 0 
            ? Math.min(100, Math.max(0, (xpProgress.current / xpProgress.required) * 100)) 
            : 100;
        const xpPercent = Math.round(rawPercent * 10) / 10;
        
        let comboInfo = '';
        if (this.deps.experienceSystem) {
            const comboCount = this.deps.experienceSystem.getComboCount();
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
    
    private getXPPerMinuteHTML(): string {
        if (!this.deps.playerProgression) return '';
        try {
            const xpStats = this.deps.playerProgression.getRealTimeXpStats();
            return `<span>XP/мин: <span style="color:#0ff">${xpStats.experiencePerMinute}</span></span>`;
        } catch (e) {
            return '';
        }
    }
    
    private renderMultiplayerStats(
        content: HTMLElement, 
        playerData: ReturnType<typeof this.getPlayerData>,
        xpProgressHTML: string
    ): void {
        const localPlayerId = this.deps.multiplayerManager?.getPlayerId();
        const tracker = this.deps.realtimeStatsTracker!;
        
        const leaderboard = tracker.getLeaderboard("score");
        const localStats = tracker.getLocalPlayerStats();
        const kdHistory = tracker.getKDHistory();
        const matchTime = tracker.getMatchTime();
        
        // Update from realtime tracker
        if (localStats) {
            playerData.kills = localStats.kills;
            playerData.deaths = localStats.deaths;
            playerData.kd = localStats.deaths > 0 
                ? (localStats.kills / localStats.deaths).toFixed(2) 
                : localStats.kills.toFixed(2);
        }
        
        const leaderboardHTML = this.generateLeaderboardHTML(leaderboard, localPlayerId);
        const kdGraphHTML = this.generateKDGraphHTML(kdHistory);
        const mapName = this.getMapDisplayName();
        
        content.innerHTML = `
            <div style="background:#0f02; padding:10px 20px; border-bottom:1px solid #0f04; display:flex; justify-content:space-between; align-items:center">
                <div style="display:flex; flex-direction:column; gap:4px">
                    <span style="color:#0f0; font-size:14px; font-weight:bold">📊 LEADERBOARD</span>
                    ${mapName ? `<span style="color:#0aa; font-size:10px">🗺️ ${mapName}</span>` : ''}
                </div>
                <span style="color:#0a0; font-size:11px">Match Time: ${Math.floor(matchTime / 60)}:${String(Math.floor(matchTime % 60)).padStart(2, '0')}</span>
            </div>
            ${this.renderPlayerStatsSection(playerData, xpProgressHTML, kdGraphHTML)}
            <table style="width:100%; border-collapse:collapse; font-size:12px">
                <thead>
                    <tr style="background:#111; border-bottom:1px solid #333">
                        <th style="padding:8px 12px; text-align:center; color:#666; width:40px">#</th>
                        <th style="padding:8px 12px; text-align:left; color:#666; width:30px"></th>
                        <th style="padding:8px 12px; text-align:left; color:#666">NAME</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:60px">KILLS</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:60px">DEATHS</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:70px">K/D</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:70px">SCORE</th>
                    </tr>
                </thead>
                <tbody>
                    ${leaderboardHTML || '<tr><td colspan="7" style="padding:20px; text-align:center; color:#666">No players in match</td></tr>'}
                </tbody>
            </table>
            <div style="background:#0a0a0a; padding:8px 20px; border-top:1px solid #222; display:flex; justify-content:space-between; font-size:10px; color:#666">
                <span>Players: ${leaderboard.length}</span>
                <span>Protocol TX v1.0</span>
            </div>
        `;
    }
    
    private renderSinglePlayerStats(
        content: HTMLElement, 
        playerData: ReturnType<typeof this.getPlayerData>,
        xpProgressHTML: string
    ): void {
        const bots = this.collectBotsData();
        const botsHTML = this.generateBotsHTML(bots);
        
        const mapName = this.getMapDisplayName();
        content.innerHTML = `
            <div style="background:#0f02; padding:10px 20px; border-bottom:1px solid #0f04; display:flex; justify-content:space-between; align-items:center">
                <div style="display:flex; flex-direction:column; gap:4px">
                    <span style="color:#0f0; font-size:14px; font-weight:bold">📊 SCOREBOARD</span>
                    ${mapName ? `<span style="color:#0aa; font-size:10px">🗺️ ${mapName}</span>` : ''}
                </div>
                <span style="color:#0a0; font-size:11px">Hold Tab</span>
            </div>
            ${this.renderPlayerStatsSection(playerData, xpProgressHTML, '')}
            <table style="width:100%; border-collapse:collapse; font-size:12px">
                <thead>
                    <tr style="background:#111; border-bottom:1px solid #333">
                        <th style="padding:8px 12px; text-align:left; color:#666; width:30px"></th>
                        <th style="padding:8px 12px; text-align:left; color:#666">NAME</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:60px">KILLS</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:60px">DEATHS</th>
                        <th style="padding:8px 12px; text-align:center; color:#666; width:80px">HEALTH</th>
                    </tr>
                </thead>
                <tbody>
                    ${botsHTML || '<tr><td colspan="5" style="padding:20px; text-align:center; color:#666">No bots in game</td></tr>'}
                </tbody>
            </table>
            <div style="background:#0a0a0a; padding:8px 20px; border-top:1px solid #222; display:flex; justify-content:space-between; font-size:10px; color:#666">
                <span>Players: 1 • Bots: ${bots.filter(b => b.isAlive).length}/${bots.length}</span>
                <span>Protocol TX v1.0</span>
            </div>
        `;
    }
    
    private renderPlayerStatsSection(
        playerData: ReturnType<typeof this.getPlayerData>,
        xpProgressHTML: string,
        kdGraphHTML: string
    ): string {
        return `
            <div style="background:#001100; padding:15px 20px; border-bottom:2px solid #0f04">
                <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px">
                    <div style="width:40px; height:40px; background:#0f0; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#000; font-weight:bold; font-size:16px">
                        ${playerData.level}
                    </div>
                    <div style="flex:1">
                        <div style="color:#0f0; font-size:16px; font-weight:bold">PLAYER</div>
                        <div style="color:#0a0; font-size:11px; margin-bottom:6px">Level ${playerData.level} • ${playerData.playTime}</div>
                        ${xpProgressHTML}
                    </div>
                    <div style="margin-left:auto; display:flex; gap:30px; text-align:center">
                        <div>
                            <div style="color:#0f0; font-size:24px; font-weight:bold">${playerData.kills}</div>
                            <div style="color:#0a0; font-size:10px">KILLS</div>
                        </div>
                        <div>
                            <div style="color:#f00; font-size:24px; font-weight:bold">${playerData.deaths}</div>
                            <div style="color:#a00; font-size:10px">DEATHS</div>
                        </div>
                        <div>
                            <div style="color:#0ff; font-size:24px; font-weight:bold">${playerData.kd}</div>
                            <div style="color:#0aa; font-size:10px">K/D</div>
                        </div>
                        <div>
                            <div style="color:#ff0; font-size:24px; font-weight:bold">${playerData.credits}</div>
                            <div style="color:#aa0; font-size:10px">CREDITS</div>
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:20px; font-size:11px; color:#888; margin-top:8px">
                    <span>Урон: <span style="color:#fff">${playerData.damage}</span></span>
                    <span>Точность: <span style="color:#fff">${playerData.accuracy}</span></span>
                    ${this.getXPPerMinuteHTML()}
                </div>
                ${kdGraphHTML}
            </div>
        `;
    }
    
    private generateLeaderboardHTML(leaderboard: any[], localPlayerId?: string): string {
        return leaderboard.map((player, index) => {
            const isLocal = player.playerId === localPlayerId;
            const kd = player.deaths > 0 ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2);
            const statusColor = player.isAlive ? "#0f0" : "#f00";
            const statusIcon = player.isAlive ? "●" : "✖";
            const rowBg = isLocal ? "#0f02" : "transparent";
            const rowOpacity = player.isAlive ? "1" : "0.5";
            const teamIndicator = player.team !== undefined 
                ? `<span style="color:${player.team === 0 ? '#4a9eff' : '#ff4a4a'}; margin-right:8px">[${player.team === 0 ? 'BLUE' : 'RED'}]</span>` 
                : "";
            
            return `
                <tr style="opacity:${rowOpacity}; border-bottom:1px solid #222; background:${rowBg}">
                    <td style="padding:8px 12px; text-align:center; color:#888; width:40px">${index + 1}</td>
                    <td style="padding:8px 12px; color:${statusColor}">${statusIcon}</td>
                    <td style="padding:8px 12px; color:${isLocal ? '#0ff' : '#f80'}">${teamIndicator}${player.playerName}${isLocal ? ' (YOU)' : ''}</td>
                    <td style="padding:8px 12px; text-align:center; color:#0f0; width:60px">${player.kills}</td>
                    <td style="padding:8px 12px; text-align:center; color:#f00; width:60px">${player.deaths}</td>
                    <td style="padding:8px 12px; text-align:center; color:#0ff; width:70px">${kd}</td>
                    <td style="padding:8px 12px; text-align:center; color:#ff0; width:70px">${player.score}</td>
                </tr>
            `;
        }).join('');
    }
    
    private generateKDGraphHTML(kdHistory: { time: number; kd: number }[]): string {
        if (kdHistory.length <= 1) return '';
        
        const maxKD = Math.max(...kdHistory.map(p => p.kd), 1);
        const minKD = Math.min(...kdHistory.map(p => p.kd), 0);
        const kdRange = maxKD - minKD || 1;
        const graphWidth = 400;
        const graphHeight = 100;
        
        const points = kdHistory.map((point, i) => {
            const x = (i / (kdHistory.length - 1)) * graphWidth;
            const y = graphHeight - ((point.kd - minKD) / kdRange) * graphHeight;
            return `${x},${y}`;
        }).join(" ");
        
        return `
            <div style="background:#0a0a0a; padding:15px; border:1px solid #0f04; margin-top:10px">
                <div style="color:#0aa; font-size:11px; margin-bottom:8px; font-weight:bold">K/D RATIO OVER TIME</div>
                <svg width="${graphWidth}" height="${graphHeight}" style="background:#000; border:1px solid #0f04">
                    <polyline points="${points}" fill="none" stroke="#0ff" stroke-width="2" />
                    <line x1="0" y1="${graphHeight - ((1 - minKD) / kdRange) * graphHeight}" x2="${graphWidth}" y2="${graphHeight - ((1 - minKD) / kdRange) * graphHeight}" stroke="#0f04" stroke-width="1" stroke-dasharray="4,4" />
                    <text x="5" y="${graphHeight - ((1 - minKD) / kdRange) * graphHeight - 5}" fill="#0aa" font-size="10px">K/D = 1.0</text>
                    <text x="5" y="10" fill="#0aa" font-size="10px">Max: ${maxKD.toFixed(2)}</text>
                    <text x="5" y="${graphHeight - 5}" fill="#0aa" font-size="10px">Min: ${minKD.toFixed(2)}</text>
                </svg>
            </div>
        `;
    }
    
    private collectBotsData(): { name: string; kills: number; deaths: number; health: number; isAlive: boolean }[] {
        const bots: { name: string; kills: number; deaths: number; health: number; isAlive: boolean }[] = [];
        
        this.deps.enemyTanks.forEach((tank, index) => {
            const currentHealth = tank.currentHealth || 0;
            const maxHealth = tank.maxHealth || 100;
            bots.push({
                name: `BOT_${index + 1}`,
                kills: Math.floor(Math.random() * 5),
                deaths: 0,
                health: Math.round((currentHealth / maxHealth) * 100),
                isAlive: currentHealth > 0
            });
        });
        
        if (this.deps.enemyManager && (this.deps.enemyManager as any).turrets) {
            const turrets = (this.deps.enemyManager as any).turrets;
            turrets.forEach((turret: any, index: number) => {
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
        
        bots.sort((a, b) => {
            if (a.isAlive && !b.isAlive) return -1;
            if (!a.isAlive && b.isAlive) return 1;
            return 0;
        });
        
        return bots;
    }
    
    private generateBotsHTML(bots: { name: string; kills: number; deaths: number; health: number; isAlive: boolean }[]): string {
        return bots.map(bot => {
            const statusColor = bot.isAlive ? "#0f0" : "#f00";
            const statusIcon = bot.isAlive ? "●" : "✖";
            const rowOpacity = bot.isAlive ? "1" : "0.5";
            const healthBar = bot.isAlive ? `
                <div style="width:60px; height:4px; background:#333; border-radius:2px; overflow:hidden">
                    <div style="width:${bot.health}%; height:100%; background:${bot.health > 50 ? '#0f0' : bot.health > 25 ? '#ff0' : '#f00'}"></div>
                </div>
            ` : '<span style="color:#f00; font-size:10px">DEAD</span>';
            
            return `
                <tr style="opacity:${rowOpacity}; border-bottom:1px solid #222">
                    <td style="padding:8px 12px; color:${statusColor}">${statusIcon}</td>
                    <td style="padding:8px 12px; color:#f80">${bot.name}</td>
                    <td style="padding:8px 12px; text-align:center; color:#0f0">${bot.kills}</td>
                    <td style="padding:8px 12px; text-align:center; color:#f00">${bot.deaths}</td>
                    <td style="padding:8px 12px; text-align:center">${healthBar}</td>
                </tr>
            `;
        }).join('');
    }
    
    /**
     * Получить отображаемое название карты
     */
    private getMapDisplayName(): string {
        if (!this.deps.currentMapType) return "";
        
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
        
        return mapNames[this.deps.currentMapType] || this.deps.currentMapType;
    }
    
    /**
     * Очистка
     */
    dispose(): void {
        if (this.statsOverlay) {
            this.statsOverlay.remove();
            this.statsOverlay = null;
        }
        this.statsOverlayVisible = false;
    }
}

