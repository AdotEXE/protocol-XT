/**
 * Bot Performance Monitor - Максимально подробный мониторинг и настройки производительности ботов
 */

import { Vector3 } from "@babylonjs/core";
import { EnemyTank } from "../enemyTank";
import { logger } from "../utils/logger";

/**
 * Детальные метрики времени выполнения методов AI
 */
export interface AITimingMetrics {
    updateAITime: number;              // Время выполнения updateAI()
    makeDecisionTime: number;           // Время выполнения makeDecision()
    scanProjectilesTime: number;        // Время сканирования снарядов
    checkProjectileThreatTime: number;  // Время проверки угрозы снарядов
    updateNearbyEnemiesTime: number;   // Время обновления ближайших врагов
    updatePlayerStyleTime: number;     // Время обновления стиля игрока
    raycastTime: number;               // Время выполнения raycast
    pathfindingTime: number;            // Время выполнения pathfinding
    driveTowardTime: number;            // Время выполнения driveToward()
    fireTime: number;                   // Время выполнения fire()
    totalAITime: number;                // Общее время AI
}

/**
 * Метрики производительности одного бота
 */
export interface BotMetrics {
    id: string;
    isAlive: boolean;
    distance: number;
    state: string;
    updateInterval: number;
    lastUpdateTime: number;
    updateCount: number;
    averageUpdateTime: number;
    maxUpdateTime: number;
    minUpdateTime: number;
    
    // Детальное время выполнения
    aiTiming: AITimingMetrics;
    physicsTime: number;
    renderTime: number;
    
    // Использование ресурсов
    memoryUsage: number;
    lodLevel: "high" | "medium" | "low";
    hasPhysics: boolean;
    
    // Статистика операций
    raycastCount: number;
    raycastCacheHits: number;
    pathfindingQueries: number;
    pathfindingCacheHits: number;
    
    // Статистика состояний
    stateChanges: number;
    lastStateChangeTime: number;
    timeInCurrentState: number;
    
    // Статистика стрельбы
    shotsFired: number;
    shotsHit: number;
    accuracy: number;
    lastShotTime: number;
    
    // Статистика движения
    distanceTraveled: number;
    averageSpeed: number;
    maxSpeed: number;
    
    // Статистика уклонений
    dodgesExecuted: number;
    successfulDodges: number;
    
    // Статистика группового поведения
    groupCoordinationCount: number;
    coverSeekingCount: number;
    
    // Производительность
    fpsImpact: number;                  // Влияние на FPS (%)
    cpuUsage: number;                   // Использование CPU (%)
}

/**
 * Агрегированные метрики всех ботов
 */
export interface AggregatedBotMetrics {
    totalBots: number;
    aliveBots: number;
    deadBots: number;
    
    // Производительность
    totalUpdateTime: number;
    averageUpdateTime: number;
    maxUpdateTime: number;
    minUpdateTime: number;
    totalAITime: number;
    totalPhysicsTime: number;
    totalRenderTime: number;
    
    // Детальное время AI методов
    averageAITiming: AITimingMetrics;
    maxAITiming: AITimingMetrics;
    
    // Распределение по расстояниям
    nearBots: number;    // < 50м
    midBots: number;     // 50-100м
    farBots: number;     // > 100м
    
    // Распределение по состояниям
    stateDistribution: Record<string, number>;
    averageTimeInState: Record<string, number>;
    
    // LOD распределение
    highLOD: number;
    mediumLOD: number;
    lowLOD: number;
    
    // Физика
    botsWithPhysics: number;
    botsWithoutPhysics: number;
    
    // Raycast статистика
    totalRaycasts: number;
    averageRaycastsPerBot: number;
    raycastCacheHitRate: number;
    
    // Pathfinding статистика
    totalPathfindingQueries: number;
    averagePathfindingPerBot: number;
    pathfindingCacheHitRate: number;
    
    // Память
    totalMemoryUsage: number;
    averageMemoryPerBot: number;
    maxMemoryPerBot: number;
    
    // FPS влияние
    estimatedFPSImpact: number;
    totalFPSImpact: number;
    
    // Интервалы обновления
    updateIntervalDistribution: Record<number, number>;
    
    // Статистика стрельбы
    totalShotsFired: number;
    totalShotsHit: number;
    averageAccuracy: number;
    
    // Статистика движения
    totalDistanceTraveled: number;
    averageSpeed: number;
    maxSpeed: number;
    
    // Статистика уклонений
    totalDodges: number;
    successfulDodges: number;
    dodgeSuccessRate: number;
    
    // Статистика группового поведения
    totalGroupCoordination: number;
    totalCoverSeeking: number;
    
    // Производительность системы
    totalCPUUsage: number;
    averageCPUUsage: number;
    
    // История метрик (для графиков)
    history: Array<{
        timestamp: number;
        fpsImpact: number;
        averageUpdateTime: number;
        aliveBots: number;
    }>;
    maxHistorySize: number;
}

/**
 * Настройки производительности ботов
 */
export interface BotPerformanceSettings {
    // Интервалы обновления AI (в кадрах)
    aiUpdateIntervalNear: number;    // Близкие боты (< 50м)
    aiUpdateIntervalMid: number;      // Средние боты (50-100м)
    aiUpdateIntervalFar: number;      // Дальние боты (> 100м)
    
    // Адаптивные интервалы при низком FPS
    adaptiveUpdateEnabled: boolean;
    lowFPSThreshold: number;         // Порог низкого FPS
    lowFPSMultiplier: number;        // Множитель интервала при низком FPS
    highFPSThreshold: number;         // Порог высокого FPS (для уменьшения интервалов)
    
    // LOD настройки
    lodEnabled: boolean;
    lodDistanceHigh: number;         // Расстояние для высокого LOD
    lodDistanceMedium: number;       // Расстояние для среднего LOD
    
    // Физика
    physicsDistanceThreshold: number; // Расстояние для отключения физики
    physicsLODEnabled: boolean;
    physicsUpdateInterval: number;    // Интервал обновления физики (в кадрах)
    
    // Оптимизации AI
    enableAICaching: boolean;          // Включить кэширование AI вычислений
    aiCacheTTL: number;               // Время жизни кэша AI (мс)
    disableRaycastsForFarBots: boolean;
    disablePathfindingForFarBots: boolean;
    maxRaycastsPerFrame: number;      // Максимум raycast за кадр
    maxPathfindingPerFrame: number;  // Максимум pathfinding запросов за кадр
    
    // Оптимизации рендеринга
    disableDetailsForFarBots: boolean;
    disablePhysicsForFarBots: boolean;
    disableEffectsForFarBots: boolean;
    disableSoundsForFarBots: boolean;
    
    // Максимальное количество ботов
    maxBots: number;
    maxBotsPerFrame: number;          // Максимум ботов обновляемых за кадр
    
    // Оптимизации группового поведения
    groupBehaviorEnabled: boolean;
    groupCheckInterval: number;       // Интервал проверки группы (мс)
    maxGroupSize: number;             // Максимальный размер группы
    
    // Оптимизации уклонений
    projectileDodgingEnabled: boolean;
    projectileScanInterval: number;   // Интервал сканирования снарядов (мс)
    maxProjectileScansPerFrame: number; // Максимум сканирований за кадр
    
    // Мониторинг
    monitoringEnabled: boolean;
    metricsUpdateInterval: number;    // Интервал обновления метрик (мс)
    logMetrics: boolean;              // Логировать метрики в консоль
    detailedMetrics: boolean;        // Собирать детальные метрики
    metricsHistorySize: number;      // Размер истории метрик
    enablePerformanceWarnings: boolean; // Показывать предупреждения о производительности
}

/**
 * Профиль настроек производительности
 */
export interface BotPerformanceProfile {
    name: string;
    description?: string;
    settings: BotPerformanceSettings;
    createdAt: number;
    updatedAt: number;
}

export const DEFAULT_BOT_PERFORMANCE_SETTINGS: BotPerformanceSettings = {
    aiUpdateIntervalNear: 1,      // Каждый кадр
    aiUpdateIntervalMid: 3,       // Каждые 3 кадра
    aiUpdateIntervalFar: 10,      // Каждые 10 кадров
    
    adaptiveUpdateEnabled: true,
    lowFPSThreshold: 30,
    lowFPSMultiplier: 1.5,
    highFPSThreshold: 55,
    
    lodEnabled: true,
    lodDistanceHigh: 50,
    lodDistanceMedium: 100,
    
    physicsDistanceThreshold: 100,
    physicsLODEnabled: true,
    physicsUpdateInterval: 1,     // Каждый кадр для физики
    
    enableAICaching: true,
    aiCacheTTL: 100,              // 100мс кэш
    disableRaycastsForFarBots: false,
    disablePathfindingForFarBots: false,
    maxRaycastsPerFrame: 50,
    maxPathfindingPerFrame: 20,
    
    disableDetailsForFarBots: true,
    disablePhysicsForFarBots: true,
    disableEffectsForFarBots: true,
    disableSoundsForFarBots: true,
    
    maxBots: 50,
    maxBotsPerFrame: 10,           // Максимум 10 ботов за кадр
    
    groupBehaviorEnabled: true,
    groupCheckInterval: 250,
    maxGroupSize: 5,
    
    projectileDodgingEnabled: true,
    projectileScanInterval: 15,
    maxProjectileScansPerFrame: 30,
    
    monitoringEnabled: true,
    metricsUpdateInterval: 1000,  // Раз в секунду
    logMetrics: false,
    detailedMetrics: true,
    metricsHistorySize: 60,      // 60 секунд истории
    enablePerformanceWarnings: true
};

