/**
 * History Manager - Управление историей метрик
 */

import type { MetricsSnapshot } from './metrics';

export interface HistoryConfig {
    enabled: boolean;
    duration: number; // seconds
    interval: number; // milliseconds
}

export class HistoryManager {
    private config: HistoryConfig;
    private history: MetricsSnapshot[] = [];
    private maxSize: number;
    
    constructor(config: HistoryConfig) {
        this.config = config;
        // Calculate max size based on duration and interval
        this.maxSize = Math.ceil((config.duration * 1000) / config.interval);
    }
    
    addSnapshot(snapshot: MetricsSnapshot): void {
        if (!this.config.enabled) return;
        
        // Optimize: only store essential data to reduce memory usage
        const optimizedSnapshot: MetricsSnapshot = {
            ...snapshot,
            // Keep full snapshot but limit nested arrays
            resources: {
                ...snapshot.resources,
                cpuHistory: snapshot.resources.cpuHistory.slice(-60), // Keep last 60
                ramHistory: snapshot.resources.ramHistory.slice(-60)  // Keep last 60
            }
        };
        
        this.history.push(optimizedSnapshot);
        
        // Remove old entries if exceeded max size (use efficient method)
        if (this.history.length > this.maxSize) {
            // Remove oldest entries in batches for better performance
            const removeCount = this.history.length - this.maxSize;
            this.history.splice(0, removeCount);
        }
    }
    
    getHistory(): MetricsSnapshot[] {
        return [...this.history];
    }
    
    getHistoryRange(startTime: number, endTime: number): MetricsSnapshot[] {
        return this.history.filter(snapshot => 
            snapshot.timestamp >= startTime && snapshot.timestamp <= endTime
        );
    }
    
    getLatest(count: number = 100): MetricsSnapshot[] {
        return this.history.slice(-count);
    }
    
    getMetricHistory(metricName: string): number[] {
        // Extract specific metric from history
        const values: number[] = [];
        
        for (const snapshot of this.history) {
            const value = this.getMetricValue(snapshot, metricName);
            if (value !== null) {
                values.push(value);
            }
        }
        
        return values;
    }
    
    private getMetricValue(snapshot: MetricsSnapshot, metricName: string): number | null {
        const parts = metricName.split('.');
        let value: any = snapshot;
        
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return null;
            }
        }
        
        return typeof value === 'number' ? value : null;
    }
    
    clear(): void {
        this.history = [];
    }
    
    getSize(): number {
        return this.history.length;
    }
    
    getMaxSize(): number {
        return this.maxSize;
    }
}

