/**
 * Bot Performance Profiler - Профилирование отдельных ботов
 */

import { BotPerformanceMonitor, BotMetrics } from "./BotPerformanceMonitor";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Button } from "@babylonjs/gui";
import { logger } from "../utils/logger";

export class BotPerformanceProfiler {
    private monitor: BotPerformanceMonitor;
    private texture: AdvancedDynamicTexture;
    private container: Rectangle | null = null;
    private isVisible: boolean = false;
    private selectedBotId: string | null = null;
    private updateTimer: NodeJS.Timeout | null = null;
    private buttonObservers: Array<{ button: Button; observer: any }> = [];
    
    constructor(monitor: BotPerformanceMonitor, texture: AdvancedDynamicTexture) {
        this.monitor = monitor;
        this.texture = texture;
    }
    
    /**
     * Показать профилировщик
     */
    show(botId?: string): void {
        if (this.isVisible) return;
        
        if (botId) {
            this.selectedBotId = botId;
        }
        
        this.createUI();
        this.isVisible = true;
    }
    
    /**
     * Скрыть профилировщик
     */
    hide(): void {
        if (!this.isVisible) return;
        
        // Останавливаем обновления
        this.stopUpdates();
        
        // Удаляем наблюдатели
        this.buttonObservers.forEach(({ button, observer }) => {
            try {
                button.onPointerClickObservable.remove(observer);
            } catch (e) {
                // Игнорируем ошибки при удалении
            }
        });
        this.buttonObservers = [];
        
        if (this.container) {
            this.container.dispose();
            this.container = null;
        }
        
        this.isVisible = false;
        this.selectedBotId = null;
    }
    
    /**
     * Создать UI
     */
    private createUI(): void {
        const container = new Rectangle("botProfilerUI");
        container.width = "500px";
        container.height = "700px";
        container.color = "#0f0";
        container.thickness = 2;
        container.background = "rgba(0, 20, 0, 0.95)";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.zIndex = 1500;
        
        // Заголовок
        const title = new TextBlock("title", "🔍 ПРОФИЛИРОВАНИЕ БОТА");
        title.color = "#0f0";
        title.fontSize = 18;
        title.fontFamily = "Consolas, monospace";
        title.top = "-320px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.addControl(title);
        
        // Список ботов
        const botListLabel = new TextBlock("bot_list_label", "Выберите бота:");
        botListLabel.color = "#0f0";
        botListLabel.fontSize = 12;
        botListLabel.fontFamily = "Consolas, monospace";
        botListLabel.top = "-280px";
        botListLabel.left = "-240px";
        botListLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(botListLabel);
        
        // Получаем список ботов
        const aggregatedMetrics = this.monitor.getAggregatedMetrics();
        if (aggregatedMetrics && aggregatedMetrics.aliveBots > 0) {
            // Показываем первые 10 ботов
            const allBots = this.monitor.getAllBots();
            const aliveMetrics = allBots.filter(b => b.metrics.isAlive).slice(0, 10).map(b => b.metrics);
            
            let yOffset = -250;
            aliveMetrics.forEach((metrics, index) => {
                const botButton = Button.CreateSimpleButton(
                    `bot_${metrics.id}`,
                    `Bot ${index + 1}: ${metrics.id.length > 8 ? metrics.id.substring(0, 8) + "..." : metrics.id} (${metrics.distance.toFixed(0)}м)`
                );
                botButton.width = "460px";
                botButton.height = "25px";
                botButton.color = this.selectedBotId === metrics.id ? "#0ff" : "#0f0";
                botButton.background = this.selectedBotId === metrics.id 
                    ? "rgba(0, 100, 100, 0.8)" 
                    : "rgba(0, 50, 0, 0.8)";
                botButton.top = `${yOffset}px`;
                botButton.left = "-230px";
                botButton.fontSize = 10;
                const observer = botButton.onPointerClickObservable.add(() => {
                    this.selectedBotId = metrics.id;
                    this.updateProfile();
                });
                this.buttonObservers.push({ button: botButton, observer });
                container.addControl(botButton);
                yOffset += 28;
            });
        }
        
        // Профиль выбранного бота
        if (this.selectedBotId) {
            this.renderBotProfile(container, this.selectedBotId);
        }
        
        // Кнопка закрытия
        const closeButton = Button.CreateSimpleButton("close", "✕ ЗАКРЫТЬ");
        closeButton.width = "200px";
        closeButton.height = "40px";
        closeButton.color = "#0f0";
        closeButton.background = "rgba(0, 50, 0, 0.8)";
        closeButton.top = "320px";
        const closeObserver = closeButton.onPointerClickObservable.add(() => {
            this.hide();
        });
        this.buttonObservers.push({ button: closeButton, observer: closeObserver });
        container.addControl(closeButton);
        
        this.container = container;
        this.texture.addControl(container);
        
        // Обновляем профиль каждую секунду
        this.startUpdates();
    }
    
    /**
     * Запустить обновления
     */
    private startUpdates(): void {
        if (this.updateTimer) return;
        
        this.updateTimer = setInterval(() => {
            if (this.isVisible && this.selectedBotId) {
                this.updateProfile();
            }
        }, 1000);
    }
    
