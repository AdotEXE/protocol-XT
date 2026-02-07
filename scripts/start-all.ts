#!/usr/bin/env node
/**
 * Start All Systems
 * Запускает все системы проекта в отдельных окнах терминала:
 * 1. Мониторинг
 * 2. Сервер
 * 3. Клиент
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';

interface WindowPosition {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

interface WindowConfig {
    monitor: WindowPosition & { title: string };
    server: WindowPosition & { title: string };
    client: WindowPosition & { title: string };
    logs?: WindowPosition & { title: string };
}

// Загрузка сохранённых позиций окон
function loadWindowPositions(): WindowConfig | null {
    const configPath = path.join(__dirname, 'window-positions.json');
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(content) as WindowConfig;
        }
    } catch (error) {
        console.warn('[!] Не удалось загрузить позиции окон, используются значения по умолчанию');
    }
    return null;
}

// УЛУЧШЕНО: Позиционирование окна по заголовку (более надёжный способ)
async function positionWindowByTitle(title: string, position: WindowPosition, startTime: number): Promise<void> {
    // Ждём, пока окно появится (максимум 5 секунд)
    for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const psCommand = `Get-Process | Where-Object {
            $_.StartTime -gt (Get-Date).AddSeconds(-10) -and
            ($_.MainWindowTitle -like '*${title.replace(/'/g, "''")}*' -or $_.ProcessName -eq 'pwsh' -or $_.ProcessName -eq 'node')
        } | Select-Object -First 5 | ForEach-Object {
            $title = $_.MainWindowTitle;
            if ($title -like '*${title.replace(/'/g, "''")}*') {
                Write-Output "$($_.Id)|$title"
            }
        }`;

        try {
            const result = await new Promise<string>((resolve) => {
                exec(`pwsh -Command "${psCommand}"`, (error, stdout) => {
                    resolve(error ? '' : (stdout || '').trim());
                });
            });

            if (result) {
                const lines = result.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    const [pid, windowTitle] = line.split('|');
                    if (pid && windowTitle && windowTitle.includes(title.split(' - ')[1] || title)) {
                        const processId = parseInt(pid.trim());
                        if (!isNaN(processId) && processId > 0) {
                            await positionWindow(processId, position);
                            return;
                        }
                    }
                }
            }
        } catch (e) {
            // Continue trying
        }
    }
}

// Позиционирование окна после запуска
async function positionWindow(processId: number, position: WindowPosition): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const isWindows = process.platform === 'win32';

        if (!isWindows) {
            resolve(true);
            return;
        }

        const posScriptPath = path.join(process.cwd(), `.window_pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.ps1`);
        const width = position.width || 0;
        const height = position.height || 0;
        const sizeFlag = (width > 0 && height > 0) ? 0 : 0x0001; // SWP_NOSIZE если размер не указан

        const posScriptContent = `param($targetPid, $x, $y, $width, $height, $sizeFlag)
$code = @"
using System;
using System.Runtime.InteropServices;
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
for ($i = 0; $i -lt 150; $i++) {
    Start-Sleep -Milliseconds 20;
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
                    Start-Sleep -Milliseconds 10;
                }
                $flags = [Win32]::SWP_SHOWWINDOW;
                if ($sizeFlag -eq 1) {
                    $flags = $flags -bor [Win32]::SWP_NOSIZE;
                }
                $result = [Win32]::SetWindowPos($handle, [Win32]::HWND_TOP, $x, $y, $width, $height, $flags);
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
                $flags = [Win32]::SWP_SHOWWINDOW;
                if ($sizeFlag -eq 1) {
                    $flags = $flags -bor [Win32]::SWP_NOSIZE;
                }
                $result = [Win32]::SetWindowPos($foundHandle, [Win32]::HWND_TOP, $x, $y, $width, $height, $flags);
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

            exec(`pwsh -ExecutionPolicy Bypass -File "${posScriptPath}" -targetPid ${processId} -x ${position.x} -y ${position.y} -width ${width} -height ${height} -sizeFlag ${sizeFlag}`, (error, stdout) => {
                try {
                    if (fs.existsSync(posScriptPath)) {
                        fs.unlinkSync(posScriptPath);
                    }
                } catch { }

                if (stdout && stdout.includes('POSITIONED')) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        } catch (error) {
            resolve(false);
        }
    });
}

async function startInNewWindow(title: string, command: string, workingDir: string, position?: WindowPosition) {
    return new Promise<void>((resolve, reject) => {
        const isWindows = process.platform === 'win32';

        if (isWindows) {
            // УЛУЧШЕНО: Используем pwsh напрямую, без промежуточного powershell
            // Экранируем путь и команду для PowerShell
            const escapedDir = workingDir.replace(/\\/g, '\\\\').replace(/'/g, "''");
            const escapedCmd = command.replace(/'/g, "''");
            // Формируем команду для прямого запуска pwsh
            const psScript = `Start-Process pwsh -ArgumentList '-NoExit', '-Command', 'cd ''${escapedDir}''; ${escapedCmd}' -WindowStyle Normal`;

            // УЛУЧШЕНО: Используем pwsh напрямую и получаем PID запущенного процесса
            const startTime = Date.now();
            exec(`pwsh -Command "${psScript}"`, async (error, _stdout, _stderr) => {
                if (error) {
                    // Fallback на powershell если pwsh не найден
                    exec(`powershell -Command "${psScript}"`, async (fallbackError) => {
                        if (fallbackError) {
                            reject(fallbackError);
                        } else {
                            console.log(`✓ Запущено: ${title}`);
                            // УЛУЧШЕНО: Позиционируем окно если указана позиция
                            if (position) {
                                await positionWindowByTitle(title, position, startTime);
                            }
                            resolve();
                        }
                    });
                } else {
                    console.log(`✓ Запущено: ${title}`);
                    // УЛУЧШЕНО: Позиционируем окно если указана позиция
                    if (position) {
                        await positionWindowByTitle(title, position, startTime);
                    }
                    resolve();
                }
            });
        } else {
            // Для Linux/Mac используем xterm или gnome-terminal
            const termCmd = process.env.TERM || 'xterm';
            const fullCommand = `cd "${workingDir}" && ${command}`;
            exec(`${termCmd} -e bash -c "${fullCommand}; exec bash"`, (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`✓ Запущено: ${title}`);
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
    console.log('[START] Запуск всех систем Protocol TX в отдельных окнах...\n');

    const workingDir = process.cwd();
    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    try {
        // УЛУЧШЕНО: Загружаем сохранённые позиции окон
        const windowConfig = loadWindowPositions();

        // 1. Запускаем сервер ПЕРВЫМ
        console.log('[*]  Запуск сервера...');
        await startInNewWindow(
            windowConfig?.server?.title || 'Protocol TX - Сервер (порт 8000)',
            `${npmCmd} run server:dev`,
            workingDir,
            windowConfig?.server
        );

        // Ждем, пока сервер станет доступен
        console.log('[...] Ожидание готовности сервера...');
        const serverReady = await waitForServer('localhost', 8000, 30, 2000);

        if (serverReady) {
            console.log('[OK] Сервер готов!\n');
        } else {
            console.log('[!] Сервер не ответил за отведенное время, но продолжаем...\n');
        }

        // 2. Теперь запускаем мониторинг (он будет подключаться к уже работающему серверу)
        console.log('[*] Запуск мониторинга...');
        await startInNewWindow(
            windowConfig?.monitor?.title || 'Protocol TX - Мониторинг',
            `${npmCmd} run monitor:only`,
            workingDir,
            windowConfig?.monitor
        );

        // Даем мониторингу время на запуск
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Запускаем клиент последним
        console.log('[*] Запуск клиента...');
        await startInNewWindow(
            windowConfig?.client?.title || 'Protocol TX - Клиент (Vite, порт 5001)',
            `${npmCmd} run dev`,
            workingDir,
            windowConfig?.client
        );

        console.log('\n[OK] Все системы запущены в отдельных окнах!');
        console.log('[*] Мониторинг: отдельное окно терминала');
        console.log('[*]  Сервер: http://localhost:8000');
        console.log('[*] Клиент: http://localhost:5001');
        console.log('\n[!] Закройте окна терминалов для остановки систем\n');

        // Завершаем главный процесс - все остальное в отдельных окнах
        process.exit(0);

    } catch (error) {
        console.error('[X] Ошибка запуска:', error);
        process.exit(1);
    }
}

main();


