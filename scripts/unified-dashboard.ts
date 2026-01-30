/**
 * Unified Dashboard - Runs and monitors all services in one TUI
 */

import { MonitorCore } from './monitor/core';
import { UIManager } from './monitor/ui';
import { DashboardBridge } from './monitor/dashboard-bridge';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { getLocalIP, getAllLocalIPs } from './get-local-ip';

// Force colors for child processes
process.env.FORCE_COLOR = '1';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EDITOR_ROOT = path.resolve(PROJECT_ROOT, 'PolyGenStudio-main');

// Configuration
const SERVICES = [
    {
        name: 'Server',
        command: path.join(PROJECT_ROOT, 'scripts', 'run-npm'),
        args: ['run', 'server:dev'],
        cwd: PROJECT_ROOT,
        logMethod: 'addServerLog',
        color: 'green'
    },
    {
        name: 'Client',
        command: path.join(PROJECT_ROOT, 'scripts', 'run-npm'),
        args: ['run', 'dev'],
        cwd: PROJECT_ROOT,
        logMethod: 'addClientLog',
        color: 'cyan'
    },
    {
        name: 'Editor',
        command: path.join(PROJECT_ROOT, 'scripts', 'run-npm'),
        args: ['run', 'dev'],
        cwd: EDITOR_ROOT,
        logMethod: 'addEditorLog',
        color: 'magenta'
    }
];

// Initialize Monitor
const core = new MonitorCore();
const ui = new UIManager(core);
const dashboard = new DashboardBridge(); // Initialize Bridge

// Track running processes
const runningProcesses: Map<string, ChildProcess> = new Map();

// Helper to spawn process
function startService(service: any) {
    if (runningProcesses.has(service.name)) {
        ui.addLog(`${service.name} is already running.`, 'warn');
        return;
    }

    const cmd = process.platform === 'win32' ? `${service.command}.cmd` : service.command;

    ui.addLog(`Starting ${service.name}...`, 'info');
    dashboard.broadcastLog({ id: Date.now(), timestamp: new Date().toISOString(), service: 'System', level: 'info', message: `Starting ${service.name}...` });

    const child = spawn(cmd, service.args, {
        cwd: service.cwd,
        env: { ...process.env, FORCE_COLOR: '1' },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    runningProcesses.set(service.name, child);
    updateServiceStatus(service.name, 'running', child.pid);

    // Handle stdout
    child.stdout.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
            str.split('\n').forEach((rawLine: string) => {
                const line = rawLine.trim();
                if (!line || line.trim() === '') return;

                if (!shouldFilter(line)) {
                    // TUI
                    // @ts-ignore
                    if (typeof ui[service.logMethod] === 'function') {
                        // @ts-ignore
                        ui[service.logMethod](line);
                    } else {
                        ui.addLog(`[${service.name}] ${line}`, 'info');
                    }

                    // Dashboard
                    dashboard.broadcastLog({
                        id: Date.now(),
                        timestamp: new Date().toISOString(),
                        service: service.name,
                        level: 'info',
                        message: line
                    });
                }
            });
        }
    });

    // Handle stderr
    child.stderr.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
            str.split('\n').forEach((rawLine: string) => {
                const line = rawLine.trim();
                if (!line || line.trim() === '') return;

                // TUI
                // @ts-ignore
                if (typeof ui[service.logMethod] === 'function') {
                    // @ts-ignore
                    ui[service.logMethod](line, 'error');
                } else {
                    ui.addLog(`[${service.name} ERR] ${line}`, 'error');
                }

                // Dashboard
                dashboard.broadcastLog({
                    id: Date.now(),
                    timestamp: new Date().toISOString(),
                    service: service.name,
                    level: 'error',
                    message: line
                });
            });
        }
    });

    child.on('close', (code) => {
        runningProcesses.delete(service.name);
        updateServiceStatus(service.name, 'stopped');

        ui.addLog(`${service.name} exited with code ${code}`, code === 0 ? 'info' : 'error');
        dashboard.broadcastLog({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            service: 'System',
            level: code === 0 ? 'info' : 'error',
            message: `${service.name} exited with code ${code}`
        });
    });

    child.on('error', (err) => {
        runningProcesses.delete(service.name);
        updateServiceStatus(service.name, 'stopped');

        ui.addLog(`Failed to start ${service.name}: ${err.message}`, 'error');
        dashboard.broadcastLog({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            service: 'System',
            level: 'error',
            message: `Failed to start ${service.name}: ${err.message}`
        });
    });
}

