/**
 * Metrics Exporter - Экспорт метрик в CSV и JSON
 */

import { ExtendedMetrics } from "./metricsCollector";
import { logger } from "./utils/logger";
import { inGameAlert } from "./utils/inGameDialogs";

export interface MetricsData {
    timestamp: number;
    fps: number;
    frameTime: number;
    drawCalls: number;
    meshes: number;
    vertices: number;
    triangles: number;
    memoryUsed: number;
    [key: string]: any;
}

export class MetricsExporter {
    private metricsHistory: MetricsData[] = [];
    private maxHistorySize = 1000; // Максимум записей в истории
    
    /**
     * Добавить метрики в историю
     */
    addMetrics(metrics: ExtendedMetrics, additionalData?: { fps?: number; frameTime?: number; drawCalls?: number; meshes?: number; vertices?: number; triangles?: number; memoryUsed?: number }): void {
        const data: MetricsData = {
            timestamp: Date.now(),
            fps: additionalData?.fps || 0,
            frameTime: additionalData?.frameTime || 0,
            drawCalls: additionalData?.drawCalls || 0,
            meshes: additionalData?.meshes || 0,
            vertices: additionalData?.vertices || 0,
            triangles: additionalData?.triangles || 0,
            memoryUsed: additionalData?.memoryUsed || 0,
            ...metrics
        };
        
        this.metricsHistory.push(data);
        
        // Ограничиваем размер истории
        if (this.metricsHistory.length > this.maxHistorySize) {
            this.metricsHistory.shift();
        }
    }
    
    /**
     * Экспорт в CSV
     */
    exportToCSV(metrics?: MetricsData[]): string {
        const data = metrics || this.metricsHistory;
        if (data.length === 0 || !data[0]) {
            return '';
        }
        
        // Получаем все ключи из первой записи
        const headers = Object.keys(data[0]);
        const csvHeaders = headers.join(',');
        
        // Формируем строки данных
        const rows = data.map(metric => {
            return headers.map(key => {
                const value = metric[key];
                // Экранируем значения, содержащие запятые или кавычки
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value ?? '';
            }).join(',');
        });
        
        return [csvHeaders, ...rows].join('\n');
    }
    
    /**
     * Экспорт в JSON
     */
    exportToJSON(metrics?: MetricsData[]): string {
        const data = metrics || this.metricsHistory;
        return JSON.stringify(data, null, 2);
    }
    
    /**
     * Скачать файл
     */
    download(data: string, filename: string, mimeType: string): void {
        try {
            const blob = new Blob([data], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            logger.log(`[MetricsExporter] Exported ${filename}`);
        } catch (error) {
            logger.error("[MetricsExporter] Download failed:", error);
            throw error;
        }
    }
    
    /**
     * Экспорт в CSV файл
     */
    exportCSVFile(customFilename?: string): void {
        const csv = this.exportToCSV();
        if (!csv) {
            inGameAlert('Нет данных для экспорта', 'Экспорт').catch(() => {});
            return;
        }
        
        const filename = customFilename || `metrics_${Date.now()}.csv`;
        this.download(csv, filename, 'text/csv');
    }
    
    /**
     * Экспорт в JSON файл
     */
    exportJSONFile(customFilename?: string): void {
        const json = this.exportToJSON();
        if (!json) {
            inGameAlert('Нет данных для экспорта', 'Экспорт').catch(() => {});
            return;
        }
        
        const filename = customFilename || `metrics_${Date.now()}.json`;
        this.download(json, filename, 'application/json');
    }
    
    /**
     * Очистить историю
     */
    clearHistory(): void {
        this.metricsHistory = [];
    }
    
    /**
     * Получить историю
     */
    getHistory(): MetricsData[] {
        return [...this.metricsHistory];
    }
    
    /**
     * Получить статистику
     */
    getStatistics(): { min: number; max: number; avg: number; count: number } {
        if (this.metricsHistory.length === 0) {
            return { min: 0, max: 0, avg: 0, count: 0 };
        }
        
        const fpsValues = this.metricsHistory.map(m => m.fps).filter(f => f > 0);
        if (fpsValues.length === 0) {
            return { min: 0, max: 0, avg: 0, count: 0 };
        }
        
        const min = Math.min(...fpsValues);
        const max = Math.max(...fpsValues);
        const avg = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
        
        return { min, max, avg, count: fpsValues.length };
    }
}

