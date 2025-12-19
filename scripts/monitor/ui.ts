/**
 * UI Manager - Управление терминальным интерфейсом
 */

// @ts-ignore - blessed is CommonJS
import blessed from 'blessed';
// @ts-ignore - blessed-contrib is CommonJS
import contrib from 'blessed-contrib';
import type { MonitorCore } from './core';
import type { MetricsSnapshot } from './metrics';
import type { Alert } from './alerts';

export interface Theme {
    name: string;
    colors: {
        fg: string;
        bg: string;
        border: string;
        success: string;
        warning: string;
        error: string;
        info: string;
    };
}

export const themes: Record<string, Theme> = {
    'terminal-green': {
        name: 'Terminal Green',
        colors: {
            fg: '#00ff00',
            bg: '#000000',
            border: '#00ff00',
            success: '#00ff00',
            warning: '#ffaa00',
            error: '#ff0000',
            info: '#00ffff'
        }
    },
    'amber': {
        name: 'Amber Terminal',
        colors: {
            fg: '#ffaa00',
            bg: '#000000',
            border: '#ffaa00',
            success: '#00ff00',
            warning: '#ffaa00',
            error: '#ff0000',
            info: '#00ffff'
        }
    },
    'matrix': {
        name: 'Matrix',
        colors: {
            fg: '#00ff00',
            bg: '#000000',
            border: '#00ff00',
            success: '#00ff00',
            warning: '#ffff00',
            error: '#ff0000',
            info: '#00ffff'
        }
    },
    'cyberpunk': {
        name: 'Cyberpunk',
        colors: {
            fg: '#ff00ff',
            bg: '#000000',
            border: '#ff00ff',
            success: '#00ff00',
            warning: '#ffff00',
            error: '#ff0000',
            info: '#00ffff'
        }
    },
    'retro': {
        name: 'Retro',
        colors: {
            fg: '#ffffff',
            bg: '#000000',
            border: '#ffffff',
            success: '#00ff00',
            warning: '#ffff00',
            error: '#ff0000',
            info: '#00ffff'
        }
    }
};

export class UIManager {
    private screen: blessed.Widgets.Screen;
    private grid: contrib.grid;
    private core: MonitorCore;
    private theme: Theme;
    private _widgets: Map<string, blessed.Widgets.Node> = new Map();
    
    // Widgets
    private headerBox: blessed.Widgets.Box;
    private statusBox: blessed.Widgets.Box;
    private performanceBox: blessed.Widgets.Box;
    private connectionsBox: blessed.Widgets.Box;
    private alertsBox: blessed.Widgets.Box;
    private resourcesBox: blessed.Widgets.Box;
    private gameStateBox: blessed.Widgets.Box;
    private metricsHistoryBox: blessed.Widgets.Box;
    private logsBox: blessed.Widgets.Box;
    
    // Charts
    private _cpuChart: any = null;
    private _ramChart: any = null;
    private _fpsChart: any = null;
    
    // Modal state
    private currentModal: blessed.Widgets.Box | null = null;
    private modalOverlay: blessed.Widgets.Box | null = null;
    
    // Log filtering and search
    private logFilter: 'all' | 'info' | 'warn' | 'error' = 'all';
    private logSearchQuery: string = '';
    private logLines: Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> = [];
    private maxLogLines: number = 200;
    
    // Chart zoom and scroll
    private chartZoom: number = 1;
    private chartScroll: number = 0;
    private chartHistorySize: number = 60;
    
    // Animation state
    private animationFrame: number = 0;
    private blinkState: boolean = false;
    