/**
 * Мониторинг производительности ботов
 */
export class BotPerformanceMonitor {
    private bots: EnemyTank[] = [];
    private metrics: Map<string, BotMetrics> = new Map();
    private aggregatedMetrics: AggregatedBotMetrics | null = null;
    private settings: BotPerformanceSettings = { ...DEFAULT_BOT_PERFORMANCE_SETTINGS };
    
    private updateTimer: NodeJS.Timeout | null = null;
    private lastMetricsUpdate: number = 0;
    
    private currentFPS: number = 60;
    private playerPosition: Vector3 = Vector3.Zero();
    
    // Статистика обновлений
    private frameUpdateTimes: Map<string, number[]> = new Map();
    private maxHistorySize = 100;
    
    // Детальная статистика AI методов
    private aiTimingMetrics: Map<string, AITimingMetrics> = new Map();
    private raycastStats: Map<string, { count: number; cacheHits: number }> = new Map();
    private pathfindingStats: Map<string, { count: number; cacheHits: number }> = new Map();
    private stateHistory: Map<string, Array<{ state: string; timestamp: number }>> = new Map();
    private shotStats: Map<string, { fired: number; hit: number }> = new Map();
    private movementStats: Map<string, { distance: number; speed: number; maxSpeed: number; lastPos: Vector3 }> = new Map();
    private dodgeStats: Map<string, { executed: number; successful: number }> = new Map();
    private groupStats: Map<string, { coordination: number; coverSeeking: number }> = new Map();
    
    // История метрик для графиков
    private metricsHistory: Array<{
        timestamp: number;
        fpsImpact: number;
        averageUpdateTime: number;
        aliveBots: number;
    }> = [];
    
    /**
     * Инициализация мониторинга
     */
    initialize(bots: EnemyTank[], settings?: Partial<BotPerformanceSettings>): void {
        this.bots = bots;
        if (settings) {
            this.settings = { ...this.settings, ...settings };
        }
        
        if (this.settings.monitoringEnabled) {
            this.startMonitoring();
        }
        
        logger.log("[BotPerformanceMonitor] Initialized", this.settings);
    }
    
    /**
     * Запустить мониторинг
     */
    private startMonitoring(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        this.updateTimer = setInterval(() => {
            this.updateMetrics();
        }, this.settings.metricsUpdateInterval);
    }
    
    /**
     * Остановить мониторинг
     */
    stopMonitoring(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }
    
    /**
     * Обновить метрики
     */
    updateMetrics(): void {
        const now = Date.now();
        if (now - this.lastMetricsUpdate < this.settings.metricsUpdateInterval) {
            return;
        }
        
        this.lastMetricsUpdate = now;
        
        // Собираем метрики для каждого бота
        const botMetrics: BotMetrics[] = [];
        
        for (const bot of this.bots) {
            if (!bot || !bot.chassis || bot.chassis.isDisposed()) continue;
            
            try {
                // Получаем уникальный ID бота
                let botId: string;
                if (typeof (bot as any).getId === 'function') {
                    botId = (bot as any).getId().toString();
                } else if ((bot as any).id !== undefined) {
                    botId = (bot as any).id.toString();
                } else if (bot.chassis && bot.chassis.uniqueId !== undefined) {
                    botId = `enemy_${bot.chassis.uniqueId}`;
                } else {
                    // Fallback: используем индекс в массиве
                    const index = this.bots.indexOf(bot);
                    botId = `enemy_${index}_${bot.chassis?.uniqueId || Date.now()}`;
                }
                if (!botId) continue;
                
                const botPos = bot.chassis.absolutePosition;
                if (!botPos) continue;
                
                const distance = Vector3.Distance(botPos, this.playerPosition);
                
                // Получаем историю времени обновления
                const updateTimes = this.frameUpdateTimes.get(botId) || [];
            const avgUpdateTime = updateTimes.length > 0 
                ? updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length 
                : 0;
            const maxUpdateTime = updateTimes.length > 0 ? Math.max(...updateTimes) : 0;
            const minUpdateTime = updateTimes.length > 0 ? Math.min(...updateTimes) : 0;
            
            // Определяем LOD уровень
            let lodLevel: "high" | "medium" | "low" = "high";
            if (distance > this.settings.lodDistanceMedium) {
                lodLevel = "low";
            } else if (distance > this.settings.lodDistanceHigh) {
                lodLevel = "medium";
            }
            
            // Определяем интервал обновления
            let updateInterval = this.settings.aiUpdateIntervalFar;
            if (distance < 50) {
                updateInterval = this.settings.aiUpdateIntervalNear;
            } else if (distance < 100) {
                updateInterval = this.settings.aiUpdateIntervalMid;
            }
            
            // Применяем адаптивный множитель при низком FPS
            if (this.settings.adaptiveUpdateEnabled && this.currentFPS < this.settings.lowFPSThreshold) {
                updateInterval = Math.ceil(updateInterval * this.settings.lowFPSMultiplier);
            }
            
            // Получаем детальные метрики AI
            const aiTiming = this.aiTimingMetrics.get(botId) || {
                updateAITime: 0,
                makeDecisionTime: 0,
                scanProjectilesTime: 0,
                checkProjectileThreatTime: 0,
                updateNearbyEnemiesTime: 0,
                updatePlayerStyleTime: 0,
                raycastTime: 0,
                pathfindingTime: 0,
                driveTowardTime: 0,
                fireTime: 0,
                totalAITime: 0
            };
            
            // Получаем статистику raycast
            const raycastStat = this.raycastStats.get(botId) || { count: 0, cacheHits: 0 };
            const pathfindingStat = this.pathfindingStats.get(botId) || { count: 0, cacheHits: 0 };
            
            // Получаем статистику состояний
            const stateHist = this.stateHistory.get(botId) || [];
            const stateChanges = stateHist.length;
            const lastStateChange = stateHist.length > 0 ? stateHist[stateHist.length - 1] : null;
            const timeInCurrentState = lastStateChange ? now - lastStateChange.timestamp : 0;
            
            // Получаем статистику стрельбы (с защитой от деления на ноль)
            const shotStat = this.shotStats.get(botId) || { fired: 0, hit: 0 };
            const accuracy = shotStat.fired > 0 && isFinite(shotStat.hit) && isFinite(shotStat.fired)
                ? Math.max(0, Math.min(100, (shotStat.hit / shotStat.fired) * 100))
                : 0;
            
            // Получаем статистику движения
            const moveStat = this.movementStats.get(botId) || { 
                distance: 0, 
                speed: 0, 
                maxSpeed: 0, 
                lastPos: botPos ? botPos.clone() : Vector3.Zero() 
            };
            
            // Получаем статистику уклонений
            const dodgeStat = this.dodgeStats.get(botId) || { executed: 0, successful: 0 };
            
            // Получаем статистику группового поведения
            const groupStat = this.groupStats.get(botId) || { coordination: 0, coverSeeking: 0 };
            
            // Оценка влияния на FPS (с защитой от деления на ноль и некорректных значений)
            const fpsImpact = isFinite(avgUpdateTime) && avgUpdateTime > 0
                ? Math.max(0, Math.min(100, (avgUpdateTime / 16.67) * 100)) // 16.67мс = 60 FPS
                : 0;
            const cpuUsage = isFinite(avgUpdateTime) && avgUpdateTime > 0
                ? Math.max(0, Math.min(100, (avgUpdateTime / 1000) * 100)) // Примерная оценка CPU
                : 0;
            
            // Оценка памяти (примерная)
            const memoryUsage = this.estimateMemoryUsage(bot);
            
            const metrics: BotMetrics = {
                id: botId,
                isAlive: bot.isAlive,
                distance,
                state: (bot as any).state || "unknown",
                updateInterval,
                lastUpdateTime: now,
                updateCount: updateTimes.length,
                averageUpdateTime: avgUpdateTime,
                maxUpdateTime,
                minUpdateTime,
                aiTiming,
                physicsTime: avgUpdateTime * 0.3,
                renderTime: avgUpdateTime * 0.1,
                memoryUsage,
                lodLevel,
                hasPhysics: distance < this.settings.physicsDistanceThreshold,
                raycastCount: raycastStat.count,
                raycastCacheHits: raycastStat.cacheHits,
                pathfindingQueries: pathfindingStat.count,
                pathfindingCacheHits: pathfindingStat.cacheHits,
                stateChanges,
                lastStateChangeTime: lastStateChange?.timestamp || 0,
                timeInCurrentState,
                shotsFired: shotStat.fired,
                shotsHit: shotStat.hit,
                accuracy,
                lastShotTime: (bot as any).lastShotTime || 0,
                distanceTraveled: moveStat.distance,
                averageSpeed: moveStat.speed,
                maxSpeed: moveStat.maxSpeed,
                dodgesExecuted: dodgeStat.executed,
                successfulDodges: dodgeStat.successful,
                groupCoordinationCount: groupStat.coordination,
                coverSeekingCount: groupStat.coverSeeking,
                fpsImpact,
                cpuUsage
            };
            
                botMetrics.push(metrics);
                this.metrics.set(botId, metrics);
            } catch (e) {
                logger.warn(`[BotPerformanceMonitor] Error collecting metrics for bot:`, e);
                continue;
            }
        }
        
        // Вычисляем агрегированные метрики
        this.aggregatedMetrics = this.calculateAggregatedMetrics(botMetrics);
        
        // Логируем если включено
        if (this.settings.logMetrics && this.aggregatedMetrics) {
            this.logMetrics(this.aggregatedMetrics);
        }
    }
    
