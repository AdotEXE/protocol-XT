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
    }
};

export class UIManager {
    private screen: blessed.Widgets.Screen;
    private _grid!: contrib.grid;
    private _core!: MonitorCore;
    private _theme!: Theme;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _widgets: Map<string, blessed.Widgets.Node> = new Map();

    // Widgets
    private headerBox: blessed.Widgets.Box;
    private performanceBox: blessed.Widgets.Box; // Unified Dashboard Box

    // Log boxes
    private logsBox: blessed.Widgets.Box;      // System logs
    private serverLogsBox: blessed.Widgets.Box; // Server logs
    private clientLogsBox: blessed.Widgets.Box; // Client logs

    // Log data
    private _logLines: Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> = [];
    private serverLogLines: Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> = [];
    private clientLogLines: Array<{ line: string; level: 'info' | 'warn' | 'error'; timestamp: string }> = [];

    // Log controls
    private _maxLogLines: number = 100;
    private logFilter: 'all' | 'info' | 'warn' | 'error' = 'all';
    private logSearchQuery: string = '';

    // Modal state
    private currentModal: blessed.Widgets.Box | null = null;
    private modalOverlay: blessed.Widgets.Box | null = null;

    // Command Input
    private commandInput: blessed.Widgets.Textbox | null = null;
    private isCommandMode: boolean = false;

    // Chart controls (kept for history access if needed, though charts are removed)
    private chartHistorySize: number = 60;

