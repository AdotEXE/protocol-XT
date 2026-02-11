
import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';

export interface LogEntry {
    id: number;
    timestamp: string;
    service: string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

export interface MetricData {
    cpu: number;
    memory: { used: number; total: number; percent: number };
    fps: { server: number; client: number };
    processes: any[];
}

export class DashboardBridge {
    private app = express();
    private server: HttpServer;
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();

    // Status
    private logs: LogEntry[] = [];
    private metricsHistory: any[] = []; // Store metrics history
    private serviceStatuses: any[] = [];
    public restartCallback: ((serviceName: string) => void) | null = null;

    private readonly MAX_LOGS = 2000;
    private readonly PORT = 9000;

    constructor() {
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });

        this.setupExpress();
        this.setupWebSocket();
    }

    private setupExpress() {
        // Serve static files from web-dashboard directory
        const publicDir = path.resolve(__dirname, '../../scripts/web-dashboard/public');

        // Fix CSP errors: Allow inline scripts/styles/eval and Chart.js CDN
        this.app.use((_req, res, next) => {
            res.setHeader(
                "Content-Security-Policy",
                "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https://cdn.jsdelivr.net;"
            );
            next();
        });

        this.app.use(express.static(publicDir));
        this.app.use(express.json());

        // API Endpoints
        this.app.post('/api/services/:name/restart', (req, res) => {
            const { name } = req.params;
            if (this.restartCallback) {
                this.restartCallback(name);
                res.json({ success: true, message: `Restarting ${name}...` });
            } else {
                res.status(503).json({ error: 'Restart capability not available' });
            }
        });

        // Basic read-only APIs for compatibility
        this.app.get('/api/logs', (req, res) => res.json(this.logs.slice(-100)));
        this.app.get('/api/metrics', (req, res) => res.json({ current: this.metricsHistory[this.metricsHistory.length - 1], history: this.metricsHistory.slice(-60) }));
        this.app.get('/api/services', (req, res) => res.json(this.serviceStatuses));
    }

    private setupWebSocket() {
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);

            // Send initial state
            ws.send(JSON.stringify({
                type: 'init',
                logs: this.logs.slice(-100),
                metrics: this.metricsHistory[this.metricsHistory.length - 1],
                services: this.serviceStatuses
            }));

            ws.on('close', () => {
                this.clients.delete(ws);
            });
        });
    }

    public start(): void {
        try {
            this.server.listen(this.PORT, () => {
                // Since this runs inside TUI, we don't want to console.log to stdout/stderr causing visible mess?
                // But TUI intercepts stdout/stderr? 
                // Wait, unified-dashboard spawns children, but runs inside the main process.
                // Main process stdout/stderr might be captured by blessed?
                // Blessed captures process.stdout/stderr?
                // Usually yes. So we shouldn't log to console.
                // We'll leave it silent or log via the system logger.
            });
        } catch (e) {
            // Ignore error if port in use (fall back to TUI only)
        }
    }

    public broadcastLog(entry: LogEntry): void {
        this.logs.push(entry);
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();
        this.broadcast({ type: 'log', data: entry });
    }

    public broadcastMetrics(metrics: MetricData): void {
        this.metricsHistory.push(metrics);
        if (this.metricsHistory.length > 300) this.metricsHistory.shift();
        this.broadcast({ type: 'metrics', data: metrics });
    }

    public updateServiceStatus(services: any[]): void {
        this.serviceStatuses = services;
        // Broadcast updates? Usually services update rarely.
        // We can check diff or just broadcast individually?
        // App.js handles single service update via 'service' type, or full 'services' via init.
        // Let's broadcast individual updates if we knew them, but here we get the full list.
        // We can hack it and send 'init' again? No, that refreshes everything.
        // Actually, TUI updates service status occasionally.
        // Let's iterate and broadcast 'service' message for each for now?
        // Or just broadcast 'init' periodically?
        // Let's rely on broadcast metrics containing processes info?
        // App.js: updateMetrics updates charts.
        // HandleMessage 'service' updates the grid.
        services.forEach(s => {
            this.broadcast({ type: 'service', data: s });
        });
    }

    private broadcast(data: any): void {
        const msg = JSON.stringify(data);
        this.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg);
            }
        });
    }
}