    /**
     * Оценить использование памяти ботом
     */
    private estimateMemoryUsage(bot: EnemyTank): number {
        // Примерная оценка памяти на основе компонентов
        let memory = 0;
        
        // Базовые компоненты
        if (bot.chassis) memory += 50; // KB
        if ((bot as any).turret) memory += 30;
        if ((bot as any).barrel) memory += 20;
        
        // Физика
        if ((bot as any).physicsBody) memory += 40;
        
        // AI данные
        memory += 20; // Состояния, пути, кэши
        
        return memory;
    }
    
    /**
     * Вычислить агрегированные метрики
     */
    private calculateAggregatedMetrics(botMetrics: BotMetrics[]): AggregatedBotMetrics {
        const alive = botMetrics.filter(m => m.isAlive);
        const dead = botMetrics.filter(m => !m.isAlive);
        
        const near = alive.filter(m => m.distance < 50).length;
        const mid = alive.filter(m => m.distance >= 50 && m.distance < 100).length;
        const far = alive.filter(m => m.distance >= 100).length;
        
        const stateDist: Record<string, number> = {};
        alive.forEach(m => {
            stateDist[m.state] = (stateDist[m.state] || 0) + 1;
        });
        
        const lodDist = {
            high: alive.filter(m => m.lodLevel === "high").length,
            medium: alive.filter(m => m.lodLevel === "medium").length,
            low: alive.filter(m => m.lodLevel === "low").length
        };
        
        const physicsDist = {
            with: alive.filter(m => m.hasPhysics).length,
            without: alive.filter(m => !m.hasPhysics).length
        };
        
        const totalUpdateTime = alive.reduce((sum, m) => sum + m.averageUpdateTime, 0);
        const totalAITime = alive.reduce((sum, m) => sum + m.aiTiming.totalAITime, 0);
        const totalPhysicsTime = alive.reduce((sum, m) => sum + m.physicsTime, 0);
        const totalRenderTime = alive.reduce((sum, m) => sum + m.renderTime, 0);
        
        const updateIntervalDist: Record<number, number> = {};
        alive.forEach(m => {
            updateIntervalDist[m.updateInterval] = (updateIntervalDist[m.updateInterval] || 0) + 1;
        });
        
        const totalRaycasts = alive.reduce((sum, m) => sum + m.raycastCount, 0);
        const totalRaycastCacheHits = alive.reduce((sum, m) => sum + m.raycastCacheHits, 0);
        const totalPathfinding = alive.reduce((sum, m) => sum + m.pathfindingQueries, 0);
        const totalPathfindingCacheHits = alive.reduce((sum, m) => sum + m.pathfindingCacheHits, 0);
        const totalMemory = alive.reduce((sum, m) => sum + (m.memoryUsage || 0), 0);
        const memoryValues = alive.map(m => m.memoryUsage || 0).filter(v => isFinite(v));
        const maxMemory = memoryValues.length > 0 ? Math.max(...memoryValues) : 0;
        
        // Детальное время AI методов
        const avgAITiming: AITimingMetrics = {
            updateAITime: alive.reduce((sum, m) => sum + m.aiTiming.updateAITime, 0) / Math.max(alive.length, 1),
            makeDecisionTime: alive.reduce((sum, m) => sum + m.aiTiming.makeDecisionTime, 0) / Math.max(alive.length, 1),
            scanProjectilesTime: alive.reduce((sum, m) => sum + m.aiTiming.scanProjectilesTime, 0) / Math.max(alive.length, 1),
            checkProjectileThreatTime: alive.reduce((sum, m) => sum + m.aiTiming.checkProjectileThreatTime, 0) / Math.max(alive.length, 1),
            updateNearbyEnemiesTime: alive.reduce((sum, m) => sum + m.aiTiming.updateNearbyEnemiesTime, 0) / Math.max(alive.length, 1),
            updatePlayerStyleTime: alive.reduce((sum, m) => sum + m.aiTiming.updatePlayerStyleTime, 0) / Math.max(alive.length, 1),
            raycastTime: alive.reduce((sum, m) => sum + m.aiTiming.raycastTime, 0) / Math.max(alive.length, 1),
            pathfindingTime: alive.reduce((sum, m) => sum + m.aiTiming.pathfindingTime, 0) / Math.max(alive.length, 1),
            driveTowardTime: alive.reduce((sum, m) => sum + m.aiTiming.driveTowardTime, 0) / Math.max(alive.length, 1),
            fireTime: alive.reduce((sum, m) => sum + m.aiTiming.fireTime, 0) / Math.max(alive.length, 1),
            totalAITime: alive.reduce((sum, m) => sum + m.aiTiming.totalAITime, 0) / Math.max(alive.length, 1)
        };
        
        // Безопасное вычисление максимумов с фильтрацией некорректных значений
        const safeMax = (values: number[]): number => {
            const valid = values.filter(v => isFinite(v) && v >= 0);
            return valid.length > 0 ? Math.max(...valid) : 0;
        };
        
        // Безопасное вычисление суммы с обработкой ошибок
        const safeReduce = <T>(arr: T[], fn: (sum: number, item: T) => number, initial: number = 0): number => {
            try {
                return arr.reduce((sum, item) => {
                    try {
                        const value = fn(sum, item);
                        return isFinite(value) ? value : sum;
                    } catch (e) {
                        return sum;
                    }
                }, initial);
            } catch (e) {
                return initial;
            }
        };
        
        // Безопасное деление с защитой от деления на ноль
        const safeDiv = (numerator: number, denominator: number): number => {
            return denominator > 0 && isFinite(numerator) && isFinite(denominator) 
                ? numerator / denominator 
                : 0;
        };
        
        const maxAITiming: AITimingMetrics = {
            updateAITime: safeMax(alive.map(m => m.aiTiming.updateAITime)),
            makeDecisionTime: safeMax(alive.map(m => m.aiTiming.makeDecisionTime)),
            scanProjectilesTime: safeMax(alive.map(m => m.aiTiming.scanProjectilesTime)),
            checkProjectileThreatTime: safeMax(alive.map(m => m.aiTiming.checkProjectileThreatTime)),
            updateNearbyEnemiesTime: safeMax(alive.map(m => m.aiTiming.updateNearbyEnemiesTime)),
            updatePlayerStyleTime: safeMax(alive.map(m => m.aiTiming.updatePlayerStyleTime)),
            raycastTime: safeMax(alive.map(m => m.aiTiming.raycastTime)),
            pathfindingTime: safeMax(alive.map(m => m.aiTiming.pathfindingTime)),
            driveTowardTime: safeMax(alive.map(m => m.aiTiming.driveTowardTime)),
            fireTime: safeMax(alive.map(m => m.aiTiming.fireTime)),
            totalAITime: safeMax(alive.map(m => m.aiTiming.totalAITime))
        };
        
        // Среднее время в состояниях (с защитой от деления на ноль)
        const avgTimeInState: Record<string, number> = {};
        Object.keys(stateDist).forEach(state => {
            const botsInState = alive.filter(m => m.state === state);
            if (botsInState.length > 0) {
                const totalTime = safeReduce(botsInState, (sum, m) => sum + (m.timeInCurrentState || 0), 0);
                avgTimeInState[state] = safeDiv(totalTime, botsInState.length);
            }
        });
        
        // Статистика стрельбы (с защитой от некорректных значений)
        const totalShotsFired = alive.reduce((sum, m) => sum + (m.shotsFired || 0), 0);
        const totalShotsHit = alive.reduce((sum, m) => sum + (m.shotsHit || 0), 0);
        const accuracySum = alive.reduce((sum, m) => {
            const acc = m.accuracy || 0;
            return sum + (isFinite(acc) && acc >= 0 && acc <= 100 ? acc : 0);
        }, 0);
        const avgAccuracy = alive.length > 0 ? Math.max(0, Math.min(100, accuracySum / alive.length)) : 0;
        
        // Статистика движения (с защитой от некорректных значений)
        const totalDistance = safeReduce(alive, (sum, m) => sum + (m.distanceTraveled || 0), 0);
        const totalSpeed = safeReduce(alive, (sum, m) => sum + (m.averageSpeed || 0), 0);
        const avgSpeed = safeDiv(totalSpeed, alive.length);
        const speedValues = alive.map(m => m.maxSpeed || 0).filter(v => isFinite(v) && v >= 0);
        const maxSpeed = speedValues.length > 0 ? Math.max(...speedValues) : 0;
        
        // Статистика уклонений (с защитой от деления на ноль)
        const totalDodges = alive.reduce((sum, m) => sum + (m.dodgesExecuted || 0), 0);
        const successfulDodges = alive.reduce((sum, m) => sum + (m.successfulDodges || 0), 0);
        const dodgeSuccessRate = totalDodges > 0 && isFinite(successfulDodges) && isFinite(totalDodges)
            ? Math.max(0, Math.min(100, (successfulDodges / totalDodges) * 100))
            : 0;
        
        // Статистика группового поведения
        const totalGroupCoordination = safeReduce(alive, (sum, m) => sum + (m.groupCoordinationCount || 0), 0);
        const totalCoverSeeking = safeReduce(alive, (sum, m) => sum + (m.coverSeekingCount || 0), 0);
        
        // Производительность системы (с защитой от некорректных значений)
        const totalCPUUsage = safeReduce(alive, (sum, m) => sum + (m.cpuUsage || 0), 0);
        const avgCPUUsage = safeDiv(totalCPUUsage, alive.length);
        
        // Оценка влияния на FPS (с защитой от некорректных значений)
        const totalFPSImpact = alive.reduce((sum, m) => {
            const impact = m.fpsImpact || 0;
            return sum + (isFinite(impact) && impact >= 0 ? impact : 0);
        }, 0);
        const estimatedFPSImpact = Math.max(0, totalFPSImpact);
        
        // Кэш hit rate (с защитой от деления на ноль)
        const raycastCacheHitRate = totalRaycasts > 0 && isFinite(totalRaycastCacheHits) && isFinite(totalRaycasts)
            ? Math.max(0, Math.min(100, (totalRaycastCacheHits / totalRaycasts) * 100))
            : 0;
        const pathfindingCacheHitRate = totalPathfinding > 0 && isFinite(totalPathfindingCacheHits) && isFinite(totalPathfinding)
            ? Math.max(0, Math.min(100, (totalPathfindingCacheHits / totalPathfinding) * 100))
            : 0;
        
        // Добавляем в историю
        this.metricsHistory.push({
            timestamp: Date.now(),
            fpsImpact: estimatedFPSImpact,
            averageUpdateTime: alive.length > 0 ? totalUpdateTime / alive.length : 0,
            aliveBots: alive.length
        });
        
        // Ограничиваем размер истории
        if (this.metricsHistory.length > this.settings.metricsHistorySize) {
            this.metricsHistory.shift();
        }
        
        return {
            totalBots: botMetrics.length,
            aliveBots: alive.length,
            deadBots: dead.length,
            
            totalUpdateTime,
            averageUpdateTime: alive.length > 0 ? totalUpdateTime / alive.length : 0,
            maxUpdateTime: alive.length > 0 ? safeMax(alive.map(m => m.maxUpdateTime || 0)) : 0,
            minUpdateTime: alive.length > 0 ? Math.min(...alive.map(m => m.minUpdateTime || 0).filter(v => isFinite(v) && v >= 0)) : 0,
            totalAITime,
            totalPhysicsTime,
            totalRenderTime,
            
            averageAITiming: avgAITiming,
            maxAITiming: maxAITiming,
            
            nearBots: near,
            midBots: mid,
            farBots: far,
            
            stateDistribution: stateDist,
            averageTimeInState: avgTimeInState,
            
            highLOD: lodDist.high,
            mediumLOD: lodDist.medium,
            lowLOD: lodDist.low,
            
            botsWithPhysics: physicsDist.with,
            botsWithoutPhysics: physicsDist.without,
            
            totalRaycasts,
            averageRaycastsPerBot: alive.length > 0 ? totalRaycasts / alive.length : 0,
            raycastCacheHitRate,
            
            totalPathfindingQueries: totalPathfinding,
            averagePathfindingPerBot: alive.length > 0 ? totalPathfinding / alive.length : 0,
            pathfindingCacheHitRate,
            
            totalMemoryUsage: totalMemory,
            averageMemoryPerBot: alive.length > 0 ? totalMemory / alive.length : 0,
            maxMemoryPerBot: maxMemory,
            
            estimatedFPSImpact,
            totalFPSImpact,
            
            updateIntervalDistribution: updateIntervalDist,
            
            totalShotsFired,
            totalShotsHit,
            averageAccuracy: avgAccuracy,
            
            totalDistanceTraveled: totalDistance,
            averageSpeed: avgSpeed,
            maxSpeed: maxSpeed,
            
            totalDodges,
            successfulDodges,
            dodgeSuccessRate,
            
            totalGroupCoordination,
            totalCoverSeeking,
            
            totalCPUUsage,
            averageCPUUsage: avgCPUUsage,
            
            history: [...this.metricsHistory],
            maxHistorySize: this.settings.metricsHistorySize
        };
    }
    
