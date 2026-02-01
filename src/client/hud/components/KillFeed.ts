/**
 * @module hud/components/KillFeed
 * @description Лента уничтожений (kill feed) в правом верхнем углу
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control,
    StackPanel
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
    text: TextBlock | StackPanel;
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
        container.thickness = 0;
        container.background = "linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,0.6))"; // Gradient background
        container.cornerRadius = 4;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.alpha = 0;

        if (this.container) {
            this.container.addControl(container);
        }

        // Use a StackPanel to organize text parts horizontally
        const stackPanel = new StackPanel();
        stackPanel.isVertical = false;
        stackPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        stackPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        // Padding used to keep text from touching the right edge directly
        stackPanel.paddingRight = "10px";
        container.addControl(stackPanel);

        // Helper to create text blocks
        const createText = (text: string, color: string, weight: string = "normal", fontSize: number = this.config.fontSize) => {
            const tb = new TextBlock();
            tb.text = text;
            tb.color = color;
            tb.fontSize = fontSize;
            tb.fontWeight = weight;
            tb.fontFamily = "'Press Start 2P', monospace";
            tb.resizeToFit = true;
            tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            // Add small margins
            tb.paddingLeft = "2px";
            tb.paddingRight = "2px";
            // Shadow for better readability
            tb.shadowColor = "black";
            tb.shadowBlur = 2;
            tb.shadowOffsetX = 1;
            tb.shadowOffsetY = 1;
            return tb;
        };

        // 1. Killer Name
        stackPanel.addControl(createText(entry.killerName, this.config.killerColor, "bold"));

        // 2. Weapon Icon / Separator
        const weaponText = entry.weapon ? ` [${entry.weapon}] ` : " 🔫 ";
        stackPanel.addControl(createText(weaponText, "#ccc", "normal", this.config.fontSize - 1));

        // 3. Victim Name
        stackPanel.addControl(createText(entry.victimName, this.config.victimColor, "bold"));

        // 4. Headshot Icon (if applicable)
        if (entry.isHeadshot) {
            stackPanel.addControl(createText(" 💀", this.config.headshotColor, "bold"));
        }

        // Appear Animation
        this.fadeIn(container);

        return {
            container,
            text: stackPanel as any, // Typed as any/TextBlock compatibility, though we don't access .text directly later
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

