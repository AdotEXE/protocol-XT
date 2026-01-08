// ═══════════════════════════════════════════════════════════════════════════
// GAME UI - Управление UI настройками и HUD
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { HUD } from "../hud";
import type { GameSettings } from "../menu";

/**
 * GameUI - Управление пользовательским интерфейсом
 * 
 * Отвечает за:
 * - Применение UI настроек
 * - Управление видимостью элементов HUD
 * - Уведомления и сообщения
 */
export class GameUI {
    private hud: HUD | undefined;
    private settings: GameSettings | undefined;
    
    /**
     * Инициализация системы UI
     */
    initialize(hud: HUD): void {
        this.hud = hud;
        logger.log("[GameUI] Initialized");
    }
    
    /**
     * Обновление настроек
     */
    setSettings(settings: GameSettings): void {
        this.settings = settings;
    }
    
    /**
     * Применение UI настроек
     */
    applySettings(): void {
        if (!this.hud || !this.settings) return;
        
        // Show crosshair
        if (this.settings.showCrosshair !== undefined) {
            // HUD может иметь метод для управления видимостью прицела
            // this.hud.setCrosshairVisible(this.settings.showCrosshair);
        }
        
        // Show health bar
        if (this.settings.showHealthBar !== undefined) {
            // this.hud.setHealthBarVisible(this.settings.showHealthBar);
        }
        
        // Show ammo counter
        // showAmmo не существует в GameSettings, пропускаем
        // if (this.settings.showAmmo !== undefined) {
        //     this.hud.setAmmoVisible(this.settings.showAmmo);
        // }
        
        // Crosshair style
        if (this.settings.crosshairStyle !== undefined) {
            // this.hud.setCrosshairStyle(this.settings.crosshairStyle);
        }
        
        // HUD scale
        if (this.settings.uiScale !== undefined) {
            // this.hud.setScale(this.settings.hudScale);
        }
        
        // Tank stats panel visibility
        if (this.settings.showTankStatsPanel !== undefined && this.hud.setDetailedStatsPanelVisible) {
            this.hud.setDetailedStatsPanelVisible(this.settings.showTankStatsPanel);
        }
        
        logger.debug("[GameUI] Applied settings");
    }
    
    /**
     * Показать сообщение
     */
    showMessage(text: string, color: string = "#fff", duration: number = 2000): void {
        if (this.hud) {
            this.hud.showMessage(text, color, duration);
        }
    }
    
    /**
     * Показать уведомление
     */
    showNotification(text: string, type: "info" | "success" | "warning" | "error" = "info"): void {
        if (this.hud?.showNotification) {
            this.hud.showNotification(text, type);
        }
    }
    
    /**
     * Обновить кредиты
     */
    setCurrency(amount: number): void {
        if (this.hud) {
            this.hud.setCurrency(amount);
        }
    }
    
    /**
     * Добавить убийство
     */
    addKill(): void {
        if (this.hud) {
            this.hud.addKill();
        }
    }
    
    /**
     * Переключить полную карту
     */
    toggleFullMap(): void {
        if (this.hud) {
            this.hud.toggleFullMap();
        }
    }
    
    /**
     * Проверить видимость полной карты
     */
    isFullMapVisible(): boolean {
        return this.hud?.isFullMapVisible() || false;
    }
    
    /**
     * Переключить панель миссий
     */
    toggleMissionPanel(): void {
        if (this.hud?.toggleMissionPanel) {
            this.hud.toggleMissionPanel();
        }
    }
    
    /**
     * Установить систему прогресии игрока
     */
    setPlayerProgression(progression: any): void {
        if (this.hud) {
            this.hud.setPlayerProgression(progression);
        }
    }
    
    /**
     * Установить систему опыта
     */
    setExperienceSystem(experienceSystem: any): void {
        if (this.hud) {
            this.hud.setExperienceSystem(experienceSystem);
        }
    }
    
    /**
     * Установить систему миссий
     */
    setMissionSystem(missionSystem: any): void {
        if (this.hud && typeof (this.hud as any).setMissionSystem === "function") {
            (this.hud as any).setMissionSystem(missionSystem);
        }
    }
    
    /**
     * Получение HUD
     */
    getHUD(): HUD | undefined {
        return this.hud;
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        this.hud = undefined;
        this.settings = undefined;
        logger.log("[GameUI] Disposed");
    }
}