    /**
     * Записать время обновления бота
     */
    recordBotUpdate(botId: string, updateTime: number): void {
        let times = this.frameUpdateTimes.get(botId) || [];
        times.push(updateTime);
        if (times.length > this.maxHistorySize) {
            times.shift();
        }
        this.frameUpdateTimes.set(botId, times);
    }
    
    /**
     * Записать детальные метрики AI
     */
    recordAITiming(botId: string, timing: Partial<AITimingMetrics>): void {
        const current = this.aiTimingMetrics.get(botId) || {
            updateAITime: 0,
            makeDecisionTime: 0,
            scanProjectilesTime: 0,
            checkProjectileThreatTime: 0,
            updateNearbyEnemiesTime: 0,
            updatePlayerStyleTime: 0,
            raycastTime: 0,
            pathfindingTime: 0,
            driveTowardTime: 0,
            fireTime: 0,
            totalAITime: 0
        };
        
        this.aiTimingMetrics.set(botId, { ...current, ...timing });
    }
    
    /**
     * Записать статистику raycast
     */
    recordRaycast(botId: string, cached: boolean = false): void {
        const stat = this.raycastStats.get(botId) || { count: 0, cacheHits: 0 };
        stat.count++;
        if (cached) {
            stat.cacheHits++;
        }
        this.raycastStats.set(botId, stat);
    }
    
    /**
     * Записать статистику pathfinding
     */
    recordPathfinding(botId: string, cached: boolean = false): void {
        const stat = this.pathfindingStats.get(botId) || { count: 0, cacheHits: 0 };
        stat.count++;
        if (cached) {
            stat.cacheHits++;
        }
        this.pathfindingStats.set(botId, stat);
    }
    
    /**
     * Записать изменение состояния
     */
    recordStateChange(botId: string, newState: string): void {
        const history = this.stateHistory.get(botId) || [];
        history.push({ state: newState, timestamp: Date.now() });
        
        // Ограничиваем размер истории
        if (history.length > 50) {
            history.shift();
        }
        
        this.stateHistory.set(botId, history);
    }
    
    /**
     * Записать выстрел
     */
    recordShot(botId: string, hit: boolean = false): void {
        const stat = this.shotStats.get(botId) || { fired: 0, hit: 0 };
        stat.fired++;
        if (hit) {
            stat.hit++;
        }
        this.shotStats.set(botId, stat);
    }
    
    /**
     * Записать движение
     */
    recordMovement(botId: string, distance: number, speed: number): void {
        const stat = this.movementStats.get(botId) || { 
            distance: 0, 
            speed: 0, 
            maxSpeed: 0, 
            lastPos: Vector3.Zero() 
        };
        
        stat.distance += distance;
        stat.speed = (stat.speed + speed) / 2; // Средняя скорость
        stat.maxSpeed = Math.max(stat.maxSpeed, speed);
        
        this.movementStats.set(botId, stat);
    }
    
    /**
     * Записать уклонение
     */
    recordDodge(botId: string, successful: boolean = false): void {
        const stat = this.dodgeStats.get(botId) || { executed: 0, successful: 0 };
        stat.executed++;
        if (successful) {
            stat.successful++;
        }
        this.dodgeStats.set(botId, stat);
    }
    
