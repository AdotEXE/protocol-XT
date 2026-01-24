/**
 * Unified Dashboard - Runs and monitors all services in one TUI
 */

import { MonitorCore } from './monitor/core';
import { UIManager } from './monitor/ui';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

// Force colors for child processes
process.env.FORCE_COLOR = '1';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EDITOR_ROOT = path.resolve(PROJECT_ROOT, 'PolyGenStudio-main');

// Configuration
const SERVICES = [
    {
        name: 'Server',
        command: 'npm',
        args: ['run', 'server:dev'],
        cwd: PROJECT_ROOT,
        logMethod: 'addServerLog',
        color: 'green'
    },
    {
        name: 'Client',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: PROJECT_ROOT,
        logMethod: 'addClientLog',
        color: 'cyan'
    },
    {
        name: 'Editor',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: EDITOR_ROOT,
        logMethod: 'addEditorLog', // This method must exist in UI now
        color: 'magenta'
    }
];

// Initialize Monitor
const core = new MonitorCore();
const ui = new UIManager(core);
// @ts-ignore - access private field/method or assume modified UI has these
// We need to access the log methods dynamically.
// Since we modified UIManager, these methods should be public.

const processes: ChildProcess[] = [];

// Helper to spawn process
function startService(service: any) {
    const cmd = process.platform === 'win32' ? `${service.command}.cmd` : service.command;

    ui.addLog(`Starting ${service.name}...`, 'info');

    const child = spawn(cmd, service.args, {
        cwd: service.cwd,
        env: { ...process.env, FORCE_COLOR: '1' },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    processes.push(child);

    // Handle stdout
    child.stdout.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
            str.split('\n').forEach((line: string) => {
                if (!shouldFilter(line)) {
                    // @ts-ignore
                    if (typeof ui[service.logMethod] === 'function') {
                        // @ts-ignore
                        ui[service.logMethod](line);
                    } else {
                        ui.addLog(`[${service.name}] ${line}`, 'info');
                    }
                }
            });
        }
    });

    // Handle stderr
    child.stderr.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
            str.split('\n').forEach((line: string) => {
                // @ts-ignore
                if (typeof ui[service.logMethod] === 'function') {
                    // @ts-ignore
                    ui[service.logMethod](line, 'error');
                } else {
                    ui.addLog(`[${service.name} ERR] ${line}`, 'error');
                }
            });
        }
    });

    child.on('close', (code) => {
        ui.addLog(`${service.name} exited with code ${code}`, code === 0 ? 'info' : 'error');
    });

    child.on('error', (err) => {
        ui.addLog(`Failed to start ${service.name}: ${err.message}`, 'error');
    });
}

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
        SERVICES.forEach(startService);
        ui.addLog('Unified Dashboard Started', 'info');
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

// Handle cleanup
function cleanup() {
    ui.addLog('Shutting down services...', 'warn');
    processes.forEach(p => p.kill());
    core.stop();
    // Allow UI to render one last time?
    setTimeout(() => {
        process.exit(0);
    }, 500);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
    processes.forEach(p => p.kill());
});

bootstrap();
