/**
 * @module hud/components/NotificationQueue
 * @description Очередь уведомлений - управляет показом уведомлений
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS, HUD_FONTS } from "../HUDConstants";
import { scalePixels } from "../../utils/uiScale";

/**
 * Тип уведомления
 */
export type NotificationType = "info" | "success" | "warning" | "error";

/**
 * Конфигурация очереди уведомлений
 */
export interface NotificationQueueConfig {
    maxNotifications: number;
    displayTime: number;
    fadeTime: number;
    width: number;
    height: number;
    spacing: number;
    position: "top" | "bottom" | "topRight" | "bottomRight";
    spamCooldown: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationQueueConfig = {
    maxNotifications: 5,
    displayTime: 3000,
    fadeTime: 500,
    width: 300,
    height: 40,
    spacing: 8,
    position: "topRight",
    spamCooldown: 800
};

/**
 * Данные уведомления
 */
interface NotificationData {
    id: string;
    text: string;
    type: NotificationType;
    element: Rectangle;
    textBlock: TextBlock;
    startTime: number;
    index: number;
}

/**
 * NotificationQueue - Очередь уведомлений
 * 
 * Показывает уведомления в углу экрана с анимацией появления/исчезновения.
 */
export class NotificationQueue {
    private guiTexture: AdvancedDynamicTexture;
    private config: NotificationQueueConfig;
    
    // Контейнер
    private container: Rectangle | null = null;
    
    // Активные уведомления
    private notifications: NotificationData[] = [];
    
    // Анти-спам
    private lastNotificationKey: string | null = null;
    private lastNotificationTime = 0;
    
    // Счётчик ID
    private idCounter = 0;
    
    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<NotificationQueueConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
        this.create();
    }
    
    /**
     * Создание контейнера
     */
    private create(): void {
        this.container = new Rectangle("notificationContainer");
        this.container.width = `${scalePixels(this.config.width + 20)}px`;
        this.container.height = "100%";
        this.container.thickness = 0;
        this.container.isPointerBlocker = false;
        
        // Позиционирование
        switch (this.config.position) {
            case "top":
                this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                break;
            case "bottom":
                this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
                this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                break;
            case "topRight":
                this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                this.container.left = `${scalePixels(-20)}px`;
                this.container.top = `${scalePixels(60)}px`;
                break;
            case "bottomRight":
                this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
                this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                this.container.left = `${scalePixels(-20)}px`;
                this.container.top = `${scalePixels(-60)}px`;
                break;
        }
        
        this.guiTexture.addControl(this.container);
    }
    
    /**
     * Получение цвета для типа уведомления
     */
    private getTypeColor(type: NotificationType): { bg: string; border: string; text: string } {
        switch (type) {
            case "success":
                return { bg: "#0a2a0a", border: HUD_COLORS.ACCENT, text: HUD_COLORS.ACCENT };
            case "warning":
                return { bg: "#2a2a0a", border: HUD_COLORS.WARNING, text: HUD_COLORS.WARNING };
            case "error":
                return { bg: "#2a0a0a", border: HUD_COLORS.DANGER, text: HUD_COLORS.DANGER };
            case "info":
            default:
                return { bg: "#0a0a2a", border: HUD_COLORS.SECONDARY, text: HUD_COLORS.SECONDARY };
        }
    }
    