    /**
     * Записать групповое поведение
     */
    recordGroupBehavior(botId: string, type: "coordination" | "coverSeeking"): void {
        const stat = this.groupStats.get(botId) || { coordination: 0, coverSeeking: 0 };
        if (type === "coordination") {
            stat.coordination++;
        } else {
            stat.coverSeeking++;
        }
        this.groupStats.set(botId, stat);
    }
    
    /**
     * Очистить метрики бота
     */
    clearBotMetrics(botId: string): void {
        if (!botId) return;
        
        // Очищаем историю времени обновления перед удалением
        const updateTimes = this.frameUpdateTimes.get(botId);
        if (updateTimes) {
            updateTimes.length = 0;
        }
        
        // Удаляем все метрики бота
        this.frameUpdateTimes.delete(botId);
        this.aiTimingMetrics.delete(botId);
        this.raycastStats.delete(botId);
        this.pathfindingStats.delete(botId);
        this.stateHistory.delete(botId);
        this.shotStats.delete(botId);
        this.movementStats.delete(botId);
        this.dodgeStats.delete(botId);
        this.groupStats.delete(botId);
        this.metrics.delete(botId);
    }
    
    /**
     * Обновить список ботов (для очистки метрик удалённых ботов)
     */
    updateBotsList(bots: EnemyTank[]): void {
        if (!bots || !Array.isArray(bots)) {
            logger.warn("[BotPerformanceMonitor] Invalid bots array provided");
            return;
        }
        
        this.bots = bots;
        
        // Очищаем метрики для несуществующих ботов
        const activeBotIds = new Set(bots.map((bot, index) => {
            try {
                if (!bot || !bot.chassis || bot.chassis.isDisposed()) return null;
                
                // Получаем уникальный ID бота
                if (typeof (bot as any).getId === 'function') {
                    return (bot as any).getId().toString();
                } else if ((bot as any).id !== undefined) {
                    return (bot as any).id.toString();
                } else if (bot.chassis && bot.chassis.uniqueId !== undefined) {
                    return `enemy_${bot.chassis.uniqueId}`;
                } else {
                    // Fallback: используем индекс
                    return `enemy_${index}_${bot.chassis?.uniqueId || Date.now()}`;
                }
            } catch (e) {
                logger.warn("[BotPerformanceMonitor] Error getting bot ID:", e);
                return null;
            }
        }).filter(id => id !== null) as string[]);
        
        // Удаляем метрики для неактивных ботов
        for (const botId of this.metrics.keys()) {
            if (!activeBotIds.has(botId)) {
                this.clearBotMetrics(botId);
            }
        }
    }
    
    /**
     * Обновить FPS
     */
    updateFPS(fps: number): void {
        this.currentFPS = fps;
    }
    
    /**
     * Обновить позицию игрока
     */
    updatePlayerPosition(position: Vector3): void {
        if (!position) {
            logger.warn("[BotPerformanceMonitor] Invalid position provided");
            return;
        }
        try {
            this.playerPosition.copyFrom(position);
        } catch (e) {
            logger.warn("[BotPerformanceMonitor] Error updating player position:", e);
        }
    }
    
    /**
     * Получить метрики бота
     */
    getBotMetrics(botId: string): BotMetrics | undefined {
        return this.metrics.get(botId);
    }
    
    /**
     * Получить агрегированные метрики
     */
    getAggregatedMetrics(): AggregatedBotMetrics | null {
        return this.aggregatedMetrics;
    }
    
    /**
     * Получить настройки
     */
    getSettings(): BotPerformanceSettings {
        return { ...this.settings };
    }
    
    /**
     * Обновить настройки
     */
    updateSettings(settings: Partial<BotPerformanceSettings>): void {
        if (!settings) {
            logger.warn("[BotPerformanceMonitor] Invalid settings provided");
            return;
        }
        
        try {
            // Валидация значений перед применением
            const validatedSettings: Partial<BotPerformanceSettings> = {};
            
            if (settings.aiUpdateIntervalNear !== undefined) {
                validatedSettings.aiUpdateIntervalNear = Math.max(1, Math.min(30, Math.round(settings.aiUpdateIntervalNear)));
            }
            if (settings.aiUpdateIntervalMid !== undefined) {
                validatedSettings.aiUpdateIntervalMid = Math.max(1, Math.min(50, Math.round(settings.aiUpdateIntervalMid)));
            }
            if (settings.aiUpdateIntervalFar !== undefined) {
                validatedSettings.aiUpdateIntervalFar = Math.max(1, Math.min(100, Math.round(settings.aiUpdateIntervalFar)));
            }
            if (settings.lowFPSThreshold !== undefined) {
                validatedSettings.lowFPSThreshold = Math.max(10, Math.min(60, Math.round(settings.lowFPSThreshold)));
            }
            if (settings.highFPSThreshold !== undefined) {
                validatedSettings.highFPSThreshold = Math.max(30, Math.min(120, Math.round(settings.highFPSThreshold)));
            }
            if (settings.lowFPSMultiplier !== undefined) {
                validatedSettings.lowFPSMultiplier = Math.max(1.0, Math.min(5.0, settings.lowFPSMultiplier));
            }
            if (settings.maxBots !== undefined) {
                validatedSettings.maxBots = Math.max(1, Math.min(200, Math.round(settings.maxBots)));
            }
            if (settings.metricsHistorySize !== undefined) {
                validatedSettings.metricsHistorySize = Math.max(10, Math.min(1000, Math.round(settings.metricsHistorySize)));
            }
            
            // Применяем валидированные и остальные настройки
            this.settings = { ...this.settings, ...settings, ...validatedSettings };
            
            if (this.settings.monitoringEnabled && !this.updateTimer) {
                this.startMonitoring();
            } else if (!this.settings.monitoringEnabled && this.updateTimer) {
                this.stopMonitoring();
            }
            
            logger.log("[BotPerformanceMonitor] Settings updated", this.settings);
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Error updating settings:", e);
        }
    }
    
    /**
     * Логировать метрики
     */
    private logMetrics(metrics: AggregatedBotMetrics): void {
        logger.log(`[BotPerformanceMonitor] Metrics:
            Total: ${metrics.totalBots} (Alive: ${metrics.aliveBots}, Dead: ${metrics.deadBots})
            Distance: Near: ${metrics.nearBots}, Mid: ${metrics.midBots}, Far: ${metrics.farBots}
            LOD: High: ${metrics.highLOD}, Medium: ${metrics.mediumLOD}, Low: ${metrics.lowLOD}
            Physics: With: ${metrics.botsWithPhysics}, Without: ${metrics.botsWithoutPhysics}
            Update Time: Avg: ${metrics.averageUpdateTime.toFixed(2)}ms, Max: ${metrics.maxUpdateTime.toFixed(2)}ms
            AI Time: ${metrics.totalAITime.toFixed(2)}ms, Physics: ${metrics.totalPhysicsTime.toFixed(2)}ms
            Estimated FPS Impact: ${metrics.estimatedFPSImpact.toFixed(2)}%
            States: ${JSON.stringify(metrics.stateDistribution)}
            Update Intervals: ${JSON.stringify(metrics.updateIntervalDistribution)}`);
    }
    
