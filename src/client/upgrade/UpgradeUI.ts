/**
 * @module upgrade/UpgradeUI
 * @description UI компонент для системы прокачки
 * 
 * Интегрируется в гараж и предоставляет:
 * - Отображение уровней элементов
 * - Кнопки прокачки
 * - Прогресс-бары XP/Credits
 * - Анимации при прокачке
 */

import { upgradeManager } from './UpgradeManager';
import {
    UpgradeCategory,
    MAX_UPGRADE_LEVEL
} from './UpgradeTypes';
import { getLevelRequirements } from './UpgradeConfig';
import { logger } from '../utils/logger';

// ============================================
// CSS СТИЛИ
// ============================================

const UPGRADE_UI_STYLES = `
.upgrade-panel {
    position: absolute;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, rgba(20, 25, 35, 0.95), rgba(30, 40, 55, 0.95));
    border: 2px solid #ffd700;
    border-radius: 12px;
    padding: 16px;
    min-width: 320px;
    font-family: 'Press Start 2P', monospace;
    color: #e0e0e0;
    box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3);
    z-index: 1000;
}

.upgrade-panel.embedded {
    position: relative;
    top: auto;
    right: auto;
    min-width: 100%;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    padding: 0;
}

.upgrade-panel.collapsed {
    min-width: auto;
    padding: 8px 12px;
}

.upgrade-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 215, 0, 0.3);
}

.upgrade-title {
    font-size: 18px;
    font-weight: 700;
    color: #ffd700;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.toggle-btn {
    background: none;
    border: 1px solid #ffd700;
    color: #ffd700;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
}

.toggle-btn:hover {
    background: rgba(255, 215, 0, 0.2);
}

.resources-bar {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
}

.resource {
    flex: 1;
    text-align: center;
}

.resource-label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 4px;
}

.resource-value {
    font-size: 18px;
    font-weight: 700;
}

.resource-value.xp {
    color: #4fc3f7;
}

.resource-value.credits {
    color: #ffd700;
}

.resource-value.level {
    color: #81c784;
}

.upgrade-section {
    margin-bottom: 12px;
}

.section-title {
    font-size: 13px;
    color: #ffd700;
    text-transform: uppercase;
    margin-bottom: 8px;
    letter-spacing: 0.5px;
}

.upgrade-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    margin-bottom: 6px;
    border: 1px solid transparent;
    transition: all 0.2s;
}

.upgrade-item:hover {
    background: rgba(255, 215, 0, 0.1);
    border-color: rgba(255, 215, 0, 0.3);
}

.upgrade-item.selected {
    border-color: #ffd700;
    background: rgba(255, 215, 0, 0.15);
}

.item-info {
    display: flex;
    align-items: center;
    gap: 10px;
}

.item-name {
    font-size: 14px;
    font-weight: 600;
}

.item-level {
    font-size: 12px;
    color: #4fc3f7;
    background: rgba(79, 195, 247, 0.2);
    padding: 2px 8px;
    border-radius: 4px;
}

.item-level.max {
    color: #ffd700;
    background: rgba(255, 215, 0, 0.2);
}

.upgrade-btn {
    background: linear-gradient(135deg, #ffd700, #ff9800);
    border: none;
    color: #1a1a2e;
    padding: 6px 14px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
}

.upgrade-btn:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 2px 10px rgba(255, 215, 0, 0.4);
}

.upgrade-btn:disabled {
    background: #555;
    color: #888;
    cursor: not-allowed;
}

.upgrade-btn.maxed {
    background: linear-gradient(135deg, #81c784, #4caf50);
    cursor: default;
}

.upgrade-cost {
    font-size: 11px;
    color: #888;
    margin-top: 2px;
}

.progress-bar-container {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    margin-top: 6px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #4fc3f7, #81c784);
    border-radius: 2px;
    transition: width 0.3s ease;
}

.notification {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #ffd700, #ff9800);
    color: #1a1a2e;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 14px;
    z-index: 9999;
    animation: slideDown 0.3s ease, fadeOut 0.3s ease 2.7s;
}

@keyframes slideDown {
    from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
}

@keyframes fadeOut {
    to { opacity: 0; }
}

.level-up-effect {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 48px;
    font-weight: 900;
    color: #ffd700;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
    z-index: 9999;
    animation: levelUpPulse 1s ease-out forwards;
}

@keyframes levelUpPulse {
    0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
    50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}
`;

