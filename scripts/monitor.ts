#!/usr/bin/env node
/**
 * Protocol TX System Monitor
 * Терминальный дашборд мониторинга всех систем проекта
 */

import { MonitorCore } from './monitor/core';
import { UIManager } from './monitor/ui';
import { ExportManager } from './monitor/export';

async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let configPath: string | undefined;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--config' && i + 1 < args.length) {
            configPath = args[i + 1];
            i++;
        }
    }
    
    // Initialize core
    const core = new MonitorCore(configPath);
    
    // Initialize UI
    const ui = new UIManager(core);
    
    // Initialize export manager
    const exportPath = core.getConfig().export.defaultPath;
    const exportManager = new ExportManager(exportPath);
    
    // Start core
    await core.start();
    
    // Initial log
    ui.addLog('Monitor started', 'info');
    ui.addLog('Connecting to server...', 'info');
    
    // Start update loop (metrics are collected by core's update loop)
    const updateInterval = setInterval(() => {
        try {
            // Get current metrics (already collected by core)
            const metrics = core.getMetricsManager().getCurrentMetrics();
            
            if (!metrics) {
                // Still collecting, skip this update
                return;
            }
            
            // Get alerts
            const alerts = core.getAlertManager().getActiveAlerts();
            
            // Update UI
            ui.update(metrics, alerts);
            
            // Log connection status changes
            const serverOnline = metrics.systemStatus.server.online;
            const lastServerStatus = (ui as any).lastServerStatus;
            if (lastServerStatus !== undefined && lastServerStatus !== serverOnline) {
                if (serverOnline) {
                    ui.addLog('Server connected', 'info');
                } else {
                    ui.addLog('Server disconnected', 'warn');
                }
            }
            (ui as any).lastServerStatus = serverOnline;
            
        } catch (error) {
            console.error('[Monitor] Error in UI update loop:', error);
            try {
                ui.addLog(`Error: ${error}`, 'error');
            } catch (e) {
                // UI might not be ready yet
            }
        }
    }, core.getConfig().updateInterval);
    
    // Handle export on F3
    const screen = ui.getScreen();
    screen.key(['f3'], async () => {
        try {
            const metrics = await core.getMetricsManager().collectMetrics();
            const alerts = core.getAlertManager().getAlertHistory();
            const historyManager = core.getHistoryManager();
            
            const filepath = await exportManager.exportMetrics(
                metrics,
                historyManager,
                alerts,
                {
                    format: core.getConfig().export.defaultFormat as any,
                    outputPath: exportPath,
                    includeHistory: true,
                    includeAlerts: true
                }
            );
            
            ui.addLog(`Exported to: ${filepath}`, 'info');
        } catch (error) {
            ui.addLog(`Export failed: ${error}`, 'error');
        }
    });
    
    // Initial log
    ui.addLog('Monitor started', 'info');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        clearInterval(updateInterval);
        await core.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        clearInterval(updateInterval);
        await core.stop();
        process.exit(0);
    });
}

// Run
main().catch(error => {
    console.error('[Monitor] Fatal error:', error);
    process.exit(1);
});

