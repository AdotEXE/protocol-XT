#!/usr/bin/env node
/**
 * Restart All Systems
 * Завершает все связанные процессы и запускает все системы проекта в отдельных окнах терминала:
 * 1. Сервер
 * 2. Мониторинг
 * 3. Клиент
 */

import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import WebSocket from 'ws';

async function closeOldTerminals(): Promise<void> {
    console.log('Closing old terminal windows...\n');
    
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
        // Method 1: Use taskkill for windows with specific titles
        console.log('  Closing cmd windows with Protocol TX titles...');
        await new Promise<void>((resolve) => {
            exec('taskkill /FI "WINDOWTITLE eq Protocol TX*" /F 2>nul', () => {
                resolve();
            });
        });
        
        // Method 2: Use Win32 API to find and close windows by title
        const titles = [
            'Protocol TX - Monitoring',
            'Protocol TX - Server (port 8080)',
            'Protocol TX - Client (Vite, port 3000)',
            'Protocol TX - System Logs'
        ];
        
        for (const title of titles) {
            const escapedTitle = title.replace(/'/g, "''").replace(/"/g, '`"');
            await new Promise<void>((resolve) => {
                exec(`powershell -NoProfile -Command "$code = @\"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport(\"user32.dll\", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport(\"user32.dll\")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport(\"user32.dll\")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    public const uint WM_CLOSE = 0x0010;
}
\"@; Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue; [Win32]::EnumWindows({ param($hWnd, $lParam) $sb = New-Object System.Text.StringBuilder 256; [Win32]::GetWindowText($hWnd, $sb, 256) | Out-Null; $wText = $sb.ToString(); if ($wText -like '*${escapedTitle}*') { [Win32]::PostMessage($hWnd, [Win32]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null } return $true }, [IntPtr]::Zero) | Out-Null"`, () => {
                    resolve();
                });
            });
        }
        
        console.log('  Waiting for terminals to close...');
        await new Promise(resolve => setTimeout(resolve, 10));
        console.log('[OK] Old terminals closed!\n');
    }
}

async function killAllProcesses(): Promise<void> {
    console.log('Stopping processes on ports 8080 and 3000...\n');
    
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
        const currentPid = process.pid;
        
        // Close only processes on ports 8080 and 3000 (server and client)
        console.log('  Closing processes on port 8080 (server)...');
        await new Promise<void>((resolve) => {
            exec(`powershell -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne ${currentPid} } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}"`, () => {
                resolve();
            });
        });
        
        console.log('  Closing processes on port 3000 (client)...');
        await new Promise<void>((resolve) => {
            exec(`powershell -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne ${currentPid} } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}"`, () => {
                resolve();
            });
        });
        
        // Wait for processes to terminate
        console.log('  Waiting for processes to terminate...');
        await new Promise(resolve => setTimeout(resolve, 10));
        
        console.log('[OK] All processes stopped!\n');
    } else {
        // For Linux/Mac - close only processes on ports
        console.log('  Closing processes on port 8080 (server)...');
        await new Promise<void>((resolve) => {
            exec('lsof -ti:8080 | xargs kill -9 2>/dev/null || true', () => {
                resolve();
            });
        });
        
        console.log('  Closing processes on port 3000 (client)...');
        await new Promise<void>((resolve) => {
            exec('lsof -ti:3000 | xargs kill -9 2>/dev/null || true', () => {
                resolve();
            });
        });
        
        await new Promise(resolve => setTimeout(resolve, 10));
        console.log('[OK] All processes stopped!\n');
    }
}

async function positionWindow(processId: number, position: { x: number; y: number }): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const isWindows = process.platform === 'win32';
        
        if (!isWindows) {
            resolve(true);
            return;
        }
        
        // Synchronous positioning script that waits until window is positioned
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
            // Use cmd instead of PowerShell
            // Create a temporary batch file to avoid escaping issues
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
            
            // Use PowerShell Start-Process directly with cmd, avoiding start command escaping issues
            const escapedBatPath = batFilePath.replace(/\\/g, '\\\\').replace(/'/g, "''");
            const psScript = `$proc = Start-Process cmd -ArgumentList '/k', '${escapedBatPath}' -PassThru -WindowStyle Normal; [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null; $proc.MainWindowTitle = '${title.replace(/'/g, "''")}'; Start-Sleep -Milliseconds 10; $allCmds = Get-Process -Name cmd -ErrorAction SilentlyContinue | Where-Object { $_.Id -ge $proc.Id } | Sort-Object Id; if ($allCmds) { $procId = $allCmds[0].Id; Write-Host $procId } else { Write-Host $proc.Id }`;
            
            exec(`powershell -NoProfile -Command "${psScript}"`, async (error, stdout) => {
                // Clean up bat file after a delay
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
                
                console.log(`[OK] Started: ${title}`);
                
                // IMMEDIATELY position the window synchronously
                if (position && stdout) {
                    const processId = parseInt(stdout.toString().trim());
                    if (!isNaN(processId)) {
                        console.log(`  Positioning window (PID: ${processId})...`);
                        const positioned = await positionWindow(processId, position);
                        if (positioned) {
                            console.log(`  Window positioned successfully at (${position.x}, ${position.y})`);
                        } else {
                            console.log(`  Warning: Could not position window, continuing anyway...`);
                        }
                    }
                }
                
                resolve();
            });
        } else {
            // For Linux/Mac use xterm or gnome-terminal
            const termCmd = process.env.TERM || 'xterm';
            const fullCommand = `cd "${workingDir}" && ${command}`;
            const geoOption = position ? ` -geometry +${position.x}+${position.y}` : '';
            exec(`${termCmd}${geoOption} -e bash -c "${fullCommand}; exec bash"`, (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`[OK] Started: ${title}`);
                    resolve();
                }
            });
        }
    });
}

