/**
 * Web Dashboard Server
 * Provides a browser-based monitoring interface with real-time updates
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const PORT = 9000;
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const EDITOR_ROOT = path.resolve(PROJECT_ROOT, 'PolyGenStudio-main');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Types
interface LogEntry {
    id: number;
    timestamp: string;
    service: string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

interface ServiceConfig {
    name: string;
    command: string;
    args: string[];
    cwd: string;
    color: string;
    port: number;
}

interface ServiceStatus {
    name: string;
    status: 'running' | 'stopped' | 'restarting';
    pid?: number;
    restarts: number;
    lastRestart?: string;
    uptime: number;
}

interface Metrics {
    cpu: number;
    memory: { used: number; total: number; percent: number };
    fps: { server: number; client: number };
    processes: ServiceStatus[];
}

// Configuration
const SERVICES: ServiceConfig[] = [
    { name: 'Server', command: 'npm', args: ['run', 'server:dev'], cwd: PROJECT_ROOT, color: '#22c55e', port: 8080 },
    { name: 'Client', command: 'npm', args: ['run', 'dev'], cwd: PROJECT_ROOT, color: '#06b6d4', port: 5000 },
    { name: 'Editor', command: 'npm', args: ['run', 'dev'], cwd: EDITOR_ROOT, color: '#a855f7', port: 3000 }
];

// State
const logs: LogEntry[] = [];
const MAX_LOGS = 2000;
let logIdCounter = 0;
const processes: Map<string, { process: ChildProcess; status: ServiceStatus }> = new Map();
const clients: Set<WebSocket> = new Set();
let metricsHistory: Metrics[] = [];
const MAX_METRICS_HISTORY = 300; // 5 minutes at 1/sec

// Express app
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// API Routes
app.get('/api/logs', (req, res) => {
    const { service, level, search, limit = 100 } = req.query;
    let filtered = [...logs];

    if (service && service !== 'all') {
        filtered = filtered.filter(l => l.service.toLowerCase() === (service as string).toLowerCase());
    }
    if (level && level !== 'all') {
        filtered = filtered.filter(l => l.level === level);
    }
    if (search) {
        const query = (search as string).toLowerCase();
        filtered = filtered.filter(l => l.message.toLowerCase().includes(query));
    }

    res.json(filtered.slice(-Number(limit)));
});

app.get('/api/metrics', (_req, res) => {
    res.json({
        current: getMetrics(),
        history: metricsHistory.slice(-60)
    });
});

app.get('/api/services', (_req, res) => {
    const statuses: ServiceStatus[] = [];
    processes.forEach((p, name) => {
        statuses.push(p.status);
    });
    res.json(statuses);
});

app.post('/api/services/:name/restart', (req, res) => {
    const { name } = req.params;
    const service = SERVICES.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (service) {
        restartService(service);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Service not found' });
    }
});

app.get('/api/export', (req, res) => {
    const { format = 'json', service, level } = req.query;
    let filtered = [...logs];

    if (service && service !== 'all') {
        filtered = filtered.filter(l => l.service.toLowerCase() === (service as string).toLowerCase());
    }
    if (level && level !== 'all') {
        filtered = filtered.filter(l => l.level === level);
    }

    if (format === 'csv') {
        const csv = ['id,timestamp,service,level,message'];
        filtered.forEach(l => {
            csv.push(`${l.id},"${l.timestamp}","${l.service}","${l.level}","${l.message.replace(/"/g, '""')}"`);
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
        res.send(csv.join('\n'));
    } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=logs.json');
        res.json(filtered);
    }
});

// WebSocket handling
wss.on('connection', (ws) => {
    clients.add(ws);
    addLog('System', 'info', 'Dashboard client connected');

    // Send initial state
    ws.send(JSON.stringify({
        type: 'init',
        logs: logs.slice(-100),
        metrics: getMetrics(),
        services: Array.from(processes.values()).map(p => p.status)
    }));

    ws.on('close', () => {
        clients.delete(ws);
    });
});

function broadcast(data: any) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Logging
function addLog(service: string, level: 'info' | 'warn' | 'error', message: string) {
    const entry: LogEntry = {
        id: ++logIdCounter,
        timestamp: new Date().toISOString(),
        service,
        level,
        message: message.trim()
    };

    logs.push(entry);
    if (logs.length > MAX_LOGS) {
        logs.shift();
    }

    broadcast({ type: 'log', data: entry });

    // Also save to file
    const logFile = path.join(LOGS_DIR, `${service.toLowerCase()}.log`);
    fs.appendFileSync(logFile, `[${entry.timestamp}] [${level.toUpperCase()}] ${message}\n`);
}

// Metrics collection
function getMetrics(): Metrics {
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const serviceStatuses: ServiceStatus[] = [];
    processes.forEach(p => serviceStatuses.push(p.status));

    return {
        cpu: Math.round(cpuUsage * 10) / 10,
        memory: {
            used: usedMem,
            total: totalMem,
            percent: Math.round((usedMem / totalMem) * 1000) / 10
        },
        fps: { server: 60, client: 60 }, // Will be updated from game metrics
        processes: serviceStatuses
    };
}

// Process management
function startService(config: ServiceConfig) {
    addLog('System', 'info', `Starting ${config.name}...`);

    const child = spawn(config.command, config.args, {
        cwd: config.cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const status: ServiceStatus = {
        name: config.name,
        status: 'running',
        pid: child.pid,
        restarts: 0,
        uptime: Date.now()
    };

    processes.set(config.name, { process: child, status });

    child.stdout?.on('data', (data) => {
        data.toString().trim().split('\n').forEach((line: string) => {
            if (line.trim()) {
                addLog(config.name, 'info', line);
            }
        });
    });

    child.stderr?.on('data', (data) => {
        data.toString().trim().split('\n').forEach((line: string) => {
            if (line.trim()) {
                const level = line.toLowerCase().includes('error') ? 'error' : 'warn';
                addLog(config.name, level, line);
            }
        });
    });

    child.on('close', (code) => {
        const proc = processes.get(config.name);
        if (proc) {
            proc.status.status = 'stopped';
            addLog('System', code === 0 ? 'info' : 'error', `${config.name} exited with code ${code}`);

            // Auto-restart if crashed unexpectedly
            if (code !== 0 && proc.status.restarts < 5) {
                setTimeout(() => {
                    restartService(config);
                }, Math.min(1000 * Math.pow(2, proc.status.restarts), 30000)); // Exponential backoff
            }
        }

        broadcast({ type: 'service', data: proc?.status });
    });

    child.on('error', (err) => {
        addLog('System', 'error', `Failed to start ${config.name}: ${err.message}`);
    });

    broadcast({ type: 'service', data: status });
}

function restartService(config: ServiceConfig) {
    const proc = processes.get(config.name);
    if (proc) {
        proc.status.status = 'restarting';
        proc.status.restarts++;
        proc.status.lastRestart = new Date().toISOString();
        broadcast({ type: 'service', data: proc.status });

        try {
            proc.process.kill();
        } catch { }
    }

    addLog('System', 'warn', `Restarting ${config.name}...`);
    setTimeout(() => startService(config), 1000);
}

function stopService(config: ServiceConfig) {
    const proc = processes.get(config.name);
    if (proc) {
        proc.status.status = 'stopped';
        try {
            proc.process.kill();
        } catch { }
        broadcast({ type: 'service', data: proc.status });
    }
}

// Metrics loop
setInterval(() => {
    const metrics = getMetrics();
    metricsHistory.push(metrics);
    if (metricsHistory.length > MAX_METRICS_HISTORY) {
        metricsHistory.shift();
    }
    broadcast({ type: 'metrics', data: metrics });
}, 1000);

// Cleanup
function cleanup() {
    addLog('System', 'warn', 'Shutting down all services...');
    processes.forEach((proc) => {
        try { proc.process.kill(); } catch { }
    });
    setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Kill processes on required ports before starting
async function killPortProcesses(): Promise<void> {
    const ports = [PORT, 8080, 5000, 3000];
    console.log('\n🔧 Checking and clearing ports...\n');

    for (const port of ports) {
        try {
            // Windows: find and kill process on port
            const findCmd = spawn('cmd', ['/c', `netstat -ano | findstr :${port} | findstr LISTENING`], { shell: true });

            let output = '';
            findCmd.stdout?.on('data', (data) => {
                output += data.toString();
            });

            await new Promise<void>((resolve) => {
                findCmd.on('close', async () => {
                    if (output.trim()) {
                        // Extract PID from netstat output
                        const lines = output.trim().split('\n');
                        const pids = new Set<string>();

                        for (const line of lines) {
                            const parts = line.trim().split(/\s+/);
                            const pid = parts[parts.length - 1];
                            if (pid && /^\d+$/.test(pid) && pid !== '0') {
                                pids.add(pid);
                            }
                        }

                        for (const pid of pids) {
                            console.log(`   Killing process on port ${port} (PID: ${pid})`);
                            spawn('taskkill', ['/PID', pid, '/F'], { shell: true });
                            await new Promise(r => setTimeout(r, 200));
                        }
                    } else {
                        console.log(`   Port ${port} is free ✓`);
                    }
                    resolve();
                });
            });
        } catch (err) {
            console.log(`   Could not check port ${port}`);
        }
    }

    console.log('\n✅ All ports cleared!\n');
    // Small delay to ensure ports are released
    await new Promise(r => setTimeout(r, 500));
}

// Start
async function bootstrap() {
    // STEP 1: Kill any processes on required ports
    await killPortProcesses();

    // STEP 2: Start the dashboard server
    server.listen(PORT, () => {
        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║     🚀 PROTOCOL TX - WEB MONITORING DASHBOARD              ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║  Dashboard:  http://localhost:${PORT}                        ║`);
        console.log('║                                                            ║');
        console.log('║  Starting services in order:                               ║');
        console.log('║    1. Dashboard (port 9000) ✓                              ║');
        console.log('║    2. Game Server (port 8080)                              ║');
        console.log('║    3. Game Client (port 5000)                              ║');
        console.log('║    4. Map Editor (port 3000)                               ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('\n');

        addLog('System', 'info', `✅ Web Dashboard ready at http://localhost:${PORT}`);

        // STEP 3: Start services sequentially with delays
        let delay = 500;
        SERVICES.forEach((service, index) => {
            setTimeout(() => {
                addLog('System', 'info', `Starting service ${index + 1}/${SERVICES.length}: ${service.name}...`);
                startService(service);
            }, delay);
            delay += 2000; // 2 second gap between each service
        });
    });
}

bootstrap();
