#!/usr/bin/env node
/**
 * System Logger
 * Собирает и отображает системные сообщения, ошибки и предупреждения из всех процессов
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface LogEntry {
    timestamp: string;
    level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
    source: string;
    message: string;
}

class SystemLogger {
    private logBuffer: LogEntry[] = [];
    private maxBufferSize = 1000;

    constructor() {
        console.clear();
        console.log('='.repeat(80));
        console.log('Protocol TX - System Logs');
        console.log('Collecting errors, warnings, and system messages...');
        console.log('='.repeat(80));
        console.log('');

        this.setupWatchers();
        this.startDisplay();
    }

    private setupWatchers(): void {
        // Watch for process outputs and system events
        this.watchProcessOutput();
        this.watchSystemEvents();
    }

    private watchProcessOutput(): void {
        // Monitor ports and processes
        setInterval(() => {
            this.checkPorts();
            this.checkProcesses();
        }, 2000);
    }

    private watchSystemEvents(): void {
        // Check for error logs, crash dumps, etc.
        const logDirs = [
            path.join(process.cwd(), 'logs'),
            path.join(process.cwd(), '.next'),
        ];

        logDirs.forEach(dir => {
            if (fs.existsSync(dir)) {
                // Could watch for log files here
            }
        });
    }

    private async checkPorts(): Promise<void> {
        return new Promise((resolve) => {
            exec('netstat -ano | findstr ":8080 :3000"', (error, stdout) => {
                if (!error && stdout) {
                    const lines = stdout.toString().split('\n').filter(l => l.trim());
                    if (lines.length > 0) {
                        this.addLog('INFO', 'PORTS', `Active ports: ${lines.length} connections found`);
                    }
                }
                resolve();
            });
        });
    }

    private async checkProcesses(): Promise<void> {
        return new Promise((resolve) => {
            exec('tasklist /FI "IMAGENAME eq node.exe" /FI "IMAGENAME eq tsx.exe" 2>nul', (error, stdout) => {
                if (!error && stdout) {
                    const lines = stdout.toString().split('\n').filter(l => 
                        l.includes('node.exe') || l.includes('tsx.exe')
                    );
                    if (lines.length > 0) {
                        // Just check if processes are running, don't spam
                    }
                }
                resolve();
            });
        });
    }

    private addLog(level: LogEntry['level'], source: string, message: string): void {
        const entry: LogEntry = {
            timestamp: new Date().toLocaleTimeString('ru-RU'),
            level,
            source,
            message: message.substring(0, 200) // Limit message length
        };

        this.logBuffer.push(entry);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }

        // Immediately display critical errors
        if (level === 'ERROR') {
            this.displayLog(entry);
        }
    }

    private displayLog(entry: LogEntry): void {
        const colorMap = {
            ERROR: '\x1b[31m', // Red
            WARN: '\x1b[33m',  // Yellow
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[90m'  // Gray
        };
        const reset = '\x1b[0m';

        const color = colorMap[entry.level];
        const levelStr = entry.level.padEnd(5);
        const sourceStr = entry.source.padEnd(15);
        
        console.log(`${color}[${entry.timestamp}] ${levelStr} ${sourceStr}${reset} ${entry.message}`);
    }

    private startDisplay(): void {
        // Display recent logs periodically
        setInterval(() => {
            if (this.logBuffer.length > 0) {
                const recent = this.logBuffer.slice(-20); // Show last 20
                recent.forEach(entry => {
                    if (entry.level !== 'DEBUG') { // Skip debug in normal view
                        this.displayLog(entry);
                    }
                });
                this.logBuffer = []; // Clear after display to avoid duplicates
            }
        }, 5000);

        // Monitor console for errors
        process.on('uncaughtException', (error) => {
            this.addLog('ERROR', 'SYSTEM', `Uncaught Exception: ${error.message}`);
        });

        process.on('unhandledRejection', (reason) => {
            this.addLog('ERROR', 'SYSTEM', `Unhandled Rejection: ${String(reason)}`);
        });
    }
}

// Start logger
new SystemLogger();

// Keep process running
setInterval(() => {
    // Keep alive
}, 10000);

