/**
 * SyncMetrics - Класс для отслеживания метрик синхронизации мультиплеера
 * Отслеживает разницу позиций, частоту reconciliation, большие расхождения
 */

import { Vector3 } from "@babylonjs/core";

export interface SyncMetricsData {
    // Позиции
    averagePositionDiff: number; // Средняя разница позиций
    maxPositionDiff: number; // Максимальная разница позиций
    positionDiffHistory: number[]; // История разниц позиций (последние 60 значений)
    
    // Reconciliation
    reconciliationCount: number; // Общее количество reconciliation
    reconciliationRate: number; // Частота reconciliation (в секунду)
    hardCorrections: number; // Количество hard corrections
    softCorrections: number; // Количество soft corrections
    
    // Большие расхождения
    largeDiffs: number; // Количество расхождений > 10 единиц
    criticalDiffs: number; // Количество расхождений > 20 единиц
    
    // Вращение
    averageRotationDiff: number; // Средняя разница вращения
    averageTurretDiff: number; // Средняя разница вращения башни
    
    // Время
    lastReconciliationTime: number; // Время последней reconciliation
    lastUpdateTime: number; // Время последнего обновления
    
    // Статистика за период
    periodStartTime: number; // Время начала периода
    samplesCount: number; // Количество образцов
}

export class SyncMetrics {
    private data: SyncMetricsData;
    private readonly MAX_HISTORY = 60; // История за последние 60 секунд (при 60Hz)
    private readonly RECONCILIATION_WINDOW = 1000; // Окно для расчета частоты (1 секунда)
    private reconciliationTimes: number[] = []; // Временные метки reconciliation
    
    constructor() {
        this.data = {
            averagePositionDiff: 0,
            maxPositionDiff: 0,
            positionDiffHistory: [],
            reconciliationCount: 0,
            reconciliationRate: 0,
            hardCorrections: 0,
            softCorrections: 0,
            largeDiffs: 0,
            criticalDiffs: 0,
            averageRotationDiff: 0,
            averageTurretDiff: 0,
            lastReconciliationTime: 0,
            lastUpdateTime: Date.now(),
            periodStartTime: Date.now(),
            samplesCount: 0
        };
    }
    
    /**
     * Записать разницу позиций
     */
    recordPositionDiff(diff: number): void {
        this.data.positionDiffHistory.push(diff);
        if (this.data.positionDiffHistory.length > this.MAX_HISTORY) {
            this.data.positionDiffHistory.shift();
        }
        
        // Обновляем среднюю разницу
        const sum = this.data.positionDiffHistory.reduce((a, b) => a + b, 0);
        this.data.averagePositionDiff = sum / this.data.positionDiffHistory.length;
        
        // Обновляем максимальную разницу
        if (diff > this.data.maxPositionDiff) {
            this.data.maxPositionDiff = diff;
        }
        
        // Подсчитываем большие расхождения
        if (diff > 20) {
            this.data.criticalDiffs++;
        } else if (diff > 10) {
            this.data.largeDiffs++;
        }
        
        this.data.samplesCount++;
        this.data.lastUpdateTime = Date.now();
    }
    
    /**
     * Записать разницу вращения
     */
    recordRotationDiff(rotationDiff: number, turretDiff: number): void {
        // Простое скользящее среднее
        const alpha = 0.1;
        this.data.averageRotationDiff = this.data.averageRotationDiff * (1 - alpha) + rotationDiff * alpha;
        this.data.averageTurretDiff = this.data.averageTurretDiff * (1 - alpha) + turretDiff * alpha;
    }
    
