/**
 * Metrics Automation - Автоматизация метрик (предупреждения, триггеры, автоотчёты)
 */

import { MetricsData } from "./metricsExporter";
import { logger } from "./utils/logger";

export interface MetricTrigger {
    id: string;
    name: string;
    metric: string; // 'fps', 'memory', 'drawCalls', etc.
    condition: 'above' | 'below' | 'equals';
    value: number;
    enabled: boolean;
    action: 'warning' | 'alert' | 'log' | 'report';
    cooldown: number; // Миллисекунды между срабатываниями
    lastTriggered?: number;
}

export interface MetricReport {
    timestamp: number;
    duration: number; // Длительность сбора данных (мс)
    metrics: {
        min: number;
        max: number;
        avg: number;
        current: number;
    };
    triggers: string[]; // ID сработавших триггеров
}

export class MetricsAutomation {
    private triggers: Map<string, MetricTrigger> = new Map();
    private reports: MetricReport[] = [];
    private maxReports = 50;
    private onWarning?: (message: string) => void;
    private onAlert?: (message: string) => void;
    
    constructor() {
        this.loadTriggers();
        this.initializeDefaultTriggers();
    }
    
    /**
     * Установка обработчиков
     */
    setHandlers(onWarning?: (message: string) => void, onAlert?: (message: string) => void): void {
        this.onWarning = onWarning;
        this.onAlert = onAlert;
    }
    
    /**
     * Проверка метрик на триггеры
     */
    checkMetrics(metrics: MetricsData): void {
        this.triggers.forEach(trigger => {
            if (!trigger.enabled) return;
            
            // Проверка кулдауна
            if (trigger.lastTriggered && Date.now() - trigger.lastTriggered < trigger.cooldown) {
                return;
            }
            
            const metricValue = this.getMetricValue(metrics, trigger.metric);
            if (metricValue === undefined) return;
            
            let shouldTrigger = false;
            
            switch (trigger.condition) {
                case 'above':
                    shouldTrigger = metricValue > trigger.value;
                    break;
                case 'below':
                    shouldTrigger = metricValue < trigger.value;
                    break;
                case 'equals':
                    shouldTrigger = Math.abs(metricValue - trigger.value) < 0.1;
                    break;
            }
            
            if (shouldTrigger) {
                this.executeTrigger(trigger, metricValue);
                trigger.lastTriggered = Date.now();
            }
        });
    }
    
    /**
     * Получение значения метрики
     */
    private getMetricValue(metrics: MetricsData, metric: string): number | undefined {
        switch (metric) {
            case 'fps':
                return metrics.fps;
            case 'memory':
                return metrics.memoryUsed;
            case 'drawCalls':
                return metrics.drawCalls;
            case 'meshes':
                return metrics.meshes;
            case 'vertices':
                return metrics.vertices;
            case 'triangles':
                return metrics.triangles;
            case 'frameTime':
                return metrics.frameTime;
            default:
                return (metrics as any)[metric];
        }
    }
    
    /**
     * Выполнение триггера
     */
    private executeTrigger(trigger: MetricTrigger, value: number): void {
        const message = `${trigger.name}: ${trigger.metric} = ${value.toFixed(2)} (${trigger.condition} ${trigger.value})`;
        
        switch (trigger.action) {
            case 'warning':
                logger.warn(`[MetricsAutomation] ${message}`);
                if (this.onWarning) {
                    this.onWarning(message);
                }
                break;
                
            case 'alert':
                logger.error(`[MetricsAutomation] ${message}`);
                if (this.onAlert) {
                    this.onAlert(message);
                }
                break;
                
            case 'log':
                logger.log(`[MetricsAutomation] ${message}`);
                break;
                
            case 'report':
                this.generateReport(trigger);
                break;
        }
    }
    
    /**
     * Добавление триггера
     */
    addTrigger(trigger: MetricTrigger): void {
        this.triggers.set(trigger.id, trigger);
        this.saveTriggers();
    }
    
    /**
     * Удаление триггера
     */
    removeTrigger(id: string): boolean {
        const deleted = this.triggers.delete(id);
        if (deleted) {
            this.saveTriggers();
        }
        return deleted;
    }
    
    /**
     * Получение всех триггеров
     */
    getTriggers(): MetricTrigger[] {
        return Array.from(this.triggers.values());
    }
    
    /**
     * Генерация отчёта
     */
    private generateReport(trigger: MetricTrigger): void {
        // Простой отчёт на основе последних данных
        const report: MetricReport = {
            timestamp: Date.now(),
            duration: 60000, // 1 минута
            metrics: {
                min: 0,
                max: 0,
                avg: 0,
                current: 0
            },
            triggers: [trigger.id]
        };
        
        this.reports.push(report);
        
        // Ограничиваем количество отчётов
        if (this.reports.length > this.maxReports) {
            this.reports.shift();
        }
        
        logger.log(`[MetricsAutomation] Report generated for trigger: ${trigger.name}`);
    }
    
    /**
     * Получение отчётов
     */
    getReports(): MetricReport[] {
        return [...this.reports];
    }
    
    /**
     * Инициализация триггеров по умолчанию
     */
    private initializeDefaultTriggers(): void {
        if (this.triggers.size > 0) return; // Уже есть триггеры
        
        // Низкий FPS
        this.addTrigger({
            id: 'low_fps',
            name: 'Низкий FPS',
            metric: 'fps',
            condition: 'below',
            value: 30,
            enabled: true,
            action: 'warning',
            cooldown: 5000
        });
        
        // Высокое использование памяти
        this.addTrigger({
            id: 'high_memory',
            name: 'Высокое использование памяти',
            metric: 'memory',
            condition: 'above',
            value: 500, // MB
            enabled: true,
            action: 'warning',
            cooldown: 10000
        });
        
        // Много draw calls
        this.addTrigger({
            id: 'high_drawcalls',
            name: 'Много draw calls',
            metric: 'drawCalls',
            condition: 'above',
            value: 1000,
            enabled: false,
            action: 'log',
            cooldown: 5000
        });
    }
    
    /**
     * Загрузка триггеров из localStorage
     */
    private loadTriggers(): void {
        try {
            const saved = localStorage.getItem('ptx_metrics_triggers');
            if (saved) {
                const triggers: MetricTrigger[] = JSON.parse(saved);
                triggers.forEach(trigger => {
                    this.triggers.set(trigger.id, trigger);
                });
            }
        } catch (error) {
            logger.warn("[MetricsAutomation] Failed to load triggers:", error);
        }
    }
    
    /**
     * Сохранение триггеров в localStorage
     */
    private saveTriggers(): void {
        try {
            const triggers = Array.from(this.triggers.values());
            localStorage.setItem('ptx_metrics_triggers', JSON.stringify(triggers));
        } catch (error) {
            logger.warn("[MetricsAutomation] Failed to save triggers:", error);
        }
    }
}

