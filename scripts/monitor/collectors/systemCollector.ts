/**
 * System Collector - Сбор системных метрик (CPU, RAM, Disk)
 */

import * as os from 'os';
import * as fs from 'fs';

export interface SystemMetrics {
    cpu?: {
        usage: number;
        cores: number;
    };
    ram?: {
        used: number;
        total: number;
        percent: number;
    };
    cpuHistory?: number[];
    ramHistory?: number[];
    diskUsage?: number;
}

export class SystemCollector {
    private cpuHistory: number[] = [];
    private ramHistory: number[] = [];
    private maxHistory: number = 60; // 1 minute at 1 second intervals
    private lastCpuUsage: NodeJS.CpuUsage | null = null;
    private lastCpuCheck: number = 0;
    
    async start(): Promise<void> {
        // Initialize CPU measurement
        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuCheck = Date.now();
    }
    
    async stop(): Promise<void> {
        // Cleanup if needed
    }
    
    async collect(): Promise<SystemMetrics> {
        const now = Date.now();
        
        // Collect CPU usage
        const currentCpuUsage = process.cpuUsage();
        let cpuPercent = 0;
        
        if (this.lastCpuUsage && this.lastCpuCheck > 0) {
            const elapsed = (now - this.lastCpuCheck) * 1000; // Convert to microseconds
            const userDiff = currentCpuUsage.user - this.lastCpuUsage.user;
            const systemDiff = currentCpuUsage.system - this.lastCpuUsage.system;
            const totalDiff = userDiff + systemDiff;
            
            // Calculate percentage (total CPU time / elapsed time / number of cores)
            const cores = os.cpus().length;
            cpuPercent = Math.min(100, (totalDiff / elapsed) * 100 * cores);
        }
        
        this.lastCpuUsage = currentCpuUsage;
        this.lastCpuCheck = now;
        
        // Add to history
        this.cpuHistory.push(cpuPercent);
        if (this.cpuHistory.length > this.maxHistory) {
            this.cpuHistory.shift();
        }
        
        // Collect RAM usage
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const ramPercent = (usedMem / totalMem) * 100;
        
        // Add to history
        this.ramHistory.push(ramPercent);
        if (this.ramHistory.length > this.maxHistory) {
            this.ramHistory.shift();
        }
        
        // Get disk usage (current directory)
        let diskUsage: number | undefined;
        try {
            const stats = fs.statSync(process.cwd());
            // This is a simplified check - in production you'd want to check actual disk space
            diskUsage = undefined; // TODO: Implement proper disk usage check
        } catch (error) {
            // Ignore errors
        }
        
        return {
            cpu: {
                usage: cpuPercent,
                cores: os.cpus().length
            },
            ram: {
                used: memUsage.heapUsed,
                total: totalMem,
                percent: ramPercent
            },
            cpuHistory: [...this.cpuHistory],
            ramHistory: [...this.ramHistory],
            diskUsage
        };
    }
}


