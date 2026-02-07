#!/usr/bin/env node
/**
 * Protocol TX System Monitor
 * Терминальный дашборд мониторинга всех систем проекта
 * При запуске автоматически открывает все 4 окна терминала одновременно
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MonitorCore } from './monitor/core';
import { ExportManager } from './monitor/export';
import { UIManager } from './monitor/ui';

async function positionWindow(processId: number, position: { x: number; y: number }): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const isWindows = process.platform === 'win32';

        if (!isWindows) {
            resolve(true);
            return;
        }

        const posScriptPath = path.join(process.cwd(), `.window_pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.ps1`);
        const posScriptContent = `param($targetPid, $x, $y)
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public static readonly IntPtr HWND_TOP = IntPtr.Zero;
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_SHOWWINDOW = 0x0040;
    public const int SW_RESTORE = 9;
}
"@;
Add-Type -TypeDefinition $code -ErrorAction Stop;
$positioned = $false;
for ($i = 0; $i -lt 100; $i++) {
    Start-Sleep -Milliseconds 10;
    if ($positioned) {
        Write-Host "POSITIONED"
        exit 0
    }
    try {
        $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue;
        if ($proc) {
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                $handle = $proc.MainWindowHandle;
                if (-not [Win32]::IsWindowVisible($handle)) {
                    [Win32]::ShowWindow($handle, [Win32]::SW_RESTORE) | Out-Null;
                    Start-Sleep -Milliseconds 5;
                }
                $result = [Win32]::SetWindowPos($handle, [Win32]::HWND_TOP, $x, $y, 0, 0, [Win32]::SWP_NOSIZE -bor [Win32]::SWP_SHOWWINDOW);
                if ($result) {
                    $positioned = $true
                    Write-Host "POSITIONED"
                    exit 0
                }
            }

            $foundHandle = [IntPtr]::Zero;
            $callback = [Win32+EnumWindowsProc]{
                param($hWnd, $lParam)
                if (-not [Win32]::IsWindowVisible($hWnd)) { return $true }
                try {
                    $pid = 0;
                    [Win32]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null;
                    if ($pid -eq $targetPid) {
                        $script:foundHandle = $hWnd;
                        return $false
                    }
                } catch {}
                return $true
            };
            [Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null;
            if ($foundHandle -ne [IntPtr]::Zero) {
                $result = [Win32]::SetWindowPos($foundHandle, [Win32]::HWND_TOP, $x, $y, 0, 0, [Win32]::SWP_NOSIZE -bor [Win32]::SWP_SHOWWINDOW);
                if ($result) {
                    $positioned = $true
                    Write-Host "POSITIONED"
                    exit 0
                }
            }
        }
    } catch {}
}
Write-Host "FAILED"`;

        try {
            fs.writeFileSync(posScriptPath, posScriptContent, 'utf8');
        } catch (e) {
            resolve(false);
            return;
        }

        const escapedScriptPath = posScriptPath.replace(/\\/g, '\\\\');
        const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${escapedScriptPath}" -targetPid ${processId} -x ${position.x} -y ${position.y}`;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        exec(psCommand, (_error, stdout, _stderr) => {
            try {
                fs.unlinkSync(posScriptPath);
            } catch (e) {
                // Ignore
            }

            if (stdout && stdout.toString().includes('POSITIONED')) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

async function startInNewWindow(title: string, command: string, workingDir: string, position?: { x: number; y: number }) {
    return new Promise<void>(async (resolve, reject) => {
        const isWindows = process.platform === 'win32';

        if (isWindows) {
            const batFilePath = path.join(workingDir, `.start_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.bat`);
            const batContent = `@echo off
chcp 65001 >nul
cd /d "${workingDir.replace(/"/g, '""')}"
${command}
`;

            try {
                fs.writeFileSync(batFilePath, batContent, 'utf8');
            } catch (e) {
                reject(e);
                return;
            }

            const escapedBatPath = batFilePath.replace(/\\/g, '\\\\').replace(/'/g, "''");
            const psScript = `$proc = Start-Process cmd -ArgumentList '/k', '${escapedBatPath}' -PassThru -WindowStyle Normal; [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null; $proc.MainWindowTitle = '${title.replace(/'/g, "''")}'; Start-Sleep -Milliseconds 10; $allCmds = Get-Process -Name cmd -ErrorAction SilentlyContinue | Where-Object { $_.Id -ge $proc.Id } | Sort-Object Id; if ($allCmds) { $procId = $allCmds[0].Id; Write-Host $procId } else { Write-Host $proc.Id }`;

            exec(`powershell -NoProfile -Command "${psScript}"`, async (error, stdout) => {
                setTimeout(() => {
                    try {
                        fs.unlinkSync(batFilePath);
                    } catch (e) {
                        // Ignore
                    }
                }, 5000);
                if (error) {
                    reject(error);
                    return;
                }

                if (position && stdout) {
                    const processId = parseInt(stdout.toString().trim());
                    if (!isNaN(processId)) {
                        await positionWindow(processId, position);
                    }
                }

                resolve();
            });
        } else {
            const termCmd = process.env.TERM || 'xterm';
            const fullCommand = `cd "${workingDir}" && ${command}`;
            const geoOption = position ? ` -geometry +${position.x}+${position.y}` : '';
            exec(`${termCmd}${geoOption} -e bash -c "${fullCommand}; exec bash"`, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        }
    });
}

async function launchAllWindows(): Promise<void> {
    const workingDir = process.cwd();
    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    // Get screen resolution
    let monitorWidth = 1920;
    let monitorHeight = 1080;

    if (isWindows) {
        try {
            const screenInfo = await new Promise<string>((resolve) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                exec(`powershell -NoProfile -Command "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height"`, (_error, stdout) => {
                    resolve(stdout || '');
                });
            });
            const lines = screenInfo.trim().split('\n');
            if (lines.length >= 2 && lines[0] && lines[1]) {
                monitorWidth = parseInt(lines[0].trim()) || 1920;
                monitorHeight = parseInt(lines[1].trim()) || 1080;
            }
        } catch (e) {
            // Use defaults
        }
    }

    // Calculate window dimensions for 2x2 grid (4 windows)
    const windowWidth = Math.floor(monitorWidth / 2);
    const windowHeight = Math.floor(monitorHeight / 2);

    const positions = {
        topLeft: { x: 0, y: 0 },                                    // Мониторинг (уже запущен)
        topRight: { x: windowWidth, y: 0 },                        // Сервер
        bottomLeft: { x: 0, y: windowHeight },                     // Клиент
        bottomRight: { x: windowWidth, y: windowHeight }           // Системные логи
    };

    // Position current monitoring window (top left)
    if (isWindows) {
        try {
            const currentPid = process.pid;
            await positionWindow(currentPid, positions.topLeft);
        } catch (e) {
            // Ignore positioning errors for current window
        }
    }

    // Launch all 3 remaining windows simultaneously (monitoring is already running)
    const launchPromises = [
        startInNewWindow(
            'Protocol TX - Server (port 8000)',
            `${npmCmd} run server:dev`,
            workingDir,
            positions.topRight
        ),
        startInNewWindow(
            'Protocol TX - Client (Vite, port 5001)',
            `${npmCmd} run dev`,
            workingDir,
            positions.bottomLeft
        ),
        startInNewWindow(
            'Protocol TX - System Logs',
            `${npmCmd} run system:logs`,
            workingDir,
            positions.bottomRight
        )
    ];

    // Wait for all windows to launch
    await Promise.all(launchPromises);
}

async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let configPath: string | undefined;
    let skipLaunch = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--config' && i + 1 < args.length) {
            configPath = args[i + 1];
            i++;
        } else if (args[i] === '--no-launch') {
            skipLaunch = true;
        }
    }

    // Launch all windows simultaneously before starting monitoring
    if (!skipLaunch) {
        console.log('🚀 Запуск всех окон терминала...\n');
        try {
            await launchAllWindows();
            console.log('✅ Все окна запущены!\n');
        } catch (error) {
            console.error('⚠️  Ошибка при запуске окон:', error);
            console.log('Продолжаем работу мониторинга...\n');
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
            ui.update(metrics);

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

