/**
 * @module hud/components/ExperienceBar
 * @description Компонент полосы опыта (XP Bar)
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS } from "../HUDConstants";

/**
 * Конфигурация полосы опыта
 */
export interface ExperienceBarConfig {
    maxWidth: number;
    height: number;
    backgroundColor: string;
    borderColor: string;
    fillColor: string;
    textColor: string;
    fontFamily: string;
    fontSize: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_EXPERIENCE_BAR_CONFIG: ExperienceBarConfig = {
    maxWidth: 1050,  // Wider than 20 arsenal slots (975px)
    height: 24,
    backgroundColor: "#000",
    borderColor: HUD_COLORS.PRIMARY,
    fillColor: HUD_COLORS.PRIMARY,
    textColor: "#0066ff",
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 12
};

/**
 * Компонент полосы опыта
 */
export class ExperienceBar {
    private container: Rectangle;
    private fill: Rectangle;
    private xpText: TextBlock;
    private xpTextOutline: TextBlock;
    private config: ExperienceBarConfig;

    // Анимация
    private targetPercent: number = 0;
    private currentPercent: number = 0;
    private lastLevel: number = 1;
    private animationTime: number = 0;

    // Данные опыта
    private currentXp: number = 0;
    private xpToNext: number = 100;
    private level: number = 1;

    constructor(parent: AdvancedDynamicTexture | Rectangle, config: Partial<ExperienceBarConfig> = {}) {
        this.config = { ...DEFAULT_EXPERIENCE_BAR_CONFIG, ...config };

        // Вычисляем ширину XP бара - максимум maxWidth, но не больше 60% экрана
        const actualWidth = Math.min(this.config.maxWidth, window.innerWidth * 0.6);

        // Контейнер
        this.container = new Rectangle("experienceBarContainer");
        this.container.width = `${actualWidth}px`;
        this.container.height = `${this.config.height}px`;
        this.container.cornerRadius = 3;
        this.container.thickness = 2;
        this.container.color = this.config.borderColor;
        this.container.background = this.config.backgroundColor;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.top = "-5px";

        if (parent instanceof AdvancedDynamicTexture) {
            parent.addControl(this.container);
        } else {
            parent.addControl(this.container);
        }

        // Полоса заполнения
        this.fill = new Rectangle("experienceBarFill");
        this.fill.width = "0%";
        this.fill.height = "100%";
        this.fill.cornerRadius = 0;
        this.fill.thickness = 0;
        this.fill.background = this.config.fillColor;
        this.fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.addControl(this.fill);

        // Обводка текста (для контраста)
        this.xpTextOutline = new TextBlock("experienceTextOutline");
        this.xpTextOutline.text = "LVL 1 XP: 0/100";
        this.xpTextOutline.color = "#000";
        this.xpTextOutline.fontSize = this.config.fontSize;
        this.xpTextOutline.fontFamily = this.config.fontFamily;
        this.xpTextOutline.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.xpTextOutline.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.xpTextOutline.top = "1px";
        this.xpTextOutline.left = "1px";
        this.container.addControl(this.xpTextOutline);

        // Основной текст
        this.xpText = new TextBlock("experienceText");
        this.xpText.text = "LVL 1 XP: 0/100";
        this.xpText.color = this.config.textColor;
        this.xpText.fontSize = this.config.fontSize;
        this.xpText.fontFamily = this.config.fontFamily;
        this.xpText.fontWeight = "bold";
        this.xpText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.xpText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.xpText.top = "3px";
        this.container.addControl(this.xpText);
    }

