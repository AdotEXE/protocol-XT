/**
 * @module menu/modules/ProgressPanel
 * @description Модуль панели прогресса игрока (уровень, достижения, задания)
 * 
 * Выделен из MainMenu для улучшения модульности кода.
 */

import { PlayerProgressionSystem, PLAYER_ACHIEVEMENTS, PLAYER_TITLES, getLevelBonuses, MAX_PLAYER_LEVEL, type PlayerAchievement, type DailyQuest } from "../../playerProgression";

import { logger } from "../../utils/logger";
// Debug logging
const DEBUG = localStorage.getItem("debug") === "true" || false;
const debugLog = (...args: any[]) => {
    if (DEBUG) logger.log("[ProgressPanel]", ...args);
};

export type ProgressTab = "level" | "achievements" | "quests";
export type AchievementCategory = "all" | "combat" | "survival" | "progression" | "special";

/**
 * Интерфейс для MainMenu (чтобы избежать циклических зависимостей)
 */
export interface IProgressPanelHost {
    progressPanel: HTMLDivElement;
    playerProgression: PlayerProgressionSystem | null;
    setupCloseButton(id: string, handler: () => void): void;
    setupPanelCloseOnBackground(panel: HTMLDivElement, handler: () => void): void;
    enforceCanvasPointerEvents(): void;
    showAvatarSelector(): void;
    updatePlayerAvatarDisplay(): void;
}

/**
 * Модуль панели прогресса игрока
 */
export class ProgressPanelModule {
    private host: IProgressPanelHost;
    private currentTab: ProgressTab = "level";
    private achievementCategoryFilter: AchievementCategory = "all";

    constructor(host: IProgressPanelHost) {
        this.host = host;
    }

