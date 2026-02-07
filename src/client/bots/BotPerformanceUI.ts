/**
 * Bot Performance UI - UI для отображения метрик и настроек производительности ботов
 */

import { BotPerformanceMonitor, AggregatedBotMetrics, BotPerformanceSettings } from "./BotPerformanceMonitor";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Button, Line } from "@babylonjs/gui";
import { logger } from "../utils/logger";

export class BotPerformanceUI {
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
     * Показать UI
     */
    show(): void {
        if (this._isVisible) return;

        this.createUI();
        this._isVisible = true;
        this.startUpdates();
    }

    /**
     * Проверить, виден ли UI
     */
    isVisible(): boolean {
        return this._isVisible;
    }

    /**
     * Скрыть UI
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
                    logger.warn("[BotPerformanceUI] Error disposing container:", e);
                }
                this.container = null;
            }

            this.stopUpdates();
            this._isVisible = false;

            logger.log("[BotPerformanceUI] UI hidden");
        } catch (e) {
            logger.error("[BotPerformanceUI] Error hiding UI:", e);
            // Принудительно сбрасываем состояние
            this._isVisible = false;
            this.container = null;
            this.buttonObservers = [];
        }
    }

    /**
     * Создать UI
     */
    private createUI(): void {
        const container = new Rectangle("botPerformanceUI");
        container.width = "600px";
        container.height = "900px";
        container.color = "#0f0";
        container.thickness = 2;
        container.background = "rgba(0, 20, 0, 0.95)";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "-20px";
        container.top = "20px";
        container.zIndex = 1000;

        // Заголовок
        const title = new TextBlock("title", "🤖 МОНИТОРИНГ БОТОВ");
        title.color = "#0f0";
        title.fontSize = 18;
        title.fontFamily = "'Press Start 2P', monospace";
        title.top = "-380px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.addControl(title);

        // Кнопка закрытия/свернуть
        const closeButton = Button.CreateSimpleButton("close", "✕ ЗАКРЫТЬ");
        closeButton.width = "120px";
        closeButton.height = "35px";
        closeButton.color = "#f00";
        closeButton.background = "rgba(50, 0, 0, 0.9)";
        closeButton.top = "-380px";
        closeButton.left = "230px";
        closeButton.fontSize = 14;
        closeButton.thickness = 2;
        closeButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        closeButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        closeButton.zIndex = 1001;
        closeButton.isPointerBlocker = true;
        closeButton.hoverCursor = "pointer";
        const closeObserver = closeButton.onPointerClickObservable.add(() => {
            try {
                logger.log("[BotPerformanceUI] Close button clicked");
                this.hide();
            } catch (e) {
                logger.error("[BotPerformanceUI] Error closing UI:", e);
            }
        });
        this.buttonObservers.push({ button: closeButton, observer: closeObserver });
        container.addControl(closeButton);

        // Контейнер для метрик
        const metricsContainer = new Rectangle("metricsContainer");
        metricsContainer.width = "580px";
        metricsContainer.height = "750px";
        metricsContainer.color = "#0a0";
        metricsContainer.thickness = 1;
        metricsContainer.background = "rgba(0, 10, 0, 0.8)";
        metricsContainer.top = "20px";
        container.addControl(metricsContainer);

        // Метрики будут обновляться динамически
        this.container = container;
        this.texture.addControl(container);

        this.updateMetrics();
    }