    /**
     * Получить рекомендации по оптимизации (расширенная версия)
     */
    getOptimizationRecommendations(): Array<{ priority: "high" | "medium" | "low"; message: string; action?: () => void }> {
        if (!this.aggregatedMetrics) return [];
        
        const recommendations: Array<{ priority: "high" | "medium" | "low"; message: string; action?: () => void }> = [];
        
        // Критические проблемы (высокий приоритет)
        if (this.aggregatedMetrics.estimatedFPSImpact > 15) {
            recommendations.push({
                priority: "high",
                message: `КРИТИЧНО: Очень высокое влияние на FPS (${this.aggregatedMetrics.estimatedFPSImpact.toFixed(1)}%)`,
                action: () => {
                    this.updateSettings({
                        aiUpdateIntervalFar: Math.min(this.settings.aiUpdateIntervalFar * 2, 30),
                        aiUpdateIntervalMid: Math.min(this.settings.aiUpdateIntervalMid * 1.5, 10)
                    });
                }
            });
        }
        
        if (this.aggregatedMetrics.averageUpdateTime > 10) {
            recommendations.push({
                priority: "high",
                message: `КРИТИЧНО: Очень высокое время обновления (${this.aggregatedMetrics.averageUpdateTime.toFixed(2)}ms)`,
                action: () => {
                    this.updateSettings({
                        disablePhysicsForFarBots: true,
                        disableDetailsForFarBots: true,
                        lodEnabled: true
                    });
                }
            });
        }
        
        if (this.currentFPS < 20 && this.aggregatedMetrics.aliveBots > 5) {
            recommendations.push({
                priority: "high",
                message: `КРИТИЧНО: Низкий FPS (${this.currentFPS.toFixed(0)}) при ${this.aggregatedMetrics.aliveBots} ботах`,
                action: () => {
                    this.updateSettings({
                        aiUpdateIntervalNear: Math.min(this.settings.aiUpdateIntervalNear * 2, 5),
                        aiUpdateIntervalMid: Math.min(this.settings.aiUpdateIntervalMid * 2, 15),
                        aiUpdateIntervalFar: Math.min(this.settings.aiUpdateIntervalFar * 2, 30),
                        lowFPSMultiplier: Math.min(this.settings.lowFPSMultiplier * 1.5, 3.0)
                    });
                }
            });
        }
        
        // Средние проблемы
        if (this.aggregatedMetrics.estimatedFPSImpact > 10) {
            recommendations.push({
                priority: "medium",
                message: `Высокое влияние на FPS (${this.aggregatedMetrics.estimatedFPSImpact.toFixed(1)}%)`,
                action: () => {
                    this.updateSettings({
                        aiUpdateIntervalFar: Math.min(this.settings.aiUpdateIntervalFar + 5, 30)
                    });
                }
            });
        }
        
        if (this.aggregatedMetrics.averageUpdateTime > 5) {
            recommendations.push({
                priority: "medium",
                message: `Высокое среднее время обновления (${this.aggregatedMetrics.averageUpdateTime.toFixed(2)}ms)`,
                action: () => {
                    this.updateSettings({
                        lodEnabled: true,
                        disableDetailsForFarBots: true
                    });
                }
            });
        }
        
        if (this.aggregatedMetrics.botsWithPhysics > this.aggregatedMetrics.aliveBots * 0.5) {
            recommendations.push({
                priority: "medium",
                message: `Много ботов с физикой (${this.aggregatedMetrics.botsWithPhysics}/${this.aggregatedMetrics.aliveBots})`,
                action: () => {
                    this.updateSettings({
                        physicsDistanceThreshold: Math.max(this.settings.physicsDistanceThreshold - 20, 50),
                        disablePhysicsForFarBots: true
                    });
                }
            });
        }
        
        if (this.aggregatedMetrics.raycastCacheHitRate < 30 && this.aggregatedMetrics.totalRaycasts > 100) {
            recommendations.push({
                priority: "medium",
                message: `Низкий hit rate кэша raycast (${this.aggregatedMetrics.raycastCacheHitRate.toFixed(1)}%)`,
                action: () => {
                    this.updateSettings({
                        aiCacheTTL: Math.min(this.settings.aiCacheTTL * 2, 500)
                    });
                }
            });
        }
        
        // Низкие проблемы (оптимизации)
        if (this.aggregatedMetrics.aliveBots > this.settings.maxBots * 0.8) {
            recommendations.push({
                priority: "low",
                message: `Приближается к максимуму ботов (${this.aggregatedMetrics.aliveBots}/${this.settings.maxBots})`
            });
        }
        
        if (this.aggregatedMetrics.averageAccuracy < 20 && this.aggregatedMetrics.totalShotsFired > 50) {
            recommendations.push({
                priority: "low",
                message: `Низкая точность стрельбы (${this.aggregatedMetrics.averageAccuracy.toFixed(1)}%)`
            });
        }
        
        if (this.aggregatedMetrics.dodgeSuccessRate < 30 && this.aggregatedMetrics.totalDodges > 20) {
            recommendations.push({
                priority: "low",
                message: `Низкая успешность уклонений (${this.aggregatedMetrics.dodgeSuccessRate.toFixed(1)}%)`
            });
        }
        
        return recommendations;
    }
    
    /**
     * Автоматическая оптимизация на основе метрик
     */
    autoOptimize(): { optimized: boolean; changes: string[] } {
        if (!this.aggregatedMetrics || !this.settings.adaptiveUpdateEnabled) {
            return { optimized: false, changes: [] };
        }
        
        try {
            const changes: string[] = [];
            const newSettings: Partial<BotPerformanceSettings> = {};
            
            // Оптимизация при низком FPS
            if (isFinite(this.currentFPS) && this.currentFPS < this.settings.lowFPSThreshold) {
                if (this.settings.aiUpdateIntervalFar < 20) {
                    const newValue = Math.min(
                        Math.ceil(this.settings.aiUpdateIntervalFar * this.settings.lowFPSMultiplier),
                        30
                    );
                    newSettings.aiUpdateIntervalFar = newValue;
                    changes.push(`Увеличен интервал дальних ботов до ${newValue}`);
                }
                
                if (this.settings.aiUpdateIntervalMid < 10) {
                    const newValue = Math.min(
                        Math.ceil(this.settings.aiUpdateIntervalMid * this.settings.lowFPSMultiplier),
                        15
                    );
                    newSettings.aiUpdateIntervalMid = newValue;
                    changes.push(`Увеличен интервал средних ботов до ${newValue}`);
                }
                
                if (!this.settings.disablePhysicsForFarBots) {
                    newSettings.disablePhysicsForFarBots = true;
                    changes.push("Отключена физика для дальних ботов");
                }
                
                if (!this.settings.disableDetailsForFarBots) {
                    newSettings.disableDetailsForFarBots = true;
                    changes.push("Отключены детали для дальних ботов");
                }
            }
            
            // Оптимизация при высоком FPS (можно уменьшить интервалы)
            if (isFinite(this.currentFPS) && 
                isFinite(this.aggregatedMetrics.estimatedFPSImpact) &&
                this.currentFPS > this.settings.highFPSThreshold && 
                this.aggregatedMetrics.estimatedFPSImpact < 5) {
                if (this.settings.aiUpdateIntervalFar > 5) {
                    const newValue = Math.max(
                        Math.floor(this.settings.aiUpdateIntervalFar / 1.2),
                        5
                    );
                    newSettings.aiUpdateIntervalFar = newValue;
                    changes.push(`Уменьшен интервал дальних ботов до ${newValue} (высокий FPS)`);
                }
            }
            
            // Оптимизация при высоком времени обновления
            if (isFinite(this.aggregatedMetrics.averageUpdateTime) && 
                this.aggregatedMetrics.averageUpdateTime > 8) {
                if (!this.settings.lodEnabled) {
                    newSettings.lodEnabled = true;
                    changes.push("Включен LOD");
                }
                
                if (this.settings.physicsDistanceThreshold > 80) {
                    const newValue = Math.max(this.settings.physicsDistanceThreshold - 20, 50);
                    newSettings.physicsDistanceThreshold = newValue;
                    changes.push(`Уменьшен порог физики до ${newValue}м`);
                }
            }
            
            // Оптимизация кэша
            if (isFinite(this.aggregatedMetrics.raycastCacheHitRate) &&
                isFinite(this.aggregatedMetrics.totalRaycasts) &&
                this.aggregatedMetrics.raycastCacheHitRate < 20 && 
                this.aggregatedMetrics.totalRaycasts > 50) {
                if (this.settings.aiCacheTTL < 300) {
                    const newValue = Math.min(this.settings.aiCacheTTL * 1.5, 500);
                    newSettings.aiCacheTTL = newValue;
                    changes.push(`Увеличен TTL кэша до ${newValue}мс`);
                }
            }
            
            const optimized = changes.length > 0;
            if (optimized) {
                // Применяем изменения через updateSettings для валидации
                this.updateSettings(newSettings);
                logger.log("[BotPerformanceMonitor] Auto-optimization applied:", changes);
            }
            
            return { optimized, changes };
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Error in auto-optimization:", e);
            return { optimized: false, changes: [] };
        }
    }
    
    /**
     * Получить профиль производительности конкретного бота
     */
    getBotProfile(botId: string): {
        metrics: BotMetrics | undefined;
        performanceScore: number;
        bottlenecks: string[];
        recommendations: string[];
    } {
        if (!botId) {
            return {
                metrics: undefined,
                performanceScore: 0,
                bottlenecks: [],
                recommendations: []
            };
        }
        
        try {
            const metrics = this.getBotMetrics(botId);
            if (!metrics) {
                return {
                    metrics: undefined,
                    performanceScore: 0,
                    bottlenecks: [],
                    recommendations: []
                };
            }
            
            // Вычисляем performance score (0-100)
            let score = 100;
            const bottlenecks: string[] = [];
            const recommendations: string[] = [];
            
            // Штрафы за проблемы
            if (metrics.averageUpdateTime > 10) {
                score -= 30;
                bottlenecks.push("Высокое время обновления");
                recommendations.push("Увеличить интервал обновления или отключить детали");
            } else if (metrics.averageUpdateTime > 5) {
                score -= 15;
                bottlenecks.push("Среднее время обновления");
            }
            
            if (metrics.fpsImpact > 5) {
                score -= 20;
                bottlenecks.push("Высокое влияние на FPS");
                recommendations.push("Увеличить интервал обновления");
            }
            
            if (metrics.aiTiming && metrics.aiTiming.totalAITime > 5) {
                score -= 15;
                bottlenecks.push("Медленная AI");
                if (metrics.aiTiming.raycastTime > 2) {
                    recommendations.push("Оптимизировать raycast (увеличить кэш)");
                }
                if (metrics.aiTiming.pathfindingTime > 2) {
                    recommendations.push("Оптимизировать pathfinding (увеличить кэш)");
                }
            }
            
            if (metrics.memoryUsage > 200) {
                score -= 10;
                bottlenecks.push("Высокое использование памяти");
            }
            
            if (metrics.distance > 150 && metrics.hasPhysics) {
                score -= 10;
                bottlenecks.push("Физика включена для дальнего бота");
                recommendations.push("Отключить физику для дальних ботов");
            }
            
            score = Math.max(0, Math.min(100, score));
            
            return {
                metrics,
                performanceScore: score,
                bottlenecks,
                recommendations
            };
        } catch (e) {
            logger.warn(`[BotPerformanceMonitor] Error getting bot profile for ${botId}:`, e);
            return {
                metrics: undefined,
                performanceScore: 0,
                bottlenecks: [],
                recommendations: []
            };
        }
    }
    
