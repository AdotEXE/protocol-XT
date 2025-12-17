/**
 * Auto Screenshot Manager - Автоматические скриншоты по правилам
 */

import { ScreenshotManager, ScreenshotFormat, ScreenshotOptions } from "./screenshotManager";
import { logger } from "./utils/logger";

export enum AutoScreenshotTrigger {
    ENEMY_KILL = "enemy_kill",
    PLAYER_DEATH = "player_death",
    ACHIEVEMENT = "achievement",
    INTERVAL = "interval",
    CUSTOM_EVENT = "custom"
}

export interface Condition {
    type: string;
    value: any;
    operator?: "equals" | "greater" | "less" | "contains";
}

export interface AutoScreenshotRule {
    id: string;
    enabled: boolean;
    trigger: AutoScreenshotTrigger;
    conditions?: Condition[];
    format: ScreenshotFormat;
    mode: any;
    quality?: number;
    filters?: any;
    watermark?: any;
    interval?: number; // для INTERVAL триггера
}

export class AutoScreenshotManager {
    private rules: Map<string, AutoScreenshotRule> = new Map();
    private screenshotManager: ScreenshotManager;
    private game: any; // Game instance
    private intervalTimers: Map<string, number> = new Map();
    
    constructor(screenshotManager: ScreenshotManager, game: any) {
        this.screenshotManager = screenshotManager;
        this.game = game;
        this.loadRules();
    }
    
    /**
     * Настройка правила автоматического скриншота
     */
    setupRule(rule: AutoScreenshotRule): void {
        this.rules.set(rule.id, rule);
        this.subscribeToTrigger(rule);
        this.saveRules();
    }
    
    /**
     * Удаление правила
     */
    removeRule(id: string): void {
        const rule = this.rules.get(id);
        if (rule && rule.trigger === AutoScreenshotTrigger.INTERVAL) {
            const timer = this.intervalTimers.get(id);
            if (timer) {
                clearInterval(timer);
                this.intervalTimers.delete(id);
            }
        }
        this.rules.delete(id);
        this.saveRules();
    }
    
    /**
     * Подписка на триггер
     */
    private subscribeToTrigger(rule: AutoScreenshotRule): void {
        if (!rule.enabled) return;
        
        switch (rule.trigger) {
            case AutoScreenshotTrigger.ENEMY_KILL:
                // Подписка на событие убийства врага
                if (this.game && this.game.enemyTanks) {
                    // Подписка будет установлена при создании врага
                    // Временно используем глобальное событие
                    window.addEventListener('enemyKilled', () => this.executeRule(rule));
                }
                break;
                
            case AutoScreenshotTrigger.PLAYER_DEATH:
                // Подписка на событие смерти игрока
                if (this.game && this.game.tank) {
                    // Подписка будет установлена в tankController
                    window.addEventListener('playerDeath', () => this.executeRule(rule));
                }
                break;
                
            case AutoScreenshotTrigger.ACHIEVEMENT:
                // Подписка на событие достижения
                window.addEventListener('achievementUnlocked', () => this.executeRule(rule));
                break;
                
            case AutoScreenshotTrigger.INTERVAL:
                if (rule.interval) {
                    const timer = setInterval(() => {
                        if (rule.enabled) {
                            this.executeRule(rule);
                        }
                    }, rule.interval * 1000);
                    this.intervalTimers.set(rule.id, timer as any);
                }
                break;
                
            case AutoScreenshotTrigger.CUSTOM_EVENT:
                // Пользовательские события
                window.addEventListener(`customScreenshot_${rule.id}`, () => this.executeRule(rule));
                break;
        }
    }
    
    /**
     * Выполнение правила
     */
    private async executeRule(rule: AutoScreenshotRule): Promise<void> {
        if (!rule.enabled) return;
        
        try {
            // Проверка условий
            if (rule.conditions && !this.checkConditions(rule.conditions)) {
                return;
            }
            
            // Создание опций для скриншота
            const options: ScreenshotOptions = {
                format: rule.format,
                quality: rule.quality || 0.92,
                mode: rule.mode,
                filters: rule.filters,
                watermark: rule.watermark
            };
            
            // Создание скриншота
            const blob = await this.screenshotManager.capture(options);
            
            // Сохранение
            await this.screenshotManager.saveToLocalStorage(blob, options);
            
            logger.log(`[AutoScreenshot] Rule "${rule.id}" executed`);
        } catch (error) {
            logger.error(`[AutoScreenshot] Rule "${rule.id}" failed:`, error);
        }
    }
    
    /**
     * Проверка условий
     */
    private checkConditions(conditions: Condition[]): boolean {
        for (const condition of conditions) {
            let actualValue: any;
            
            // Получение значения в зависимости от типа условия
            switch (condition.type) {
                case 'fps':
                    actualValue = this.game?.engine?.getFps?.() || 0;
                    break;
                case 'health':
                    actualValue = this.game?.tank?.currentHealth || 0;
                    break;
                case 'enemies':
                    actualValue = this.game?.enemyTanks?.length || 0;
                    break;
                default:
                    continue;
            }
            
            // Проверка оператора
            switch (condition.operator) {
                case 'equals':
                    if (actualValue !== condition.value) return false;
                    break;
                case 'greater':
                    if (actualValue <= condition.value) return false;
                    break;
                case 'less':
                    if (actualValue >= condition.value) return false;
                    break;
                case 'contains':
                    if (!String(actualValue).includes(String(condition.value))) return false;
                    break;
                default:
                    if (actualValue !== condition.value) return false;
            }
        }
        
        return true;
    }
    
    /**
     * Загрузка правил из localStorage
     */
    private loadRules(): void {
        try {
            const saved = localStorage.getItem('ptx_auto_screenshots');
            if (saved) {
                const rules: AutoScreenshotRule[] = JSON.parse(saved);
                rules.forEach(rule => {
                    this.rules.set(rule.id, rule);
                    if (rule.enabled) {
                        this.subscribeToTrigger(rule);
                    }
                });
            }
        } catch (error) {
            logger.warn("[AutoScreenshot] Failed to load rules:", error);
        }
    }
    
    /**
     * Сохранение правил в localStorage
     */
    private saveRules(): void {
        try {
            const rules = Array.from(this.rules.values());
            localStorage.setItem('ptx_auto_screenshots', JSON.stringify(rules));
        } catch (error) {
            logger.warn("[AutoScreenshot] Failed to save rules:", error);
        }
    }
    
    /**
     * Получить все правила
     */
    getRules(): AutoScreenshotRule[] {
        return Array.from(this.rules.values());
    }
    
    /**
     * Включить/выключить правило
     */
    toggleRule(id: string): void {
        const rule = this.rules.get(id);
        if (!rule) return;
        
        rule.enabled = !rule.enabled;
        
        if (rule.enabled) {
            this.subscribeToTrigger(rule);
        } else {
            if (rule.trigger === AutoScreenshotTrigger.INTERVAL) {
                const timer = this.intervalTimers.get(id);
                if (timer) {
                    clearInterval(timer);
                    this.intervalTimers.delete(id);
                }
            }
        }
        
        this.saveRules();
    }
}

