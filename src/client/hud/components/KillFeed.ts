/**
 * @module hud/components/KillFeed
 * @description Лента уничтожений (kill feed) в правом верхнем углу
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";

export interface KillFeedEntry {
    killerName: string;
    victimName: string;
    weapon?: string;
    isHeadshot?: boolean;
    timestamp: number;
}

export interface KillFeedConfig {
    maxEntries: number;
    entryHeight: number;
    entryWidth: number;
    entryGap: number;
    fadeOutTime: number;
    displayTime: number;
    fontSize: number;
    killerColor: string;
    victimColor: string;
    separatorColor: string;
    headshotColor: string;
}

export const DEFAULT_KILLFEED_CONFIG: KillFeedConfig = {
    maxEntries: 5,
    entryHeight: 24,
    entryWidth: 300,
    entryGap: 4,
    fadeOutTime: 500,
    displayTime: 5000,
    fontSize: 11,
    killerColor: "#0f0",
    victimColor: "#f00",
    separatorColor: "#fff",
    headshotColor: "#ff0"
};

interface KillFeedElement {
    container: Rectangle;
    text: TextBlock;
    entry: KillFeedEntry;
    fadeTimeout: number | null;
}

export class KillFeed {
    private guiTexture: AdvancedDynamicTexture;
    private config: KillFeedConfig;
    
    private container: Rectangle | null = null;
    private entries: KillFeedElement[] = [];
    
    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<KillFeedConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_KILLFEED_CONFIG, ...config };
        this.create();
    }
    
    private create(): void {
        // Основной контейнер в правом верхнем углу
        this.container = new Rectangle("killFeedContainer");
        this.container.width = `${this.config.entryWidth + 20}px`;
        this.container.height = `${(this.config.entryHeight + this.config.entryGap) * this.config.maxEntries + 20}px`;
        this.container.thickness = 0;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = "10px";
        this.container.left = "-10px";
        this.guiTexture.addControl(this.container);
    }
    
    addKill(killer: string, victim: string, weapon?: string, isHeadshot?: boolean): void {
        const entry: KillFeedEntry = {
            killerName: killer,
            victimName: victim,
            weapon,
            isHeadshot,
            timestamp: Date.now()
        };
        
        // Создаём визуальный элемент
        const element = this.createEntry(entry);
        
        // Добавляем в начало массива
        this.entries.unshift(element);
        
        // Удаляем лишние записи
        while (this.entries.length > this.config.maxEntries) {
            const removed = this.entries.pop();
            if (removed) {
                this.removeEntry(removed);
            }
        }
        
        // Обновляем позиции
        this.updatePositions();
        
        // Устанавливаем таймер исчезновения
        element.fadeTimeout = window.setTimeout(() => {
            this.fadeOutEntry(element);
        }, this.config.displayTime);
    }
    
    private createEntry(entry: KillFeedEntry): KillFeedElement {
        const container = new Rectangle(`killEntry_${entry.timestamp}`);
        container.width = `${this.config.entryWidth}px`;
        container.height = `${this.config.entryHeight}px`;
        container.background = "#000000aa";
        container.thickness = 1;
        container.color = entry.isHeadshot ? this.config.headshotColor : "#333";
        container.cornerRadius = 4;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.alpha = 0;
        
        if (this.container) {
            this.container.addControl(container);
        }
        
        // Текст
        const weaponIcon = entry.weapon ? ` [${entry.weapon}] ` : " ➤ ";
        const headshotIcon = entry.isHeadshot ? " 💀" : "";
        
        const text = new TextBlock(`killText_${entry.timestamp}`);
        text.text = `${entry.killerName}${weaponIcon}${entry.victimName}${headshotIcon}`;
        text.color = this.config.separatorColor;
        text.fontSize = this.config.fontSize;
        text.fontWeight = "bold";
        text.fontFamily = "Consolas, monospace";
        text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        text.outlineWidth = 1;
        text.outlineColor = "#000";
        container.addControl(text);
        
        // Анимация появления
        this.fadeIn(container);
        
        return {
            container,
            text,
            entry,
            fadeTimeout: null
        };
    }
    
    private fadeIn(container: Rectangle): void {
        let alpha = 0;
        const animate = () => {
            alpha += 0.1;
            container.alpha = Math.min(1, alpha);
            if (alpha < 1) {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }
    
    private fadeOutEntry(element: KillFeedElement): void {
        let alpha = 1;
        const animate = () => {
            alpha -= 0.05;
            element.container.alpha = Math.max(0, alpha);
            if (alpha > 0) {
                requestAnimationFrame(animate);
            } else {
                this.removeEntry(element);
            }
        };
        animate();
    }
    
    private removeEntry(element: KillFeedElement): void {
        if (element.fadeTimeout) {
            clearTimeout(element.fadeTimeout);
        }
        
        if (this.container) {
            this.container.removeControl(element.container);
        }
        element.container.dispose();
        
        const index = this.entries.indexOf(element);
        if (index > -1) {
            this.entries.splice(index, 1);
        }
        
        this.updatePositions();
    }
    
    private updatePositions(): void {
        this.entries.forEach((element, index) => {
            element.container.top = `${index * (this.config.entryHeight + this.config.entryGap)}px`;
        });
    }
    
    clear(): void {
        [...this.entries].forEach(element => {
            this.removeEntry(element);
        });
    }
    
    setVisible(visible: boolean): void {
        if (this.container) {
            this.container.isVisible = visible;
        }
    }
    
    isVisible(): boolean {
        return this.container?.isVisible ?? false;
    }
    
    getEntries(): KillFeedEntry[] {
        return this.entries.map(e => e.entry);
    }
    
    dispose(): void {
        this.clear();
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
    }
}

export default KillFeed;

