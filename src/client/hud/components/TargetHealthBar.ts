/**
 * TargetHealthBar - Отображение здоровья текущей цели (врага под прицелом)
 * Военно-тактический стиль HUD
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, StackPanel } from "@babylonjs/gui";
import { HUD_COLORS } from "../HUDConstants";

export interface TargetInfo {
    name: string;
    health: number;
    maxHealth: number;
    distance: number;
    type: "enemy" | "player" | "boss";
}

export class TargetHealthBar {
    private container: Rectangle;
    private backgroundBar: Rectangle;
    private healthFill: Rectangle;
    private healthGlow: Rectangle;
    private nameText: TextBlock;
    private healthText: TextBlock;
    private distanceText: TextBlock;
    private bracketLeft: TextBlock;
    private bracketRight: TextBlock;
    private scanlineOverlay: Rectangle;

    private currentTarget: TargetInfo | null = null;
    private displayedHealth = 0;
    private fadeAlpha = 0;
    private lastTargetTime = 0;
    private readonly FADE_DURATION = 500; // мс
    private readonly HOLD_DURATION = 4000; // УВЕЛИЧЕНО с 3000 до 4000 мс - держать 4 сек после потери цели

    constructor(parent: AdvancedDynamicTexture) {
        // === ГЛАВНЫЙ КОНТЕЙНЕР (под компасом) ===
        // Компас: top: 10px, height: 35px, так что полоска должна быть на ~50px
        this.container = new Rectangle("targetHealthContainer");
        this.container.width = "320px";
        this.container.height = "60px";
        this.container.thickness = 0;
        this.container.background = "transparent";
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = "50px"; // Под компасом (компас: top 10px + height 35px + отступ 5px = 50px)
        this.container.alpha = 0; // СКРЫТ по умолчанию - показывать только при точном прицеливании
        this.container.isVisible = false; // ГАРАНТИРОВАННО скрыт
        parent.addControl(this.container);

        // === НАЗВАНИЕ ЦЕЛИ ===
        this.nameText = new TextBlock("targetName");
        this.nameText.text = "< ВРАГ >";
        this.nameText.color = HUD_COLORS.DANGER;
        this.nameText.fontSize = "14px";
        this.nameText.fontFamily = "'Consolas', 'Courier New', monospace";
        this.nameText.fontWeight = "bold";
        this.nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.nameText.top = "2px";
        this.nameText.shadowColor = "#000";
        this.nameText.shadowBlur = 4;
        this.container.addControl(this.nameText);

        // === КВАДРАТНЫЕ СКОБКИ (ТАКТИЧЕСКИЙ СТИЛЬ) ===
        this.bracketLeft = new TextBlock("bracketLeft");
        this.bracketLeft.text = "[";
        this.bracketLeft.color = HUD_COLORS.DANGER;
        this.bracketLeft.fontSize = "32px";
        this.bracketLeft.fontFamily = "'Consolas', monospace";
        this.bracketLeft.fontWeight = "bold";
        this.bracketLeft.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.bracketLeft.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.bracketLeft.left = "10px";
        this.bracketLeft.top = "6px";
        this.container.addControl(this.bracketLeft);

        this.bracketRight = new TextBlock("bracketRight");
        this.bracketRight.text = "]";
        this.bracketRight.color = HUD_COLORS.DANGER;
        this.bracketRight.fontSize = "32px";
        this.bracketRight.fontFamily = "'Consolas', monospace";
        this.bracketRight.fontWeight = "bold";
        this.bracketRight.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.bracketRight.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.bracketRight.left = "-10px";
        this.bracketRight.top = "6px";
        this.container.addControl(this.bracketRight);

        // === ПОЛОСА ЗДОРОВЬЯ (ФОН) ===
        this.backgroundBar = new Rectangle("targetHealthBg");
        this.backgroundBar.width = "250px";
        this.backgroundBar.height = "16px";
        this.backgroundBar.thickness = 1;
        this.backgroundBar.color = HUD_COLORS.DANGER;
        this.backgroundBar.background = "rgba(0, 0, 0, 0.7)";
        this.backgroundBar.cornerRadius = 0; // Острые углы
        this.backgroundBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.backgroundBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.backgroundBar.top = "8px";
        this.container.addControl(this.backgroundBar);

        // === СВЕЧЕНИЕ ЗДОРОВЬЯ ===
        this.healthGlow = new Rectangle("targetHealthGlow");
        this.healthGlow.width = "100%";
        this.healthGlow.height = "100%";
        this.healthGlow.thickness = 0;
        this.healthGlow.background = HUD_COLORS.DANGER;
        this.healthGlow.alpha = 0.3;
        this.healthGlow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.backgroundBar.addControl(this.healthGlow);

        // === ЗАПОЛНЕНИЕ ЗДОРОВЬЯ ===
        this.healthFill = new Rectangle("targetHealthFill");
        this.healthFill.width = "100%";
        this.healthFill.height = "100%";
        this.healthFill.thickness = 0;
        this.healthFill.background = HUD_COLORS.DANGER;
        this.healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.backgroundBar.addControl(this.healthFill);

        // === СКАНЛАЙНЫ (ВОЕННЫЙ СТИЛЬ) ===
        this.scanlineOverlay = new Rectangle("targetScanlines");
        this.scanlineOverlay.width = "100%";
        this.scanlineOverlay.height = "100%";
        this.scanlineOverlay.thickness = 0;
        this.scanlineOverlay.alpha = 0.15;
        // CSS-подобный эффект через паттерн
        this.backgroundBar.addControl(this.scanlineOverlay);

        // === ТЕКСТ ЗДОРОВЬЯ ===
        this.healthText = new TextBlock("targetHealthText");
        this.healthText.text = "100/100";
        this.healthText.color = "#fff";
        this.healthText.fontSize = "11px";
        this.healthText.fontFamily = "'Consolas', monospace";
        this.healthText.fontWeight = "bold";
        this.healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.healthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.healthText.shadowColor = "#000";
        this.healthText.shadowBlur = 3;
        this.backgroundBar.addControl(this.healthText);

        // === ДИСТАНЦИЯ ===
        this.distanceText = new TextBlock("targetDistance");
        this.distanceText.text = "DIST: 45m";
        this.distanceText.color = HUD_COLORS.WARNING;
        this.distanceText.fontSize = "11px"; // Увеличено с 10px для лучшей читаемости
        this.distanceText.fontFamily = "'Consolas', monospace";
        this.distanceText.fontWeight = "bold"; // Добавлено для лучшей видимости
        this.distanceText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.distanceText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.distanceText.top = "0px"; // ИСПРАВЛЕНО: было -2px что скрывало текст за пределами контейнера
        this.distanceText.shadowColor = "#000";
        this.distanceText.shadowBlur = 4;
        this.container.addControl(this.distanceText);
    }

    /**
     * Установить текущую цель
     */
    setTarget(target: TargetInfo | null): void {
        if (target) {
            this.currentTarget = target;
            this.lastTargetTime = Date.now();
            this.container.isVisible = true; // Показываем контейнер
            this.fadeAlpha = 1; // Сразу показываем (без fade-in)
            this.container.alpha = 1;

            // Обновляем название
            const typePrefix = target.type === "boss" ? "⚠ BOSS" : target.type === "player" ? "ИГРОК" : "ВРАГ";
            this.nameText.text = `< ${typePrefix}: ${target.name} >`;

            // Цвет в зависимости от типа
            const color = target.type === "boss" ? HUD_COLORS.WARNING :
                target.type === "player" ? HUD_COLORS.PRIMARY : HUD_COLORS.DANGER;
            this.updateColors(color);

            // Обновляем дистанцию
            this.distanceText.text = `DIST: ${Math.round(target.distance)}m`;
        } else {
            // ИСПРАВЛЕНО: Сбрасываем сразу - полоска должна исчезать мгновенно
            // когда враг не в прицеле
            this.currentTarget = null;
            this.fadeAlpha = 0;
            this.container.alpha = 0;
            this.container.isVisible = false; // ГАРАНТИРОВАННО скрыть
        }
    }

    /**
     * Обновить цвета элементов
     */
    private updateColors(color: string): void {
        this.nameText.color = color;
        this.bracketLeft.color = color;
        this.bracketRight.color = color;
        this.backgroundBar.color = color;
        this.healthFill.background = color;
        this.healthGlow.background = color;
    }

    /**
     * Обновление анимации (вызывать каждый кадр)
     */
    update(deltaTime: number): void {
        const now = Date.now();

        // Рассчитываем целевую прозрачность
        let targetAlpha = 0;
        if (this.currentTarget) {
            const timeSinceTarget = now - this.lastTargetTime;
            if (timeSinceTarget < this.HOLD_DURATION) {
                targetAlpha = 1;
            } else if (timeSinceTarget < this.HOLD_DURATION + this.FADE_DURATION) {
                targetAlpha = 1 - (timeSinceTarget - this.HOLD_DURATION) / this.FADE_DURATION;
            } else {
                this.currentTarget = null;
            }
        }

        // Плавная интерполяция прозрачности
        const alphaSpeed = 8.0;
        this.fadeAlpha += (targetAlpha - this.fadeAlpha) * alphaSpeed * deltaTime;
        this.container.alpha = this.fadeAlpha;

        // ИСПРАВЛЕНО: Управление видимостью - показываем только когда alpha > 0
        this.container.isVisible = this.fadeAlpha > 0.01;

        // Обновляем полосу здоровья с плавной анимацией
        if (this.currentTarget) {
            const healthPercent = Math.max(0, Math.min(100,
                (this.currentTarget.health / this.currentTarget.maxHealth) * 100));

            // Плавное изменение отображаемого здоровья
            const healthSpeed = 5.0;
            this.displayedHealth += (healthPercent - this.displayedHealth) * healthSpeed * deltaTime;

            // Обновляем визуал
            this.healthFill.width = `${this.displayedHealth}%`;
            this.healthGlow.width = `${this.displayedHealth}%`;
            this.healthText.text = `${Math.round(this.currentTarget.health)}/${this.currentTarget.maxHealth}`;

            // Мигание при низком здоровье
            if (healthPercent < 25) {
                const blink = Math.sin(now * 0.01) * 0.3 + 0.7;
                this.healthFill.alpha = blink;
                this.bracketLeft.alpha = blink;
                this.bracketRight.alpha = blink;
            } else {
                this.healthFill.alpha = 1;
                this.bracketLeft.alpha = 1;
                this.bracketRight.alpha = 1;
            }

            // Цвет здоровья в зависимости от процента
            let healthColor: string;
            if (healthPercent > 60) {
                healthColor = HUD_COLORS.HEALTH_FULL;
            } else if (healthPercent > 30) {
                healthColor = HUD_COLORS.WARNING;
            } else {
                healthColor = HUD_COLORS.DANGER;
            }
            this.healthFill.background = healthColor;
        }
    }

    /**
     * Показать/скрыть
     */
    setVisible(visible: boolean): void {
        if (!visible) {
            this.currentTarget = null;
            this.fadeAlpha = 0;
            this.container.alpha = 0;
            this.container.isVisible = false; // ГАРАНТИРОВАННО скрыть
        }
    }

    /**
     * Есть ли активная цель
     */
    hasTarget(): boolean {
        return this.currentTarget !== null && this.fadeAlpha > 0.1;
    }

    /**
     * Очистка
     */
    dispose(): void {
        this.container.dispose();
    }
}