    /**
     * Записать reconciliation
     */
    recordReconciliation(isHard: boolean, positionDiff: number): void {
        const now = Date.now();
        this.data.reconciliationCount++;
        this.reconciliationTimes.push(now);
        
        // Удаляем старые записи (старше окна)
        while (this.reconciliationTimes.length > 0 && now - this.reconciliationTimes[0] > this.RECONCILIATION_WINDOW) {
            this.reconciliationTimes.shift();
        }
        
        // Обновляем частоту reconciliation
        this.data.reconciliationRate = this.reconciliationTimes.length; // Количество за последнюю секунду
        
        if (isHard) {
            this.data.hardCorrections++;
        } else {
            this.data.softCorrections++;
        }
        
        this.data.lastReconciliationTime = now;
        this.recordPositionDiff(positionDiff);
    }
    
    /**
     * Получить текущие метрики
     */
    getMetrics(): SyncMetricsData {
        return { ...this.data };
    }
    
    /**
     * Сбросить метрики
     */
    reset(): void {
        this.data = {
            averagePositionDiff: 0,
            maxPositionDiff: 0,
            positionDiffHistory: [],
            reconciliationCount: 0,
            reconciliationRate: 0,
            hardCorrections: 0,
            softCorrections: 0,
            largeDiffs: 0,
            criticalDiffs: 0,
            averageRotationDiff: 0,
            averageTurretDiff: 0,
            lastReconciliationTime: 0,
            lastUpdateTime: Date.now(),
            periodStartTime: Date.now(),
            samplesCount: 0
        };
        this.reconciliationTimes = [];
    }
    
    /**
     * Экспорт метрик в JSON
     */
    exportJSON(): string {
        return JSON.stringify(this.data, null, 2);
    }
    
    /**
     * Экспорт метрик в CSV
     */
    exportCSV(): string {
        const lines: string[] = [];
        lines.push("Metric,Value");
        lines.push(`Average Position Diff,${this.data.averagePositionDiff.toFixed(3)}`);
        lines.push(`Max Position Diff,${this.data.maxPositionDiff.toFixed(3)}`);
        lines.push(`Reconciliation Count,${this.data.reconciliationCount}`);
        lines.push(`Reconciliation Rate,${this.data.reconciliationRate.toFixed(2)}`);
        lines.push(`Hard Corrections,${this.data.hardCorrections}`);
        lines.push(`Soft Corrections,${this.data.softCorrections}`);
        lines.push(`Large Diffs (>10),${this.data.largeDiffs}`);
        lines.push(`Critical Diffs (>20),${this.data.criticalDiffs}`);
        lines.push(`Average Rotation Diff,${this.data.averageRotationDiff.toFixed(3)}`);
        lines.push(`Average Turret Diff,${this.data.averageTurretDiff.toFixed(3)}`);
        lines.push(`Samples Count,${this.data.samplesCount}`);
        
        // История разниц позиций
        lines.push("");
        lines.push("Position Diff History");
        this.data.positionDiffHistory.forEach((diff, index) => {
            lines.push(`${index},${diff.toFixed(3)}`);
        });
        
        return lines.join("\n");
    }
    
    /**
     * Получить качество синхронизации (0-100, где 100 = отлично)
     */
    getSyncQuality(): number {
        let quality = 100;
        
        // Штраф за среднюю разницу позиций
        if (this.data.averagePositionDiff > 1.0) {
            quality -= Math.min(30, this.data.averagePositionDiff * 10);
        }
        
        // Штраф за частоту reconciliation
        if (this.data.reconciliationRate > 5) {
            quality -= Math.min(30, (this.data.reconciliationRate - 5) * 5);
        }
        
        // Штраф за большие расхождения
        quality -= Math.min(20, this.data.largeDiffs * 0.1);
        quality -= Math.min(20, this.data.criticalDiffs * 0.2);
        
        return Math.max(0, Math.min(100, quality));
    }
    
    /**
     * Получить статус качества синхронизации (хорошо/плохо)
     */
    getSyncQualityStatus(): "excellent" | "good" | "fair" | "poor" {
        const quality = this.getSyncQuality();
        if (quality >= 80) return "excellent";
        if (quality >= 60) return "good";
        if (quality >= 40) return "fair";
        return "poor";
    }
}