async function waitForServer(host: string, port: number, maxAttempts: number = 30, delay: number = 1000): Promise<boolean> {
    const url = `ws://${host}:${port}`;
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(url);
                let resolved = false;
                
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        try {
                            ws.close();
                        } catch (e) {
                            // Ignore
                        }
                        reject(new Error('Timeout'));
                    }
                }, 2000);
                
                ws.on('open', () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    }
                });
                
                ws.on('error', (error: Error) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        reject(error);
                    }
                });
            });
            
            // Server WebSocket is responding
            return true;
        } catch (error) {
            // Server not ready yet, wait and retry
            if (i < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    return false;
}

async function main() {
    // Устанавливаем UTF-8 кодировку для консоли Windows
    if (process.platform === 'win32') {
        try {
            // Устанавливаем переменные окружения для UTF-8
            process.env['PYTHONIOENCODING'] = 'utf-8';
            // Устанавливаем кодировку через chcp
            exec('chcp 65001 >nul 2>&1', () => {});
        } catch (e) {
            // Игнорируем ошибки
        }
    }
    
    try {
        console.log('Restarting all Protocol TX systems...\n');
        
        // FIRST: Close old terminal windows
        try {
            await closeOldTerminals();
        } catch (error) {
            console.log('Warning: some terminals could not be closed, continuing...\n');
        }
        
        // Second: Close all processes
        try {
            await killAllProcesses();
        } catch (error) {
            // Ignore errors when closing processes
            console.log('Warning: some processes could not be closed, continuing...\n');
        }
        
        console.log('Starting all Protocol TX systems in separate windows...\n');
        
        const workingDir = process.cwd();
        const isWindows = process.platform === 'win32';
        const npmCmd = isWindows ? 'npm.cmd' : 'npm';
        
        // Get actual screen resolution
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
            topLeft: { x: 0, y: 0 },                                    // Мониторинг
            topRight: { x: windowWidth, y: 0 },                        // Сервер
            bottomLeft: { x: 0, y: windowHeight },                     // Клиент
            bottomRight: { x: windowWidth, y: windowHeight }           // Системные логи
        };
        
        // 1. Start monitoring FIRST (top left corner)
        console.log('Starting monitoring...');
        await startInNewWindow(
            'Protocol TX - Monitoring',
            `${npmCmd} run monitor:only`,
            workingDir,
            positions.topLeft
        );

        // Minimal delay for monitoring
        await new Promise(resolve => setTimeout(resolve, 10));

        // 2. Start server (top right corner)
        console.log('Starting server...');
        await startInNewWindow(
            'Protocol TX - Server (port 8080)',
            `${npmCmd} run server:dev`,
            workingDir,
            positions.topRight
        );

        // Wait for server to become available
        console.log('Waiting for server to be ready...');
        const serverReady = await waitForServer('localhost', 8080, 30, 2000);
        
        if (serverReady) {
            console.log('Server is ready!\n');
        } else {
            console.log('Server did not respond in time, but continuing...\n');
        }

        // 3. Start client (bottom left corner)
        console.log('Starting client...');
        await startInNewWindow(
            'Protocol TX - Client (Vite, port 3000)',
            `${npmCmd} run dev`,
            workingDir,
            positions.bottomLeft
        );

        // 4. Start system logs (bottom right corner)
        console.log('Starting system logs...');
        await startInNewWindow(
            'Protocol TX - System Logs',
            `${npmCmd} run system:logs`,
            workingDir,
            positions.bottomRight
        );

        console.log('\n[OK] All systems restarted in separate windows!');
        console.log('Monitoring: top left corner');
        console.log('Server: top right corner (http://localhost:8080)');
        console.log('Client: bottom left corner (http://localhost:3000)');
        console.log('System Logs: bottom right corner');
        console.log('\nClose terminal windows to stop systems\n');
        
        // Завершаем главный процесс - все остальное в отдельных окнах
        // Минимальная задержка для вывода сообщений
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Корректно завершаем процесс
        if (process.stdout.isTTY) {
            process.stdout.write('\n');
        }
        process.exit(0);
        
    } catch (error: any) {
        console.error('[ERROR] Startup error:', error?.message || error);
        process.exit(1);
    }
}

main().catch((error: any) => {
    console.error('[ERROR] Critical error:', error?.message || error);
    process.exit(1);
});