// ============================================
// UI КОМПОНЕНТ
// ============================================

/**
 * UI система прокачки
 */
export class UpgradeUI {
    private container: HTMLElement | null = null;
    private styleElement: HTMLStyleElement | null = null;
    private isCollapsed: boolean = false;
    private currentCategory: UpgradeCategory = "cannon";
    private selectedElementId: string | null = null;
    private onElementSelect?: (category: UpgradeCategory, elementId: string) => void;

    constructor() {
        this.injectStyles();
        this.setupEventListeners();
    }

    /**
     * Внедрить CSS стили
     */
    private injectStyles(): void {
        if (document.getElementById('upgrade-ui-styles')) return;

        this.styleElement = document.createElement('style');
        this.styleElement.id = 'upgrade-ui-styles';
        this.styleElement.textContent = UPGRADE_UI_STYLES;
        document.head.appendChild(this.styleElement);
    }

    /**
     * Настроить слушатели событий UpgradeManager
     */
    private setupEventListeners(): void {
        upgradeManager.onXpGain((event) => {
            this.showNotification(`+${event.amount} XP`);
            this.refresh();
        });

        upgradeManager.onCreditsGain((event) => {
            this.showNotification(`+${event.amount} Credits`);
            this.refresh();
        });

        upgradeManager.onUpgrade((category, elementId, newLevel) => {
            this.showNotification(`${elementId} upgraded to Level ${newLevel}!`);
            this.refresh();
        });

        upgradeManager.onPlayerLevelUp((newLevel) => {
            this.showLevelUpEffect(newLevel);
        });
    }

    /**
     * Создать панель прокачки
     */
    create(parentElement?: HTMLElement): HTMLElement {
        this.container = document.createElement('div');
        this.container.className = 'upgrade-panel';
        this.container.innerHTML = this.renderContent();

        if (parentElement) {
            parentElement.appendChild(this.container);
        } else {
            document.body.appendChild(this.container);
        }

        this.attachEventHandlers();
        return this.container;
    }

    /**
     * Создать встроенную панель прокачки в существующем контейнере (гараж, древо навыков).
     * Удаляет прежнюю плавающую панель из DOM, если была.
     */
    createEmbedded(containerId: string): void {
        const parent = document.getElementById(containerId);
        if (!parent) {
            logger.error(`[UpgradeUI] Container ${containerId} not found`);
            return;
        }

        // Убираем старую панель из body, если была создана как плавающая
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
            this.container = null;
        }

        parent.innerHTML = '';

        this.container = document.createElement('div');
        this.container.className = 'upgrade-panel embedded';
        this.container.innerHTML = this.renderContent();

