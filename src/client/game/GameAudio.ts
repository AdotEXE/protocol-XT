// ═══════════════════════════════════════════════════════════════════════════
// GAME AUDIO - Управление аудио настройками
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { SoundManager } from "../soundManager";
import type { GameSettings } from "../menu";

/**
 * GameAudio - Управление звуком
 * 
 * Отвечает за:
 * - Применение настроек громкости
 * - Mute при потере фокуса
 * - Управление музыкой и эффектами
 */
export class GameAudio {
    private soundManager: SoundManager | undefined;
    private settings: GameSettings | undefined;
    private muteOnFocusLossHandler: (() => void) | null = null;
    private masterVolume: number = 1.0;
    
    /**
     * Инициализация системы аудио
     */
    initialize(soundManager: SoundManager): void {
        this.soundManager = soundManager;
        logger.log("[GameAudio] Initialized");
    }
    
    /**
     * Обновление настроек
     */
    setSettings(settings: GameSettings): void {
        this.settings = settings;
    }
    
    /**
     * Применение аудио настроек
     */
    applySettings(): void {
        if (!this.soundManager || !this.settings) return;
        
        // Master volume (0-100 -> 0-1)
        this.masterVolume = (this.settings.masterVolume ?? 100) / 100;
        this.soundManager.setMasterVolume(this.masterVolume);
        
        // Sound volume (effects)
        // Note: SoundManager может иметь отдельные регуляторы
        // const soundVol = ((this.settings.soundVolume ?? 100) / 100) * this.masterVolume;
        
        // Music volume
        // const musicVol = ((this.settings.musicVolume ?? 100) / 100) * this.masterVolume;
        
        // Ambient volume
        // const ambientVol = ((this.settings.ambientVolume ?? 100) / 100) * this.masterVolume;
        
        // Voice volume
        // const voiceVol = ((this.settings.voiceVolume ?? 100) / 100) * this.masterVolume;
        
        // Mute on focus loss
        this.setupMuteOnFocusLoss();
        
        logger.debug(`[GameAudio] Applied settings: masterVolume=${this.masterVolume}`);
    }
    
    /**
     * Настройка mute при потере фокуса
     */
    private setupMuteOnFocusLoss(): void {
        // Удаляем старый обработчик
        if (this.muteOnFocusLossHandler) {
            document.removeEventListener("visibilitychange", this.muteOnFocusLossHandler);
            this.muteOnFocusLossHandler = null;
        }
        
        if (this.settings?.muteOnFocusLoss) {
            this.muteOnFocusLossHandler = () => {
                if (!this.soundManager) return;
                
                if (document.hidden) {
                    this.soundManager.setMasterVolume(0);
                } else {
                    this.soundManager.setMasterVolume(this.masterVolume);
                }
            };
            document.addEventListener("visibilitychange", this.muteOnFocusLossHandler);
        }
    }
    
    /**
     * Установка громкости напрямую
     */
    setVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.soundManager) {
            this.soundManager.setMasterVolume(this.masterVolume);
        }
    }
    
    /**
     * Получение текущей громкости
     */
    getVolume(): number {
        return this.masterVolume;
    }
    
    /**
     * Временный mute
     */
    mute(): void {
        if (this.soundManager) {
            this.soundManager.setMasterVolume(0);
        }
    }
    
    /**
     * Восстановление громкости после mute
     */
    unmute(): void {
        if (this.soundManager) {
            this.soundManager.setMasterVolume(this.masterVolume);
        }
    }
    
    /**
     * Воспроизведение звука достижения
     */
    playAchievementSound(): void {
        if (this.soundManager?.playReloadComplete) {
            this.soundManager.playReloadComplete();
        }
    }
    
    /**
     * Воспроизведение звука миссии
     */
    playMissionCompleteSound(): void {
        if (this.soundManager?.playReloadComplete) {
            this.soundManager.playReloadComplete();
        }
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        if (this.muteOnFocusLossHandler) {
            document.removeEventListener("visibilitychange", this.muteOnFocusLossHandler);
            this.muteOnFocusLossHandler = null;
        }
        
        this.soundManager = undefined;
        this.settings = undefined;
        
        logger.log("[GameAudio] Disposed");
    }
}

