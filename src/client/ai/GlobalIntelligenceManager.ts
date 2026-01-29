import { logger } from "../utils/logger";

/**
 * Конфигурация для глобального интеллекта ботов
 */
export interface GlobalIntelligenceConfig {
    enabled: boolean;
    base: number;
    max: number;
    growthIntervalMs: number;
    growthAmount: number;
}

/**
 * Менеджер глобального интеллекта ботов.
 * Хранит общее значение adaptiveIntelligence, которое растёт во время боя
 * и используется всеми ботами, если включён режим "Global shared intelligence".
 * 
 * Это предотвращает ускорение роста интеллекта при увеличении количества ботов.
 */
export class GlobalIntelligenceManager {
    private static instance: GlobalIntelligenceManager | null = null;

    private globalIntelligence: number = 3.0;
    private lastUpdateMs: number = 0;
    private inCombat: boolean = false;
    private config: GlobalIntelligenceConfig = {
        enabled: false,
        base: 3.0,
        max: 6.0,
        growthIntervalMs: 2000,
        growthAmount: 0.7
    };

    private constructor() {
        // Private constructor for singleton
    }

    /**
     * Получить единственный экземпляр менеджера
     */
    public static getInstance(): GlobalIntelligenceManager {
        if (!GlobalIntelligenceManager.instance) {
            GlobalIntelligenceManager.instance = new GlobalIntelligenceManager();
        }
        return GlobalIntelligenceManager.instance;
    }

    /**
     * Обновить конфигурацию
     */
    public setConfig(config: GlobalIntelligenceConfig): void {
        this.config = { ...config };
        
        // Если глобальный интеллект отключён, сбрасываем значение
        if (!this.config.enabled) {
            this.globalIntelligence = this.config.base;
        }
        
        logger.log("[GlobalIntelligenceManager] Config updated:", this.config);
    }

    /**
     * Получить текущее значение глобального интеллекта
     */
    public get(): number {
        if (!this.config.enabled) {
            return this.config.base;
        }
        return Math.min(this.globalIntelligence, this.config.max);
    }

    /**
     * Обновить глобальный интеллект (вызывается из GameEnemies)
     * @param nowMs Текущее время в миллисекундах
     * @param inCombat Флаг, что идёт активный бой
     */
    public tick(nowMs: number, inCombat: boolean): void {
        if (!this.config.enabled) {
            return;
        }

        this.inCombat = inCombat;

        // Если не в бою, не увеличиваем интеллект
        if (!inCombat) {
            return;
        }

        // Проверяем, прошёл ли интервал роста
        if (this.lastUpdateMs === 0) {
            this.lastUpdateMs = nowMs;
            return;
        }

        const elapsed = nowMs - this.lastUpdateMs;
        if (elapsed >= this.config.growthIntervalMs) {
            // Увеличиваем интеллект
            this.globalIntelligence = Math.min(
                this.globalIntelligence + this.config.growthAmount,
                this.config.max
            );
            
            this.lastUpdateMs = nowMs;
            
            if (ENABLE_DIAGNOSTIC_LOGS) {
                logger.log(`[GlobalIntelligenceManager] Intelligence increased to ${this.globalIntelligence.toFixed(2)}`);
            }
        }
    }

    /**
     * Сбросить глобальный интеллект к базовому значению
     */
    public reset(): void {
        this.globalIntelligence = this.config.base;
        this.lastUpdateMs = 0;
        this.inCombat = false;
        logger.log(`[GlobalIntelligenceManager] Reset to base: ${this.config.base}`);
    }

    /**
     * Получить текущую конфигурацию
     */
    public getConfig(): Readonly<GlobalIntelligenceConfig> {
        return { ...this.config };
    }

    /**
     * Проверить, включён ли глобальный интеллект
     */
    public isEnabled(): boolean {
        return this.config.enabled;
    }
}

// Импорт для диагностических логов
import { ENABLE_DIAGNOSTIC_LOGS } from "../utils/diagnosticLogs";

