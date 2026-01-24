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
    private grid!: contrib.grid; // Инициализируется в конструкторе
    private core!: MonitorCore; // Инициализируется в конструкторе
    private theme!: Theme; // Инициализируется в конструкторе
    // Reserved for future widget management
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Log boxes
    private logsBox: blessed.Widgets.Box;      // System logs
    private serverLogsBox: blessed.Widgets.Box; // Server logs
    private clientLogsBox: blessed.Widgets.Box; // Client logs

    // Log data
    private _logLines: Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> = [];
    private serverLogLines: Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> = [];
    private clientLogLines: Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> = [];

    // Charts
    private _cpuChart: any;
    private _ramChart: any;
    private _fpsChart: any;
    
    // Публичные геттеры для обратной совместимости (если где-то используется UDManager)
    public get fpsChart(): any { return this._fpsChart; }
    public get cpuChart(): any { return this._cpuChart; }
    public get maxLogLines(): number { return this._maxLogLines; }
    public get logLines(): Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> { return this._logLines; }
    public get grid(): contrib.grid { return this.grid; }
    public get core(): MonitorCore { return this.core; }
    public get theme(): Theme { return this.theme; }

    // Log controls
    private _maxLogLines: number = 100;
    private logFilter: 'all' | 'info' | 'warn' | 'error' = 'all';
    private logSearchQuery: string = '';

    // Modal state
    private currentModal: blessed.Widgets.Box | null = null;
    private modalOverlay: blessed.Widgets.Box | null = null;

    // Chart controls
    private chartZoom: number = 1;
    private chartScroll: number = 0;
    private chartHistorySize: number = 60;

    constructor(core: MonitorCore) {
        this.core = core;
        this.theme = themes['terminal-green'] ?? themes['matrix'] ?? {
            name: 'Default',
            colors: { fg: '#00ff00', bg: '#000000', border: '#00ff00', success: '#00ff00', warning: '#ffaa00', error: '#ff0000', info: '#00ffff' }
        };

        // Create screen
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'TX Server Monitor',
            fullUnicode: true,
            autoPadding: true
        });

        // Check minimum terminal size to prevent blessed-contrib crash
        const termWidth = (this.screen as any).width || process.stdout.columns || 80;
        const termHeight = (this.screen as any).height || process.stdout.rows || 24;

        if (termWidth < 100 || termHeight < 30) {
            console.error('\n╔═══════════════════════════════════════════════════════════════╗');
            console.error('║  ОШИБКА: Окно терминала слишком маленькое!                    ║');
            console.error('║                                                               ║');
            console.error(`║  Текущий размер: ${termWidth}x${termHeight}`.padEnd(64) + '║');
            console.error('║  Минимальный размер: 100x30                                   ║');
            console.error('║                                                               ║');
            console.error('║  Пожалуйста, увеличьте окно терминала и попробуйте снова.    ║');
            console.error('║  Или используйте: npm run dev (без dashboard)                ║');
            console.error('╚═══════════════════════════════════════════════════════════════╝\n');
            process.exit(1);
        }

        // Create grid layout (12 rows, 12 cols)
        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        // Initialize UI
        this.setupUI();
        this.setupKeyboard();

        // Start update loop
        this.startUpdateLoop();
    }

    private startUpdateLoop(): void {
        setInterval(() => {
            this.update(this.core.getMetricsManager().getCurrentMetrics());
        }, 1000);
    }

    public getHeaderContent(): string {
        const title = '{bold}TX SERVER MONITOR{/bold}';
        const time = new Date().toLocaleTimeString();
        return `${title} | ${time}`;
    }

    public update(metrics: MetricsSnapshot | null): void {
        if (!metrics) return;

        // Update header
        if (this.headerBox) {
            this.headerBox.setContent(this.getHeaderContent());
        }

        // Update status - use systemStatus.server
        if (this.statusBox) {
            const status = metrics.systemStatus.server.online ? '{green-fg}ONLINE{/}' : '{red-fg}OFFLINE{/}';
            const uptimeMs = metrics.systemStatus.server.uptime || 0; // Already in milliseconds from server
            this.statusBox.setContent(`Status: ${status}\nUptime: ${this.formatUptimeMs(uptimeMs)}`);
        }

        // Update performance - use performance.cpu/ram
        if (this.performanceBox) {
            this.performanceBox.setContent(
                `CPU: ${this.createProgressBar(metrics.performance.cpu.usage, 100, 15)} ${metrics.performance.cpu.usage.toFixed(1)}%\n` +
                `RAM: ${this.createProgressBar(metrics.performance.ram.percent, 100, 15)} ${this.formatBytes(metrics.performance.ram.used)}`
            );
        }

        // Update connections
        if (this.connectionsBox) {
            this.connectionsBox.setContent(
                `Players: ${metrics.connections.players}\n` +
                `Rooms: ${metrics.connections.rooms}\n` +
                `Ping: ${metrics.connections.avgPing > 0 ? metrics.connections.avgPing.toFixed(0) + 'ms' : 'N/A'}`
            );
        }

        // Update charts with progress bars (same style as PERFORMANCE block)
        const history = this.core.getHistoryManager().getLatest(this.chartHistorySize);
        if (history.length > 0) {
            const cpuValue = history[history.length - 1]?.performance?.cpu?.usage ?? 0;
            const ramValue = history[history.length - 1]?.performance?.ram?.percent ?? 0;
            const fpsValue = history[history.length - 1]?.performance?.clientFps ?? 0;

            // Progress bar style like PERFORMANCE block
            if (this._cpuChart) {
                this._cpuChart.setContent(
                    `${this.createProgressBar(cpuValue, 100, 30)} ${cpuValue.toFixed(1)}%`
                );
            }
            if (this._ramChart) {
                this._ramChart.setContent(
                    `${this.createProgressBar(ramValue, 100, 30)} ${ramValue.toFixed(1)}%`
                );
            }
            if (this._fpsChart) {
                const maxFps = 120; // Assume 120 FPS max for scale
                this._fpsChart.setContent(
                    `${this.createProgressBar(fpsValue, maxFps, 30)} ${Math.round(fpsValue)}`
                );
            }
        } else {
            // Initialize with zeros
            if (this._cpuChart) this._cpuChart.setContent(`${this.createProgressBar(0, 100, 30)} 0%`);
            if (this._ramChart) this._ramChart.setContent(`${this.createProgressBar(0, 100, 30)} 0%`);
            if (this._fpsChart) this._fpsChart.setContent(`${this.createProgressBar(0, 120, 30)} 0`);
        }

        // Render
        this.screen.render();
    }

    public handleAlert(alert: Alert): void {
        const color = alert.severity === 'error' ? '{red-fg}' : alert.severity === 'warning' ? '{yellow-fg}' : '{green-fg}';
        this.addLog(`${color}[ALERT]{/} ${alert.message}`, alert.severity === 'error' ? 'error' : alert.severity === 'warning' ? 'warn' : 'info');
    }

    private setupUI(): void {
        // ... (Header to Game State remains same System Status row 1-2 etc) ...
        // Header (row 0, full width)
        this.headerBox = this.grid.set(0, 0, 1, 12, blessed.box, {
            content: this.getHeaderContent(),
            tags: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // System Status (row 1-2, col 0-3)
        this.statusBox = this.grid.set(1, 0, 2, 3, blessed.box, {
            label: ' SYSTEM STATUS ',
            tags: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Performance (row 1-2, col 3-6)
        this.performanceBox = this.grid.set(1, 3, 2, 3, blessed.box, {
            label: ' PERFORMANCE ',
            tags: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Connections (row 1-2, col 6-9)
        this.connectionsBox = this.grid.set(1, 6, 2, 3, blessed.box, {
            label: ' CONNECTIONS ',
            tags: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Alerts (row 1-2, col 9-12)
        this.alertsBox = this.grid.set(1, 9, 2, 3, blessed.box, {
            label: ' ALERTS ',
            tags: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Resources (row 3-4, full width)
        this.resourcesBox = this.grid.set(3, 0, 2, 12, blessed.box, {
            label: ' RESOURCES ',
            tags: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Game State (row 5-6, full width)
        this.gameStateBox = this.grid.set(5, 0, 2, 12, blessed.box, {
            label: ' GAME STATE ',
            tags: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Charts (Row 7-8) - Using simple boxes with ASCII sparklines for compatibility
        this._cpuChart = this.grid.set(7, 0, 2, 4, blessed.box, {
            label: ' CPU % ',
            tags: true,
            style: { fg: this.theme.colors.success, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        this._ramChart = this.grid.set(7, 4, 2, 4, blessed.box, {
            label: ' RAM % ',
            tags: true,
            style: { fg: 'cyan', bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        this._fpsChart = this.grid.set(7, 8, 2, 4, blessed.box, {
            label: ' FPS ',
            tags: true,
            style: { fg: 'yellow', bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Logs Area (Row 9-11) - SPLIT INTO 3

        // Server Logs (Left)
        this.serverLogsBox = this.grid.set(9, 0, 2, 4, blessed.box, {
            label: ' SERVER LOGS ',
            tags: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', inverse: true },
            keys: true, vi: true, mouse: true,
            wrap: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // Client Logs (Middle)
        this.clientLogsBox = this.grid.set(9, 4, 2, 4, blessed.box, {
            label: ' CLIENT LOGS ',
            tags: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', inverse: true },
            keys: true, vi: true, mouse: true,
            wrap: true,
            style: { fg: 'cyan', bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
        });

        // System Logs (Right)
        this.logsBox = this.grid.set(9, 8, 2, 4, blessed.box, {
            label: ' SYSTEM LOGS ',
            tags: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', inverse: true },
            keys: true, vi: true, mouse: true,
            wrap: true,
            style: { fg: this.theme.colors.fg, bg: this.theme.colors.bg, border: { fg: this.theme.colors.border } },
            border: { type: 'line' }
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

    addServerLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        if (!this.serverLogsBox) return;
        this.addLogToBox(this.serverLogsBox, this.serverLogLines, message, level, 'SERVER');
    }

    addClientLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        if (!this.clientLogsBox) return;
        this.addLogToBox(this.clientLogsBox, this.clientLogLines, message, level, 'CLIENT');
    }

    private addLogToBox(box: blessed.Widgets.Box, lines: any[], message: string, level: string, prefixLabel: string): void {
        const timestamp = new Date().toLocaleTimeString();
        lines.push({ line: message, level, timestamp });
        if (lines.length > this._maxLogLines) lines.shift();

        // Basic rendering
        const formatted = lines.slice(-20).map(l => {
            const color = l.level === 'error' ? '{red-fg}' : l.level === 'warn' ? '{yellow-fg}' : '{green-fg}';
            const cleanLine = this.cleanLogLine(l.line);
            return `${color}${l.timestamp} ${cleanLine}{/}`;
        }).join('\n');

        box.setContent(formatted);
        this.screen.render();
    }

    addLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        // Use existing addLog logic but only update logsBox
        // ... existing implementation adapted ...
        if (!this.logsBox) return;
        const timestamp = new Date().toLocaleTimeString();
        this._logLines.push({ line: message, level, timestamp });
        if (this._logLines.length > this._maxLogLines) this._logLines.shift();
        this.updateLogsDisplay();
    }

    private cleanLogLine(line: string): string {
        // Remove ANSI codes for blessed compatibility (since we use tags)
        // eslint-disable-next-line no-control-regex
        const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
        let clean = line.replace(ansiRegex, '');

        // Replace common emojis that might break TUI on some terminals
        clean = clean
            .replace(/📦/g, '[PKG]')
            .replace(/🚀/g, '[LAU]')
            .replace(/✅/g, '[OK]')
            .replace(/❌/g, '[ERR]')
            .replace(/⚠️/g, '[WARN]')
            .replace(/➜/g, '>')
            .replace(/✔/g, 'v')
            .replace(/ℹ/g, 'i')
            .replace(/👤/g, '[USER]')
            .replace(/💀/g, '[KILL]')
            .replace(/🎮/g, '[GAME]')
            .replace(/⚔/g, '[FIGHT]'); // ⚔️ without selector

        // Strip any remaining non-printable/weird wide chars that aren't Cyrillic or Basic Latin
        // This regex preserves Cyrillic (\u0400-\u04FF), Basic Latin, and some punctuation.
        // It aggressively replaces everything else with an empty string to ensure a clean layout.
        // eslint-disable-next-line no-control-regex
        clean = clean.replace(/[^\x00-\x7F\u0400-\u04FF\u00A0-\u00FF\s]/g, ''); // Quietly remove unknown rubbish

        return clean;
    }

    private updateLogsDisplay(): void {
        if (!this.logsBox || typeof this.logsBox.setContent !== 'function') return;

        // Filter logs
        let filtered = this._logLines;
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
            // Clean the line to prevent rendering glitches
            const cleanLine = this.cleanLogLine(log.line);
            return `${colorTag}${log.timestamp} ${prefix}{/} ${cleanLine}`;
        });

        const filterLabel = this.logFilter === 'all' ? 'ALL' : this.logFilter.toUpperCase();
        const searchLabel = this.logSearchQuery ? ` | Search: "${this.logSearchQuery}"` : '';
        this.logsBox.setLabel(` SYSTEM LOGS [${filterLabel}]${searchLabel} `);
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
        this._logLines = [];
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _serverCollector = (this.core.getMetricsManager() as any).serverCollector; void _serverCollector;
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

    private formatUptimeMs(ms: number): string {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
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
        // Use Unicode block characters for proper visual display
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    private createSparkline(data: number[]): string {
        if (data.length === 0) return '';

        // Use solid block characters for a cleaner progress bar look
        const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;

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

