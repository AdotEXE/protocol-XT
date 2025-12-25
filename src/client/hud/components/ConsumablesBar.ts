/**
 * @module hud/components/ConsumablesBar
 * @description Компонент панели расходников
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS, HUD_SIZES } from "../HUDConstants";

/**
 * Данные слота расходника
 */
export interface ConsumableSlotData {
    id: string;
    icon: string;
    name: string;
    count: number;
    maxCount: number;
    cooldown: number; // 0-1
    isActive: boolean;
    hotkey: string;
}

/**
 * Конфигурация панели расходников
 */
export interface ConsumablesBarConfig {
    /** Размер слота */
    slotSize: number;
    /** Отступ между слотами */
    slotGap: number;
    /** Количество слотов */
    slotCount: number;
    /** Показывать ли хоткеи */
    showHotkeys: boolean;
    /** Показывать ли количество */
    showCount: boolean;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_CONSUMABLES_CONFIG: ConsumablesBarConfig = {
    slotSize: HUD_SIZES.ARSENAL_SLOT_SIZE,
    slotGap: HUD_SIZES.ARSENAL_SLOT_MARGIN,
    slotCount: 5,
    showHotkeys: true,
    showCount: true
};

/**
 * Структура слота
 */
interface SlotElements {
    container: Rectangle;
    icon: TextBlock;
    countText: TextBlock | null;
    hotkeyText: TextBlock | null;
    cooldownOverlay: Rectangle;
    cooldownFill: Rectangle;
}

/**
 * Компонент панели расходников
 */
export class ConsumablesBar {
    private container: Rectangle;
    private slots: SlotElements[] = [];
    private slotData: Map<number, ConsumableSlotData> = new Map();
    private config: ConsumablesBarConfig;
    private selectedSlot: number = -1;
    
    constructor(parent: AdvancedDynamicTexture, config: Partial<ConsumablesBarConfig> = {}) {
        this.config = { ...DEFAULT_CONSUMABLES_CONFIG, ...config };
        
        const totalWidth = this.config.slotCount * (this.config.slotSize + this.config.slotGap) - this.config.slotGap;
        
        // Контейнер
        this.container = new Rectangle("consumablesContainer");
        this.container.width = `${totalWidth + 20}px`;
        this.container.height = `${this.config.slotSize + 30}px`;
        this.container.thickness = 0;
        this.container.background = "transparent";
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.top = "-20px";
        parent.addControl(this.container);
        
        // Создать слоты
        for (let i = 0; i < this.config.slotCount; i++) {
            this.createSlot(i);
        }
    }
    
    /**
     * Создать слот
     */
    private createSlot(index: number): void {
        const slotSize = this.config.slotSize;
        const offsetX = (index - Math.floor(this.config.slotCount / 2)) * (slotSize + this.config.slotGap);
        
        // Контейнер слота
        const slotContainer = new Rectangle(`slot_${index}`);
        slotContainer.width = `${slotSize}px`;
        slotContainer.height = `${slotSize}px`;
        slotContainer.left = `${offsetX}px`;
        slotContainer.background = HUD_COLORS.BG_PANEL;
        slotContainer.thickness = 2;
        slotContainer.color = HUD_COLORS.ARSENAL_INACTIVE;
        slotContainer.cornerRadius = 4;
        this.container.addControl(slotContainer);
        
        // Иконка
        const icon = new TextBlock(`icon_${index}`);
        icon.text = "";
        icon.fontSize = slotSize * 0.5;
        icon.color = "white";
        slotContainer.addControl(icon);
        
        // Кулдаун оверлей
        const cooldownOverlay = new Rectangle(`cooldown_${index}`);
        cooldownOverlay.width = "100%";
        cooldownOverlay.height = "100%";
        cooldownOverlay.background = "transparent";
        cooldownOverlay.thickness = 0;
        cooldownOverlay.isVisible = false;
        slotContainer.addControl(cooldownOverlay);
        
        // Заполнение кулдауна
        const cooldownFill = new Rectangle(`cooldownFill_${index}`);
        cooldownFill.width = "100%";
        cooldownFill.height = "0%";
        cooldownFill.background = "rgba(255, 100, 0, 0.5)";
        cooldownFill.thickness = 0;
        cooldownFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        cooldownOverlay.addControl(cooldownFill);
        
        // Текст количества
        let countText: TextBlock | null = null;
        if (this.config.showCount) {
            countText = new TextBlock(`count_${index}`);
            countText.text = "";
            countText.fontSize = 10;
            countText.color = "white";
            countText.fontFamily = "'Consolas', monospace";
            countText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            countText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            countText.left = "-2px";
            countText.top = "-2px";
            countText.shadowColor = "black";
            countText.shadowOffsetX = 1;
            countText.shadowOffsetY = 1;
            slotContainer.addControl(countText);
        }
        
        // Текст хоткея
        let hotkeyText: TextBlock | null = null;
        if (this.config.showHotkeys) {
            hotkeyText = new TextBlock(`hotkey_${index}`);
            hotkeyText.text = `${index + 1}`;
            hotkeyText.fontSize = 10;
            hotkeyText.color = HUD_COLORS.PRIMARY;
            hotkeyText.fontFamily = "'Consolas', monospace";
            hotkeyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            hotkeyText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            hotkeyText.left = "2px";
            hotkeyText.top = "2px";
            slotContainer.addControl(hotkeyText);
        }
        
        this.slots.push({
            container: slotContainer,
            icon,
            countText,
            hotkeyText,
            cooldownOverlay,
            cooldownFill
        });
    }
    