    /**
     * Обновить значения опыта
     * @param currentXp - Текущий опыт
     * @param xpToNext - Опыт для следующего уровня
     * @param level - Текущий уровень
     */
    setExperience(currentXp: number, xpToNext: number, level: number): void {
        // Валидация данных
        this.currentXp = Math.max(0, Math.round(currentXp || 0));
        this.xpToNext = Math.max(1, Math.round(xpToNext || 100));
        this.level = Math.max(1, Math.round(level || 1));

        // Вычисляем процент заполнения
        const rawPercent = this.xpToNext > 0
            ? Math.min(100, Math.max(0, (this.currentXp / this.xpToNext) * 100))
            : 0;
        this.targetPercent = Math.round(rawPercent * 10) / 10;

        // Если уровень изменился, сбрасываем анимацию и добавляем эффект
        if (this.level !== this.lastLevel) {
            this.currentPercent = 0; // Начинаем с 0 при повышении уровня
            this.lastLevel = this.level;
            this.playLevelUpEffect();
        }

        // Обновляем текст
        this.updateText();
    }

    /**
     * Обновить текст отображения
     */
    private updateText(): void {
        const text = `LVL ${this.level} XP: ${this.currentXp}/${this.xpToNext}`;
        this.xpText.text = text;
        this.xpTextOutline.text = text;
    }

    /**
     * Эффект повышения уровня
     */
    private playLevelUpEffect(): void {
        const originalColor = this.container.color;
        this.container.color = "#fff";

        setTimeout(() => {
            this.container.color = originalColor;
        }, 300);
    }

    /**
     * Показать плавающий текст получения опыта
     * @param parent - Родительский элемент для добавления текста
     * @param amount - Количество опыта
     * @param type - Тип опыта (chassis/cannon)
     */
    showExperienceGain(parent: AdvancedDynamicTexture, amount: number, type: "chassis" | "cannon" = "chassis"): void {
        const roundedAmount = Math.round(amount);

        const text = new TextBlock(`xpGain_${Date.now()}_${Math.random()}`);
        text.text = `+${roundedAmount} XP`;
        text.color = type === "chassis" ? "#0ff" : "#f80";
        text.fontSize = 28;
        text.fontWeight = "bold";
        text.fontFamily = this.config.fontFamily;
        text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        text.top = "-80px";
        text.shadowBlur = 10;
        text.shadowOffsetX = 2;
        text.shadowOffsetY = 2;
        text.shadowColor = "#000";

        // Случайное смещение по X
        const xOffset = (Math.random() - 0.5) * 100;
        text.left = `${xOffset}px`;

        parent.addControl(text);

        // Анимация
        let frame = 0;
        const animate = () => {
            frame++;
            const progress = frame / 60; // ~1 секунда

            text.top = `${-80 - progress * 60}px`;
            text.alpha = 1 - progress;

            if (frame < 60) {
                requestAnimationFrame(animate);
            } else {
                text.dispose();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Обновить анимацию (вызывается каждый кадр)
     * @param deltaTime - Время с прошлого кадра в секундах
     */
    update(deltaTime: number): void {
        this.animationTime += deltaTime;

        // Плавная интерполяция к целевому проценту
        const lerpSpeed = 10.0;
        const diff = this.targetPercent - this.currentPercent;

        if (Math.abs(diff) > 0.1) {
            this.currentPercent += diff * lerpSpeed * deltaTime;
            this.currentPercent = Math.max(0, Math.min(100, this.currentPercent));
            this.fill.width = `${this.currentPercent}%`;

            // Легкая пульсация при заполнении
            if (diff > 0.5) {
                const pulse = 1 + Math.sin(this.animationTime * 8) * 0.05;
                this.fill.alpha = 0.9 + pulse * 0.1;
            }
        } else {
            this.currentPercent = this.targetPercent;
            this.fill.width = `${this.currentPercent}%`;
            this.fill.alpha = 1.0;
        }
    }

    /**
     * Показать/скрыть
     */
    setVisible(visible: boolean): void {
        this.container.isVisible = visible;
    }

    /**
     * Проверка видимости
     */
    isVisible(): boolean {
        return this.container.isVisible;
    }

    /**
     * Получить текущий уровень
     */
    getLevel(): number {
        return this.level;
    }

    /**
     * Получить текущий процент заполнения
     */
    getPercent(): number {
        return this.currentPercent;
    }

    /**
     * Получить контейнер компонента
     */
    getContainer(): Rectangle {
        return this.container;
    }

    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.container.dispose();
    }
}

export default ExperienceBar;