    /**
     * Обновить метрики в UI
     */
    private updateMetrics(): void {
        if (!this.container || !this.monitor) return;

        try {
            const metrics = this.monitor.getAggregatedMetrics();
            const settings = this.monitor.getSettings();

            if (!metrics || !settings) {
                return;
            }

            // Удаляем старые элементы метрик
            const oldMetrics = this.container.children?.filter(c => c.name && c.name.startsWith("metric_")) || [];
            oldMetrics.forEach(c => c.dispose());

            let yOffset = -350;
            const lineHeight = 20;
            const sectionSpacing = 10;

            // Общая статистика
            this.addMetricLine("📊 ОБЩАЯ СТАТИСТИКА", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Всего ботов: ${metrics.totalBots}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Живых: ${metrics.aliveBots} | Мёртвых: ${metrics.deadBots}`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Распределение по расстояниям
            this.addMetricLine("📏 РАССТОЯНИЯ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Близкие (<50м): ${metrics.nearBots}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Средние (50-100м): ${metrics.midBots}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Дальние (>100м): ${metrics.farBots}`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Производительность
            this.addMetricLine("⚡ ПРОИЗВОДИТЕЛЬНОСТЬ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Среднее время обновления: ${metrics.averageUpdateTime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Макс: ${metrics.maxUpdateTime.toFixed(2)}ms | Мин: ${metrics.minUpdateTime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`AI время: ${metrics.totalAITime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Физика: ${metrics.totalPhysicsTime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Рендер: ${metrics.totalRenderTime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Влияние на FPS: ${metrics.estimatedFPSImpact.toFixed(2)}%`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // LOD
            this.addMetricLine("🎯 LOD", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Высокий: ${metrics.highLOD}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Средний: ${metrics.mediumLOD}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Низкий: ${metrics.lowLOD}`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Физика
            this.addMetricLine("🔧 ФИЗИКА", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`С физикой: ${metrics.botsWithPhysics}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Без физики: ${metrics.botsWithoutPhysics}`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Состояния
            this.addMetricLine("🔄 СОСТОЯНИЯ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            Object.entries(metrics.stateDistribution).forEach(([state, count]) => {
                this.addMetricLine(`${state}: ${count}`, yOffset);
                yOffset += lineHeight;
            });
            yOffset += sectionSpacing;

            // Интервалы обновления
            this.addMetricLine("⏱️ ИНТЕРВАЛЫ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            Object.entries(metrics.updateIntervalDistribution).forEach(([interval, count]) => {
                this.addMetricLine(`Каждые ${interval} кадров: ${count}`, yOffset);
                yOffset += lineHeight;
            });
            yOffset += sectionSpacing;

            // Настройки
            this.addMetricLine("⚙️ НАСТРОЙКИ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Близкие: ${settings.aiUpdateIntervalNear} кадр`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Средние: ${settings.aiUpdateIntervalMid} кадров`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Дальние: ${settings.aiUpdateIntervalFar} кадров`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Адаптивное: ${settings.adaptiveUpdateEnabled ? "Да" : "Нет"}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`LOD: ${settings.lodEnabled ? "Вкл" : "Выкл"}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Макс ботов: ${settings.maxBots}`, yOffset);
            yOffset += lineHeight;

            // Детальное время AI методов
            yOffset += sectionSpacing;
            this.addMetricLine("🧠 ДЕТАЛЬНОЕ ВРЕМЯ AI", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`updateAI: ${metrics.averageAITiming.updateAITime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`makeDecision: ${metrics.averageAITiming.makeDecisionTime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`raycast: ${metrics.averageAITiming.raycastTime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`pathfinding: ${metrics.averageAITiming.pathfindingTime.toFixed(2)}ms`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Статистика стрельбы
            this.addMetricLine("🎯 СТРЕЛЬБА", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Выстрелов: ${metrics.totalShotsFired}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Попаданий: ${metrics.totalShotsHit}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Точность: ${metrics.averageAccuracy.toFixed(1)}%`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Статистика движения
            this.addMetricLine("🚗 ДВИЖЕНИЕ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Пройдено: ${metrics.totalDistanceTraveled.toFixed(1)}м`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Средняя скорость: ${metrics.averageSpeed.toFixed(1)}м/с`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Макс скорость: ${metrics.maxSpeed.toFixed(1)}м/с`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Статистика уклонений
            this.addMetricLine("⚡ УКЛОНЕНИЯ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Всего: ${metrics.totalDodges}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Успешных: ${metrics.successfulDodges}`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Успешность: ${metrics.dodgeSuccessRate.toFixed(1)}%`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Кэш статистика
            this.addMetricLine("💾 КЭШ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`Raycast hit rate: ${metrics.raycastCacheHitRate.toFixed(1)}%`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Pathfinding hit rate: ${metrics.pathfindingCacheHitRate.toFixed(1)}%`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Производительность системы
            this.addMetricLine("⚙️ СИСТЕМА", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.addMetricLine(`CPU использование: ${metrics.averageCPUUsage.toFixed(1)}%`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Память: ${(metrics.totalMemoryUsage / 1024).toFixed(1)}MB`, yOffset);
            yOffset += lineHeight;
            this.addMetricLine(`Макс память/бот: ${(metrics.maxMemoryPerBot).toFixed(1)}KB`, yOffset);
            yOffset += lineHeight + sectionSpacing;

            // Графики производительности
            yOffset += sectionSpacing;
            this.addMetricLine("📊 ГРАФИКИ", yOffset, true);
            yOffset += lineHeight + sectionSpacing;
            this.renderPerformanceChart(yOffset, metrics.history || []);
            yOffset += 60; // Место для графика

            // Алерты
            const alerts = this.monitor.getPerformanceAlerts();
            if (alerts.length > 0) {
                yOffset += sectionSpacing;
                this.addMetricLine("⚠️ АЛЕРТЫ", yOffset, true);
                yOffset += lineHeight + sectionSpacing;
                alerts.slice(0, 3).forEach(alert => {
                    const color = alert.level === "critical" ? "#f00" : alert.level === "warning" ? "#ff0" : "#0ff";
                    this.addMetricLine(`[${alert.level.toUpperCase()}] ${alert.message}`, yOffset, false, color);
                    yOffset += lineHeight;
                });
            }

            // Рекомендации (расширенные)
            const recommendations = this.monitor.getOptimizationRecommendations();
            if (recommendations.length > 0) {
                yOffset += sectionSpacing;
                this.addMetricLine("💡 РЕКОМЕНДАЦИИ", yOffset, true);
                yOffset += lineHeight + sectionSpacing;
                recommendations.slice(0, 5).forEach(rec => {
                    const color = rec.priority === "high" ? "#f00" : rec.priority === "medium" ? "#ff0" : "#0f0";
                    this.addMetricLine(`[${rec.priority.toUpperCase()}] ${rec.message}`, yOffset, false, color);
                    yOffset += lineHeight;
                });
            }

            // Кнопки действий
            yOffset += sectionSpacing;
            this.addActionButtons(yOffset);
        } catch (e) {
            logger.warn("[BotPerformanceUI] Error updating metrics:", e);
        }
    }

    /**
     * Отрисовать график производительности
     */
    private renderPerformanceChart(top: number, history: Array<{ timestamp: number; fpsImpact: number; averageUpdateTime: number; aliveBots: number }>): void {
        if (!this.container || !history || history.length === 0) return;

        try {
            const chartHeight = 50;
            const chartWidth = 560;
            const fpsImpacts = history.map(h => h.fpsImpact).filter(v => isFinite(v) && v >= 0);
            if (fpsImpacts.length === 0) return;

            const maxValue = Math.max(...fpsImpacts, 1);

            // График FPS Impact
            const chartLabel = new TextBlock("chart_label", "FPS Impact (%)");
            chartLabel.color = "#0f0";
            chartLabel.fontSize = 10;
            chartLabel.fontFamily = "'Press Start 2P', monospace";
            chartLabel.top = `${top}px`;
            chartLabel.left = "-280px";
            chartLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            this.container.addControl(chartLabel);

            // Улучшенный график с визуальными элементами
            const chartData = history.slice(-30).filter(h =>
                h && isFinite(h.fpsImpact) && h.fpsImpact >= 0
            ); // Последние 30 точек

            if (chartData.length === 0) return;

            // Фон графика
            const chartBg = new Rectangle("chart_bg");
            chartBg.width = "560px";
            chartBg.height = "40px";
            chartBg.color = "#0a0";
            chartBg.thickness = 1;
            chartBg.background = "rgba(0, 10, 0, 0.5)";
            chartBg.top = `${top + 15}px`;
            chartBg.left = "-280px";
            this.container.addControl(chartBg);

            // Визуальные столбцы графика
            const barWidth = 560 / chartData.length;
            chartData.forEach((h, index) => {
                const barHeight = Math.max(2, Math.min(38, (h.fpsImpact / maxValue) * 38));
                const barColor = h.fpsImpact > 5 ? "#f00" : h.fpsImpact > 2 ? "#ff0" : "#0f0";

                const bar = new Rectangle(`chart_bar_${index}`);
                bar.width = `${Math.max(2, barWidth - 1)}px`;
                bar.height = `${barHeight}px`;
                bar.color = barColor;
                bar.thickness = 0;
                bar.background = barColor;
                bar.top = `${top + 15 + (40 - barHeight)}px`;
                bar.left = `${-280 + index * barWidth}px`;
                this.container?.addControl(bar); // [Opus 4.6] Null-safe access
            });

            // Текстовое представление для дополнительной информации
            const chartText = chartData.slice(-15).map((h) => {
                const barHeight = Math.max(0, Math.min(8, Math.floor((h.fpsImpact / maxValue) * 8)));
                return "█".repeat(barHeight);
            }).join("");

            const chartDisplay = new TextBlock("chart_display", chartText);
            chartDisplay.color = "#0aa";
            chartDisplay.fontSize = 7;
            chartDisplay.fontFamily = "'Press Start 2P', monospace";
            chartDisplay.top = `${top + 60}px`;
            chartDisplay.left = "-280px";
            chartDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            chartDisplay.textWrapping = false;
            this.container.addControl(chartDisplay);

            // Значения (с защитой от пустого массива)
            const validImpacts = chartData.map(h => h.fpsImpact).filter(v => isFinite(v));
            if (validImpacts.length > 0) {
                const minValue = Math.min(...validImpacts);
                const maxValue2 = Math.max(...validImpacts);
                const avgValue = validImpacts.reduce((s, v) => s + v, 0) / validImpacts.length;

                const chartValues = new TextBlock("chart_values",
                    `Min: ${minValue.toFixed(1)}% | ` +
                    `Max: ${maxValue2.toFixed(1)}% | ` +
                    `Avg: ${avgValue.toFixed(1)}%`
                );
                chartValues.color = "#0aa";
                chartValues.fontSize = 9;
                chartValues.fontFamily = "'Press Start 2P', monospace";
                chartValues.top = `${top + 35}px`;
                chartValues.left = "-280px";
                chartValues.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                this.container.addControl(chartValues);
            }
        } catch (e) {
            logger.warn("[BotPerformanceUI] Error rendering chart:", e);
        }
    }

    /**
     * Добавить кнопки действий
     */
    private addActionButtons(top: number): void {
        if (!this.container) return;

        // Кнопка автооптимизации
        const autoOptButton = Button.CreateSimpleButton("auto_optimize", "⚡ АВТООПТИМИЗАЦИЯ");
        autoOptButton.width = "180px";
        autoOptButton.height = "30px";
        autoOptButton.color = "#0f0";
        autoOptButton.background = "rgba(0, 50, 0, 0.8)";
        autoOptButton.top = `${top}px`;
        autoOptButton.left = "-280px";
        autoOptButton.fontSize = 11;
        const autoOptObserver = autoOptButton.onPointerClickObservable.add(() => {
            try {
                if (!this.monitor) return;
                const result = this.monitor.autoOptimize();
                if (result.optimized) {
                    logger.log("[BotPerformanceUI] Auto-optimization applied:", result.changes);
                    this.updateMetrics(); // Обновить UI
                }
            } catch (e) {
                logger.error("[BotPerformanceUI] Error in auto-optimization:", e);
            }
        });
        this.buttonObservers.push({ button: autoOptButton, observer: autoOptObserver });
        this.container.addControl(autoOptButton);

        // Кнопка экспорта
        const exportButton = Button.CreateSimpleButton("export", "💾 ЭКСПОРТ");
        exportButton.width = "180px";
        exportButton.height = "30px";
        exportButton.color = "#0f0";
        exportButton.background = "rgba(0, 50, 0, 0.8)";
        exportButton.top = `${top}px`;
        exportButton.left = "-80px";
        exportButton.fontSize = 11;
        const exportObserver = exportButton.onPointerClickObservable.add(() => {
            try {
                if (!this.monitor) return;
                const json = this.monitor.exportMetrics("json");
                if (!json) return;
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bot-metrics-${Date.now()}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 100);
            } catch (e) {
                logger.error("[BotPerformanceUI] Error exporting metrics:", e);
            }
        });
        this.buttonObservers.push({ button: exportButton, observer: exportObserver });
        this.container.addControl(exportButton);

        // Кнопка экспорта CSV
        const exportCsvButton = Button.CreateSimpleButton("export_csv", "📊 CSV");
        exportCsvButton.width = "100px";
        exportCsvButton.height = "30px";
        exportCsvButton.color = "#0f0";
        exportCsvButton.background = "rgba(0, 50, 0, 0.8)";
        exportCsvButton.top = `${top}px`;
        exportCsvButton.left = "120px";
        exportCsvButton.fontSize = 11;
        const exportCsvObserver = exportCsvButton.onPointerClickObservable.add(() => {
            try {
                if (!this.monitor) return;
                const csv = this.monitor.exportMetrics("csv");
                if (!csv) return;
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bot-metrics-${Date.now()}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 100);
            } catch (e) {
                logger.error("[BotPerformanceUI] Error exporting CSV:", e);
            }
        });
        this.buttonObservers.push({ button: exportCsvButton, observer: exportCsvObserver });
        this.container.addControl(exportCsvButton);

        // Кнопка настроек производительности ботов
        const settingsButton = Button.CreateSimpleButton("bot_settings", "⚙️ НАСТРОЙКИ");
        settingsButton.width = "140px";
        settingsButton.height = "30px";
        settingsButton.color = "#0ff";
        settingsButton.background = "rgba(0, 50, 50, 0.8)";
        settingsButton.top = `${top + 40}px`;
        settingsButton.left = "-280px";
        settingsButton.fontSize = 11;
        const settingsObserver = settingsButton.onPointerClickObservable.add(() => {
            try {
                // Отправляем событие для открытия настроек производительности ботов
                window.dispatchEvent(new CustomEvent("botPerformanceSettingsUI:show"));
                logger.log("[BotPerformanceUI] Bot performance settings button clicked");
            } catch (e) {
                logger.error("[BotPerformanceUI] Error opening bot performance settings:", e);
            }
        });
        this.buttonObservers.push({ button: settingsButton, observer: settingsObserver });
        this.container.addControl(settingsButton);
    }

    /**
     * Добавить строку метрики
     */
    private addMetricLine(text: string, top: number, isHeader: boolean = false, color: string = "#0f0"): void {
        if (!this.container) return;

        const line = new TextBlock(`metric_${top}`, text);
        line.color = color;
        line.fontSize = isHeader ? 14 : 12;
        line.fontFamily = "'Press Start 2P', monospace";
        line.top = `${top}px`;
        line.left = "-280px";
        line.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        line.textWrapping = true;
        line.width = "560px";
        this.container.addControl(line);
    }

    /**
     * Запустить обновления
     */
    private startUpdates(): void {
        if (this.updateTimer) return;

        this.updateTimer = setInterval(() => {
            this.updateMetrics();
        }, 1000); // Обновляем каждую секунду
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

