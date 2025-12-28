/**
 * @module hud/components/ArsenalBar
 * @description Панель арсенала с типами снарядов (5 слотов)
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";
import { scalePixels } from "../../utils/uiScale";

export interface ArsenalSlotData {
    type: string;
    icon: string;
    label: string;
    color: string;
    current: number;
    max: number;
    cooldownPercent?: number;
    cooldownText?: string;
}

export interface ArsenalBarConfig {
    slotWidth: number;
    slotGap: number;
    totalSlots: number;
    bottomOffset: number;
}

export const DEFAULT_ARSENAL_CONFIG: ArsenalBarConfig = {
    slotWidth: 44,
    slotGap: 5,
    totalSlots: 23,
    bottomOffset: -40
};

const AMMO_TYPES: ArsenalSlotData[] = [
    { type: "tracer", icon: "🔥", label: "T", color: "#f80", current: 0, max: 0 },
    { type: "ap", icon: "⚫", label: "AP", color: "#0ff", current: 0, max: 0 },
    { type: "apcr", icon: "⚡", label: "APCR", color: "#0af", current: 0, max: 0 },
    { type: "he", icon: "💥", label: "HE", color: "#f60", current: 0, max: 0 },
    { type: "apds", icon: "🎯", label: "APDS", color: "#0fa", current: 0, max: 0 }
];

interface ArsenalSlot {
    container: Rectangle;
    icon: TextBlock;
    countText: TextBlock;
    type: string;
    cooldownOverlay: Rectangle;
    cooldownFill: Rectangle;
    cooldownFillGlow: Rectangle;
    cooldownText: TextBlock;
}

export class ArsenalBar {
    private guiTexture: AdvancedDynamicTexture;
    private config: ArsenalBarConfig;
    private slots: ArsenalSlot[] = [];
    private scalePx: (value: number) => string;
    private scaleFontSize: (base: number, min: number, max: number) => number;
    
    constructor(
        guiTexture: AdvancedDynamicTexture,
        scalePx: (value: number) => string,
        scaleFontSize: (base: number, min: number, max: number) => number,
        config: Partial<ArsenalBarConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scalePx = scalePx;
        this.scaleFontSize = scaleFontSize;
        this.config = { ...DEFAULT_ARSENAL_CONFIG, ...config };
        this.create();
    }
    
    private create(): void {
        const slotWidth = scalePixels(this.config.slotWidth);
        const slotGap = scalePixels(this.config.slotGap);
        const totalWidth = this.config.totalSlots * slotWidth + (this.config.totalSlots - 1) * slotGap;
        const startX = -totalWidth / 2 + slotWidth / 2;
        
        for (let i = 0; i < 5; i++) {
            const ammoType = AMMO_TYPES[i]!;
            
            // Контейнер слота
            const container = new Rectangle(`arsenalSlot${i}`);
            container.width = `${slotWidth}px`;
            container.height = `${slotWidth}px`;
            container.cornerRadius = 3;
            container.thickness = 2;
            container.color = ammoType.color + "5";
            container.background = "#000000bb";
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            container.left = `${startX + i * (slotWidth + slotGap)}px`;
            container.top = this.scalePx(this.config.bottomOffset);
            container.isVisible = true;
            this.guiTexture.addControl(container);
            
            // Иконка типа снаряда
            const icon = new TextBlock(`arsenalIcon${i}`);
            icon.text = ammoType.icon;
            icon.color = "#fff";
            icon.fontSize = this.scaleFontSize(18, 14, 24);
            icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            icon.top = this.scalePx(-8);
            icon.outlineWidth = 1;
            icon.outlineColor = "#000";
            container.addControl(icon);
            
            // Текст количества
            const countText = new TextBlock(`arsenalCount${i}`);
            countText.text = "0/0";
            countText.color = ammoType.color;
            countText.fontSize = this.scaleFontSize(10, 8, 14);
            countText.fontWeight = "bold";
            countText.fontFamily = "Consolas, monospace";
            countText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            countText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            countText.top = this.scalePx(-2);
            countText.outlineWidth = 1;
            countText.outlineColor = "#000";
            container.addControl(countText);
            
            // Метка типа
            const label = new TextBlock(`arsenalLabel${i}`);
            label.text = ammoType.label;
            label.color = ammoType.color;
            label.fontSize = this.scaleFontSize(7, 6, 10);
            label.fontWeight = "bold";
            label.fontFamily = "Consolas, monospace";
            label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            label.top = this.scalePx(2);
            label.outlineWidth = 1;
            label.outlineColor = "#000";
            container.addControl(label);
            
            // Cooldown overlay
            const cooldownOverlay = new Rectangle(`arsenalCooldownOverlay${i}`);
            cooldownOverlay.width = "100%";
            cooldownOverlay.height = "100%";
            cooldownOverlay.thickness = 0;
            cooldownOverlay.background = "#000000aa";
            cooldownOverlay.cornerRadius = 2;
            cooldownOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.isVisible = false;
            container.addControl(cooldownOverlay);
            
            const cooldownFill = new Rectangle(`arsenalCooldownFill${i}`);
            cooldownFill.width = "100%";
            cooldownFill.height = "0%";
            cooldownFill.thickness = 0;
            cooldownFill.background = "#ff0000dd";
            cooldownFill.cornerRadius = 2;
            cooldownFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.addControl(cooldownFill);
            
            const cooldownFillGlow = new Rectangle(`arsenalCooldownFillGlow${i}`);
            cooldownFillGlow.width = "100%";
            cooldownFillGlow.height = "0%";
            cooldownFillGlow.thickness = 0;
            cooldownFillGlow.background = "#00ff00bb";
            cooldownFillGlow.cornerRadius = 2;
            cooldownFillGlow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFillGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownFillGlow.alpha = 0;
            cooldownOverlay.addControl(cooldownFillGlow);
            
            const cooldownText = new TextBlock(`arsenalCooldownText${i}`);
            cooldownText.text = "";
            cooldownText.color = "#fff";
            cooldownText.fontSize = 12;
            cooldownText.fontWeight = "bold";
            cooldownText.fontFamily = "'Press Start 2P', monospace";
            cooldownText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            cooldownText.outlineWidth = 2;
            cooldownText.outlineColor = "#000";
            cooldownOverlay.addControl(cooldownText);
            
            this.slots.push({
                container,
                icon,
                countText,
                type: ammoType.type,
                cooldownOverlay,
                cooldownFill,
                cooldownFillGlow,
                cooldownText
            });
        }
    }
    
    updateSlot(slotIndex: number, current: number, max: number): void {
        if (slotIndex < 0 || slotIndex >= this.slots.length) return;
        
        const slot = this.slots[slotIndex];
        if (!slot) return;
        
        slot.countText.text = `${current}/${max}`;
        
        // Изменяем цвет в зависимости от количества
        if (current === 0) {
            slot.countText.color = "#f00";
            slot.container.alpha = 0.5;
        } else if (current <= max * 0.25) {
            slot.countText.color = "#ff8800";
            slot.container.alpha = 0.8;
        } else {
            slot.countText.color = AMMO_TYPES[slotIndex]?.color ?? "#fff";
            slot.container.alpha = 1;
        }
    }
    
    updateCooldown(slotIndex: number, percent: number, text?: string): void {
        if (slotIndex < 0 || slotIndex >= this.slots.length) return;
        
        const slot = this.slots[slotIndex];
        if (!slot) return;
        
        if (percent > 0) {
            slot.cooldownOverlay.isVisible = true;
            slot.cooldownFill.height = `${percent}%`;
            slot.cooldownText.text = text ?? "";
        } else {
            slot.cooldownOverlay.isVisible = false;
        }
    }
    
    getSlotByType(type: string): ArsenalSlot | undefined {
        return this.slots.find(s => s.type === type);
    }
    
    getSlotIndex(type: string): number {
        return this.slots.findIndex(s => s.type === type);
    }
    
    setVisible(visible: boolean): void {
        this.slots.forEach(slot => {
            slot.container.isVisible = visible;
        });
    }
    
    dispose(): void {
        this.slots.forEach(slot => {
            this.guiTexture.removeControl(slot.container);
            slot.container.dispose();
        });
        this.slots = [];
    }
}

export default ArsenalBar;