    /**
     * Остановить обновления
     */
    private stopUpdates(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }
    
    /**
     * Отрисовать профиль бота
     */
    private renderBotProfile(container: Rectangle, botId: string): void {
        if (!this.monitor || !botId) return;
        
        try {
            const profile = this.monitor.getBotProfile(botId);
            if (!profile || !profile.metrics) return;
        
        let yOffset = 50;
        const lineHeight = 18;
        
        // Performance Score
        const scoreColor = profile.performanceScore > 70 ? "#0f0" : 
                          profile.performanceScore > 40 ? "#ff0" : "#f00";
        this.addProfileLine(container, `Performance Score: ${profile.performanceScore.toFixed(0)}/100`, 
            yOffset, true, scoreColor);
        yOffset += lineHeight + 5;
        
        // Метрики
        this.addProfileLine(container, "📊 МЕТРИКИ", yOffset, true);
        yOffset += lineHeight + 5;
        this.addProfileLine(container, `Состояние: ${profile.metrics.state}`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `Расстояние: ${profile.metrics.distance.toFixed(1)}м`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `LOD: ${profile.metrics.lodLevel}`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `Физика: ${profile.metrics.hasPhysics ? "Да" : "Нет"}`, yOffset);
        yOffset += lineHeight + 5;
        
        // Производительность
        this.addProfileLine(container, "⚡ ПРОИЗВОДИТЕЛЬНОСТЬ", yOffset, true);
        yOffset += lineHeight + 5;
        this.addProfileLine(container, `Время обновления: ${profile.metrics.averageUpdateTime.toFixed(2)}мс`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `Влияние на FPS: ${profile.metrics.fpsImpact.toFixed(2)}%`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `CPU: ${profile.metrics.cpuUsage.toFixed(2)}%`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `Память: ${profile.metrics.memoryUsage.toFixed(1)}KB`, yOffset);
        yOffset += lineHeight + 5;
        
        // AI Timing
        this.addProfileLine(container, "🧠 AI TIMING", yOffset, true);
        yOffset += lineHeight + 5;
        this.addProfileLine(container, `updateAI: ${profile.metrics.aiTiming.updateAITime.toFixed(2)}мс`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `makeDecision: ${profile.metrics.aiTiming.makeDecisionTime.toFixed(2)}мс`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `raycast: ${profile.metrics.aiTiming.raycastTime.toFixed(2)}мс`, yOffset);
        yOffset += lineHeight;
        this.addProfileLine(container, `pathfinding: ${profile.metrics.aiTiming.pathfindingTime.toFixed(2)}мс`, yOffset);
        yOffset += lineHeight + 5;
        
        // Bottlenecks
        if (profile.bottlenecks.length > 0) {
            this.addProfileLine(container, "⚠️ УЗКИЕ МЕСТА", yOffset, true, "#ff0");
            yOffset += lineHeight + 5;
            profile.bottlenecks.forEach(bottleneck => {
                this.addProfileLine(container, `• ${bottleneck}`, yOffset, false, "#ff0");
                yOffset += lineHeight;
            });
            yOffset += 5;
        }
        
        // Рекомендации
        if (profile.recommendations.length > 0) {
            this.addProfileLine(container, "💡 РЕКОМЕНДАЦИИ", yOffset, true);
            yOffset += lineHeight + 5;
            profile.recommendations.forEach(rec => {
                this.addProfileLine(container, `• ${rec}`, yOffset);
                yOffset += lineHeight;
            });
        }
        } catch (e) {
            logger.warn(`[BotPerformanceProfiler] Error rendering profile for bot ${botId}:`, e);
        }
    }
    
    /**
     * Добавить строку профиля
     */
    private addProfileLine(
        container: Rectangle,
        text: string,
        top: number,
        isHeader: boolean = false,
        color: string = "#0f0"
    ): void {
        const line = new TextBlock(`profile_${top}`, text);
        line.color = color;
        line.fontSize = isHeader ? 12 : 10;
        line.fontFamily = "Consolas, monospace";
        line.top = `${top}px`;
        line.left = "-240px";
        line.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        line.textWrapping = true;
        line.width = "480px";
        container.addControl(line);
    }
    
    /**
     * Обновить профиль
     */
    private updateProfile(): void {
        if (!this.container || !this.selectedBotId || !this.monitor) return;
        
        try {
            // Удаляем старые элементы профиля
            const oldProfile = this.container.children?.filter(c => c.name && c.name.startsWith("profile_")) || [];
            oldProfile.forEach(c => {
                try {
                    c.dispose();
                } catch (e) {
                    // Игнорируем ошибки при dispose
                }
            });
            
            // Отрисовываем новый профиль
            this.renderBotProfile(this.container, this.selectedBotId);
        } catch (e) {
            logger.warn("[BotPerformanceProfiler] Error updating profile:", e);
        }
    }
    
    /**
     * Очистить ресурсы
     */
    dispose(): void {
        this.stopUpdates();
        this.hide();
    }
}

