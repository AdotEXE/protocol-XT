/**
 * Metrics Charts - Графики метрик с использованием Chart.js
 */

import { ExtendedMetrics } from "./metricsCollector";

export interface ChartConfig {
    id: string;
    title: string;
    metric: string;
    color: string;
    unit?: string;
    min?: number;
    max?: number;
}

export class MetricsCharts {
    private charts: Map<string, any> = new Map(); // Chart.js instances
    private chartConfigs: ChartConfig[] = [];
    private maxDataPoints = 60; // 60 секунд при обновлении раз в секунду
    
    constructor() {
        this.initializeChartConfigs();
    }
    
    /**
     * Инициализация конфигураций графиков
     */
    private initializeChartConfigs(): void {
        this.chartConfigs = [
            { id: 'fps', title: 'FPS', metric: 'fps', color: '#0f0', min: 0, max: 120 },
            { id: 'memory', title: 'Memory (MB)', metric: 'memoryUsed', color: '#ff0', min: 0 },
            { id: 'drawCalls', title: 'Draw Calls', metric: 'drawCalls', color: '#0ff', min: 0 },
            { id: 'triangles', title: 'Triangles', metric: 'triangles', color: '#f0f', min: 0 },
            { id: 'frameTime', title: 'Frame Time (ms)', metric: 'frameTime', color: '#f00', min: 0, max: 50 }
        ];
    }
    
    /**
     * Создание контейнера для графиков
     */
    createChartsContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.id = 'metrics-charts-container';
        container.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            padding: 15px;
            background: rgba(0, 5, 0, 0.3);
            border-top: 1px solid rgba(0, 255, 4, 0.3);
            margin-top: 15px;
        `;
        
        this.chartConfigs.forEach(config => {
            const chartContainer = this.createChartContainer(config);
            container.appendChild(chartContainer);
        });
        
        return container;
    }
    
    /**
     * Создание контейнера для одного графика
     */
    private createChartContainer(config: ChartConfig): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            background: rgba(0, 10, 0, 0.5);
            border: 1px solid rgba(0, 255, 4, 0.3);
            border-radius: 4px;
            padding: 10px;
        `;
        
