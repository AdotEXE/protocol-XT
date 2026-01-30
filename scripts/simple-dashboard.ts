/**
 * Simple Dashboard - Runs all services with colored console output
 * Works in any terminal without TUI dependencies
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { getLocalIP, getAllLocalIPs } from './get-local-ip';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EDITOR_ROOT = path.resolve(PROJECT_ROOT, 'PolyGenStudio-main');

// Configuration
const SERVICES = [
    {
        name: 'SERVER',
        command: 'npm',
        args: ['run', 'server:dev'],
        cwd: PROJECT_ROOT,
        color: colors.green,
        prefix: '[S]'
    },
    {
        name: 'CLIENT',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: PROJECT_ROOT,
        color: colors.cyan,
        prefix: '[C]'
    },
    {
        name: 'EDITOR',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: EDITOR_ROOT,
        color: colors.magenta,
        prefix: '[E]'
    }
];

const processes: ChildProcess[] = [];

function log(service: string, color: string, prefix: string, message: string, isError = false) {
    const time = new Date().toLocaleTimeString();
    const levelColor = isError ? colors.red : color;
    const level = isError ? 'ERR' : 'LOG';
    console.log(`${colors.gray}[${time}]${colors.reset} ${prefix} ${levelColor}[${service}]${colors.reset} ${message}`);
}

function startService(service: typeof SERVICES[0]) {
    log('SYSTEM', colors.yellow, '[*]', `Starting ${service.name}...`);

    const child = spawn(service.command, service.args, {
        cwd: service.cwd,
        env: { ...process.env, FORCE_COLOR: '1' },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    processes.push(child);

    child.stdout?.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach((line: string) => {
            if (line.trim()) {
                log(service.name, service.color, service.prefix, line);
            }
        });
    });

    child.stderr?.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach((line: string) => {
            if (line.trim()) {
                log(service.name, service.color, service.prefix, line, true);
            }
        });
    });

    child.on('close', (code) => {
        log('SYSTEM', colors.yellow, '[*]', `${service.name} exited with code ${code}`, code !== 0);
    });

    child.on('error', (err) => {
        log('SYSTEM', colors.red, '[X]', `Failed to start ${service.name}: ${err.message}`, true);
    });
}

function cleanup() {
    console.log('\n');
    log('SYSTEM', colors.yellow, '[*]', 'Shutting down all services...');
    processes.forEach(p => {
        try { p.kill(); } catch { }
    });
    setTimeout(() => process.exit(0), 500);
}

// Main
const localIP = getLocalIP();
const allIPs = getAllLocalIPs();

console.log('\n');
console.log(`${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}║     PROTOCOL TX - UNIFIED DEVELOPMENT SERVER       ║${colors.reset}`);
console.log(`${colors.cyan}╠════════════════════════════════════════════════════╣${colors.reset}`);
console.log(`${colors.cyan}║  ${colors.white}📍 Локальный доступ:${colors.cyan}                                    ║${colors.reset}`);
console.log(`${colors.cyan}║  ${colors.green}[*] SERVER${colors.cyan} - Game Backend (port 8000)              ║${colors.reset}`);
console.log(`${colors.cyan}║     → ws://localhost:8000                          ║${colors.reset}`);
console.log(`${colors.cyan}║  ${colors.cyan}[*] CLIENT${colors.cyan} - Game Frontend (port 5000)             ║${colors.reset}`);
console.log(`${colors.cyan}║     → http://localhost:5000                         ║${colors.reset}`);
console.log(`${colors.cyan}║  ${colors.magenta}[*] EDITOR${colors.cyan} - Map Editor (port 3000)               ║${colors.reset}`);
console.log(`${colors.cyan}║     → http://localhost:3000                         ║${colors.reset}`);
if (localIP) {
    console.log(`${colors.cyan}╠════════════════════════════════════════════════════╣${colors.reset}`);
    console.log(`${colors.cyan}║  ${colors.green}[*] Сетевой доступ (для других ПК в сети):${colors.cyan}         ║${colors.reset}`);
    console.log(`${colors.cyan}║     → ws://${localIP}:8000${' '.repeat(30 - localIP.length)}║${colors.reset}`);
    console.log(`${colors.cyan}║     → http://${localIP}:5000${' '.repeat(29 - localIP.length)}║${colors.reset}`);
    console.log(`${colors.cyan}║     → http://${localIP}:3000${' '.repeat(29 - localIP.length)}║${colors.reset}`);
}
if (allIPs.length > 1) {
    console.log(`${colors.cyan}╠════════════════════════════════════════════════════╣${colors.reset}`);
    console.log(`${colors.cyan}║  ${colors.magenta}[*] Все доступные IP-адреса:${colors.cyan}                        ║${colors.reset}`);
    allIPs.forEach(ip => {
        console.log(`${colors.cyan}║     → ${ip}${' '.repeat(42 - ip.length)}║${colors.reset}`);
    });
}
console.log(`${colors.cyan}╠════════════════════════════════════════════════════╣${colors.reset}`);
console.log(`${colors.cyan}║  Press Ctrl+C to stop all services                 ║${colors.reset}`);
console.log(`${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}`);
console.log('\n');

SERVICES.forEach(startService);

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
