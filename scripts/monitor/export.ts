/**
 * Export Manager - Экспорт данных в различные форматы
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MetricsSnapshot } from './metrics';
import type { Alert } from './alerts';
import type { HistoryManager } from './history';

export type ExportFormat = 'json' | 'csv' | 'html' | 'txt';

export interface ExportOptions {
    format: ExportFormat;
    outputPath: string;
    includeHistory?: boolean;
    includeAlerts?: boolean;
    timeRange?: {
        start: number;
        end: number;
    };
}

export class ExportManager {
    private exportPath: string;
    
    constructor(exportPath: string) {
        this.exportPath = exportPath;
        
        // Ensure export directory exists
        if (!fs.existsSync(this.exportPath)) {
            fs.mkdirSync(this.exportPath, { recursive: true });
        }
    }
    
    async exportMetrics(
        metrics: MetricsSnapshot,
        historyManager: HistoryManager,
        alerts: Alert[],
        options: ExportOptions
    ): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `monitor-export-${timestamp}.${options.format}`;
        const filepath = path.join(this.exportPath, filename);
        
        let content: string;
        
        switch (options.format) {
            case 'json':
                content = this.exportJSON(metrics, historyManager, alerts, options);
                break;
            case 'csv':
                content = this.exportCSV(metrics, historyManager, options);
                break;
            case 'html':
                content = this.exportHTML(metrics, historyManager, alerts, options);
                break;
            case 'txt':
                content = this.exportTXT(metrics, historyManager, alerts, options);
                break;
            default:
                throw new Error(`Unsupported export format: ${options.format}`);
        }
        
        fs.writeFileSync(filepath, content, 'utf-8');
        return filepath;
    }
    
    private exportJSON(
        metrics: MetricsSnapshot,
        historyManager: HistoryManager,
        alerts: Alert[],
        options: ExportOptions
    ): string {
        const data: any = {
            timestamp: new Date().toISOString(),
            currentMetrics: metrics
        };
        
        if (options.includeHistory) {
            if (options.timeRange) {
                data.history = historyManager.getHistoryRange(
                    options.timeRange.start,
                    options.timeRange.end
                );
            } else {
                data.history = historyManager.getHistory();
            }
        }
        
        if (options.includeAlerts) {
            data.alerts = alerts;
        }
        
        return JSON.stringify(data, null, 2);
    }
    
    private exportCSV(
        metrics: MetricsSnapshot,
        historyManager: HistoryManager,
        options: ExportOptions
    ): string {
        const lines: string[] = [];
        
        // Header
        lines.push('timestamp,cpu,ram,serverFps,clientFps,players,rooms,activeRooms');
        
        // Current metrics
        lines.push([
            new Date(metrics.timestamp).toISOString(),
            metrics.performance.cpu.usage.toFixed(2),
            metrics.performance.ram.percent.toFixed(2),
            metrics.performance.serverFps.toFixed(2),
            metrics.performance.clientFps?.toFixed(2) || '',
            metrics.connections.players,
            metrics.connections.rooms,
            metrics.connections.activeRooms
        ].join(','));
        
        // History
        if (options.includeHistory) {
            const history = options.timeRange
                ? historyManager.getHistoryRange(options.timeRange.start, options.timeRange.end)
                : historyManager.getHistory();
            
            for (const snapshot of history) {
                lines.push([
                    new Date(snapshot.timestamp).toISOString(),
                    snapshot.performance.cpu.usage.toFixed(2),
                    snapshot.performance.ram.percent.toFixed(2),
                    snapshot.performance.serverFps.toFixed(2),
                    snapshot.performance.clientFps?.toFixed(2) || '',
                    snapshot.connections.players,
                    snapshot.connections.rooms,
                    snapshot.connections.activeRooms
                ].join(','));
            }
        }
        
        return lines.join('\n');
    }
    
    private exportHTML(
        metrics: MetricsSnapshot,
        historyManager: HistoryManager,
        alerts: Alert[],
        options: ExportOptions
    ): string {
        const history = options.includeHistory
            ? (options.timeRange
                ? historyManager.getHistoryRange(options.timeRange.start, options.timeRange.end)
                : historyManager.getHistory())
            : [];
        
        return `<!DOCTYPE html>
<html>
<head>
    <title>Protocol TX Monitor Export</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Courier New', monospace; 
            background: #0a0a0a; 
            color: #00ff00; 
            padding: 20px; 
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { 
            color: #00ff00; 
            text-shadow: 0 0 10px #00ff00;
            margin-bottom: 10px;
            border-bottom: 2px solid #00ff00;
            padding-bottom: 10px;
        }
        h2 { 
            color: #00ff00; 
            margin-top: 30px;
            margin-bottom: 15px;
            border-left: 4px solid #00ff00;
            padding-left: 10px;
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .metric-card {
            background: #111;
            border: 1px solid #00ff00;
            padding: 15px;
            border-radius: 4px;
        }
        .metric-card h3 {
            color: #00ff00;
            margin-bottom: 10px;
            font-size: 14px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #00ff00;
        }
        .metric-label {
            font-size: 12px;
            color: #888;
            margin-top: 5px;
        }
        .chart-container { 
            width: 100%; 
            height: 400px; 
            margin: 20px 0;
            background: #111;
            padding: 20px;
            border: 1px solid #00ff00;
        }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 20px 0;
            background: #111;
        }
        th, td { 
            border: 1px solid #00ff00; 
            padding: 12px; 
            text-align: left; 
        }
        th { 
            background: #00ff00; 
            color: #000; 
            font-weight: bold;
        }
        td { color: #00ff00; }
        .alert-error { color: #ff0000; }
        .alert-warning { color: #ffff00; }
        .alert-info { color: #00ffff; }
        .timestamp {
            color: #888;
            font-size: 12px;
            margin-bottom: 20px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin: 20px 0;
        }
        .stat-item {
            background: #111;
            border: 1px solid #00ff00;
            padding: 10px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>╔═══════════════════════════════════════════════════════════╗</h1>
        <h1>║  PROTOCOL TX SYSTEM MONITOR - EXPORT REPORT                ║</h1>
        <h1>╚═══════════════════════════════════════════════════════════╝</h1>
        <div class="timestamp">Generated: ${new Date().toISOString()}</div>
        
        <h2>📊 Current System Metrics</h2>
        <div class="metric-grid">
            <div class="metric-card">
                <h3>CPU Usage</h3>
                <div class="metric-value">${metrics.performance.cpu.usage.toFixed(2)}%</div>
                <div class="metric-label">${metrics.performance.cpu.cores} cores</div>
            </div>
            <div class="metric-card">
                <h3>RAM Usage</h3>
                <div class="metric-value">${metrics.performance.ram.percent.toFixed(2)}%</div>
                <div class="metric-label">${(metrics.performance.ram.used / (1024 * 1024 * 1024)).toFixed(2)} GB / ${(metrics.performance.ram.total / (1024 * 1024 * 1024)).toFixed(2)} GB</div>
            </div>
            <div class="metric-card">
                <h3>Server FPS</h3>
                <div class="metric-value">${metrics.performance.serverFps.toFixed(2)}</div>
                <div class="metric-label">Tick Rate</div>
            </div>
            <div class="metric-card">
                <h3>Client FPS</h3>
                <div class="metric-value">${metrics.performance.clientFps?.toFixed(2) || 'N/A'}</div>
                <div class="metric-label">Frame Rate</div>
            </div>
            <div class="metric-card">
                <h3>Latency</h3>
                <div class="metric-value">${metrics.performance.latency ? metrics.performance.latency.toFixed(0) + 'ms' : 'N/A'}</div>
                <div class="metric-label">Network Delay</div>
            </div>
        </div>
        
        <h2>🔌 Connection Statistics</h2>
        <div class="stats-grid">
            <div class="stat-item">Players: ${metrics.connections.players}</div>
            <div class="stat-item">Authenticated: ${metrics.connections.authenticated}</div>
            <div class="stat-item">Guests: ${metrics.connections.guests}</div>
            <div class="stat-item">Rooms: ${metrics.connections.rooms}</div>
            <div class="stat-item">Active Rooms: ${metrics.connections.activeRooms}</div>
            <div class="stat-item">In Queue: ${metrics.connections.inQueue}</div>
            <div class="stat-item">WebSocket Conns: ${metrics.connections.websocketConns}</div>
            <div class="stat-item">Avg Ping: ${metrics.connections.avgPing > 0 ? metrics.connections.avgPing.toFixed(0) + 'ms' : 'N/A'}</div>
        </div>
    
        ${options.includeAlerts && alerts.length > 0 ? `
        <h2>⚠️ Alerts (${alerts.length})</h2>
        <table>
            <tr><th>Time</th><th>Severity</th><th>Message</th></tr>
            ${alerts.map(alert => `
            <tr class="alert-${alert.severity}">
                <td>${new Date(alert.timestamp).toLocaleString()}</td>
                <td><strong>${alert.severity.toUpperCase()}</strong></td>
                <td>${alert.message}</td>
            </tr>
            `).join('')}
        </table>
        ` : ''}
        
        ${history.length > 0 ? `
        <h2>📈 Performance History</h2>
        <div class="chart-container">
            <canvas id="metricsChart"></canvas>
        </div>
        <script>
            const ctx = document.getElementById('metricsChart').getContext('2d');
            const history = ${JSON.stringify(history)};
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: history.map(h => new Date(h.timestamp).toLocaleTimeString()),
                    datasets: [{
                        label: 'CPU %',
                        data: history.map(h => h.performance.cpu.usage),
                        borderColor: '#00ff00',
                        backgroundColor: 'rgba(0, 255, 0, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'RAM %',
                        data: history.map(h => h.performance.ram.percent),
                        borderColor: '#ffff00',
                        backgroundColor: 'rgba(255, 255, 0, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Server FPS',
                        data: history.map(h => h.performance.serverFps),
                        borderColor: '#00ffff',
                        backgroundColor: 'rgba(0, 255, 255, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Client FPS',
                        data: history.map(h => h.performance.clientFps || null),
                        borderColor: '#ff00ff',
                        backgroundColor: 'rgba(255, 0, 255, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#00ff00' }
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            ticks: { color: '#00ff00' },
                            grid: { color: 'rgba(0, 255, 0, 0.1)' }
                        },
                        x: {
                            ticks: { color: '#00ff00' },
                            grid: { color: 'rgba(0, 255, 0, 0.1)' }
                        }
                    }
                }
            });
        </script>
        ` : ''}
    </div>
</body>
</html>`;
    }
    
    private exportTXT(
        metrics: MetricsSnapshot,
        historyManager: HistoryManager,
        alerts: Alert[],
        options: ExportOptions
    ): string {
        const lines: string[] = [];
        
        lines.push('Protocol TX Monitor Export');
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push('');
        lines.push('=== Current Metrics ===');
        lines.push(`CPU: ${metrics.performance.cpu.usage.toFixed(2)}%`);
        lines.push(`RAM: ${metrics.performance.ram.percent.toFixed(2)}%`);
        lines.push(`Server FPS: ${metrics.performance.serverFps.toFixed(2)}`);
        lines.push(`Players: ${metrics.connections.players}`);
        lines.push(`Rooms: ${metrics.connections.rooms}`);
        lines.push('');
        
        if (options.includeAlerts && alerts.length > 0) {
            lines.push('=== Alerts ===');
            for (const alert of alerts) {
                lines.push(`[${new Date(alert.timestamp).toISOString()}] [${alert.severity.toUpperCase()}] ${alert.message}`);
            }
            lines.push('');
        }
        
        if (options.includeHistory) {
            const history = options.timeRange
                ? historyManager.getHistoryRange(options.timeRange.start, options.timeRange.end)
                : historyManager.getHistory();
            
            lines.push('=== History ===');
            for (const snapshot of history) {
                lines.push(`[${new Date(snapshot.timestamp).toISOString()}] CPU: ${snapshot.performance.cpu.usage.toFixed(2)}% | RAM: ${snapshot.performance.ram.percent.toFixed(2)}% | FPS: ${snapshot.performance.serverFps.toFixed(2)}`);
            }
        }
        
        return lines.join('\n');
    }
}

