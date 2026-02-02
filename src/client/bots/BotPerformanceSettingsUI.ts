/**
 * Bot Performance Settings UI - UI для настройки производительности ботов
 */

import { BotPerformanceMonitor, BotPerformanceSettings, BotPerformanceProfile } from "./BotPerformanceMonitor";
import { logger } from "../utils/logger";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Slider, Button } from "@babylonjs/gui";

export class BotPerformanceSettingsUI {
    private monitor: BotPerformanceMonitor;
    private texture: AdvancedDynamicTexture;
    private container: Rectangle | null = null;
    private _isVisible: boolean = false;
    private observers: Array<{ control: Control; observer: any }> = [];

    constructor(monitor: BotPerformanceMonitor, texture: AdvancedDynamicTexture) {
        this.monitor = monitor;
        this.texture = texture;
    }

    /**
     * Показать UI настроек
     */
    show(): void {
        if (this._isVisible) return;

        this.createUI();
        this._isVisible = true;
    }

    /**
     * Проверить видимость UI
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
            this.observers.forEach(({ control, observer }) => {
                try {
                    if (control) {
                        if ((control as any).onValueChangedObservable) {
                            (control as any).onValueChangedObservable.remove(observer);
                        } else if ((control as any).onPointerClickObservable) {
                            (control as any).onPointerClickObservable.remove(observer);
                        }
                    }
                } catch (e) {
                    // Игнорируем ошибки при удалении
                }
            });
            this.observers = [];

            if (this.container) {
                try {
                    this.container.dispose();
                } catch (e) {
                    logger.warn("[BotPerformanceSettingsUI] Error disposing container:", e);
                }
                this.container = null;
            }

            this._isVisible = false;

            logger.log("[BotPerformanceSettingsUI] Settings UI hidden");
        } catch (e) {
            logger.error("[BotPerformanceSettingsUI] Error hiding settings UI:", e);
            // Принудительно сбрасываем состояние
            this._isVisible = false;
            this.container = null;
            this.observers = [];
        }
    }

    /**
     * Создать UI настроек
     */
    private createUI(): void {
        const container = new Rectangle("botPerformanceSettingsUI");
        container.width = "500px";
        container.height = "900px";
        container.color = "#0f0";
        container.thickness = 2;
        container.background = "rgba(0, 20, 0, 0.95)";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.zIndex = 2000;

        // Заголовок
        const title = new TextBlock("title", "⚙️ НАСТРОЙКИ ПРОИЗВОДИТЕЛЬНОСТИ БОТОВ");
        title.color = "#0f0";
        title.fontSize = 18;
        title.fontFamily = "'Press Start 2P', monospace";
        title.top = "-320px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.addControl(title);

        const settings = this.monitor.getSettings();
        let yOffset = -280;
        const lineHeight = 40;

        // Интервалы обновления AI
        this.addSliderSetting(container, "Близкие боты (<50м)", settings.aiUpdateIntervalNear, 1, 10,
            (value) => {
                this.monitor.updateSettings({ aiUpdateIntervalNear: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Средние боты (50-100м)", settings.aiUpdateIntervalMid, 1, 20,
            (value) => {
                this.monitor.updateSettings({ aiUpdateIntervalMid: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Дальние боты (>100м)", settings.aiUpdateIntervalFar, 1, 30,
            (value) => {
                this.monitor.updateSettings({ aiUpdateIntervalFar: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Адаптивные настройки
        this.addToggleSetting(container, "Адаптивное обновление", settings.adaptiveUpdateEnabled,
            (value) => {
                this.monitor.updateSettings({ adaptiveUpdateEnabled: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Порог низкого FPS", settings.lowFPSThreshold, 10, 60,
            (value) => {
                this.monitor.updateSettings({ lowFPSThreshold: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Множитель при низком FPS", settings.lowFPSMultiplier, 1, 3,
            (value) => {
                this.monitor.updateSettings({ lowFPSMultiplier: value });
            }, yOffset);
        yOffset += lineHeight + 20;

        // LOD настройки
        this.addToggleSetting(container, "LOD включен", settings.lodEnabled,
            (value) => {
                this.monitor.updateSettings({ lodEnabled: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Расстояние высокого LOD", settings.lodDistanceHigh, 10, 100,
            (value) => {
                this.monitor.updateSettings({ lodDistanceHigh: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Расстояние среднего LOD", settings.lodDistanceMedium, 50, 200,
            (value) => {
                this.monitor.updateSettings({ lodDistanceMedium: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Физика
        this.addSliderSetting(container, "Порог отключения физики", settings.physicsDistanceThreshold, 50, 200,
            (value) => {
                this.monitor.updateSettings({ physicsDistanceThreshold: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addToggleSetting(container, "Отключить физику для дальних", settings.disablePhysicsForFarBots,
            (value) => {
                this.monitor.updateSettings({ disablePhysicsForFarBots: value });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Максимальное количество ботов
        this.addSliderSetting(container, "Максимум ботов", settings.maxBots, 1, 100,
            (value) => {
                this.monitor.updateSettings({ maxBots: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Оптимизации AI
        this.addToggleSetting(container, "Кэширование AI", settings.enableAICaching,
            (value) => {
                this.monitor.updateSettings({ enableAICaching: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "TTL кэша AI (мс)", settings.aiCacheTTL, 50, 500,
            (value) => {
                this.monitor.updateSettings({ aiCacheTTL: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Макс raycast/кадр", settings.maxRaycastsPerFrame, 10, 100,
            (value) => {
                this.monitor.updateSettings({ maxRaycastsPerFrame: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Макс pathfinding/кадр", settings.maxPathfindingPerFrame, 5, 50,
            (value) => {
                this.monitor.updateSettings({ maxPathfindingPerFrame: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Групповое поведение
        this.addToggleSetting(container, "Групповое поведение", settings.groupBehaviorEnabled,
            (value) => {
                this.monitor.updateSettings({ groupBehaviorEnabled: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Интервал проверки группы (мс)", settings.groupCheckInterval, 100, 1000,
            (value) => {
                this.monitor.updateSettings({ groupCheckInterval: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Макс размер группы", settings.maxGroupSize, 2, 10,
            (value) => {
                this.monitor.updateSettings({ maxGroupSize: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Уклонения от снарядов
        this.addToggleSetting(container, "Уклонения от снарядов", settings.projectileDodgingEnabled,
            (value) => {
                this.monitor.updateSettings({ projectileDodgingEnabled: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Интервал сканирования (мс)", settings.projectileScanInterval, 10, 100,
            (value) => {
                this.monitor.updateSettings({ projectileScanInterval: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Макс сканирований/кадр", settings.maxProjectileScansPerFrame, 10, 100,
            (value) => {
                this.monitor.updateSettings({ maxProjectileScansPerFrame: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Оптимизации рендеринга
        this.addToggleSetting(container, "Отключить эффекты для дальних", settings.disableEffectsForFarBots,
            (value) => {
                this.monitor.updateSettings({ disableEffectsForFarBots: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addToggleSetting(container, "Отключить звуки для дальних", settings.disableSoundsForFarBots,
            (value) => {
                this.monitor.updateSettings({ disableSoundsForFarBots: value });
            }, yOffset);
        yOffset += lineHeight + 20;

        // Мониторинг
        this.addToggleSetting(container, "Мониторинг включен", settings.monitoringEnabled,
            (value) => {
                this.monitor.updateSettings({ monitoringEnabled: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addToggleSetting(container, "Детальные метрики", settings.detailedMetrics,
            (value) => {
                this.monitor.updateSettings({ detailedMetrics: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addSliderSetting(container, "Размер истории метрик", settings.metricsHistorySize, 10, 300,
            (value) => {
                this.monitor.updateSettings({ metricsHistorySize: Math.round(value) });
            }, yOffset);
        yOffset += lineHeight;

        this.addToggleSetting(container, "Логировать метрики", settings.logMetrics,
            (value) => {
                this.monitor.updateSettings({ logMetrics: value });
            }, yOffset);
        yOffset += lineHeight;

        this.addToggleSetting(container, "Предупреждения о производительности", settings.enablePerformanceWarnings,
            (value) => {
                this.monitor.updateSettings({ enablePerformanceWarnings: value });
            }, yOffset);
        yOffset += lineHeight;

        // Управление профилями
        yOffset += lineHeight + 20;
        this.addProfileManagement(container, yOffset);

        // Кнопка закрытия
        const closeButton = Button.CreateSimpleButton("close", "✕ ЗАКРЫТЬ");
        closeButton.width = "200px";
        closeButton.height = "40px";
        closeButton.color = "#0f0";
        closeButton.background = "rgba(0, 50, 0, 0.8)";
        closeButton.top = "400px";
        closeButton.isPointerBlocker = true;
        closeButton.hoverCursor = "pointer";
        closeButton.zIndex = 2001;
        const closeObserver = closeButton.onPointerClickObservable.add(() => {
            try {
                logger.log("[BotPerformanceSettingsUI] Close button clicked");
                this.hide();
            } catch (e) {
                logger.error("[BotPerformanceSettingsUI] Error closing settings:", e);
            }
        });
        this.observers.push({ control: closeButton, observer: closeObserver });
        container.addControl(closeButton);

        this.container = container;
        this.texture.addControl(container);
    }

    /**
     * Добавить слайдер настройки
     */
    private addSliderSetting(
        container: Rectangle,
        label: string,
        value: number,
        min: number,
        max: number,
        onChange: (value: number) => void,
        top: number
    ): void {
        // Метка
        const labelText = new TextBlock(`label_${top}`, label);
        labelText.color = "#0f0";
        labelText.fontSize = 12;
        labelText.fontFamily = "'Press Start 2P', monospace";
        labelText.top = `${top}px`;
        labelText.left = "-240px";
        labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(labelText);

        // Значение
        const valueText = new TextBlock(`value_${top}`, value.toString());
        valueText.color = "#0ff";
        valueText.fontSize = 12;
        valueText.fontFamily = "'Press Start 2P', monospace";
        valueText.top = `${top}px`;
        valueText.left = "200px";
        valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.addControl(valueText);

        // Слайдер
        const slider = new Slider(`slider_${top}`);
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        slider.width = "400px";
        slider.height = "20px";
        slider.top = `${top + 15}px`;
        slider.color = "#0f0";
        slider.background = "rgba(0, 50, 0, 0.8)";
        const sliderObserver = slider.onValueChangedObservable.add((newValue) => {
            valueText.text = Math.round(newValue).toString();
            onChange(newValue);
        });
        this.observers.push({ control: slider, observer: sliderObserver });
        container.addControl(slider);
    }

    /**
     * Добавить переключатель настройки
     */
    private addToggleSetting(
        container: Rectangle,
        label: string,
        value: boolean,
        onChange: (value: boolean) => void,
        top: number
    ): void {
        // Метка
        const labelText = new TextBlock(`label_${top}`, label);
        labelText.color = "#0f0";
        labelText.fontSize = 12;
        labelText.fontFamily = "'Press Start 2P', monospace";
        labelText.top = `${top}px`;
        labelText.left = "-240px";
        labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(labelText);

        // Кнопка переключения
        const toggleButton = Button.CreateSimpleButton(`toggle_${top}`, value ? "ВКЛ" : "ВЫКЛ");
        toggleButton.width = "100px";
        toggleButton.height = "30px";
        toggleButton.color = value ? "#0f0" : "#f00";
        toggleButton.background = value ? "rgba(0, 50, 0, 0.8)" : "rgba(50, 0, 0, 0.8)";
        toggleButton.top = `${top}px`;
        toggleButton.left = "200px";
        const toggleObserver = toggleButton.onPointerClickObservable.add(() => {
            const newValue = !value;
            toggleButton.textBlock!.text = newValue ? "ВКЛ" : "ВЫКЛ";
            toggleButton.color = newValue ? "#0f0" : "#f00";
            toggleButton.background = newValue ? "rgba(0, 50, 0, 0.8)" : "rgba(50, 0, 0, 0.8)";
            onChange(newValue);
        });
        this.observers.push({ control: toggleButton, observer: toggleObserver });
        container.addControl(toggleButton);
    }

    /**
     * Добавить управление профилями
     */
    private addProfileManagement(container: Rectangle, top: number): void {
        const lineHeight = 30;
        let yOffset = top;

        // Заголовок
        const profileLabel = new TextBlock("profile_label", "💾 ПРОФИЛИ НАСТРОЕК");
        profileLabel.color = "#0f0";
        profileLabel.fontSize = 14;
        profileLabel.fontFamily = "'Press Start 2P', monospace";
        profileLabel.top = `${yOffset}px`;
        profileLabel.left = "-240px";
        container.addControl(profileLabel);
        yOffset += lineHeight;

        // Список профилей
        const profiles = this.monitor.getProfiles();
        const profileListLabel = new TextBlock("profile_list_label", `Профили (${profiles.length}):`);
        profileListLabel.color = "#0a0";
        profileListLabel.fontSize = 11;
        profileLabel.fontFamily = "'Press Start 2P', monospace";
        profileListLabel.top = `${yOffset}px`;
        profileListLabel.left = "-240px";
        container.addControl(profileListLabel);
        yOffset += 20;

        // Показываем первые 5 профилей
        profiles.slice(0, 5).forEach((profile, index) => {
            const profileBtn = Button.CreateSimpleButton(
                `profile_${profile.name}`,
                `${index + 1}. ${profile.name.length > 20 ? profile.name.substring(0, 20) + "..." : profile.name}`
            );
            profileBtn.width = "200px";
            profileBtn.height = "25px";
            profileBtn.color = "#0f0";
            profileBtn.background = "rgba(0, 50, 0, 0.8)";
            profileBtn.top = `${yOffset}px`;
            profileBtn.left = "-240px";
            profileBtn.fontSize = 10;
            const loadObs = profileBtn.onPointerClickObservable.add(() => {
                try {
                    if (this.monitor.loadProfile(profile.name)) {
                        this.hide();
                        this.show(); // Перезагружаем UI с новыми настройками
                        logger.log(`[BotPerformanceSettingsUI] Profile "${profile.name}" loaded`);
                    }
                } catch (e) {
                    logger.error("[BotPerformanceSettingsUI] Error loading profile:", e);
                }
            });
            this.observers.push({ control: profileBtn, observer: loadObs });
            container.addControl(profileBtn);

            // Кнопка удаления
            const deleteBtn = Button.CreateSimpleButton(`delete_${profile.name}`, "✕");
            deleteBtn.width = "30px";
            deleteBtn.height = "25px";
            deleteBtn.color = "#f00";
            deleteBtn.background = "rgba(50, 0, 0, 0.8)";
            deleteBtn.top = `${yOffset}px`;
            deleteBtn.left = "30px";
            deleteBtn.fontSize = 12;
            const deleteObs = deleteBtn.onPointerClickObservable.add(() => {
                try {
                    if (this.monitor.deleteProfile(profile.name)) {
                        this.hide();
                        this.show(); // Перезагружаем UI
                        logger.log(`[BotPerformanceSettingsUI] Profile "${profile.name}" deleted`);
                    }
                } catch (e) {
                    logger.error("[BotPerformanceSettingsUI] Error deleting profile:", e);
                }
            });
            this.observers.push({ control: deleteBtn, observer: deleteObs });
            container.addControl(deleteBtn);

            yOffset += 28;
        });

        // Кнопки управления
        yOffset += 10;

        // Сохранить текущие настройки
        const saveBtn = Button.CreateSimpleButton("save_profile", "💾 Сохранить как...");
        saveBtn.width = "150px";
        saveBtn.height = "30px";
        saveBtn.color = "#0f0";
        saveBtn.background = "rgba(0, 50, 0, 0.8)";
        saveBtn.top = `${yOffset}px`;
        saveBtn.left = "-240px";
        saveBtn.fontSize = 11;
        const saveObs = saveBtn.onPointerClickObservable.add(() => {
            try {
                const name = prompt("Введите имя профиля:");
                if (name && name.trim()) {
                    const description = prompt("Введите описание (необязательно):") || undefined;
                    this.monitor.saveProfile(name.trim(), description);
                    this.hide();
                    this.show(); // Перезагружаем UI
                    logger.log(`[BotPerformanceSettingsUI] Profile "${name}" saved`);
                }
            } catch (e) {
                logger.error("[BotPerformanceSettingsUI] Error saving profile:", e);
            }
        });
        this.observers.push({ control: saveBtn, observer: saveObs });
        container.addControl(saveBtn);

        // Экспорт профиля
        const exportBtn = Button.CreateSimpleButton("export_profile", "📤 Экспорт");
        exportBtn.width = "100px";
        exportBtn.height = "30px";
        exportBtn.color = "#0f0";
        exportBtn.background = "rgba(0, 50, 0, 0.8)";
        exportBtn.top = `${yOffset}px`;
        exportBtn.left = "-80px";
        exportBtn.fontSize = 11;
        const exportObs = exportBtn.onPointerClickObservable.add(() => {
            try {
                const name = prompt("Введите имя профиля для экспорта:");
                if (name) {
                    const json = this.monitor.exportProfile(name);
                    if (json) {
                        const blob = new Blob([json], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `bot-performance-${name}-${Date.now()}.json`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 100);
                        logger.log(`[BotPerformanceSettingsUI] Profile "${name}" exported`);
                    }
                }
            } catch (e) {
                logger.error("[BotPerformanceSettingsUI] Error exporting profile:", e);
            }
        });
        this.observers.push({ control: exportBtn, observer: exportObs });
        container.addControl(exportBtn);

        // Импорт профиля
        const importBtn = Button.CreateSimpleButton("import_profile", "📥 Импорт");
        importBtn.width = "100px";
        importBtn.height = "30px";
        importBtn.color = "#0f0";
        importBtn.background = "rgba(0, 50, 0, 0.8)";
        importBtn.top = `${yOffset}px`;
        importBtn.left = "30px";
        importBtn.fontSize = 11;
        const importObs = importBtn.onPointerClickObservable.add(() => {
            try {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json";
                input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                const json = event.target?.result as string;
                                if (this.monitor.importProfile(json)) {
                                    this.hide();
                                    this.show(); // Перезагружаем UI
                                    logger.log("[BotPerformanceSettingsUI] Profile imported");
                                }
                            } catch (err) {
                                logger.error("[BotPerformanceSettingsUI] Error importing profile:", err);
                                alert("Ошибка импорта профиля. Проверьте формат файла.");
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            } catch (e) {
                logger.error("[BotPerformanceSettingsUI] Error importing profile:", e);
            }
        });
        this.observers.push({ control: importBtn, observer: importObs });
        container.addControl(importBtn);
    }

    /**
     * Очистить ресурсы
     */
    dispose(): void {
        this.hide();
    }
}

