/**
 * Alert Manager - Управление алертами
 */

export interface AlertRules {
    cpuThreshold: number;
    ramThreshold: number;
    fpsThreshold: number;
    latencyThreshold: number;
}

export interface AlertConfig {
    enabled: boolean;
    sound: boolean;
    rules: AlertRules;
}

export interface Alert {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    timestamp: number;
    resolved: boolean;
    resolvedAt?: number;
}

export class AlertManager {
    private config: AlertConfig;
    private alerts: Map<string, Alert> = new Map();
    private alertHistory: Alert[] = [];
    private maxHistory: number = 100;
    
    constructor(config: AlertConfig) {
        this.config = config;
    }
    
    checkMetrics(metrics: any): void {
        if (!this.config.enabled) return;
        
        const rules = this.config.rules;
        
        // Check CPU
        if (metrics.performance?.cpu?.usage > rules.cpuThreshold) {
            this.triggerAlert('cpu-high', 'error', `CPU usage is ${metrics.performance.cpu.usage.toFixed(1)}% (threshold: ${rules.cpuThreshold}%)`);
        } else {
            this.resolveAlert('cpu-high');
        }
        
        // Check RAM
        if (metrics.performance?.ram?.percent > rules.ramThreshold) {
            this.triggerAlert('ram-high', 'error', `RAM usage is ${metrics.performance.ram.percent.toFixed(1)}% (threshold: ${rules.ramThreshold}%)`);
        } else {
            this.resolveAlert('ram-high');
        }
        
        // Check Server FPS
        if (metrics.performance?.serverFps < rules.fpsThreshold) {
            this.triggerAlert('fps-low', 'warning', `Server FPS is ${metrics.performance.serverFps.toFixed(1)} (threshold: ${rules.fpsThreshold})`);
        } else {
            this.resolveAlert('fps-low');
        }
        
        // Check Latency
        if (metrics.performance?.latency && metrics.performance.latency > rules.latencyThreshold) {
            this.triggerAlert('latency-high', 'warning', `Latency is ${metrics.performance.latency}ms (threshold: ${rules.latencyThreshold}ms)`);
        } else {
            this.resolveAlert('latency-high');
        }
        
        // Check Server Status
        if (!metrics.systemStatus?.server?.online) {
            this.triggerAlert('server-offline', 'error', 'WebSocket server is offline');
        } else {
            this.resolveAlert('server-offline');
        }
        
        // Check Vite Status
        if (!metrics.systemStatus?.vite?.online) {
            this.triggerAlert('vite-offline', 'warning', 'Vite dev server is offline');
        } else {
            this.resolveAlert('vite-offline');
        }
        
        // Check Firebase Status
        if (!metrics.systemStatus?.firebase?.online) {
            this.triggerAlert('firebase-offline', 'warning', 'Firebase connection is offline');
        } else {
            this.resolveAlert('firebase-offline');
        }
        
        // Check Client FPS
        if (metrics.performance?.clientFps && metrics.performance.clientFps < rules.fpsThreshold) {
            this.triggerAlert('client-fps-low', 'warning', `Client FPS is ${metrics.performance.clientFps.toFixed(1)} (threshold: ${rules.fpsThreshold})`);
        } else {
            this.resolveAlert('client-fps-low');
        }
        
        // Check Room Capacity
        if (metrics.connections?.rooms && metrics.connections.activeRooms) {
            const capacity = (metrics.connections.players / (metrics.connections.activeRooms * 10)) * 100; // Assuming 10 max players per room
            if (capacity > 90) {
                this.triggerAlert('room-capacity-high', 'warning', `Room capacity is ${capacity.toFixed(1)}%`);
            } else {
                this.resolveAlert('room-capacity-high');
            }
        }
        
        // Check Network Traffic
        if (metrics.resources?.networkIn && metrics.resources.networkOut) {
            const totalTraffic = metrics.resources.networkIn + metrics.resources.networkOut;
            const trafficMBps = totalTraffic / (1024 * 1024);
            if (trafficMBps > 10) { // 10 MB/s threshold
                this.triggerAlert('network-traffic-high', 'warning', `Network traffic is ${trafficMBps.toFixed(2)} MB/s`);
            } else {
                this.resolveAlert('network-traffic-high');
            }
        }
    }
    
    triggerAlert(id: string, severity: 'info' | 'warning' | 'error', message: string): void {
        const existing = this.alerts.get(id);
        
        if (existing && !existing.resolved) {
            // Update existing alert
            existing.message = message;
            existing.severity = severity;
            return;
        }
        
        // Create new alert
        const alert: Alert = {
            id,
            type: id,
            severity,
            message,
            timestamp: Date.now(),
            resolved: false
        };
        
        this.alerts.set(id, alert);
        this.alertHistory.push(alert);
        
        // Keep history size limited
        if (this.alertHistory.length > this.maxHistory) {
            this.alertHistory.shift();
        }
        
        // Sound alert if enabled
        if (this.config.sound && severity === 'error') {
            // Play sound (terminal beep)
            process.stdout.write('\x07');
        }
    }
    
    resolveAlert(id: string): void {
        const alert = this.alerts.get(id);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedAt = Date.now();
            this.alerts.delete(id);
        }
    }
    
    getActiveAlerts(): Alert[] {
        return Array.from(this.alerts.values());
    }
    
    getAlertHistory(): Alert[] {
        return [...this.alertHistory];
    }
    
    getRecentAlerts(count: number = 10): Alert[] {
        return this.alertHistory.slice(-count);
    }
}