        const title = document.createElement('div');
        title.textContent = config.title;
        title.style.cssText = `
            color: ${config.color};
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 8px;
            text-align: center;
        `;
        wrapper.appendChild(title);
        
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${config.id}`;
        canvas.style.cssText = `
            width: 100%;
            height: 150px;
        `;
        wrapper.appendChild(canvas);
        
        // Инициализация графика (Chart.js будет загружен динамически)
        this.initializeChart(canvas, config);
        
        return wrapper;
    }
    
    /**
     * Инициализация графика Chart.js
     */
    private async initializeChart(canvas: HTMLCanvasElement, config: ChartConfig): Promise<void> {
        try {
            // Динамическая загрузка Chart.js (если установлен)
            // Если Chart.js не установлен, используем простой canvas график
            let Chart: any = null;
            try {
                const chartModule = await import('chart.js/auto');
                Chart = chartModule.Chart || (chartModule as any).default?.Chart || (chartModule as any).default;
                if (!Chart) {
                    throw new Error('Chart not found in module');
                }
            } catch (e) {
                // Chart.js не установлен, используем простой график
                this.createSimpleChart(canvas, config);
                return;
            }
            
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: config.title,
                        data: [],
                        borderColor: config.color,
                        backgroundColor: config.color + '40',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: true,
                            mode: 'index',
                            intersect: false
                        }
                    },
                    scales: {
                        x: {
                            display: false,
                            grid: {
                                color: 'rgba(0, 255, 4, 0.1)'
                            }
                        },
                        y: {
                            display: true,
                            grid: {
                                color: 'rgba(0, 255, 4, 0.1)'
                            },
                            ticks: {
                                color: config.color,
                                font: {
                                    size: 10
                                }
                            },
                            min: config.min,
                            max: config.max
                        }
                    }
                }
            });
            
            this.charts.set(config.id, chart);
        } catch (error) {
            console.warn(`[MetricsCharts] Failed to initialize chart for ${config.id}:`, error);
        }
    }
    
    /**
     * Обновление графиков новыми данными
     */
    updateCharts(metrics: ExtendedMetrics): void {
        this.chartConfigs.forEach(config => {
            const value = this.getMetricValue(metrics, config.metric);
            if (value === undefined) return;
            
            const chart = this.charts.get(config.id);
            if (chart) {
                // Chart.js график
                const dataset = chart.data.datasets[0];
                dataset.data.push(value);
                
                const now = new Date();
                const timeLabel = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;
                chart.data.labels.push(timeLabel);
                
                if (dataset.data.length > this.maxDataPoints) {
                    dataset.data.shift();
                    chart.data.labels.shift();
                }
                
                chart.update('none');
            } else {
                // Простой canvas график
                const canvas = document.getElementById(`chart-${config.id}`) as HTMLCanvasElement;
                if (canvas) {
                    this.updateSimpleChart(canvas, value);
                }
            }
        });
    }
    
    /**
     * Получение значения метрики
     */
    private getMetricValue(metrics: ExtendedMetrics, metric: string): number | undefined {
        switch (metric) {
            case 'fps':
                return metrics.fps;
            case 'memoryUsed':
                return metrics.memoryUsed;
            case 'drawCalls':
                return metrics.drawCalls;
            case 'triangles':
                return metrics.triangles;
            case 'frameTime':
                return metrics.frameTime;
            default: {
                const value = (metrics as any)[metric];
                return typeof value === "number" ? value : undefined;
            }
        }
    }
    
    /**
     * Очистка всех графиков
     */
    clearCharts(): void {
        this.charts.forEach(chart => {
            chart.destroy();
        });
        this.charts.clear();
    }
    
    /**
     * Показ/скрытие графиков
     */
    setVisible(visible: boolean): void {
        const container = document.getElementById('metrics-charts-container');
        if (container) {
            container.style.display = visible ? 'grid' : 'none';
        }
    }
    
    /**
     * Создание простого графика без Chart.js
     */
    private createSimpleChart(canvas: HTMLCanvasElement, config: ChartConfig): void {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const data: number[] = [];
        const maxPoints = this.maxDataPoints;
        
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (data.length < 2) return;
            
            const width = canvas.width;
            const height = canvas.height;
            const padding = 20;
            const graphWidth = width - padding * 2;
            const graphHeight = height - padding * 2;
            
            // Фон
            ctx.fillStyle = 'rgba(0, 10, 0, 0.5)';
            ctx.fillRect(padding, padding, graphWidth, graphHeight);
            
            // Сетка
            ctx.strokeStyle = 'rgba(0, 255, 4, 0.1)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding + (graphHeight / 5) * i;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(padding + graphWidth, y);
                ctx.stroke();
            }
            
            // График
            ctx.strokeStyle = config.color;
            ctx.fillStyle = config.color + '40';
            ctx.lineWidth = 2;
            
            const min = config.min || Math.min(...data);
            const max = config.max || Math.max(...data);
            const range = max - min || 1;
            
            ctx.beginPath();
            data.forEach((value, index) => {
                const x = padding + (graphWidth / (data.length - 1)) * index;
                const y = padding + graphHeight - ((value - min) / range) * graphHeight;
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            
            // Заливка
            ctx.lineTo(padding + graphWidth, padding + graphHeight);
            ctx.lineTo(padding, padding + graphHeight);
            ctx.closePath();
            ctx.fill();
            
            // Текущее значение
            if (data.length > 0) {
                const lastValue = data[data.length - 1] ?? 0;
                ctx.fillStyle = config.color;
                ctx.font = '10px Consolas';
                ctx.textAlign = 'right';
                ctx.fillText(`${lastValue.toFixed(1)}${config.unit || ''}`, width - 5, 15);
            }
        };
        
        // Сохраняем функцию обновления
        (canvas as any)._updateChart = (value: number) => {
            data.push(value);
            if (data.length > maxPoints) {
                data.shift();
            }
            draw();
        };
    }
    
    /**
     * Обновление простого графика
     */
    private updateSimpleChart(canvas: HTMLCanvasElement, value: number): void {
        const updateFn = (canvas as any)._updateChart;
        if (updateFn) {
            updateFn(value);
        }
    }
}

