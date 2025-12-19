// ═══════════════════════════════════════════════════════════════════════════
// GAME ENEMIES - Управление врагами и волнами
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { EnemyTank } from "../enemyTank";
import type { EnemyManager } from "../enemy";
import type { TankController } from "../tankController";

/**
 * GameEnemies - Управление врагами и волнами
 * 
 * Отвечает за:
 * - Управление вражескими танками
 * - Систему волн для карты "Передовая"
 * - Адаптивную сложность врагов
 */
export class GameEnemies {
    // Вражеские танки
    enemyTanks: EnemyTank[] = [];
    
    // Система волн для карты "Передовая"
    private frontlineWaveNumber = 0;
    private frontlineWaveTimer: number | null = null;
    private frontlineMaxEnemies = 12;
    private frontlineWaveInterval = 75000; // 75 секунд между волнами
    
    // Плавающая сложность врагов
    private _lastAdaptiveDifficultyLogTime = 0;
    
    // Ссылки на системы
    protected enemyManager: EnemyManager | undefined;
    protected tank: TankController | undefined;
    protected currentMapType: string = "normal";
    
    // Ссылки на дополнительные системы
    protected sessionSettings: any | undefined;
    protected mainMenu: any | undefined;
    protected playerProgression: any | undefined;
    
    /**
     * Инициализация системы врагов
     */
    initialize(
        enemyManager: EnemyManager | undefined,
        tank: TankController | undefined,
        currentMapType: string,
        sessionSettings?: any,
        mainMenu?: any,
        playerProgression?: any
    ): void {
        this.enemyManager = enemyManager;
        this.tank = tank;
        this.currentMapType = currentMapType;
        this.sessionSettings = sessionSettings;
        this.mainMenu = mainMenu;
        this.playerProgression = playerProgression;
        
        logger.log("[GameEnemies] Enemy system initialized");
    }
    
    /**
     * Получить текущую сложность врагов
     */
    getCurrentEnemyDifficulty(): "easy" | "medium" | "hard" {
        // Приоритет: настройки сессии (ин‑игровая панель) > настройки главного меню > medium
        if (this.sessionSettings) {
            const sessionSettings = this.sessionSettings.getSettings();
            const sessionDiff = sessionSettings.aiDifficulty;
            if (sessionDiff === "easy" || sessionDiff === "medium" || sessionDiff === "hard") {
                return sessionDiff;
            }
        }
        
        const menuSettings = this.mainMenu?.getSettings();
        if (menuSettings?.enemyDifficulty) {
            return menuSettings.enemyDifficulty;
        }
        
        return "medium";
    }
    
    /**
     * Получить мультипликатор награды за сложность
     */
    getDifficultyRewardMultiplier(): number {
        const diff = this.getCurrentEnemyDifficulty();
        switch (diff) {
            case "easy":
                return 0.7;  // Меньше награды на лёгкой сложности
            case "hard":
                return 1.4;  // Больше награды на сложной
            case "medium":
            default:
                return 1.0;
        }
    }
    
    /**
     * Получить масштаб адаптивной сложности врагов
     */
    getAdaptiveEnemyDifficultyScale(): number {
        const diff = this.getCurrentEnemyDifficulty();
        let base = 1.0;
        if (diff === "easy") {
            base = 0.9;
        } else if (diff === "hard") {
            base = 1.1;
        }
        
        // Множитель от уровня игрока (1..50). Чем выше уровень, тем выше давление от ИИ.
        let levelFactor = 1.0;
        if (this.playerProgression) {
            const level = this.playerProgression.getLevel();
            levelFactor = 1.0 + (level - 1) * 0.02; // +2% за уровень, максимум ~2x на 50 уровне
        }
        
        // Множитель от времени выживания в текущей сессии
        let survivalFactor = 1.0;
        if (this.tank && (this.tank as any).survivalStartTime) {
            const survivalTime = (Date.now() - (this.tank as any).survivalStartTime) / 1000;
            survivalFactor = 1.0 + Math.min(survivalTime / 600, 0.5); // До +50% за 10 минут
        }
        
        // Множитель от количества убийств
        let killFactor = 1.0;
        if (this.tank && (this.tank as any).killCount) {
            const kills = (this.tank as any).killCount || 0;
            killFactor = 1.0 + Math.min(kills / 20, 0.3); // До +30% за 20 убийств
        }
        
        const scale = base * levelFactor * survivalFactor * killFactor;
        
        // Логируем каждые 30 секунд
        const now = Date.now();
        if (now - this._lastAdaptiveDifficultyLogTime > 30000) {
            logger.log(`[GameEnemies] Adaptive difficulty scale: ${scale.toFixed(2)} (base: ${base.toFixed(2)}, level: ${levelFactor.toFixed(2)}, survival: ${survivalFactor.toFixed(2)}, kills: ${killFactor.toFixed(2)})`);
            this._lastAdaptiveDifficultyLogTime = now;
        }
        
        return Math.min(scale, 2.5); // Максимум 2.5x
    }
    
    /**
     * Обновление системы волн для карты "Передовая"
     */
    updateFrontlineWaves(deltaTime: number): void {
        if (this.currentMapType !== "frontline") return;
        
        // Инициализация таймера первой волны
        if (this.frontlineWaveTimer === null) {
            this.frontlineWaveTimer = this.frontlineWaveInterval;
            logger.log("[GameEnemies] Frontline wave system initialized");
        }
        
        // Обновляем таймер
        this.frontlineWaveTimer -= deltaTime * 1000; // deltaTime в секундах, timer в миллисекундах
        
        if (this.frontlineWaveTimer <= 0) {
            // Новая волна
            this.frontlineWaveNumber++;
            this.frontlineWaveTimer = this.frontlineWaveInterval;
            
            logger.log(`[GameEnemies] Frontline wave ${this.frontlineWaveNumber} starting`);
            
            // Спавним врагов для новой волны
            this.spawnFrontlineWave();
        }
    }
    
    /**
     * Спавн волны для карты "Передовая"
     */
    private spawnFrontlineWave(): void {
        // Будет реализовано в Game.ts, так как требует доступа к множеству систем
        logger.log(`[GameEnemies] Spawning frontline wave ${this.frontlineWaveNumber} (will be implemented in Game.ts)`);
    }
    
    /**
     * Обновление вражеских турелей
     */
    updateEnemyTurretsVisibility(): void {
        if (!this.enemyManager) return;
        
        // Будет реализовано в Game.ts
        logger.debug("[GameEnemies] Updating enemy turrets visibility (will be implemented in Game.ts)");
    }
    
    /**
     * Очистка всех врагов
     */
    clearAllEnemies(): void {
        this.enemyTanks.forEach(enemy => {
            if (enemy.chassis) {
                enemy.chassis.dispose();
            }
        });
        this.enemyTanks = [];
        
        logger.log("[GameEnemies] All enemies cleared");
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        enemyManager?: EnemyManager;
        tank?: TankController;
        currentMapType?: string;
    }): void {
        if (callbacks.enemyManager !== undefined) this.enemyManager = callbacks.enemyManager;
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.currentMapType !== undefined) this.currentMapType = callbacks.currentMapType;
    }
    
    /**
     * Dispose системы врагов
     */
    dispose(): void {
        this.clearAllEnemies();
        this.frontlineWaveTimer = null;
        this.frontlineWaveNumber = 0;
        
        logger.log("[GameEnemies] Enemy system disposed");
    }
}