    /**
     * Получить performance score бота
     */
    getBotPerformanceScore(botId: string): number {
        const profile = this.getBotProfile(botId);
        return profile.performanceScore;
    }
    
    /**
     * Получить рекомендации по оптимизации для бота
     */
    getBotOptimizationRecommendations(botId: string): Array<{ priority: "High" | "Medium" | "Low"; text: string }> {
        const profile = this.getBotProfile(botId);
        return profile.recommendations.map(rec => {
            // Определяем приоритет на основе текста рекомендации
            let priority: "High" | "Medium" | "Low" = "Low";
            const recLower = rec.toLowerCase();
            if (recLower.includes("критично") || recLower.includes("высокое") || recLower.includes("очень")) {
                priority = "High";
            } else if (recLower.includes("среднее") || recLower.includes("рекомендуется")) {
                priority = "Medium";
            }
            return { priority, text: rec };
        });
    }
    
    /**
     * Получить топ N лучших ботов по производительности
     */
    getTopPerformingBots(count: number = 5): Array<{ id: string; metrics: BotMetrics; score: number }> {
        return this.getTopBots(count, "performance");
    }
    
    /**
     * Получить топ N худших ботов по производительности
     */
    getWorstPerformingBots(count: number = 5): Array<{ id: string; metrics: BotMetrics; score: number }> {
        try {
            const allBots = this.getAllBots();
            if (allBots.length === 0) return [];
            
            const scored = allBots.map(({ id, metrics }) => {
                const score = this.getBotPerformanceScore(id);
                return { id, metrics, score };
            });
            
            scored.sort((a, b) => a.score - b.score); // Сортируем по возрастанию (худшие первыми)
            return scored.slice(0, Math.min(count, scored.length));
        } catch (e) {
            logger.warn("[BotPerformanceMonitor] Error getting worst performing bots:", e);
            return [];
        }
    }
    
    /**
     * Сравнить производительность ботов
     */
    compareBots(botIds: string[]): {
        best: string | null;
        worst: string | null;
        comparison: Array<{ botId: string; score: number; metrics: BotMetrics }>;
    } {
        if (!botIds || !Array.isArray(botIds) || botIds.length === 0) {
            return { best: null, worst: null, comparison: [] };
        }
        
        try {
            const profiles = botIds
                .filter(id => id && typeof id === 'string')
                .map(id => ({
                    botId: id,
                    profile: this.getBotProfile(id)
                }))
                .filter(p => p.profile && p.profile.metrics);
            
            if (profiles.length === 0) {
                return { best: null, worst: null, comparison: [] };
            }
            
            profiles.sort((a, b) => b.profile.performanceScore - a.profile.performanceScore);
            
            return {
                best: profiles[0]?.botId || null,
                worst: profiles[profiles.length - 1]?.botId || null,
                comparison: profiles.map(p => ({
                    botId: p.botId,
                    score: p.profile.performanceScore,
                    metrics: p.profile.metrics!
                }))
            };
        } catch (e) {
            logger.warn("[BotPerformanceMonitor] Error comparing bots:", e);
            return { best: null, worst: null, comparison: [] };
        }
    }
    
    /**
     * Экспортировать метрики в JSON
     */
    exportMetrics(format: "json" | "csv" = "json"): string {
        try {
            if (!this.aggregatedMetrics) {
                // Возвращаем пустые данные вместо пустой строки
                if (format === "json") {
                    return JSON.stringify({
                        timestamp: Date.now(),
                        settings: this.settings,
                        aggregatedMetrics: null,
                        botMetrics: [],
                        fps: this.currentFPS
                    }, null, 2);
                } else {
                    return "Bot ID,Alive,Distance,State,Update Time (ms),FPS Impact (%),CPU Usage (%),Memory (KB)\n";
                }
            }
            
            if (format === "json") {
                const exportData = {
                    timestamp: Date.now(),
                    settings: this.settings,
                    aggregatedMetrics: this.aggregatedMetrics,
                    botMetrics: Array.from(this.metrics.values()),
                    fps: this.currentFPS
                };
                return JSON.stringify(exportData, null, 2);
            } else {
                // CSV формат
                const lines: string[] = [];
                lines.push("Bot ID,Alive,Distance,State,Update Time (ms),FPS Impact (%),CPU Usage (%),Memory (KB)");
                
                for (const metrics of this.metrics.values()) {
                    try {
                        // Экранируем запятые и кавычки в CSV
                        const escapeCSV = (val: string | number): string => {
                            const str = String(val);
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        };
                        
                        lines.push([
                            escapeCSV(metrics.id),
                            metrics.isAlive ? "Yes" : "No",
                            metrics.distance.toFixed(2),
                            escapeCSV(metrics.state),
                            metrics.averageUpdateTime.toFixed(2),
                            metrics.fpsImpact.toFixed(2),
                            metrics.cpuUsage.toFixed(2),
                            metrics.memoryUsage.toFixed(2)
                        ].join(","));
                    } catch (e) {
                        logger.warn("[BotPerformanceMonitor] Error exporting bot metrics:", e);
                        continue;
                    }
                }
                
                return lines.join("\n");
            }
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Error exporting metrics:", e);
            return format === "json" ? "{}" : "";
        }
    }
    
    /**
     * Получить алерты о производительности
     */
    getPerformanceAlerts(): Array<{ level: "critical" | "warning" | "info"; message: string; timestamp: number }> {
        if (!this.aggregatedMetrics) return [];
        
        const alerts: Array<{ level: "critical" | "warning" | "info"; message: string; timestamp: number }> = [];
        const now = Date.now();
        
        // Критические алерты
        if (this.aggregatedMetrics.estimatedFPSImpact > 20) {
            alerts.push({
                level: "critical",
                message: `КРИТИЧНО: Влияние на FPS превышает 20% (${this.aggregatedMetrics.estimatedFPSImpact.toFixed(1)}%)`,
                timestamp: now
            });
        }
        
        if (this.currentFPS < 15) {
            alerts.push({
                level: "critical",
                message: `КРИТИЧНО: FPS ниже 15 (${this.currentFPS.toFixed(0)} FPS)`,
                timestamp: now
            });
        }
        
        if (this.aggregatedMetrics.averageUpdateTime > 15) {
            alerts.push({
                level: "critical",
                message: `КРИТИЧНО: Среднее время обновления превышает 15мс (${this.aggregatedMetrics.averageUpdateTime.toFixed(2)}мс)`,
                timestamp: now
            });
        }
        
        // Предупреждения
        if (this.aggregatedMetrics.estimatedFPSImpact > 10) {
            alerts.push({
                level: "warning",
                message: `ВНИМАНИЕ: Высокое влияние на FPS (${this.aggregatedMetrics.estimatedFPSImpact.toFixed(1)}%)`,
                timestamp: now
            });
        }
        
        if (this.currentFPS < 30 && this.aggregatedMetrics.aliveBots > 10) {
            alerts.push({
                level: "warning",
                message: `ВНИМАНИЕ: Низкий FPS (${this.currentFPS.toFixed(0)}) при ${this.aggregatedMetrics.aliveBots} ботах`,
                timestamp: now
            });
        }
        
        if (this.aggregatedMetrics.totalMemoryUsage > 5000) {
            alerts.push({
                level: "warning",
                message: `ВНИМАНИЕ: Высокое использование памяти (${(this.aggregatedMetrics.totalMemoryUsage / 1024).toFixed(1)}MB)`,
                timestamp: now
            });
        }
        
        // Информационные алерты
        if (this.aggregatedMetrics.aliveBots > this.settings.maxBots * 0.9) {
            alerts.push({
                level: "info",
                message: `Информация: Приближается к максимуму ботов (${this.aggregatedMetrics.aliveBots}/${this.settings.maxBots})`,
                timestamp: now
            });
        }
        
        return alerts;
    }
    
