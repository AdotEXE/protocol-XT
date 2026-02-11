/**
 * Bot Metrics Collector - Автоматический сбор метрик из EnemyTank
 */

import { EnemyTank } from "../enemyTank";
import { BotPerformanceMonitor } from "./BotPerformanceMonitor";
import { logger } from "../utils/logger";

/**
 * Декоратор для автоматического сбора метрик методов
 */
export class BotMetricsCollector {
    private monitor: BotPerformanceMonitor | null = null;
    private botId: string;
    
    constructor(botId: string, monitor: BotPerformanceMonitor | null = null) {
        this.botId = botId;
        this.monitor = monitor;
    }
    
    /**
     * Установить монитор
     */
    setMonitor(monitor: BotPerformanceMonitor): void {
        this.monitor = monitor;
    }
    
    /**
     * Измерить время выполнения метода
     */
    measureMethod<T>(
        methodName: string,
        method: () => T,
        recordToMonitor: boolean = true
    ): T {
        if (!this.monitor || !recordToMonitor) {
            try {
                return method();
            } catch (e) {
                logger.warn(`[BotMetricsCollector] Error in method ${methodName}:`, e);
                throw e;
            }
        }
        
        try {
        
        const startTime = performance.now();
        const result = method();
        const duration = performance.now() - startTime;
        
        // Записываем время выполнения
        const currentTiming = this.monitor.getBotMetrics(this.botId)?.aiTiming || {
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
        
        // Обновляем соответствующее поле
        const timingUpdate: any = {};
        switch (methodName) {
            case "updateAI":
                timingUpdate.updateAITime = duration;
                break;
            case "makeDecision":
                timingUpdate.makeDecisionTime = duration;
                break;
            case "scanProjectiles":
                timingUpdate.scanProjectilesTime = duration;
                break;
            case "checkProjectileThreat":
                timingUpdate.checkProjectileThreatTime = duration;
                break;
            case "updateNearbyEnemies":
                timingUpdate.updateNearbyEnemiesTime = duration;
                break;
            case "updatePlayerStyle":
                timingUpdate.updatePlayerStyleTime = duration;
                break;
            case "raycast":
                timingUpdate.raycastTime = duration;
                break;
            case "pathfinding":
                timingUpdate.pathfindingTime = duration;
                break;
            case "driveToward":
                timingUpdate.driveTowardTime = duration;
                break;
            case "fire":
                timingUpdate.fireTime = duration;
                break;
        }
        
        timingUpdate.totalAITime = currentTiming.totalAITime + duration;
        
            this.monitor.recordAITiming(this.botId, timingUpdate);
            
            return result;
        } catch (e) {
            logger.warn(`[BotMetricsCollector] Error measuring method ${methodName}:`, e);
            // Вызываем метод без измерения при ошибке
            return method();
        }
    }
    
    /**
     * Записать raycast
     */
    recordRaycast(cached: boolean = false): void {
        this.monitor?.recordRaycast(this.botId, cached);
    }
    
    /**
     * Записать pathfinding
     */
    recordPathfinding(cached: boolean = false): void {
        this.monitor?.recordPathfinding(this.botId, cached);
    }
    
    /**
     * Записать изменение состояния
     */
    recordStateChange(newState: string): void {
        this.monitor?.recordStateChange(this.botId, newState);
    }
    
    /**
     * Записать выстрел
     */
    recordShot(hit: boolean = false): void {
        this.monitor?.recordShot(this.botId, hit);
    }
    
    /**
     * Записать движение
     */
    recordMovement(distance: number, speed: number): void {
        this.monitor?.recordMovement(this.botId, distance, speed);
    }
    
    /**
     * Записать уклонение
     */
    recordDodge(successful: boolean = false): void {
        this.monitor?.recordDodge(this.botId, successful);
    }
    
    /**
     * Записать групповое поведение
     */
    recordGroupBehavior(type: "coordination" | "coverSeeking"): void {
        this.monitor?.recordGroupBehavior(this.botId, type);
    }
}

/**
 * Интеграция с EnemyTank для автоматического сбора метрик
 */
export function integrateBotMetrics(enemy: EnemyTank, monitor: BotPerformanceMonitor | null): void {
    if (!monitor || !enemy) return;
    
    // Получаем уникальный ID бота
    let botId: string;
    if (typeof (enemy as any).getId === 'function') {
        botId = (enemy as any).getId().toString();
    } else if ((enemy as any).id !== undefined) {
        botId = (enemy as any).id.toString();
    } else if (enemy.chassis && enemy.chassis.uniqueId !== undefined) {
        botId = `enemy_${enemy.chassis.uniqueId}`;
    } else {
        // Fallback: используем timestamp
        botId = `enemy_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
    
    const collector = new BotMetricsCollector(botId, monitor);
    
    // Сохраняем коллектор в боте
    (enemy as any).metricsCollector = collector;
    
    // Перехватываем методы для автоматического сбора метрик
    const originalUpdateAI = enemy["updateAI"]?.bind(enemy);
    if (originalUpdateAI) {
        enemy["updateAI"] = function() {
            return collector.measureMethod("updateAI", () => originalUpdateAI());
        };
    }
    
    const originalMakeDecision = enemy["makeDecision"]?.bind(enemy);
    if (originalMakeDecision) {
        enemy["makeDecision"] = function(distance: number, canSeeTarget: boolean = true) {
            return collector.measureMethod("makeDecision", () => originalMakeDecision(distance, canSeeTarget));
        };
    }
    
    const originalFire = enemy["fire"]?.bind(enemy);
    if (originalFire) {
        enemy["fire"] = function() {
            const result = collector.measureMethod("fire", () => originalFire());
            collector.recordShot(false); // NOTE: результат попадания требует колбэка из системы урона
            return result;
        };
    }
    
    // Отслеживаем изменения состояния
    let lastState = (enemy as any).state;
    const stateCheckInterval = setInterval(() => {
        const currentState = (enemy as any).state;
        if (currentState !== lastState) {
            collector.recordStateChange(currentState);
            lastState = currentState;
        }
    }, 100);
    
    // Сохраняем интервал для очистки
    (enemy as any)._metricsStateCheckInterval = stateCheckInterval;
    
    // Очистка при удалении бота
    const originalDispose = (enemy as any).dispose;
    (enemy as any).dispose = function() {
        // Очищаем интервал
        if ((this as any)._metricsStateCheckInterval) {
            clearInterval((this as any)._metricsStateCheckInterval);
            (this as any)._metricsStateCheckInterval = null;
        }
        
        // Очищаем метрики
        if (monitor) {
            monitor.clearBotMetrics(botId);
        }
        
        // Вызываем оригинальный dispose если есть
        if (originalDispose) {
            originalDispose.call(this);
        }
    };
    
    // Также очищаем при вызове onDispose если он есть
    if ((enemy as any).onDeathObservable) {
        (enemy as any).onDeathObservable.addOnce(() => {
            if ((enemy as any)._metricsStateCheckInterval) {
                clearInterval((enemy as any)._metricsStateCheckInterval);
                (enemy as any)._metricsStateCheckInterval = null;
            }
            if (monitor) {
                monitor.clearBotMetrics(botId);
            }
        });
    }
    
    logger.log(`[BotMetricsCollector] Integrated metrics collection for bot ${botId}`);
}