    /**
     * Показать уведомление
     */
    show(text: string, type: NotificationType = "info"): void {
        if (!this.container) return;
        
        // Проверяем анти-спам
        const key = `${type}:${text}`;
        const now = Date.now();
        if (key === this.lastNotificationKey && now - this.lastNotificationTime < this.config.spamCooldown) {
            return;
        }
        this.lastNotificationKey = key;
        this.lastNotificationTime = now;
        
        // Удаляем старые если превышен лимит
        while (this.notifications.length >= this.config.maxNotifications) {
            this.removeOldest();
        }
        
        // Создаём элемент
        const colors = this.getTypeColor(type);
        const id = `notification_${this.idCounter++}`;
        const index = this.notifications.length;
        
        const element = new Rectangle(id);
        element.width = `${scalePixels(this.config.width)}px`;
        element.height = `${scalePixels(this.config.height)}px`;
        element.background = colors.bg;
        element.thickness = 1;
        element.color = colors.border;
        element.cornerRadius = 4;
        element.alpha = 0; // Начинаем с прозрачного
        
        // Позиционирование
        element.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        element.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        element.top = `${index * (scalePixels(this.config.height) + scalePixels(this.config.spacing))}px`;
        
        // Текст
        const textBlock = new TextBlock(`${id}_text`);
        textBlock.text = text;
        textBlock.color = colors.text;
        textBlock.fontSize = scalePixels(12);
        textBlock.fontFamily = HUD_FONTS.PRIMARY;
        textBlock.textWrapping = true;
        textBlock.paddingLeft = `${scalePixels(10)}px`;
        textBlock.paddingRight = `${scalePixels(10)}px`;
        element.addControl(textBlock);
        
        this.container.addControl(element);
        
        // Добавляем в массив
        this.notifications.push({
            id,
            text,
            type,
            element,
            textBlock,
            startTime: now,
            index
        });
        
        // Анимация появления
        this.animateIn(element);
    }
    
    /**
     * Анимация появления
     */
    private animateIn(element: Rectangle): void {
        let alpha = 0;
        const targetAlpha = 0.95;
        const duration = 200;
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            alpha = targetAlpha * progress;
            element.alpha = alpha;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Анимация исчезновения
     */
    private animateOut(notification: NotificationData, callback: () => void): void {
        let alpha = notification.element.alpha;
        const duration = this.config.fadeTime;
        const startTime = Date.now();
        const startAlpha = alpha;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            alpha = startAlpha * (1 - progress);
            notification.element.alpha = alpha;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                callback();
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Удаление самого старого уведомления
     */
    private removeOldest(): void {
        if (this.notifications.length === 0) return;
        
        const oldest = this.notifications.shift()!;
        
        if (this.container) {
            this.container.removeControl(oldest.element);
            oldest.element.dispose();
        }
        
        // Обновляем позиции оставшихся
        this.updatePositions();
    }
    
    /**
     * Удаление уведомления по ID
     */
    private removeById(id: string): void {
        const index = this.notifications.findIndex(n => n.id === id);
        if (index === -1) return;
        
        const notification = this.notifications[index];
        this.notifications.splice(index, 1);
        
        if (this.container) {
            this.container.removeControl(notification.element);
            notification.element.dispose();
        }
        
        this.updatePositions();
    }
    
    /**
     * Обновление позиций уведомлений
     */
    private updatePositions(): void {
        this.notifications.forEach((notification, index) => {
            notification.index = index;
            notification.element.top = `${index * (scalePixels(this.config.height) + scalePixels(this.config.spacing))}px`;
        });
    }
    
    /**
     * Обновление каждый кадр
     */
    update(): void {
        const now = Date.now();
        const toRemove: string[] = [];
        
        for (const notification of this.notifications) {
            const elapsed = now - notification.startTime;
            
            // Начинаем затухание
            if (elapsed >= this.config.displayTime) {
                const fadeElapsed = elapsed - this.config.displayTime;
                if (fadeElapsed >= this.config.fadeTime) {
                    toRemove.push(notification.id);
                } else {
                    const fadeProgress = fadeElapsed / this.config.fadeTime;
                    notification.element.alpha = 0.95 * (1 - fadeProgress);
                }
            }
        }
        
        // Удаляем завершённые
        for (const id of toRemove) {
            this.removeById(id);
        }
    }
    
    /**
     * Очистить все уведомления
     */
    clear(): void {
        if (!this.container) return;
        
        for (const notification of this.notifications) {
            this.container.removeControl(notification.element);
            notification.element.dispose();
        }
        this.notifications = [];
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        this.clear();
        
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
    }
}

