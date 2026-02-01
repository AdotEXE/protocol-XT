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

    // Фильтрация и поиск
    private searchQuery: string = "";
    private filterState: "all" | "alive" | "dead" = "alive";
    private filterDistance: "all" | "near" | "mid" | "far" = "all";
    private filterPerformance: "all" | "high" | "medium" | "low" = "all";
    private sortBy: "id" | "distance" | "fpsImpact" | "cpuUsage" = "distance";
    private sortOrder: "asc" | "desc" = "asc";

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

        try {
            // Останавливаем обновления
            this.stopUpdates();

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
                    logger.warn("[BotPerformanceProfiler] Error disposing container:", e);
                }
                this.container = null;
            }

            this.isVisible = false;
            this.selectedBotId = null;

            logger.log("[BotPerformanceProfiler] Profiler hidden");
        } catch (e) {
            logger.error("[BotPerformanceProfiler] Error hiding profiler:", e);
            // Принудительно сбрасываем состояние
            this.isVisible = false;
            this.container = null;
            this.buttonObservers = [];
            this.selectedBotId = null;
        }
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
        title.fontFamily = "'Press Start 2P', monospace";
        title.top = "-320px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.addControl(title);

        // Загрузка сохраненных фильтров
        this.loadFilters();

        // Поиск и фильтры
        this.renderFilters(container);

        // Список ботов
        const botListLabel = new TextBlock("bot_list_label", "Выберите бота:");
        botListLabel.color = "#0f0";
        botListLabel.fontSize = 12;
        botListLabel.fontFamily = "'Press Start 2P', monospace";
        botListLabel.top = "-180px";
        botListLabel.left = "-240px";
        botListLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(botListLabel);

        // Рендерим отфильтрованный список ботов
        this.renderBotList(container);

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
        closeButton.isPointerBlocker = true;
        closeButton.hoverCursor = "pointer";
        closeButton.zIndex = 2001;
        const closeObserver = closeButton.onPointerClickObservable.add(() => {
            try {
                logger.log("[BotPerformanceProfiler] Close button clicked");
                this.hide();
            } catch (e) {
                logger.error("[BotPerformanceProfiler] Error closing profiler:", e);
            }
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
     * Отрисовать фильтры и поиск
     */
    private renderFilters(container: Rectangle): void {
        let yOffset = -270;

        // Поиск
        const searchLabel = new TextBlock("search_label", "🔍 Поиск:");
        searchLabel.color = "#0f0";
        searchLabel.fontSize = 11;
        searchLabel.fontFamily = "'Press Start 2P', monospace";
        searchLabel.top = `${yOffset}px`;
        searchLabel.left = "-240px";
        searchLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(searchLabel);
        yOffset += 20;

        // Кнопки поиска (упрощенный вариант - можно улучшить с HTML input)
        const searchClearBtn = Button.CreateSimpleButton("search_clear", this.searchQuery || "Очистить");
        searchClearBtn.width = "100px";
        searchClearBtn.height = "20px";
        searchClearBtn.color = "#0f0";
        searchClearBtn.background = "rgba(0, 50, 0, 0.8)";
        searchClearBtn.top = `${yOffset}px`;
        searchClearBtn.left = "-240px";
        searchClearBtn.fontSize = 9;
        const searchObserver = searchClearBtn.onPointerClickObservable.add(() => {
            this.searchQuery = "";
            this.saveFilters();
            this.updateBotList();
        });
        this.buttonObservers.push({ button: searchClearBtn, observer: searchObserver });
        container.addControl(searchClearBtn);

        // Фильтр по состоянию
        yOffset += 30;
        const stateLabel = new TextBlock("state_label", "Состояние:");
        stateLabel.color = "#0f0";
        stateLabel.fontSize = 11;
        stateLabel.fontFamily = "'Press Start 2P', monospace";
        stateLabel.top = `${yOffset}px`;
        stateLabel.left = "-240px";
        container.addControl(stateLabel);
        yOffset += 20;

        const stateOptions = [
            { value: "all" as const, label: "Все" },
            { value: "alive" as const, label: "Живые" },
            { value: "dead" as const, label: "Мертвые" }
        ];
        stateOptions.forEach((opt, idx) => {
            const btn = Button.CreateSimpleButton(`filter_state_${opt.value}`, opt.label);
            btn.width = "70px";
            btn.height = "20px";
            btn.color = this.filterState === opt.value ? "#0ff" : "#0f0";
            btn.background = this.filterState === opt.value ? "rgba(0, 100, 100, 0.8)" : "rgba(0, 50, 0, 0.8)";
            btn.top = `${yOffset}px`;
            btn.left = `${-240 + idx * 75}px`;
            btn.fontSize = 9;
            const obs = btn.onPointerClickObservable.add(() => {
                this.filterState = opt.value;
                this.saveFilters();
                this.updateBotList();
            });
            this.buttonObservers.push({ button: btn, observer: obs });
            container.addControl(btn);
        });

        // Сортировка
        yOffset += 30;
        const sortLabel = new TextBlock("sort_label", "Сортировка:");
        sortLabel.color = "#0f0";
        sortLabel.fontSize = 11;
        sortLabel.fontFamily = "'Press Start 2P', monospace";
        sortLabel.top = `${yOffset}px`;
        sortLabel.left = "-240px";
        container.addControl(sortLabel);
        yOffset += 20;

        const sortOptions = [
            { value: "distance" as const, label: "Расстояние" },
            { value: "fpsImpact" as const, label: "FPS" },
            { value: "cpuUsage" as const, label: "CPU" }
        ];
        sortOptions.forEach((opt, idx) => {
            const btn = Button.CreateSimpleButton(`sort_${opt.value}`, opt.label);
            btn.width = "80px";
            btn.height = "20px";
            btn.color = this.sortBy === opt.value ? "#0ff" : "#0f0";
            btn.background = this.sortBy === opt.value ? "rgba(0, 100, 100, 0.8)" : "rgba(0, 50, 0, 0.8)";
            btn.top = `${yOffset}px`;
            btn.left = `${-240 + idx * 85}px`;
            btn.fontSize = 9;
            const obs = btn.onPointerClickObservable.add(() => {
                if (this.sortBy === opt.value) {
                    this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
                } else {
                    this.sortBy = opt.value;
                    this.sortOrder = "asc";
                }
                this.saveFilters();
                this.updateBotList();
            });
            this.buttonObservers.push({ button: btn, observer: obs });
            container.addControl(btn);
        });

        // Кнопка изменения порядка сортировки
        const orderBtn = Button.CreateSimpleButton("sort_order", this.sortOrder === "asc" ? "↑" : "↓");
        orderBtn.width = "30px";
        orderBtn.height = "20px";
        orderBtn.color = "#0f0";
        orderBtn.background = "rgba(0, 50, 0, 0.8)";
        orderBtn.top = `${yOffset}px`;
        orderBtn.left = "50px";
        orderBtn.fontSize = 12;
        const orderObs = orderBtn.onPointerClickObservable.add(() => {
            this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
            this.saveFilters();
            this.updateBotList();
        });
        this.buttonObservers.push({ button: orderBtn, observer: orderObs });
        container.addControl(orderBtn);
    }

    /**
     * Отрисовать список ботов с фильтрацией
     */
    private renderBotList(container: Rectangle): void {
        const allBots = this.monitor.getAllBots();
        const filtered = this.filterAndSortBots(allBots);

        let yOffset = -150;
        const maxBots = 15;

        filtered.slice(0, maxBots).forEach((bot, index) => {
            const metrics = bot.metrics;
            const botButton = Button.CreateSimpleButton(
                `bot_${metrics.id}`,
                `${index + 1}. ${metrics.id.length > 10 ? metrics.id.substring(0, 10) + "..." : metrics.id} | ${metrics.distance.toFixed(0)}м | FPS:${metrics.fpsImpact.toFixed(1)}%`
            );
            botButton.width = "460px";
            botButton.height = "22px";
            botButton.color = this.selectedBotId === metrics.id ? "#0ff" : "#0f0";
            botButton.background = this.selectedBotId === metrics.id
                ? "rgba(0, 100, 100, 0.8)"
                : "rgba(0, 50, 0, 0.8)";
            botButton.top = `${yOffset}px`;
            botButton.left = "-230px";
            botButton.fontSize = 9;
            const observer = botButton.onPointerClickObservable.add(() => {
                this.selectedBotId = metrics.id;
                this.updateProfile();
            });
            this.buttonObservers.push({ button: botButton, observer });
            container.addControl(botButton);
            yOffset += 24;
        });

        // Показываем количество отфильтрованных ботов
        if (filtered.length > maxBots) {
            const moreLabel = new TextBlock("more_bots", `... и еще ${filtered.length - maxBots} ботов`);
            moreLabel.color = "#0a0";
            moreLabel.fontSize = 10;
            moreLabel.fontFamily = "'Press Start 2P', monospace";
            moreLabel.top = `${yOffset}px`;
            moreLabel.left = "-230px";
            container.addControl(moreLabel);
        }
    }

    /**
     * Фильтрация и сортировка ботов
     */
    private filterAndSortBots(bots: Array<{ metrics: BotMetrics }>): Array<{ metrics: BotMetrics }> {
        let filtered = bots;

        // Фильтр по состоянию
        if (this.filterState === "alive") {
            filtered = filtered.filter(b => b.metrics.isAlive);
        } else if (this.filterState === "dead") {
            filtered = filtered.filter(b => !b.metrics.isAlive);
        }

        // Фильтр по расстоянию
        if (this.filterDistance === "near") {
            filtered = filtered.filter(b => b.metrics.distance < 50);
        } else if (this.filterDistance === "mid") {
            filtered = filtered.filter(b => b.metrics.distance >= 50 && b.metrics.distance < 100);
        } else if (this.filterDistance === "far") {
            filtered = filtered.filter(b => b.metrics.distance >= 100);
        }

        // Фильтр по производительности
        if (this.filterPerformance === "high") {
            filtered = filtered.filter(b => b.metrics.fpsImpact > 5);
        } else if (this.filterPerformance === "medium") {
            filtered = filtered.filter(b => b.metrics.fpsImpact >= 2 && b.metrics.fpsImpact <= 5);
        } else if (this.filterPerformance === "low") {
            filtered = filtered.filter(b => b.metrics.fpsImpact < 2);
        }

        // Поиск
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(b =>
                b.metrics.id.toLowerCase().includes(query) ||
                b.metrics.state.toLowerCase().includes(query)
            );
        }

        // Сортировка
        filtered.sort((a, b) => {
            let aVal: number, bVal: number;
            switch (this.sortBy) {
                case "distance":
                    aVal = a.metrics.distance;
                    bVal = b.metrics.distance;
                    break;
                case "fpsImpact":
                    aVal = a.metrics.fpsImpact;
                    bVal = b.metrics.fpsImpact;
                    break;
                case "cpuUsage":
                    aVal = a.metrics.cpuUsage;
                    bVal = b.metrics.cpuUsage;
                    break;
                default:
                    aVal = 0;
                    bVal = 0;
            }
            return this.sortOrder === "asc" ? aVal - bVal : bVal - aVal;
        });

        return filtered;
    }

    /**
     * Обновить список ботов
     */
    private updateBotList(): void {
        if (!this.container) return;

        // Удаляем старые кнопки ботов
        const controlsToRemove: Control[] = [];
        this.container.children.forEach(child => {
            if (child.name && child.name.startsWith("bot_")) {
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

        // Удаляем метку "еще ботов"
        const moreLabel = this.container.children.find(c => c.name === "more_bots");
        if (moreLabel) {
            try {
                moreLabel.dispose();
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        // Рендерим новый список
        this.renderBotList(this.container);
    }

    /**
     * Сохранить фильтры в localStorage
     */
    private saveFilters(): void {
        try {
            localStorage.setItem("botProfilerFilters", JSON.stringify({
                searchQuery: this.searchQuery,
                filterState: this.filterState,
                filterDistance: this.filterDistance,
                filterPerformance: this.filterPerformance,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder
            }));
        } catch (e) {
            logger.warn("[BotPerformanceProfiler] Failed to save filters:", e);
        }
    }

    /**
     * Загрузить фильтры из localStorage
     */
    private loadFilters(): void {
        try {
            const saved = localStorage.getItem("botProfilerFilters");
            if (saved) {
                const filters = JSON.parse(saved);
                this.searchQuery = filters.searchQuery || "";
                this.filterState = filters.filterState || "alive";
                this.filterDistance = filters.filterDistance || "all";
                this.filterPerformance = filters.filterPerformance || "all";
                this.sortBy = filters.sortBy || "distance";
                this.sortOrder = filters.sortOrder || "asc";
            }
        } catch (e) {
            logger.warn("[BotPerformanceProfiler] Failed to load filters:", e);
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
        line.fontFamily = "'Press Start 2P', monospace";
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