function updateServiceStatus(name: string, status: string, pid?: number) {
    // For Dashboard
    // We construct a full list
    const statusList = SERVICES.map(s => ({
        name: s.name,
        status: runningProcesses.has(s.name) ? 'running' : 'stopped',
        pid: runningProcesses.get(s.name)?.pid,
        restarts: 0, // Not tracking count here yet
        uptime: 0 // Not tracking uptime
    }));
    dashboard.updateServiceStatus(statusList);
}

// Restart logic
function restartService(name: string) {
    const service = SERVICES.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!service) return;

    ui.addLog(`Restarting ${service.name}...`, 'warn');
    dashboard.broadcastLog({ id: Date.now(), timestamp: new Date().toISOString(), service: 'System', level: 'warn', message: `Restarting ${service.name}...` });

    const existing = runningProcesses.get(service.name);
    if (existing) {
        existing.kill();
        // Wait minor delay for port release?
        setTimeout(() => {
            startService(service);
        }, 1000);
    } else {
        startService(service);
    }
}

// Hook Restart from Dashboard
dashboard.restartCallback = (name) => {
    restartService(name);
};


// Filter spammy logs
function shouldFilter(line: string): boolean {
    const filters = [
        'hmr update',
        '[vite]',
        'page reload',
        'file changed',
    ];
    // Keep filter minimal for now, or user preferences
    return false; // filters.some(f => line.toLowerCase().includes(f));
}

// Start everything
async function bootstrap() {
    try {
        await core.start();

        // Display network information
        const localIP = getLocalIP();
        const allIPs = getAllLocalIPs();

        ui.addLog('═══════════════════════════════════════════════════════', 'info');
        ui.addLog('[*] Локальный доступ:', 'info');
        ui.addLog('   > Server: ws://localhost:8000', 'info');
        ui.addLog('   > Client: http://localhost:5000', 'info');
        ui.addLog('   > Editor: http://localhost:3000', 'info');
        if (localIP) {
            ui.addLog('', 'info');
            ui.addLog('[*] Сетевой доступ (для других ПК в сети):', 'info');
            ui.addLog(`   > Server: ws://${localIP}:8000`, 'info');
            ui.addLog(`   > Client: http://${localIP}:5000`, 'info');
            ui.addLog(`   > Editor: http://${localIP}:3000`, 'info');
        }
        if (allIPs.length > 1) {
            ui.addLog('', 'info');
            ui.addLog('[*] Все доступные IP-адреса:', 'info');
            allIPs.forEach(ip => {
                ui.addLog(`   > ${ip}`, 'info');
            });
        }
        ui.addLog('═══════════════════════════════════════════════════════', 'info');

        // Start Web Dashboard Bridge
        dashboard.start();
        ui.addLog('Web Dashboard initialized on port 9000', 'info');
        dashboard.broadcastLog({ id: Date.now(), timestamp: new Date().toISOString(), service: 'System', level: 'info', message: 'Web Dashboard initialized' });

        SERVICES.forEach(startService);
        ui.addLog('Unified Dashboard Started', 'info');

        // Start metrics loop for dashboard
        setInterval(() => {
            const metrics = core.getMetricsManager().getCurrentMetrics();
            if (metrics) {
                // Map metrics to dashboard format (if simpler format needed)
                // Bridge expects exact format
                dashboard.broadcastMetrics(metrics as any);

                // Update services list periodically just in case
                // updateServiceStatus would do it
            }
        }, 1000);

    } catch (e: any) {
        console.error(e);
        process.exit(1);
    }
}

// Handle cleanup
function cleanup() {
    ui.addLog('Shutting down services...', 'warn');
    runningProcesses.forEach(p => p.kill());
    core.stop();
    // Allow UI to render one last time?
    setTimeout(() => {
        process.exit(0);
    }, 500);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
    runningProcesses.forEach(p => p.kill());
});

bootstrap();