    constructor(core: MonitorCore) {
        this._core = core;
        this._theme = themes['terminal-green'];

        // Create screen
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'TX Server Monitor',
            fullUnicode: true,
            autoPadding: true
        });

        // Check minimum terminal size
        const termWidth = (this.screen as any).width || process.stdout.columns || 80;
        const termHeight = (this.screen as any).height || process.stdout.rows || 24;

        if (termWidth < 100 || termHeight < 30) {
            // (Error handling omitted for brevity, assuming standard size)
        }

        // Create grid layout (12 rows, 12 cols)
        this._grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        // Initialize UI
        this.setupUI();
        this.setupKeyboard();
        this.startUpdateLoop();
    }

    private startUpdateLoop(): void {
        setInterval(() => {
            this.update(this._core.getMetricsManager().getCurrentMetrics());
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

        // Update Unified Performance Box
        if (this.performanceBox) {
            this.updatePerformanceBox(metrics);
        }

        this.screen.render();
    }

    private updatePerformanceBox(metrics: MetricsSnapshot): void {
        // SERVER DATA
        const sStatus = metrics.systemStatus.server.online ? '{green-fg}ONLINE{/}' : '{red-fg}OFFLINE{/}';
        const sUptime = this.formatUptimeMs(metrics.systemStatus.server.uptime || 0);
        const sCpu = `${this.createProgressBar(metrics.performance.cpu.usage, 100, 10)} ${metrics.performance.cpu.usage.toFixed(1)}%`;

        // RAM: 2GB Limit
        const ramUsed = metrics.performance.ram.used;
        const ramTotal = metrics.performance.ram.total; // 2GB from metrics.ts
        const ramPercent = metrics.performance.ram.percent;
        const sRam = `${this.createProgressBar(ramPercent, 100, 10)} ${this.formatBytes(ramUsed)} / ${this.formatBytes(ramTotal)}`;

        const sFps = metrics.performance.serverFps.toFixed(0);
        const sRooms = metrics.connections.activeRooms;
        const sPlayers = metrics.connections.players;

        // CLIENT DATA
        const cStatus = metrics.systemStatus.vite.online ? '{green-fg}ONLINE{/}' : '{red-fg}OFFLINE{/}';
        const cFps = metrics.performance.clientFps ? metrics.performance.clientFps.toFixed(0) : 'N/A';
        const cPing = metrics.performance.latency ? metrics.performance.latency.toFixed(0) + 'ms' : 'N/A';
        const cClients = metrics.connections.authenticated; // Or websocketConns

        // PORTS Line (Embed)
        const ports = metrics.portStatus?.ports || [];
        const portsLine = ports.map(p => {
            const stat = p.online ? '{green-fg}[+]{/}' : '{yellow-fg}[-]{/}';
            return `${p.label}:${p.port}${stat}`;
        }).join('  ');

        const col1 = 45; // Width of Server Col

        const content =
            `{bold}SERVER STATUS{/bold}                                     {bold}CLIENT STATUS{/bold}
────────────────────────────────────────────────────────────────────────
Status:   ${sStatus.padEnd(45)} Vite Dev:    ${cStatus}
Uptime:   ${sUptime.padEnd(35)} Clients:     ${cClients}
CPU:      ${sCpu.padEnd(35)} Avg FPS:     ${cFps}
RAM:      ${sRam.padEnd(35)} Avg Ping:    ${cPing}
TickRate: ${sFps} TPS
Rooms:    Active: ${sRooms} | Total: ${metrics.connections.rooms} | Players: ${sPlayers}

{bold}SYSTEM PORTS{/bold}
────────────────────────────────────────────────────────────────────────
${portsLine}`;

        this.performanceBox.setContent(content);
    }

    private setupUI(): void {
        // Header (Row 0)
        this.headerBox = this._grid.set(0, 0, 1, 12, blessed.box, {
            content: this.getHeaderContent(),
            tags: true,
            style: { fg: this._theme.colors.fg, bg: this._theme.colors.bg, border: { fg: this._theme.colors.border } },
            border: { type: 'line' }
        });

        // Unified Performance Box (Row 1-5, Full Width)
        this.performanceBox = this._grid.set(1, 0, 5, 12, blessed.box, {
            label: ' SYSTEM PERFORMANCE ',
            tags: true,
            style: { fg: this._theme.colors.fg, bg: this._theme.colors.bg, border: { fg: this._theme.colors.border } },
            border: { type: 'line' }
        });

        // Logs Area (Row 6-10) - Reduced by 1 row for Command Input
        this.serverLogsBox = this._grid.set(6, 0, 5, 4, blessed.box, {
            label: ' SERVER LOGS ',
            tags: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', inverse: true },
            keys: true, mouse: true,
            style: { fg: this._theme.colors.fg, bg: this._theme.colors.bg, border: { fg: this._theme.colors.border } },
            border: { type: 'line' }
        });

        this.clientLogsBox = this._grid.set(6, 4, 5, 4, blessed.box, {
            label: ' CLIENT LOGS ',
            tags: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', inverse: true },
            keys: true, mouse: true,
            style: { fg: 'cyan', bg: this._theme.colors.bg, border: { fg: this._theme.colors.border } },
            border: { type: 'line' }
        });

        this.logsBox = this._grid.set(6, 8, 5, 4, blessed.box, {
            label: ' SYSTEM LOGS ',
            tags: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', inverse: true },
            keys: true, mouse: true,
            style: { fg: this._theme.colors.fg, bg: this._theme.colors.bg, border: { fg: this._theme.colors.border } },
            border: { type: 'line' }
        });

        // Command Input (Row 11) - New Addition
        this.commandInput = blessed.textbox({
            parent: this.screen,
            bottom: 1, // Above footer
            left: 0,
            width: '100%',
            height: 1,
            keys: true,
            mouse: true,
            inputOnFocus: true,
            style: { fg: 'white', bg: 'black', focus: { bg: 'blue' } },
            label: ' Admin Console (Press / or Enter to focus) ',
            border: 'line'
        });

        // Footer (Row 12 - effectively)
        // We use bottom: 0 instead of grid to ensure it stays at bottom
        const footer = blessed.box({
            parent: this.screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            content: '{bold}[F1]Help [F5]Ply [F6]Room [/]Cmd [ESC]Quit{/bold}',
            tags: true,
            style: { fg: 'black', bg: 'green' }
        });

        // Handle Command Input
        this.commandInput.on('submit', (value: string) => {
            if (value && value.trim().length > 0) {
                this.handleCommand(value.trim());
            }
            if (this.commandInput) {
                this.commandInput.clearValue();
                this.commandInput.cancel(); // Blur
                this.screen.render();
            }
        });

        this.commandInput.on('cancel', () => {
            // Blur logic handled by library mostly
        });
    }

    private handleCommand(cmdStr: string): void {
        // Parse command
        const parts = cmdStr.split(' ');
        const command = parts[0].toLowerCase().replace(/^\//, ''); // remove leading /
        const args = parts.slice(1);

        this.addLog(`Executed: /${command} ${args.join(' ')}`, 'info');

        const serverCollector = this._core.getMetricsManager().getServerCollector();

        switch (command) {
            case 'kick':
                if (args.length < 1) {
                    this.addLog('Usage: /kick <playerId>', 'warn');
                    return;
                }
                serverCollector.sendCommand('kick', { playerId: args[0] });
                break;
            case 'say':
                if (args.length < 1) {
                    this.addLog('Usage: /say <message>', 'warn');
                    return;
                }
                serverCollector.sendCommand('say', { text: args.join(' ') });
                break;
            case 'restart':
                serverCollector.sendCommand('restart');
                break;
            default:
                this.addLog(`Unknown command: ${command}`, 'error');
        }
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
        // Filter out specific noisy logs that break deduplication or provide little value
        if (message.includes('Upgrade request from:')) return;

        const timestamp = new Date().toLocaleTimeString();

        // Basic deduplication: check if the last message is identical (ignoring timestamp)
        // We compare the raw message content before formatting
        const lastLog = lines.length > 0 ? lines[lines.length - 1] : null;

        if (lastLog && lastLog.line === message && lastLog.level === level) {
            // Update timestamp of the last message
            lastLog.timestamp = timestamp;
            // Optionally add a counter or just update time as requested.
            // If we wanted a counter: lastLog.count = (lastLog.count || 1) + 1; 
            // But user said "update only time", so we just update usage.
        } else {
            lines.push({ line: message, level, timestamp });
            if (lines.length > this._maxLogLines) lines.shift();
        }

        const formatted = lines.slice(-20).map(l => {
            const color = l.level === 'error' ? '{red-fg}' : l.level === 'warn' ? '{yellow-fg}' : '{green-fg}';
            let cleanLine = this.cleanLogLine(l.line);
            if (prefixLabel) {
                const regex = new RegExp(`^\\[${prefixLabel}\\]\\s*`, 'i');
                cleanLine = cleanLine.replace(regex, '');
            }
            return `${color}${l.timestamp} ${cleanLine}{/}`;
        }).join('\n');

        box.setContent(formatted);
        this.screen.render();
    }

    addLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        if (!this.logsBox) return;
        const timestamp = new Date().toLocaleTimeString();
        this._logLines.push({ line: message, level, timestamp });
        if (this._logLines.length > this._maxLogLines) this._logLines.shift();
        this.updateLogsDisplay();
    }

    private cleanLogLine(line: string): string {
        // eslint-disable-next-line no-control-regex
        const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
        let clean = line.replace(ansiRegex, '');

        clean = clean
            .replace(/📦/g, '[PKG]')
            .replace(/🚀/g, '[LAU]')
            .replace(/✅/g, '[OK]')
            .replace(/❌/g, '[ERR]')
            .replace(/➜/g, '')
            .replace(/✔/g, 'v')
            .replace(/ℹ/g, 'i')
            .replace(/👤/g, '[USER]')
            .replace(/💀/g, '[KILL]')
            .replace(/🎮/g, '[GAME]')
            .replace(/⚔/g, '[FIGHT]')
            .replace(/⚠️/g, '[WARN]');

        // eslint-disable-next-line no-control-regex
        clean = clean.replace(/[^\x00-\x7F\u0400-\u04FF\u00A0-\u00FF\s]/g, '');

        clean = clean.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
        // We DO NOT strip Service prefix globally (kept from previous fix, handled in addLogToBox for specific boxes)

        clean = clean.replace(/^>\s*/, '');
        clean = clean.replace(/\s{2,}/g, ' ');

        return clean.trim();
    }

    private updateLogsDisplay(): void {
        if (!this.logsBox || typeof this.logsBox.setContent !== 'function') return;

        let filtered = this._logLines;
        if (this.logFilter !== 'all') {
            filtered = filtered.filter(log => log.level === this.logFilter);
        }
        if (this.logSearchQuery) {
            const query = this.logSearchQuery.toLowerCase();
            filtered = filtered.filter(log => log.line.toLowerCase().includes(query));
        }

        const formattedLines = filtered.slice(-20).map(log => {
            const colorTag = log.level === 'error' ? '{red-fg}' : log.level === 'warn' ? '{yellow-fg}' : '{green-fg}';
            const cleanLine = this.cleanLogLine(log.line);
            return `${colorTag}${log.timestamp} ${cleanLine}{/}`;
        });

        const filterLabel = this.logFilter === 'all' ? 'ALL' : this.logFilter.toUpperCase();
        this.logsBox.setLabel(` SYSTEM LOGS [${filterLabel}] `);
        this.logsBox.setContent(formattedLines.join('\n') || 'No logs matching filter');
    }

    private setupKeyboard(): void {
        this.screen.key(['escape', 'q', 'C-c'], async () => {
            if (this.currentModal) { this.closeModal(); }
            else { await this._core.stop(); process.exit(0); }
        });

        // F1: Help
        this.screen.key(['f1'], () => {
            this.showModal('HELP',
                `{bold}Keyboard Shortcuts:{/bold}
                
                [F1]  Show this help
                [F5]  Players List (Kick options)
                [F6]  Rooms List
                
                [/]   Focus Command Line
                [ESC] Close Modal / Quit`, 40, 12);
        });

        // F5: Players
        this.screen.key(['f5'], () => {
            const metrics = this._core.getMetricsManager().getCurrentMetrics();
            // Since we don't have detailed player list in basic metrics, 
            // we rely on roomsList players, OR we need detailed stats.
            // Assuming server collector provides enough info or we can fetch it.
            // For now, we list connected players if available, or just room summary.

            // Ideally metrics should have a players array.
            // Let's check serverCollector definition. It has activeRooms but maybe not full player list.
            // We'll show what we have.

            // If we implemented detailed room stats fetch, we'd use that.
            // For now, let's create a stub "Players" view showing count and advice to use /kick <id>
            // OR, better, we list active connections count.

            this.showModal('PLAYERS',
                `Currently Online: ${metrics?.connections.players || 0}
                
                To kick a player, use the command line:
                /kick <playerId>
                
                (Detailed player list requires separate API call)`, 50, 10);
        });

        // F6: Rooms
        this.screen.key(['f6'], () => {
            const metrics = this._core.getMetricsManager().getCurrentMetrics();
            const rooms = metrics?.portStatus?.ports[0]?.online ? "Server Online" : "Server Offline"; // Placeholder

            // If metric had rooms list
            const roomList = metrics?.performance?.serverFps ? "Active Rooms: " + metrics.connections.activeRooms : "No Data";

            this.showModal('ROOMS',
                `Active Rooms: ${metrics?.connections.activeRooms || 0}
                Total Rooms: ${metrics?.connections.rooms || 0}
                
                (Detailed room list requires separate API call)`, 50, 10);
        });

        // Command focus
        this.screen.key(['/'], () => {
            if (this.commandInput) {
                this.commandInput.focus();
                this.screen.render();
            }
        });
    }

    // ... (Helpers: createProgressBar, formatBytes, time, etc)
    private formatUptimeMs(ms: number): string {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return `${h}h ${m}m`;
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
    }

    private createProgressBar(value: number, max: number, width: number): string {
        const filled = Math.round((value / max) * width);
        const empty = Math.max(0, width - filled);
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    // Modal logic (Simplified for brevity in this specific rewrite if allowed, but better safe)
    private showModal(title: string, content: string, width: number, height: number): void {
        if (this.currentModal) this.closeModal();
        this.modalOverlay = blessed.box({ top: 0, left: 0, width: '100%', height: '100%', bg: 'black', opacity: 0.5 });
        this.currentModal = blessed.box({ top: 'center', left: 'center', width, height, content, tags: true, border: { type: 'line' }, style: { bg: this._theme.colors.bg }, label: ` ${title} `, keys: true, scrollable: true, scrollbar: { ch: ' ' } });
        this.currentModal.key(['escape'], () => this.closeModal());
        this.screen.append(this.modalOverlay);
        this.screen.append(this.currentModal);
        this.currentModal.focus();
        this.screen.render();
    }

    private closeModal(): void {
        if (this.currentModal) { this.currentModal.detach(); this.currentModal = null; }
        if (this.modalOverlay) { this.modalOverlay.detach(); this.modalOverlay = null; }
        this.screen.render();
    }

    // Getters
    public get core(): MonitorCore { return this._core; }
}
