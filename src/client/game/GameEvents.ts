// ═══════════════════════════════════════════════════════════════════════════
// GAME EVENTS - Обработка событий и колбэков
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { Achievement } from "../achievements";
import type { Mission } from "../missionSystem";

/**
 * GameEvents - Обработка событий и колбэков
 * 
 * Отвечает за:
 * - Обработку событий достижений
 * - Обработку событий миссий
 * - Обработку событий убийств
 * - Обработку других игровых событий
 */
export class GameEvents {
    // Callbacks для событий
    private onAchievementUnlockedCallback: ((achievement: Achievement) => void) | null = null;
    private onMissionCompleteCallback: ((mission: Mission) => void) | null = null;
    private onTurretDestroyedCallback: (() => void) | null = null;
    
    // Ссылки на системы (будут переданы из Game)
    protected hud: any | undefined;
    protected chatSystem: any | undefined;
    protected currencyManager: any | undefined;
    protected experienceSystem: any | undefined;
    protected playerProgression: any | undefined;
    protected achievementsSystem: any | undefined;
    protected missionSystem: any | undefined;
    protected soundManager: any | undefined;
    protected effectsManager: any | undefined;
    
    /**
     * Инициализация системы событий
     */
    initialize(callbacks: {
        hud?: any;
        chatSystem?: any;
        currencyManager?: any;
        experienceSystem?: any;
        playerProgression?: any;
        achievementsSystem?: any;
        missionSystem?: any;
        soundManager?: any;
        effectsManager?: any;
    }): void {
        this.hud = callbacks.hud;
        this.chatSystem = callbacks.chatSystem;
        this.currencyManager = callbacks.currencyManager;
        this.experienceSystem = callbacks.experienceSystem;
        this.playerProgression = callbacks.playerProgression;
        this.achievementsSystem = callbacks.achievementsSystem;
        this.missionSystem = callbacks.missionSystem;
        this.soundManager = callbacks.soundManager;
        this.effectsManager = callbacks.effectsManager;
        
        logger.log("[GameEvents] Event system initialized");
    }
    
    /**
     * Обработка разблокировки достижения
     */
    onAchievementUnlocked(achievement: Achievement): void {
        logger.log(`[GameEvents] Achievement unlocked: ${achievement.id}`);
        
        // Показываем уведомление в HUD
        if (this.hud) {
            this.hud.showNotification?.(`🏆 Достижение: ${achievement.name}`, "success");
        }
        
        // Показываем сообщение в чате
        if (this.chatSystem) {
            this.chatSystem.success(`Достижение разблокировано: ${achievement.name}`);
        }
        
        // Воспроизводим звук
        if (this.soundManager) {
            this.soundManager.playAchievementUnlock?.();
        }
        
        // Обновляем прогресс в системе достижений
        if (this.achievementsSystem) {
            // Достижение уже разблокировано, просто обновляем UI
        }
        
        // Вызываем пользовательский колбэк
        if (this.onAchievementUnlockedCallback) {
            this.onAchievementUnlockedCallback(achievement);
        }
    }
    
    /**
     * Обработка завершения миссии
     */
    onMissionComplete(mission: Mission): void {
        logger.log(`[GameEvents] Mission completed: ${mission.id}`);
        
        // Показываем уведомление в HUD
        if (this.hud) {
            this.hud.showNotification?.(`✅ Миссия выполнена: ${mission.name}`, "success");
        }
        
        // Показываем сообщение в чате
        if (this.chatSystem) {
            this.chatSystem.success(`Миссия выполнена: ${mission.name}`);
        }
        
        // Воспроизводим звук
        if (this.soundManager) {
            this.soundManager.playMissionComplete?.();
        }
        
        // Вызываем пользовательский колбэк
        if (this.onMissionCompleteCallback) {
            this.onMissionCompleteCallback(mission);
        }
    }
    
    /**
     * Обработка уничтожения турели
     */
    onTurretDestroyed(tank?: any, getDifficultyRewardMultiplier?: () => number): void {
        logger.log("[GameEvents] Turret destroyed");
        
        // Добавляем убийство в HUD
        if (this.hud) {
            this.hud.addKill();
        }
        
        // Начисляем валюту
        if (this.currencyManager) {
            const baseReward = 50;
            const multiplier = getDifficultyRewardMultiplier ? getDifficultyRewardMultiplier() : 1.0;
            const reward = Math.round(baseReward * multiplier);
            this.currencyManager.addCurrency(reward);
            
            if (this.hud) {
                this.hud.setCurrency(this.currencyManager.getCurrency());
            }
            
            if (this.chatSystem) {
                this.chatSystem.economy(`+${reward} кредитов (уничтожена турель)`);
            }
        }
        
        // Добавляем опыт
        if (this.experienceSystem && tank) {
            this.experienceSystem.recordKill(
                tank.chassisType.id,
                tank.cannonType.id,
                true // isTurret
            );
        }
        
        // Записываем в прогресс игрока
        if (this.playerProgression) {
            this.playerProgression.recordKill();
            if (this.currencyManager) {
                const baseReward = 50;
                const multiplier = getDifficultyRewardMultiplier ? getDifficultyRewardMultiplier() : 1.0;
                const reward = Math.round(baseReward * multiplier);
                this.playerProgression.addCredits(reward);
            }
        }
        
        // Вызываем пользовательский колбэк
        if (this.onTurretDestroyedCallback) {
            this.onTurretDestroyedCallback();
        }
    }
    
    /**
     * Установить колбэк для разблокировки достижения
     */
    setOnAchievementUnlocked(callback: (achievement: Achievement) => void): void {
        this.onAchievementUnlockedCallback = callback;
    }
    
    /**
     * Установить колбэк для завершения миссии
     */
    setOnMissionComplete(callback: (mission: Mission) => void): void {
        this.onMissionCompleteCallback = callback;
    }
    
    /**
     * Установить колбэк для уничтожения турели
     */
    setOnTurretDestroyed(callback: () => void): void {
        this.onTurretDestroyedCallback = callback;
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        hud?: any;
        chatSystem?: any;
        currencyManager?: any;
        experienceSystem?: any;
        playerProgression?: any;
        achievementsSystem?: any;
        missionSystem?: any;
        soundManager?: any;
        effectsManager?: any;
    }): void {
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.chatSystem !== undefined) this.chatSystem = callbacks.chatSystem;
        if (callbacks.currencyManager !== undefined) this.currencyManager = callbacks.currencyManager;
        if (callbacks.experienceSystem !== undefined) this.experienceSystem = callbacks.experienceSystem;
        if (callbacks.playerProgression !== undefined) this.playerProgression = callbacks.playerProgression;
        if (callbacks.achievementsSystem !== undefined) this.achievementsSystem = callbacks.achievementsSystem;
        if (callbacks.missionSystem !== undefined) this.missionSystem = callbacks.missionSystem;
        if (callbacks.soundManager !== undefined) this.soundManager = callbacks.soundManager;
        if (callbacks.effectsManager !== undefined) this.effectsManager = callbacks.effectsManager;
    }
    
    /**
     * Dispose системы событий
     */
    dispose(): void {
        this.onAchievementUnlockedCallback = null;
        this.onMissionCompleteCallback = null;
        this.onTurretDestroyedCallback = null;
        
        logger.log("[GameEvents] Event system disposed");
    }
}