    /**
     * Получить список всех ботов с их метриками
     */
    getAllBots(): Array<{ id: string; metrics: BotMetrics }> {
        return Array.from(this.metrics.entries()).map(([id, metrics]) => ({
            id,
            metrics
        }));
    }
    
    /**
     * Получить топ N ботов по производительности
     */
    getTopBots(count: number = 5, sortBy: "performance" | "fpsImpact" | "updateTime" = "performance"): Array<{ id: string; metrics: BotMetrics; score: number }> {
        if (count <= 0) return [];
        
        try {
            const allBots = this.getAllBots();
            if (allBots.length === 0) return [];
            
            const scored = allBots.map(({ id, metrics }) => {
                let score = 0;
                
                try {
                    switch (sortBy) {
                        case "performance":
                            const profile = this.getBotProfile(id);
                            score = profile.performanceScore;
                            break;
                        case "fpsImpact":
                            score = -metrics.fpsImpact; // Меньше = лучше
                            break;
                        case "updateTime":
                            score = -metrics.averageUpdateTime; // Меньше = лучше
                            break;
                        default:
                            score = 0;
                    }
                } catch (e) {
                    logger.warn(`[BotPerformanceMonitor] Error scoring bot ${id}:`, e);
                    score = 0;
                }
                
                return { id, metrics, score };
            });
            
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, Math.min(count, scored.length));
        } catch (e) {
            logger.warn("[BotPerformanceMonitor] Error getting top bots:", e);
            return [];
        }
    }
    
    /**
     * Получить статистику по состояниям ботов
     */
    getStateStatistics(): Record<string, {
        count: number;
        averageUpdateTime: number;
        averageFPSImpact: number;
    }> {
        try {
            const stats: Record<string, {
                count: number;
                totalUpdateTime: number;
                totalFPSImpact: number;
            }> = {};
            
            for (const metrics of this.metrics.values()) {
                if (!metrics || !metrics.isAlive) continue;
                
                const state = metrics.state || "unknown";
                
                if (!stats[state]) {
                    stats[state] = {
                        count: 0,
                        totalUpdateTime: 0,
                        totalFPSImpact: 0
                    };
                }
                
                stats[state].count++;
                stats[state].totalUpdateTime += metrics.averageUpdateTime || 0;
                stats[state].totalFPSImpact += metrics.fpsImpact || 0;
            }
            
            const result: Record<string, {
                count: number;
                averageUpdateTime: number;
                averageFPSImpact: number;
            }> = {};
            
            for (const [state, data] of Object.entries(stats)) {
                if (data.count > 0) {
                    result[state] = {
                        count: data.count,
                        averageUpdateTime: data.totalUpdateTime / data.count,
                        averageFPSImpact: data.totalFPSImpact / data.count
                    };
                }
            }
            
            return result;
        } catch (e) {
            logger.warn("[BotPerformanceMonitor] Error getting state statistics:", e);
            return {};
        }
    }
    
    /**
     * Очистить метрики
     */
    dispose(): void {
        this.stopMonitoring();
        
        // Очищаем все коллекции
        this.metrics.clear();
        this.frameUpdateTimes.clear();
        this.aiTimingMetrics.clear();
        this.raycastStats.clear();
        this.pathfindingStats.clear();
        this.stateHistory.clear();
        this.shotStats.clear();
        this.movementStats.clear();
        this.dodgeStats.clear();
        this.groupStats.clear();
        this.metricsHistory = [];
        this.aggregatedMetrics = null;
        
        // Очищаем ссылки на ботов
        this.bots = [];
        this.playerPosition = Vector3.Zero();
        this.currentFPS = 60;
        
        logger.log("[BotPerformanceMonitor] Disposed");
    }
    
    /**
     * Сохранить профиль настроек
     */
    saveProfile(name: string, description?: string): void {
        try {
            const profile: BotPerformanceProfile = {
                name,
                description,
                settings: { ...this.settings },
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            const profiles = this.getProfiles();
            const existingIndex = profiles.findIndex(p => p.name === name);
            
            if (existingIndex >= 0) {
                profiles[existingIndex] = profile;
            } else {
                profiles.push(profile);
            }
            
            localStorage.setItem("botPerformanceProfiles", JSON.stringify(profiles));
            logger.log(`[BotPerformanceMonitor] Profile "${name}" saved`);
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Failed to save profile:", e);
        }
    }
    
    /**
     * Загрузить профиль настроек
     */
    loadProfile(name: string): boolean {
        try {
            const profiles = this.getProfiles();
            const profile = profiles.find(p => p.name === name);
            
            if (!profile) {
                logger.warn(`[BotPerformanceMonitor] Profile "${name}" not found`);
                return false;
            }
            
            this.updateSettings(profile.settings);
            logger.log(`[BotPerformanceMonitor] Profile "${name}" loaded`);
            return true;
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Failed to load profile:", e);
            return false;
        }
    }
    
    /**
     * Удалить профиль
     */
    deleteProfile(name: string): boolean {
        try {
            const profiles = this.getProfiles();
            const filtered = profiles.filter(p => p.name !== name);
            
            if (filtered.length === profiles.length) {
                logger.warn(`[BotPerformanceMonitor] Profile "${name}" not found`);
                return false;
            }
            
            localStorage.setItem("botPerformanceProfiles", JSON.stringify(filtered));
            logger.log(`[BotPerformanceMonitor] Profile "${name}" deleted`);
            return true;
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Failed to delete profile:", e);
            return false;
        }
    }
    
    /**
     * Получить список всех профилей
     */
    getProfiles(): BotPerformanceProfile[] {
        try {
            const saved = localStorage.getItem("botPerformanceProfiles");
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            logger.warn("[BotPerformanceMonitor] Failed to load profiles:", e);
        }
        
        // Возвращаем предустановленные профили, если нет сохраненных
        return this.getDefaultProfiles();
    }
    
    /**
     * Получить предустановленные профили
     */
    getDefaultProfiles(): BotPerformanceProfile[] {
        const now = Date.now();
        return [
            {
                name: "Максимальная производительность",
                description: "Минимальные настройки для максимального FPS",
                settings: {
                    ...DEFAULT_BOT_PERFORMANCE_SETTINGS,
                    aiUpdateIntervalNear: 3,
                    aiUpdateIntervalMid: 6,
                    aiUpdateIntervalFar: 15,
                    lodEnabled: true,
                    disableDetailsForFarBots: true,
                    disablePhysicsForFarBots: true,
                    disableEffectsForFarBots: true,
                    disableSoundsForFarBots: true,
                    maxBots: 30,
                    maxBotsPerFrame: 5
                },
                createdAt: now,
                updatedAt: now
            },
            {
                name: "Сбалансированный",
                description: "Оптимальный баланс между производительностью и качеством",
                settings: { ...DEFAULT_BOT_PERFORMANCE_SETTINGS },
                createdAt: now,
                updatedAt: now
            },
            {
                name: "Максимальное качество",
                description: "Максимальное качество AI и рендеринга",
                settings: {
                    ...DEFAULT_BOT_PERFORMANCE_SETTINGS,
                    aiUpdateIntervalNear: 1,
                    aiUpdateIntervalMid: 2,
                    aiUpdateIntervalFar: 5,
                    lodEnabled: false,
                    disableDetailsForFarBots: false,
                    disablePhysicsForFarBots: false,
                    disableEffectsForFarBots: false,
                    disableSoundsForFarBots: false,
                    maxBots: 50,
                    maxBotsPerFrame: 15
                },
                createdAt: now,
                updatedAt: now
            }
        ];
    }
    
    /**
     * Экспортировать профиль в JSON
     */
    exportProfile(name: string): string | null {
        try {
            const profiles = this.getProfiles();
            const profile = profiles.find(p => p.name === name);
            
            if (!profile) {
                logger.warn(`[BotPerformanceMonitor] Profile "${name}" not found`);
                return null;
            }
            
            return JSON.stringify(profile, null, 2);
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Failed to export profile:", e);
            return null;
        }
    }
    
    /**
     * Импортировать профиль из JSON
     */
    importProfile(json: string): boolean {
        try {
            const profile: BotPerformanceProfile = JSON.parse(json);
            
            if (!profile.name || !profile.settings) {
                logger.error("[BotPerformanceMonitor] Invalid profile format");
                return false;
            }
            
            // Обновляем даты
            profile.updatedAt = Date.now();
            if (!profile.createdAt) {
                profile.createdAt = Date.now();
            }
            
            const profiles = this.getProfiles();
            const existingIndex = profiles.findIndex(p => p.name === profile.name);
            
            if (existingIndex >= 0) {
                profiles[existingIndex] = profile;
            } else {
                profiles.push(profile);
            }
            
            localStorage.setItem("botPerformanceProfiles", JSON.stringify(profiles));
            logger.log(`[BotPerformanceMonitor] Profile "${profile.name}" imported`);
            return true;
        } catch (e) {
            logger.error("[BotPerformanceMonitor] Failed to import profile:", e);
            return false;
        }
    }
}