    /**
     * Создать HTML-структуру панели прогресса
     */
    create(): HTMLDivElement {
        const panel = document.createElement("div");
        panel.className = "panel-overlay";
        panel.id = "progress-panel";
        panel.innerHTML = `
            <div class="panel" style="width: min(90vw, 700px); max-height: min(85vh, 700px);">
                <div class="panel-header">
                    <div class="panel-title">ПРОГРЕСС ИГРОКА</div>
                    <button class="panel-close" id="progress-close">×</button>
                </div>
                <div class="progress-tabs">
                    <button class="progress-tab active" data-tab="level">[1] УРОВЕНЬ</button>
                    <button class="progress-tab" data-tab="achievements">[2] ДОСТИЖЕНИЯ</button>
                    <button class="progress-tab" data-tab="quests">[3] ЗАДАНИЯ</button>
                </div>
                <div class="progress-content">
                    <div class="progress-tab-content active" id="progress-level-content">
                        <!--Level tab content will be rendered dynamically-->
                    </div>
                    <div class="progress-tab-content" id="progress-achievements-content">
                        <!--Achievements tab content will be rendered dynamically-->
                    </div>
                    <div class="progress-tab-content" id="progress-quests-content">
                        <!--Quests tab content will be rendered dynamically-->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // Setup close button
        this.host.setupCloseButton("progress-close", () => this.hide());
        this.host.setupPanelCloseOnBackground(panel, () => this.hide());

        // Setup tab switching
        panel.querySelectorAll(".progress-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = (tab as HTMLElement).dataset.tab as ProgressTab;
                this.switchTab(tabName);
            });
        });

        return panel;
    }

    /**
     * Переключить вкладку
     */
    switchTab(tab: ProgressTab): void {
        this.currentTab = tab;
        const panel = this.host.progressPanel;
        if (!panel) return;

        // Update tab buttons
        panel.querySelectorAll(".progress-tab").forEach(t => {
            t.classList.toggle("active", (t as HTMLElement).dataset.tab === tab);
        });

        // Update content
        panel.querySelectorAll(".progress-tab-content").forEach(c => {
            c.classList.remove("active");
        });

        const contentId = `progress-${tab}-content`;
        const contentEl = document.getElementById(contentId);
        if (contentEl) {
            contentEl.classList.add("active");
        }

        // Render content based on tab
        switch (tab) {
            case "level":
                this.renderLevelTab();
                break;
            case "achievements":
                this.renderAchievementsTab();
                break;
            case "quests":
                this.renderQuestsTab();
                break;
        }
    }

    /**
     * Показать панель
     */
    show(): void {
        debugLog("show() called");
        const panel = this.host.progressPanel;
        if (panel) {
            panel.classList.add("visible");
            panel.style.setProperty("display", "flex", "important");
            panel.style.setProperty("visibility", "visible", "important");
            panel.style.setProperty("opacity", "1", "important");
            panel.style.setProperty("z-index", "100002", "important");

            // Add in-battle class if game is running
            const game = (window as any).gameInstance;
            if (game && game.gameStarted) {
                panel.classList.add("in-battle");
            } else {
                panel.classList.remove("in-battle");
            }

            // Render current tab
            this.switchTab(this.currentTab);
            this.host.enforceCanvasPointerEvents();
        }
    }

    /**
     * Скрыть панель
     */
    hide(): void {
        debugLog("hide() called");
        const panel = this.host.progressPanel;
        if (panel) {
            panel.classList.remove("visible");
            panel.style.setProperty("display", "none", "important");
            panel.style.setProperty("visibility", "hidden", "important");
            this.host.enforceCanvasPointerEvents();
        }
    }

    /**
     * Получить текущую вкладку
     */
    getCurrentTab(): ProgressTab {
        return this.currentTab;
    }

    /**
     * Рендеринг вкладки "Уровень"
     */
    private renderLevelTab(): void {
        const content = document.getElementById("progress-level-content");
        const progression = this.host.playerProgression;
        if (!content || !progression) return;

        const stats = progression.getStats();
        const xpProgress = progression.getExperienceProgress();
        const realTimeStats = progression.getRealTimeXpStats();
        const bonuses = getLevelBonuses(stats.level);

        // Get current title
        let currentTitle: { title: string; icon: string; color: string } = { title: "Новобранец", icon: "🪖", color: "#888888" };
        for (let lvl = stats.level; lvl >= 1; lvl--) {
            const titleData = PLAYER_TITLES[lvl];
            if (titleData) {
                currentTitle = titleData;
                break;
            }
        }

        // Get next title
        let nextTitle: { level: number; title: string; icon: string; color: string } | null = null;
        for (let lvl = stats.level + 1; lvl <= MAX_PLAYER_LEVEL; lvl++) {
            const titleData = PLAYER_TITLES[lvl];
            if (titleData && titleData.title && titleData.icon && titleData.color) {
                nextTitle = {
                    level: lvl,
                    title: titleData.title,
                    icon: titleData.icon,
                    color: titleData.color
                };
                break;
            }
        }

        // Format prestige
        const prestigeText = stats.prestigeLevel > 0
            ? `Престиж ${stats.prestigeLevel} (+${(stats.prestigeLevel * 10)}%)`
            : "Нет престижа";

        // Calculate XP per minute display
        const xpPerMin = Math.round(realTimeStats.experiencePerMinute);
        const xpPerMinText = xpPerMin > 0 ? `+ ${xpPerMin} XP / мин` : "—";

        content.innerHTML = `
            <div class="progress-level-section">
                <div class="avatar-container-large" id="profile-avatar-container" style="position: relative; cursor: pointer; display: flex; justify-content: center; align-items: center; margin-bottom: 10px;">
                    <div style="position: relative;">
                        <canvas id="profile-avatar-canvas" width="128" height="128" style="width: 128px; height: 128px; image-rendering: pixelated; border: 4px solid #0f0; background: #000; box-shadow: 0 0 20px rgba(0, 255, 0, 0.5); border-radius: 8px;"></canvas>
                        <div class="progress-level-badge" style="position: absolute; bottom: -10px; right: -10px; z-index: 2; width: 40px; height: 40px; font-size: 18px; border: 3px solid #0f0;">
                            <div class="progress-level-number">${stats.level}</div>
                        </div>
                        <div class="avatar-edit-hint" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; pointer-events: none; border-radius: 4px;">
                            <span style="font-size: 24px;">✏️</span>
                        </div>
                    </div>
                </div>
                <div class="progress-title" style="color: ${currentTitle.color}">
                    <span class="progress-title-icon">${currentTitle.icon}</span>
                    ${currentTitle.title}
                </div>
                <div style="text-align: center; font-size: 10px; color: #080; margin-top: -5px; margin-bottom: 10px;">Нажми на аватарку для изменения</div>
            </div>

            <div class="progress-xp-bar-container">
                <div class="progress-xp-bar-bg">
                    <div class="progress-xp-bar-fill" style="width: ${xpProgress.percent}%"></div>
                </div>
                <div class="progress-xp-text">
                    ${xpProgress.current.toLocaleString()} / ${xpProgress.required.toLocaleString()} XP
                    <span class="progress-xp-percent">(${xpProgress.percent.toFixed(1)}%)</span>
                </div>
            </div>

            <div class="progress-stats-grid">
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${stats.totalExperience.toLocaleString()}</div>
                    <div class="progress-stat-label">ОБЩИЙ ОПЫТ</div>
                </div>
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${xpPerMinText}</div>
                    <div class="progress-stat-label">СКОРОСТЬ НАБОРА</div>
                </div>
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${prestigeText}</div>
                    <div class="progress-stat-label">ПРЕСТИЖ</div>
                </div>
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${progression.getPlayTimeFormatted()}</div>
                    <div class="progress-stat-label">ВРЕМЯ В ИГРЕ</div>
                </div>
            </div>

            <div class="progress-bonuses-grid">
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${bonuses.healthBonus}</div>
                    <div class="progress-bonus-label">ЗДОРОВЬЕ</div>
                </div>
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${bonuses.damageBonus}</div>
                    <div class="progress-bonus-label">УРОН</div>
                </div>
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${bonuses.speedBonus.toFixed(1)}</div>
                    <div class="progress-bonus-label">СКОРОСТЬ</div>
                </div>
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${((bonuses.creditBonus - 1) * 100).toFixed(0)}%</div>
                    <div class="progress-bonus-label">КРЕДИТЫ</div>
                </div>
            </div>

            ${nextTitle ? `
            <div class="progress-next-level">
                <div class="progress-next-level-title">СЛЕДУЮЩИЙ РАНГ: УРОВЕНЬ ${nextTitle.level}</div>
                <div class="progress-next-level-rewards">
                    <span class="progress-reward" style="color: ${nextTitle.color}">
                        <span class="progress-reward-icon">${nextTitle.icon}</span>
                        ${nextTitle.title}
                    </span>
                    <span class="progress-reward">
                        <span class="progress-reward-icon">⭐</span>
                        +1 Очко навыков
                    </span>
                </div>
            </div>
            ` : `
            <div class="progress-next-level">
                <div class="progress-next-level-title" style="color: #ffd700">МАКСИМАЛЬНЫЙ УРОВЕНЬ ДОСТИГНУТ!</div>
            </div>
            `}
        `;

        // Setup avatar click
        const avatarContainer = content.querySelector("#profile-avatar-container");
        logger.log("[ProgressPanel] avatarContainer found:", !!avatarContainer);
        if (avatarContainer) {
            avatarContainer.addEventListener("click", () => {
                logger.log("[ProgressPanel] Avatar clicked! host.showAvatarSelector:", typeof this.host.showAvatarSelector);
                if (typeof this.host.showAvatarSelector === 'function') {
                    logger.log("[ProgressPanel] Calling showAvatarSelector()");
                    this.host.showAvatarSelector();
                } else {
                    logger.error("[ProgressPanel] showAvatarSelector is NOT a function!");
                }
            });

            // Show hover effect
            const editHint = content.querySelector(".avatar-edit-hint") as HTMLElement;
            if (editHint) {
                avatarContainer.addEventListener("mouseenter", () => editHint.style.opacity = "1");
                avatarContainer.addEventListener("mouseleave", () => editHint.style.opacity = "0");
            }
        }

        // Trigger avatar update
        if (typeof this.host.updatePlayerAvatarDisplay === 'function') {
            this.host.updatePlayerAvatarDisplay();
        }
    }

    /**
     * Рендеринг вкладки "Достижения"
     */
    private renderAchievementsTab(): void {
        const content = document.getElementById("progress-achievements-content");
        const progression = this.host.playerProgression;
        if (!content || !progression) return;

        const { unlocked, locked } = progression.getAchievements();
        const allAchievements = [...unlocked, ...locked];

        // Filter by category
        const filtered = this.achievementCategoryFilter === "all"
            ? allAchievements
            : allAchievements.filter(a => a.category === this.achievementCategoryFilter);

        // Category counts
        const categoryCounts = {
            all: allAchievements.length,
            combat: allAchievements.filter(a => a.category === "combat").length,
            survival: allAchievements.filter(a => a.category === "survival").length,
            progression: allAchievements.filter(a => a.category === "progression").length,
            special: allAchievements.filter(a => a.category === "special").length
        };

        const unlockedCount = unlocked.length;
        const totalCount = allAchievements.length;

        content.innerHTML = `
            <div style="margin-bottom: 15px; text-align: center; color: #0f0; font-size: 11px;">
                Разблокировано: ${unlockedCount} / ${totalCount}
            </div>

            <div class="achievements-category-tabs">
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'all' ? 'active' : ''}" data-category="all">
                    ВСЕ (${categoryCounts.all})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'combat' ? 'active' : ''}" data-category="combat">
                    ⚔ БОЙ (${categoryCounts.combat})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'survival' ? 'active' : ''}" data-category="survival">
                    🛡 ВЫЖИВАНИЕ (${categoryCounts.survival})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'progression' ? 'active' : ''}" data-category="progression">
                    📈 ПРОГРЕСС (${categoryCounts.progression})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'special' ? 'active' : ''}" data-category="special">
                    ⭐ ОСОБЫЕ (${categoryCounts.special})
                </button>
            </div>

            <div class="achievements-grid">
                ${filtered.map(achievement => {
            const isUnlocked = unlocked.some((u: PlayerAchievement) => u.id === achievement.id);
            return `
                        <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'} tier-${achievement.tier}">
                            <div class="achievement-header">
                                <span class="achievement-icon">${achievement.icon}</span>
                                <span class="achievement-name">${achievement.name}</span>
                                <span class="achievement-tier ${achievement.tier}">${achievement.tier.toUpperCase()}</span>
                            </div>
                            <div class="achievement-description">${achievement.description}</div>
                            <div class="achievement-reward">
                                <span>💰 ${achievement.reward.credits}</span>
                                <span>⭐ ${achievement.reward.exp} XP</span>
                                ${achievement.reward.skillPoints ? `<span>🔧 +${achievement.reward.skillPoints} SP</span>` : ''}
                            </div>
                            <span class="achievement-status">${isUnlocked ? '✅' : '🔒'}</span>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

        // Setup category filter buttons
        content.querySelectorAll(".achievement-category-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                this.achievementCategoryFilter = (btn as HTMLElement).dataset.category as AchievementCategory;
                this.renderAchievementsTab();
            });
        });
    }

    /**
     * Рендеринг вкладки "Задания"
     */
    private renderQuestsTab(): void {
        const content = document.getElementById("progress-quests-content");
        const progression = this.host.playerProgression;
        if (!content || !progression) return;

        const stats = progression.getStats();
        const dailyQuests: DailyQuest[] = stats.dailyQuests || [];

        // Calculate time until daily reset (assumes reset at midnight)
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const timeUntilReset = tomorrow.getTime() - now.getTime();
        const hoursLeft = Math.floor(timeUntilReset / (1000 * 60 * 60));
        const minutesLeft = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));

        if (dailyQuests.length === 0) {
            content.innerHTML = `
                <div class="quests-header">
                    <div class="quests-title">ЕЖЕДНЕВНЫЕ ЗАДАНИЯ</div>
                    <div class="quests-reset-timer">Обновление через: ${hoursLeft}ч ${minutesLeft}м</div>
                </div>
                <div class="no-quests-message">
                    Нет активных заданий.<br>
                    Задания обновляются ежедневно в полночь.
                </div>
            `;
            return;
        }

        const completedCount = dailyQuests.filter(q => q.completed).length;

        content.innerHTML = `
            <div class="quests-header">
                <div class="quests-title">ЕЖЕДНЕВНЫЕ ЗАДАНИЯ (${completedCount} / ${dailyQuests.length})</div>
                <div class="quests-reset-timer">Обновление через: ${hoursLeft}ч ${minutesLeft}м</div>
            </div>

            ${dailyQuests.map(quest => {
            const progressPercent = Math.min(100, (quest.progress / quest.target) * 100);
            return `
                    <div class="quest-card ${quest.completed ? 'completed' : ''}">
                        <div class="quest-header">
                            <span class="quest-name">${quest.name}</span>
                            <span class="quest-status-icon">${quest.completed ? '✅' : '⏳'}</span>
                        </div>
                        <div class="quest-description">${quest.description}</div>
                        <div class="quest-progress-bar-bg">
                            <div class="quest-progress-bar-fill" style="width: ${progressPercent}%"></div>
                            <span class="quest-progress-text">${quest.progress} / ${quest.target}</span>
                        </div>
                        <div class="quest-rewards">
                            <span class="quest-reward">
                                <span class="quest-reward-icon">💰</span>${quest.reward.credits}
                            </span>
                            <span class="quest-reward">
                                <span class="quest-reward-icon">⭐</span>${quest.reward.exp} XP
                            </span>
                        </div>
                    </div>
                `;
        }).join('')}
        `;
    }
}

export default ProgressPanelModule;
