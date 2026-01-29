/**
 * Bot Performance Mini Panel - Компактная панель для постоянного отображения ключевых метрик
 */

import { BotPerformanceMonitor } from "./BotPerformanceMonitor";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Button } from "@babylonjs/gui";
import { logger } from "../utils/logger";

export class BotPerformanceMiniPanel {
    private monitor: BotPerformanceMonitor;
    private texture: AdvancedDynamicTexture;
    private container: Rectangle | null = null;
    private _isVisible: boolean = false;
    
    private updateTimer: NodeJS.Timeout | null = null;
    private buttonObservers: Array<{ button: Button; observer: any }> = [];
    
    constructor(monitor: BotPerformanceMonitor, texture: AdvancedDynamicTexture) {
        this.monitor = monitor;
        this.texture = texture;
    }
    
    /**
     * Показать мини-панель
     */
    show(): void {
        if (this._isVisible) return;
        
        this.createUI();
        this._isVisible = true;
        this.startUpdates();
    }
    
    /**
     * Скрыть мини-панель
     */
    hide(): void {
        if (!this._isVisible) return;
        
        try {
            // Удаляем наблюдатели
            this.buttonObservers.forEach(({ button, observer }) => {
                try {
                    if (button && button.onPointerClickObservable) {
                        button.onPointerClickObservable.remove(observer);
                    }
                } catch (e) {
                    // Игнорируем ошибки при удалении
                }
            });
            this.buttonObservers = [];
            
            if (this.container) {
                try {
                    this.container.dispose();
                } catch (e) {
                    logger.warn("[BotPerformanceMiniPanel] Error disposing container:", e);
                }
                this.container = null;
            }
            
            this.stopUpdates();
            this._isVisible = false;
            
            logger.log("[BotPerformanceMiniPanel] Mini panel hidden");
        } catch (e) {
            logger.error("[BotPerformanceMiniPanel] Error hiding mini panel:", e);
            // Принудительно сбрасываем состояние
            this._isVisible = false;
            this.container = null;
            this.buttonObservers = [];
        }
    }
    
    /**
     * Проверить, видна ли мини-панель
     */
    isVisible(): boolean {
        return this._isVisible;
    }
    
    /**
     * Создать UI
     */
    private createUI(): void {
        const container = new Rectangle("botPerformanceMiniPanel");
        container.width = "250px";
        container.height = "120px";
        container.color = "#0f0";
        container.thickness = 1;
        container.background = "rgba(0, 20, 0, 0.85)";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "10px";
        container.top = "10px";
        container.zIndex = 500;
        container.isPointerBlocker = false; // Не блокируем клики
        
        this.container = container;
        this.texture.addControl(container);
        
        this.updateMetrics();
    }
    
    /**
     * Обновить метрики
     */
    private updateMetrics(): void {
        if (!this.container || !this.monitor) return;
        
        try {
            // Очищаем старые элементы (кроме контейнера)
            const controlsToRemove: Control[] = [];
            this.container.children.forEach(child => {
                if (child.name !== "botPerformanceMiniPanel") {
                    controlsToRemove.push(child);
                }
            });
            controlsToRemove.forEach(control => {
                try {
                    control.dispose();
                } catch (e) {
                    // Игнорируем ошибки
                }
            });
            
            const metrics = this.monitor.getAggregatedMetrics();
            if (!metrics) return;
            
            let yOffset = -50;
            const lineHeight = 18;
            
            // Заголовок
            const title = new TextBlock("miniTitle", "🤖 БОТЫ");
            title.color = "#0f0";
            title.fontSize = 14;
            title.fontFamily = "Consolas, monospace";
            title.top = `${yOffset}px`;
            title.left = "-110px";
            title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            this.container.addControl(title);
            yOffset += lineHeight + 5;
            
            // Ключевые метрики
            const fpsColor = metrics.averageFPSImpact > 5 ? "#f00" : metrics.averageFPSImpact > 2 ? "#ff0" : "#0f0";
            this.addMiniLine(`FPS: ${metrics.averageFPSImpact.toFixed(1)}%`, yOffset, fpsColor);
            yOffset += lineHeight;
            
            this.addMiniLine(`Ботов: ${metrics.aliveBots}/${metrics.totalBots}`, yOffset);
            yOffset += lineHeight;
            
            const cpuColor = metrics.averageCPUUsage > 50 ? "#f00" : metrics.averageCPUUsage > 30 ? "#ff0" : "#0f0";
            this.addMiniLine(`CPU: ${metrics.averageCPUUsage.toFixed(1)}%`, yOffset, cpuColor);
            yOffset += lineHeight;
            
            this.addMiniLine(`Время AI: ${metrics.averageAITiming.totalAITime.toFixed(1)}ms`, yOffset);
            yOffset += lineHeight;
            
            // Кнопка развернуть
            const expandButton = Button.CreateSimpleButton("expand", "📊");
            expandButton.width = "30px";
            expandButton.height = "25px";
            expandButton.color = "#0f0";
            expandButton.background = "rgba(0, 50, 0, 0.8)";
            expandButton.top = "-50px";
            expandButton.left = "100px";
            expandButton.fontSize = 12;
            expandButton.isPointerBlocker = true;
            expandButton.hoverCursor = "pointer";
            expandButton.zIndex = 501;
            const expandObserver = expandButton.onPointerClickObservable.add(() => {
                try {
                    // Отправляем событие для открытия полного UI
                    window.dispatchEvent(new CustomEvent("botPerformanceUI:show"));
                    logger.log("[BotPerformanceMiniPanel] Expand button clicked");
                } catch (e) {
                    logger.error("[BotPerformanceMiniPanel] Error expanding UI:", e);
                }
            });
            this.buttonObservers.push({ button: expandButton, observer: expandObserver });
            this.container.addControl(expandButton);
            
        } catch (e) {
            logger.warn("[BotPerformanceMiniPanel] Error updating metrics:", e);
        }
    }
    
    /**
     * Добавить строку метрики
     */
    private addMiniLine(text: string, top: number, color: string = "#0f0"): void {
        if (!this.container) return;
        
        const line = new TextBlock(`mini_${top}`, text);
        line.color = color;
        line.fontSize = 11;
        line.fontFamily = "Consolas, monospace";
        line.top = `${top}px`;
        line.left = "-110px";
        line.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.addControl(line);
    }
    
    /**
     * Запустить обновления
     */
    private startUpdates(): void {
        if (this.updateTimer) return;
        
        this.updateTimer = setInterval(() => {
            this.updateMetrics();
        }, 2000); // Обновляем каждые 2 секунды
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
     * Очистить ресурсы
     */
    dispose(): void {
        this.hide();
    }
}