    constructor(core: MonitorCore) {
        this.core = core;
        const config = core.getConfig();
        this.theme = themes[config.ui.theme] ?? themes['terminal-green']!;
        
        // Create screen
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'Protocol TX System Monitor'
        });
        
        // Create grid
        this.grid = new contrib.grid({
            rows: 12,
            cols: 12,
            screen: this.screen
        });
        
        // Setup UI
        this.setupUI();
        this.setupKeyboard();
        
        // Initial render
        this.screen.render();
    }
    
    private setupUI(): void {
        // Header (row 0, full width)
        this.headerBox = this.grid.set(0, 0, 1, 12, blessed.box, {
            content: this.getHeaderContent(),
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // System Status (row 1-2, col 0-3)
        this.statusBox = this.grid.set(1, 0, 2, 3, blessed.box, {
            label: ' SYSTEM STATUS ',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Performance (row 1-2, col 3-6)
        this.performanceBox = this.grid.set(1, 3, 2, 3, blessed.box, {
            label: ' PERFORMANCE ',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Connections (row 1-2, col 6-9)
        this.connectionsBox = this.grid.set(1, 6, 2, 3, blessed.box, {
            label: ' CONNECTIONS ',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Alerts (row 1-2, col 9-12)
        this.alertsBox = this.grid.set(1, 9, 2, 3, blessed.box, {
            label: ' ALERTS ',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Resources (row 3-4, full width)
        this.resourcesBox = this.grid.set(3, 0, 2, 12, blessed.box, {
            label: ' RESOURCES ',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Game State (row 5-6, full width)
        this.gameStateBox = this.grid.set(5, 0, 2, 12, blessed.box, {
            label: ' GAME STATE ',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Metrics History (row 7-8, full width)
        this.metricsHistoryBox = this.grid.set(7, 0, 2, 12, blessed.box, {
            label: ' METRICS HISTORY ',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Logs (row 9-11, full width) - use scrollable box instead of log widget
        this.logsBox = this.grid.set(9, 0, 3, 12, blessed.box, {
            label: ' LOGS [ALL] ',
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: ' ',
                inverse: true
            },
            keys: true,
            vi: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            border: {
                type: 'line'
            }
        });
        
        // Footer (row 11, full width)
        this.grid.set(11, 0, 1, 12, blessed.box, {
            content: '[F1]Help [F2]Config [F3]Export [F4]Alerts [F5]Players [F6]Rooms [ESC]Quit',
            tags: true,
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg
            }
        });
    }
    
    private getHeaderContent(): string {
        const blinkChar = this.blinkState ? '█' : '░';
        return `
╔═══════════════════════════════════════════════════════════════════════╗
║  ██████╗ ██████╗  ██████╗ ████████╗ ██████╗ ██╗     ██╗                ║
║  ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝██╔═══██╗██║     ██║                ║
║  ██████╔╝██████╔╝██║   ██║   ██║   ██║   ██║██║     ██║                ║
║  ██╔═══╝ ██╔══██╗██║   ██║   ██║   ██║   ██║██║     ██║                ║
║  ██║     ██║  ██║╚██████╔╝   ██║   ╚██████╔╝███████╗███████╗           ║
║  ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚══════╝╚══════╝           ║
║  SYSTEM MONITOR v0.3.0 ${blinkChar} [F1]Help [F2]Config [F3]Export [F4]Alerts    ║
╚═══════════════════════════════════════════════════════════════════════╝`;
    }
    
    update(metrics: MetricsSnapshot, alerts: Alert[]): void {
        try {
            // Update animation frame for blinking effects
            this.animationFrame++;
            if (this.animationFrame % 30 === 0) {
                this.blinkState = !this.blinkState;
            }
            
            // Update header with uptime
            const uptime = this.formatUptime(metrics.timestamp);
            if (this.headerBox && typeof this.headerBox.setContent === 'function') {
                const headerContent = this.getHeaderContent().replace('v0.3.0', `v0.3.0 | Uptime: ${uptime}`);
                this.headerBox.setContent(headerContent);
            }
            
            // Update system status
            this.updateSystemStatus(metrics);
            
            // Update performance
            this.updatePerformance(metrics);
            
            // Update connections
            this.updateConnections(metrics);
            
            // Update alerts
            this.updateAlerts(alerts);
            
            // Update resources
            this.updateResources(metrics);
            
            // Update game state
            this.updateGameState(metrics);
            
            // Update metrics history
            this.updateMetricsHistory(metrics);
            
            // Update logs display
            this.updateLogsDisplay();
            
            // Render
            if (this.screen && typeof this.screen.render === 'function') {
                this.screen.render();
            }
        } catch (error) {
            console.error('[UI] Error updating UI:', error);
        }
    }
    
    private updateSystemStatus(metrics: MetricsSnapshot): void {
        if (!this.statusBox || typeof this.statusBox.setContent !== 'function') return;
        
        const status = metrics.systemStatus;
        const blink = this.blinkState ? '●' : '○';
        const content = [
            `Vite Dev:    ${status.vite.online ? `[ONLINE]  ✓ ${blink}` : '[OFFLINE] ✗'}`,
            `WebSocket:   ${status.server.online ? `[ONLINE]  ✓ ${blink}` : '[OFFLINE] ✗'}`,
            `Firebase:    ${status.firebase.online ? `[ONLINE]  ✓ ${blink}` : '[OFFLINE] ✗'}`,
            `Physics:     ${status.physics.active ? `[ACTIVE]  ✓ ${blink}` : '[INACTIVE] ✗'}`,
            `Network:     [STABLE]  ✓ ${blink}`
        ].join('\n');
        
        this.statusBox.setContent(content);
    }
    
    private updatePerformance(metrics: MetricsSnapshot): void {
        if (!this.performanceBox || typeof this.performanceBox.setContent !== 'function') return;
        
        const perf = metrics.performance;
        const lines: string[] = [
            `CPU:        ${perf.cpu.usage.toFixed(1)}% (${perf.cpu.cores} cores)`,
            `RAM:        ${this.formatBytes(perf.ram.used)} / ${this.formatBytes(perf.ram.total)} (${perf.ram.percent.toFixed(1)}%)`,
            `Server FPS: ${perf.serverFps.toFixed(1)}`,
            `Client FPS: ${perf.clientFps?.toFixed(1) || 'N/A'}`,
            `Latency:    ${perf.latency ? perf.latency.toFixed(0) + 'ms' : 'N/A'}`
        ];
        
        // Add extended client metrics if available
        if (perf.clientMetrics) {
            const cm = perf.clientMetrics;
            if (cm.physics) {
                lines.push(`Physics:    ${cm.physics.objects || 0} objects, ${cm.physics.bodies || 0} bodies`);
            }
            if (cm.scene) {
                lines.push(`Scene:      ${cm.scene.meshes || 0} meshes, ${cm.scene.lights || 0} lights`);
            }
            if (cm.effects) {
                lines.push(`Effects:    ${cm.effects.particles || 0} particles, ${cm.effects.systems || 0} systems`);
            }
        }
        
        this.performanceBox.setContent(lines.join('\n'));
    }
    
    private updateConnections(metrics: MetricsSnapshot): void {
        if (!this.connectionsBox || typeof this.connectionsBox.setContent !== 'function') return;
        
        const conn = metrics.connections;
        const content = [
            `Players:           ${conn.players} (${conn.authenticated} auth, ${conn.guests} guests)`,
            `Rooms:             ${conn.rooms} total, ${conn.activeRooms} active`,
            `In Queue:          ${conn.inQueue}`,
            `WebSocket Conns:   ${conn.websocketConns}`,
            `Avg Ping:          ${conn.avgPing > 0 ? conn.avgPing.toFixed(0) + 'ms' : 'N/A'}`
        ].join('\n');
        
        this.connectionsBox.setContent(content);
    }
    
    private updateAlerts(alerts: Alert[]): void {
        if (!this.alertsBox || typeof this.alertsBox.setContent !== 'function') return;
        
        const recentAlerts = alerts.slice(-3);
        const content = recentAlerts.length > 0
            ? recentAlerts.map(alert => {
                const time = new Date(alert.timestamp).toLocaleTimeString();
                const severity = alert.severity.toUpperCase();
                const blink = this.blinkState && alert.severity === 'error' ? '●' : ' ';
                return `[${time}] ${blink}[${severity}] ${alert.message.substring(0, 30)}`;
            }).join('\n')
            : 'No active alerts';
        
        this.alertsBox.setContent(content);
    }
    
    private updateResources(metrics: MetricsSnapshot): void {
        if (!this.resourcesBox || typeof this.resourcesBox.setContent !== 'function') return;
        
        const res = metrics.resources;
        const cpuValue = res.cpuHistory[res.cpuHistory.length - 1] || 0;
        const ramValue = metrics.performance.ram.percent;
        const cpuBar = this.createProgressBar(cpuValue, 100, 40);
        const ramBar = this.createProgressBar(ramValue, 100, 40);
        
        const lines: string[] = [
            `CPU:  ${cpuBar} ${cpuValue.toFixed(1)}%`,
            `RAM:  ${ramBar} ${ramValue.toFixed(1)}%`,
            `Net:  ↑${this.formatBytes(res.networkIn)}/s ↓${this.formatBytes(res.networkOut)}/s`
        ];
        
        // Add disk usage if available
        if (res.diskUsage !== undefined) {
            const diskBar = this.createProgressBar(res.diskUsage, 100, 40);
            lines.push(`Disk: ${diskBar} ${res.diskUsage.toFixed(1)}%`);
        }
        
        // Add server memory if available
        if (res.serverMemory) {
            const sm = res.serverMemory;
            const heapPercent = (sm.heapUsed / sm.heapTotal) * 100;
            const heapBar = this.createProgressBar(heapPercent, 100, 40);
            lines.push(`Srv Heap: ${heapBar} ${this.formatBytes(sm.heapUsed)} / ${this.formatBytes(sm.heapTotal)}`);
        }
        
        this.resourcesBox.setContent(lines.join('\n'));
    }
    
    private updateGameState(metrics: MetricsSnapshot): void {
        if (!this.gameStateBox || typeof this.gameStateBox.setContent !== 'function') return;
        
        const rooms = metrics.gameState.rooms.slice(0, 3);
        const content = rooms.length > 0
            ? rooms.map(room => {
                const time = room.gameTime ? this.formatTime(room.gameTime) : 'N/A';
                return `Room #${room.id.substring(0, 6)} (${room.mode.toUpperCase()}): ${room.players}/${room.maxPlayers} players | ${room.status} | ${time}`;
            }).join('\n')
            : 'No active rooms';
        
        this.gameStateBox.setContent(content);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private updateMetricsHistory(_metrics: MetricsSnapshot): void {
        if (!this.metricsHistoryBox || typeof this.metricsHistoryBox.setContent !== 'function') return;
        
        const totalHistory = this.core.getHistoryManager().getLatest(this.chartHistorySize * this.chartZoom);
        if (totalHistory.length < 2) {
            this.metricsHistoryBox.setContent('Collecting metrics...');
            return;
        }
        
        // Apply scroll offset
        const scrollStart = Math.max(0, Math.min(this.chartScroll, totalHistory.length - this.chartHistorySize));
        const history = totalHistory.slice(scrollStart, scrollStart + this.chartHistorySize);
        
        const cpuData = history.map(h => h.performance.cpu.usage);
        const ramData = history.map(h => h.performance.ram.percent);
        const fpsData = history.map(h => h.performance.serverFps);
        const clientFpsData = history.map(h => h.performance.clientFps || 0).filter(v => v > 0);
        
        const cpuSpark = this.createSparkline(cpuData);
        const ramSpark = this.createSparkline(ramData);
        const fpsSpark = this.createSparkline(fpsData);
        const clientFpsSpark = clientFpsData.length > 0 ? this.createSparkline(clientFpsData) : 'N/A';
        
        const zoomInfo = this.chartZoom > 1 ? ` (Zoom: ${this.chartZoom}x)` : '';
        const scrollInfo = this.chartScroll > 0 ? ` (Scroll: ${this.chartScroll})` : '';
        
        const content = [
            `CPU:       ${cpuSpark}`,
            `RAM:       ${ramSpark}`,
            `Server FPS: ${fpsSpark}`,
            `Client FPS: ${clientFpsSpark}`,
            `Last ${history.length} samples${zoomInfo}${scrollInfo} | [Z] Zoom | [←→] Scroll`
        ].join('\n');
        
        this.metricsHistoryBox.setContent(content);
    }
    
    addLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        if (!this.logsBox || typeof this.logsBox.setContent !== 'function') return;
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            line: message,
            level,
            timestamp
        };
        
        // Add to log lines
        this.logLines.push(logEntry);
        
        // Keep only last N lines
        if (this.logLines.length > this.maxLogLines) {
            this.logLines.shift();
        }
        
        // Update display
        this.updateLogsDisplay();
    }
    
    private updateLogsDisplay(): void {
        if (!this.logsBox || typeof this.logsBox.setContent !== 'function') return;
        
        // Filter logs
        let filtered = this.logLines;
        if (this.logFilter !== 'all') {
            filtered = filtered.filter(log => log.level === this.logFilter);
        }
        
        // Search logs
        if (this.logSearchQuery) {
            const query = this.logSearchQuery.toLowerCase();
            filtered = filtered.filter(log => 
                log.line.toLowerCase().includes(query) || 
                log.timestamp.toLowerCase().includes(query)
            );
        }
        
        // Format log lines with colors
        const formattedLines = filtered.slice(-20).map(log => {
            const prefix = log.level === 'error' ? '[ERROR]' : log.level === 'warn' ? '[WARN]' : '[INFO]';
            const colorTag = log.level === 'error' ? '{red-fg}' : log.level === 'warn' ? '{yellow-fg}' : '{green-fg}';
            return `${colorTag}${log.timestamp} ${prefix}{/} ${log.line}`;
        });
        
        const filterLabel = this.logFilter === 'all' ? 'ALL' : this.logFilter.toUpperCase();
        const searchLabel = this.logSearchQuery ? ` | Search: "${this.logSearchQuery}"` : '';
        this.logsBox.setLabel(` LOGS [${filterLabel}]${searchLabel} `);
        this.logsBox.setContent(formattedLines.join('\n') || 'No logs matching filter');
    }
    
    private filterLogs(level: 'all' | 'info' | 'warn' | 'error'): void {
        this.logFilter = level;
        this.updateLogsDisplay();
        this.screen.render();
    }
    
    private searchLogs(query: string): void {
        this.logSearchQuery = query;
        this.updateLogsDisplay();
        this.screen.render();
    }
    
    private clearLogs(): void {
        this.logLines = [];
        this.logSearchQuery = '';
        this.updateLogsDisplay();
        this.screen.render();
        this.addLog('Logs cleared', 'info');
    }
    
    private setupKeyboard(): void {
        // Exit
        this.screen.key(['escape', 'q', 'C-c'], async () => {
            if (this.currentModal) {
                this.closeModal();
            } else {
                await this.core.stop();
                process.exit(0);
            }
        });
        
        // Function keys
        this.screen.key(['f1'], () => {
            if (!this.currentModal) this.showHelp();
        });
        
        this.screen.key(['f2'], () => {
            if (!this.currentModal) this.showConfig();
        });
        
        // F3 handled in main monitor.ts for export
        
        this.screen.key(['f4'], () => {
            if (!this.currentModal) this.showAlerts();
        });
        
        this.screen.key(['f5'], () => {
            if (!this.currentModal) this.showPlayers();
        });
        
        this.screen.key(['f6'], () => {
            if (!this.currentModal) this.showRooms();
        });
        
        // Refresh data
        this.screen.key(['r', 'R'], () => {
            if (!this.currentModal) {
                this.addLog('Refreshing metrics...', 'info');
                // Metrics will be updated in next cycle
            }
        });
        
        // Log filtering
        this.screen.key(['f', 'F'], () => {
            if (!this.currentModal) {
                const filters: Array<'all' | 'info' | 'warn' | 'error'> = ['all', 'info', 'warn', 'error'];
                const currentIndex = filters.indexOf(this.logFilter);
                const nextIndex = (currentIndex + 1) % filters.length;
                const nextFilter = filters[nextIndex] ?? 'all';
                this.filterLogs(nextFilter);
                this.addLog(`Log filter: ${nextFilter}`, 'info');
            }
        });
        
        // Log search
        this.screen.key(['s', 'S'], () => {
            if (!this.currentModal) {
                this.showSearchModal();
            }
        });
        
        // Clear logs
        this.screen.key(['c', 'C'], () => {
            if (!this.currentModal) {
                this.clearLogs();
            }
        });
        
        // Chart zoom
        this.screen.key(['z', 'Z'], () => {
            if (!this.currentModal) {
                this.chartZoom = this.chartZoom >= 4 ? 1 : this.chartZoom * 2;
                this.addLog(`Chart zoom: ${this.chartZoom}x`, 'info');
            }
        });
        
        // Chart scroll
        this.screen.key(['left'], () => {
            if (!this.currentModal) {
                this.chartScroll = Math.max(0, this.chartScroll - 10);
            }
        });
        
        this.screen.key(['right'], () => {
            if (!this.currentModal) {
                const maxScroll = this.core.getHistoryManager().getLatest(this.chartHistorySize * this.chartZoom).length - this.chartHistorySize;
                this.chartScroll = Math.min(maxScroll, this.chartScroll + 10);
            }
        });
        
        // Allow scrolling logs with arrow keys
        this.screen.key(['up', 'down'], (_ch: unknown, key: { name: string }) => {
            if (!this.currentModal && this.logsBox && typeof (this.logsBox as any).scroll === 'function') {
                if (key.name === 'up') {
                    (this.logsBox as any).scroll(-1);
                } else if (key.name === 'down') {
                    (this.logsBox as any).scroll(1);
                }
                this.screen.render();
            }
        });
    }
    
    private showModal(title: string, content: string, width: number = 80, height: number = 20): void {
        // Close existing modal if any
        if (this.currentModal) {
            this.closeModal();
        }
        
        // Create overlay
        this.modalOverlay = blessed.box({
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            bg: 'black',
            opacity: 0.5
        });
        
        // Create modal
        const screenWidth = (this.screen as any).width || 120;
        const screenHeight = (this.screen as any).height || 40;
        const left = Math.max(0, Math.floor((screenWidth - width) / 2));
        const top = Math.max(0, Math.floor((screenHeight - height) / 2));
        
        this.currentModal = blessed.box({
            top,
            left,
            width,
            height,
            content,
            tags: true,
            border: {
                type: 'line'
            },
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            label: ` ${title} `,
            keys: true,
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: ' ',
                inverse: true
            }
        });
        
        // Close on ESC
        this.currentModal.key(['escape'], () => {
            this.closeModal();
        });
        
        this.screen.append(this.modalOverlay);
        this.screen.append(this.currentModal);
        this.currentModal.focus();
        this.screen.render();
    }
    
    private closeModal(): void {
        if (this.currentModal) {
            this.currentModal.detach();
            this.currentModal = null;
        }
        if (this.modalOverlay) {
            this.modalOverlay.detach();
            this.modalOverlay = null;
        }
        this.screen.render();
    }
    
    private showHelp(): void {
        const helpContent = `
╔═══════════════════════════════════════════════════════════════════════╗
║                      KEYBOARD SHORTCUTS                               ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Function Keys:                                                       ║
║    [F1]          Show this help dialog                               ║
║    [F2]          Show configuration                                   ║
║    [F3]          Export data (JSON/CSV/HTML/TXT)                     ║
║    [F4]          Show alerts history                                 ║
║    [F5]          Show detailed player stats                          ║
║    [F6]          Show detailed room stats                            ║
║                                                                       ║
║  Navigation:                                                          ║
║    [TAB]         Switch focus between sections                       ║
║    [↑/↓]         Scroll logs                                         ║
║    [←/→]         Scroll chart history                                ║
║                                                                       ║
║  Logs Control:                                                        ║
║    [F]           Cycle log filter (ALL/INFO/WARN/ERROR)              ║
║    [S]           Search in logs                                      ║
║    [E]           Export logs to file                                 ║
║    [C]           Clear logs                                          ║
║                                                                       ║
║  Charts:                                                              ║
║    [Z]           Toggle chart zoom (1x, 2x, 4x)                      ║
║    [←/→]         Scroll chart timeline                               ║
║                                                                       ║
║  General:                                                             ║
║    [R]           Refresh metrics                                     ║
║    [ESC]         Close modal / Exit                                  ║
║    [Q]           Quit                                                ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

Press [ESC] to close`;
        
        this.showModal('HELP', helpContent, 70, 30);
    }
    
    private showConfig(): void {
        const config = this.core.getConfig();
        const configContent = `
╔═══════════════════════════════════════════════════════════════════════╗
║                      CONFIGURATION                                    ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Server:                                                              ║
║    Host:            ${config.server.host.padEnd(50)}║
║    Port:            ${config.server.port.toString().padEnd(50)}║
║    Reconnect:       ${config.server.reconnectInterval}ms${''.padEnd(45)}║
║                                                                       ║
║  Client:                                                              ║
║    Vite URL:        ${config.client.viteUrl.padEnd(50)}║
║    Check Interval:  ${config.client.checkInterval}ms${''.padEnd(45)}║
║                                                                       ║
║  Update:                                                              ║
║    Interval:        ${config.updateInterval}ms${''.padEnd(45)}║
║                                                                       ║
║  History:                                                             ║
║    Enabled:         ${config.history.enabled ? 'Yes' : 'No'}${''.padEnd(47)}║
║    Duration:        ${config.history.duration}s${''.padEnd(48)}║
║    Interval:        ${config.history.interval}ms${''.padEnd(45)}║
║                                                                       ║
║  Alerts:                                                              ║
║    Enabled:         ${config.alerts.enabled ? 'Yes' : 'No'}${''.padEnd(47)}║
║    Sound:           ${config.alerts.sound ? 'Yes' : 'No'}${''.padEnd(47)}║
║    CPU Threshold:   ${config.alerts.rules.cpuThreshold}%${''.padEnd(46)}║
║    RAM Threshold:   ${config.alerts.rules.ramThreshold}%${''.padEnd(46)}║
║    FPS Threshold:   ${config.alerts.rules.fpsThreshold}${''.padEnd(47)}║
║    Latency Thresh:  ${config.alerts.rules.latencyThreshold}ms${''.padEnd(43)}║
║                                                                       ║
║  UI:                                                                  ║
║    Theme:           ${config.ui.theme.padEnd(50)}║
║    Refresh Rate:    ${config.ui.refreshRate} FPS${''.padEnd(46)}║
║                                                                       ║
║  Export:                                                              ║
║    Default Format:  ${config.export.defaultFormat.padEnd(50)}║
║    Default Path:    ${config.export.defaultPath.padEnd(50)}║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

Press [ESC] to close`;
        
        this.showModal('CONFIGURATION', configContent, 70, 30);
    }
    
    private showAlerts(): void {
        const alerts = this.core.getAlertManager().getAlertHistory();
        const activeAlerts = this.core.getAlertManager().getActiveAlerts();
        
        let alertsContent = `
╔═══════════════════════════════════════════════════════════════════════╗
║                      ALERTS HISTORY                                   ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Active Alerts: ${activeAlerts.length.toString().padEnd(60)}║
║                                                                       ║
`;
        
        if (activeAlerts.length > 0) {
            alertsContent += `║  ACTIVE:                                                                 ║\n`;
            activeAlerts.slice(-10).forEach(alert => {
                const time = new Date(alert.timestamp).toLocaleString();
                const severity = alert.severity.toUpperCase().padEnd(7);
                const message = alert.message.substring(0, 50).padEnd(50);
                const color = alert.severity === 'error' ? '{red-fg}' : alert.severity === 'warning' ? '{yellow-fg}' : '{green-fg}';
                alertsContent += `║    ${color}[${severity}]{/} ${time} - ${message}  ║\n`;
            });
        }
        
        alertsContent += `║                                                                       ║
║  Recent History:                                                      ║
`;
        
        const recentAlerts = alerts.slice(-20);
        if (recentAlerts.length > 0) {
            recentAlerts.forEach(alert => {
                const time = new Date(alert.timestamp).toLocaleString();
                const severity = alert.severity.toUpperCase().padEnd(7);
                const resolved = alert.resolved ? '[RESOLVED]' : '[ACTIVE]';
                const message = alert.message.substring(0, 45).padEnd(45);
                const color = alert.severity === 'error' ? '{red-fg}' : alert.severity === 'warning' ? '{yellow-fg}' : '{green-fg}';
                alertsContent += `║    ${color}[${severity}]{/} ${time} ${resolved} - ${message}  ║\n`;
            });
        } else {
            alertsContent += `║    No alerts in history                                                ║\n`;
        }
        
        alertsContent += `║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

Press [ESC] to close`;
        
        this.showModal('ALERTS', alertsContent, 75, 30);
    }
    
    private showPlayers(): void {
        // Get player stats from server collector
        (this.core.getMetricsManager() as any).serverCollector;
        let playersContent = `
╔═══════════════════════════════════════════════════════════════════════╗
║                      PLAYER STATISTICS                                ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
`;
        
        // Try to get detailed player stats (this would require extending the API)
        // For now, show basic info from metrics
        const metrics = this.core.getMetricsManager().getCurrentMetrics();
        if (metrics) {
            playersContent += `║  Total Players:     ${metrics.connections.players.toString().padEnd(55)}║\n`;
            playersContent += `║  Authenticated:     ${metrics.connections.authenticated.toString().padEnd(55)}║\n`;
            playersContent += `║  Guests:            ${metrics.connections.guests.toString().padEnd(55)}║\n`;
            playersContent += `║  Avg Ping:          ${metrics.connections.avgPing > 0 ? metrics.connections.avgPing.toFixed(0) + 'ms' : 'N/A'}${''.padEnd(45)}║\n`;
        }
        
        playersContent += `║                                                                       ║
║  Note: Detailed player stats require server API enhancement.          ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

Press [ESC] to close`;
        
        this.showModal('PLAYERS', playersContent, 75, 15);
    }
    
    private showRooms(): void {
        const metrics = this.core.getMetricsManager().getCurrentMetrics();
        let roomsContent = `
╔═══════════════════════════════════════════════════════════════════════╗
║                      ROOM STATISTICS                                  ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
`;
        
        if (metrics) {
            roomsContent += `║  Total Rooms:       ${metrics.connections.rooms.toString().padEnd(55)}║\n`;
            roomsContent += `║  Active Rooms:      ${metrics.connections.activeRooms.toString().padEnd(55)}║\n`;
            roomsContent += `║  In Queue:          ${metrics.connections.inQueue.toString().padEnd(55)}║\n`;
            roomsContent += `║                                                                       ║\n`;
            
            if (metrics.gameState.rooms.length > 0) {
                roomsContent += `║  Room Details:                                                       ║\n`;
                metrics.gameState.rooms.slice(0, 10).forEach(room => {
                    const id = room.id.substring(0, 8).padEnd(8);
                    const mode = room.mode.toUpperCase().padEnd(15);
                    const players = `${room.players}/${room.maxPlayers}`.padEnd(7);
                    const status = room.status.padEnd(10);
                    const time = room.gameTime ? this.formatTime(room.gameTime).padEnd(8) : 'N/A'.padEnd(8);
                    roomsContent += `║    ${id} | ${mode} | ${players} | ${status} | ${time}          ║\n`;
                });
            }
        }
        
        roomsContent += `║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

Press [ESC] to close`;
        
        this.showModal('ROOMS', roomsContent, 75, 25);
    }
    
    private showSearchModal(): void {
        const input = blessed.textbox({
            top: 'center',
            left: 'center',
            width: 50,
            height: 5,
            content: 'Enter search query:',
            border: {
                type: 'line'
            },
            style: {
                fg: this.theme.colors.fg,
                bg: this.theme.colors.bg,
                border: {
                    fg: this.theme.colors.border
                }
            },
            label: ' Search Logs '
        });
        
        input.on('submit', (value: string) => {
            this.searchLogs(value);
            input.detach();
            this.screen.render();
        });
        
        input.key(['escape'], () => {
            input.detach();
            this.screen.render();
        });
        
        this.screen.append(input);
        input.focus();
        this.screen.render();
    }
    
    // Utility methods
    private formatUptime(timestamp: number): string {
        const uptime = Date.now() - timestamp;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
    }
    
    private formatBytes(bytes: number): string {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
    }
    
    private formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    private createProgressBar(value: number, max: number, width: number): string {
        const filled = Math.round((value / max) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }
    
    private createSparkline(data: number[]): string {
        if (data.length === 0) return '';
        
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        
        const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        return data.map(val => {
            const normalized = (val - min) / range;
            const index = Math.floor(normalized * (blocks.length - 1));
            return blocks[index];
        }).join('');
    }
    
    getScreen(): blessed.Widgets.Screen {
        return this.screen;
    }
}