    /**
     * Установить данные слота
     */
    setSlotData(index: number, data: ConsumableSlotData): void {
        if (index < 0 || index >= this.slots.length) return;
        
        this.slotData.set(index, data);
        this.updateSlot(index);
    }
    
    /**
     * Обновить отображение слота
     */
    private updateSlot(index: number): void {
        const slot = this.slots[index];
        const data = this.slotData.get(index);
        
        if (!slot || !data) return;
        
        slot.icon.text = data.icon;
        
        if (slot.countText) {
            slot.countText.text = data.count > 0 ? `${data.count}` : "";
            slot.countText.color = data.count === 0 ? HUD_COLORS.DANGER : "white";
        }
        
        if (slot.hotkeyText) {
            slot.hotkeyText.text = data.hotkey;
        }
        
        // Обновить рамку
        if (index === this.selectedSlot) {
            slot.container.color = HUD_COLORS.ARSENAL_ACTIVE;
            slot.container.shadowColor = HUD_COLORS.ARSENAL_ACTIVE;
            slot.container.shadowBlur = 10;
        } else if (data.isActive) {
            slot.container.color = HUD_COLORS.ACCENT;
            slot.container.shadowBlur = 5;
        } else {
            slot.container.color = HUD_COLORS.ARSENAL_INACTIVE;
            slot.container.shadowBlur = 0;
        }
        
        // Обновить кулдаун
        if (data.cooldown > 0) {
            slot.cooldownOverlay.isVisible = true;
            slot.cooldownFill.height = `${(1 - data.cooldown) * 100}%`;
        } else {
            slot.cooldownOverlay.isVisible = false;
        }
    }
    
    /**
     * Выбрать слот
     */
    selectSlot(index: number): void {
        const prevSelected = this.selectedSlot;
        this.selectedSlot = index;
        
        // Обновить предыдущий и новый выбранный слоты
        if (prevSelected >= 0 && prevSelected < this.slots.length) {
            this.updateSlot(prevSelected);
        }
        if (index >= 0 && index < this.slots.length) {
            this.updateSlot(index);
        }
    }
    
    /**
     * Обновить кулдаун слота
     */
    updateCooldown(index: number, cooldown: number): void {
        const data = this.slotData.get(index);
        if (data) {
            data.cooldown = Math.max(0, Math.min(1, cooldown));
            this.updateSlot(index);
        }
    }
    
    /**
     * Обновить количество
     */
    updateCount(index: number, count: number): void {
        const data = this.slotData.get(index);
        if (data) {
            data.count = count;
            this.updateSlot(index);
        }
    }
    
    /**
     * Показать/скрыть
     */
    setVisible(visible: boolean): void {
        this.container.isVisible = visible;
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.container.dispose();
    }
}

export default ConsumablesBar;