        parent.appendChild(this.container);
        this.attachEventHandlers();
    }

    /**
     * Рендер содержимого панели
     */
    private renderContent(): string {
        if (this.isCollapsed) {
            return `
                <div class="upgrade-header">
                    <span class="upgrade-title">⬆</span>
                    <button class="toggle-btn" data-action="toggle">+</button>
                </div>
            `;
        }

        const xp = upgradeManager.getTotalXp();
        const credits = upgradeManager.getCredits();
        const level = upgradeManager.getPlayerLevel();

        return `
            <div class="upgrade-header">
                <span class="upgrade-title">Прокачка</span>
                <button class="toggle-btn" data-action="toggle">−</button>
            </div>
            
            <div class="resources-bar">
                <div class="resource">
                    <div class="resource-label">Опыт</div>
                    <div class="resource-value xp">${this.formatNumber(xp)}</div>
                </div>
                <div class="resource">
                    <div class="resource-label">Кредиты</div>
                    <div class="resource-value credits">${this.formatNumber(credits)}</div>
                </div>
                <div class="resource">
                    <div class="resource-label">Уровень</div>
                    <div class="resource-value level">${level}</div>
                </div>
            </div>
            
            ${this.renderCategoryTabs()}
            ${this.renderSelectedCategory()}
        `;
    }

    /**
     * Рендер вкладок категорий
     */
    private renderCategoryTabs(): string {
        const categories: { id: UpgradeCategory; label: string }[] = [
            { id: "cannon", label: "Орудия" },
            { id: "chassis", label: "Корпуса" },
            { id: "tracks", label: "Шасси" },
            { id: "module", label: "Модули" }
        ];

        return `
            <div style="display: flex; gap: 4px; margin-bottom: 12px;">
                ${categories.map(cat => `
                    <button 
                        class="upgrade-btn ${this.currentCategory === cat.id ? '' : 'disabled'}"
                        data-action="category"
                        data-category="${cat.id}"
                        style="flex: 1; padding: 6px 8px; font-size: 11px; ${this.currentCategory === cat.id ? '' : 'background: #444; color: #aaa;'}"
                    >
                        ${cat.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Рендер выбранной категории
     */
    private renderSelectedCategory(): string {
        const items = this.getItemsForCategory(this.currentCategory);

        return `
            <div class="upgrade-section">
                ${items.map(item => this.renderUpgradeItem(item)).join('')}
            </div>
        `;
    }

    /**
     * Получить элементы для категории
     */
    private getItemsForCategory(category: UpgradeCategory): { id: string; name: string }[] {
        switch (category) {
            case "cannon":
                return [
                    { id: "standard", name: "Standard" },
                    { id: "rapid", name: "Rapid" },
                    { id: "heavy", name: "Heavy" },
                    { id: "sniper", name: "Sniper" },
                    { id: "gatling", name: "Gatling" },
                    { id: "ricochet", name: "Ricochet Master" }
                ];
            case "chassis":
                return [
                    { id: "light", name: "Light" },
                    { id: "medium", name: "Medium" },
                    { id: "heavy", name: "Heavy" }
                ];
            case "tracks":
                return [
                    { id: "standard", name: "Standard" },
                    { id: "heavy", name: "Heavy" },
                    { id: "speed", name: "Speed" }
                ];
            case "module":
                return [
                    { id: "shield", name: "Shield" },
                    { id: "repair", name: "Repair" },
                    { id: "boost", name: "Boost" }
                ];
            default:
                return [];
        }
    }

    /**
     * Рендер элемента прокачки
     */
    private renderUpgradeItem(item: { id: string; name: string }): string {
        const level = upgradeManager.getElementLevel(this.currentCategory, item.id);
        const isMaxLevel = level >= MAX_UPGRADE_LEVEL;
        const canUpgrade = upgradeManager.canUpgrade(this.currentCategory, item.id);
        const nextReq = !isMaxLevel ? getLevelRequirements(level + 1) : null;
        const isSelected = this.selectedElementId === item.id;

        return `
            <div class="upgrade-item ${isSelected ? 'selected' : ''}" data-action="select" data-id="${item.id}">
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-level ${isMaxLevel ? 'max' : ''}">
                        Lv.${level}${isMaxLevel ? ' MAX' : ''}
                    </span>
                </div>
                ${isMaxLevel ? `
                    <button class="upgrade-btn maxed" disabled>МАКС</button>
                ` : `
                    <div style="text-align: right;">
                        <button 
                            class="upgrade-btn" 
                            data-action="upgrade"
                            data-id="${item.id}"
                            ${canUpgrade.canUpgrade ? '' : 'disabled'}
                        >
                            Улучшить
                        </button>
                        ${nextReq ? `
                            <div class="upgrade-cost">${this.formatNumber(nextReq.credits)} кр</div>
                        ` : ''}
                    </div>
                `}
            </div>
        `;
    }

    /**
     * Привязать обработчики событий
     */
    private attachEventHandlers(): void {
        if (!this.container) return;

        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const action = target.dataset.action;

            switch (action) {
                case 'toggle':
                    this.isCollapsed = !this.isCollapsed;
                    this.refresh();
                    break;

                case 'category':
                    this.currentCategory = target.dataset.category as UpgradeCategory;
                    this.refresh();
                    break;

                case 'select':
                    const selectId = target.closest('[data-id]')?.getAttribute('data-id');
                    if (selectId) {
                        this.selectedElementId = selectId;
                        if (this.onElementSelect) {
                            this.onElementSelect(this.currentCategory, selectId);
                        }
                        this.refresh();
                    }
                    break;

                case 'upgrade':
                    const upgradeId = target.dataset.id;
                    if (upgradeId) {
                        this.handleUpgrade(upgradeId);
                    }
                    break;
            }
        });
    }

    /**
     * Обработать прокачку
     */
    private handleUpgrade(elementId: string): void {
        const result = upgradeManager.upgrade(this.currentCategory, elementId);

        if (!result.success && result.error) {
            let message = '';
            switch (result.error) {
                case 'insufficient_xp':
                    message = 'Недостаточно опыта!';
                    break;
                case 'insufficient_credits':
                    message = 'Недостаточно кредитов!';
                    break;
                case 'max_level':
                    message = 'Максимальный уровень!';
                    break;
                default:
                    message = 'Ошибка прокачки';
            }
            this.showNotification(message);
        }
    }

    /**
     * Обновить UI
     */
    refresh(): void {
        if (this.container) {
            this.container.innerHTML = this.renderContent();
            this.attachEventHandlers();
        }
    }

    /**
     * Показать уведомление
     */
    showNotification(message: string): void {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * Показать эффект повышения уровня
     */
    private showLevelUpEffect(level: number): void {
        const effect = document.createElement('div');
        effect.className = 'level-up-effect';
        effect.textContent = `LEVEL UP! ${level}`;
        document.body.appendChild(effect);

        setTimeout(() => {
            effect.remove();
        }, 1000);
    }

    /**
     * Форматировать число
     */
    private formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    /**
     * Установить коллбэк выбора элемента
     */
    setOnElementSelect(callback: (category: UpgradeCategory, elementId: string) => void): void {
        this.onElementSelect = callback;
    }

    /**
     * Уничтожить UI
     */
    destroy(): void {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
    }

    /**
     * Показать/скрыть панель
     */
    setVisible(visible: boolean): void {
        if (this.container) {
            this.container.style.display = visible ? 'block' : 'none';

            // Manage menu mode (pointer lock/input)
            const game = (window as any).gameInstance;
            if (game) {
                game.setMenuMode(visible);
            }
        }
    }
}

// ============================================
// СИНГЛТОН (LAZY INITIALIZATION)
// ============================================

/** Приватный экземпляр UI прокачки */
let _upgradeUIInstance: UpgradeUI | null = null;

/** Получить глобальный экземпляр UI прокачки */
export function getUpgradeUI(): UpgradeUI {
    if (!_upgradeUIInstance) {
        _upgradeUIInstance = new UpgradeUI();
    }
    return _upgradeUIInstance;
}

/** 
 * Глобальный экземпляр UI прокачки (lazy proxy)
 */
export const upgradeUI: UpgradeUI = new Proxy({} as UpgradeUI, {
    get(_target, prop) {
        const instance = getUpgradeUI();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    set(_target, prop, value) {
        const instance = getUpgradeUI();
        (instance as any)[prop] = value;
        return true;
    }
});

