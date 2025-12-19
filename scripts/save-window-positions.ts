#!/usr/bin/env node
/**
 * Save Current Window Positions
 * Сохраняет текущие позиции и размеры окон терминалов в конфигурационный файл
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface WindowPosition {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
}

interface WindowConfig {
    monitor: WindowPosition;
    server: WindowPosition;
    client: WindowPosition;
    logs?: WindowPosition;
}

function getWindowPositions(): Promise<WindowConfig | null> {
    return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        
        if (!isWindows) {
            resolve(null);
            return;
        }
        
        const psScript = `
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
"@;
Add-Type -TypeDefinition $code -ErrorAction Stop;

$windows = @{};

$callback = [Win32+EnumWindowsProc]{
    param($hWnd, $lParam)
    if (-not [Win32]::IsWindowVisible($hWnd)) { return $true }
    try {
        $title = New-Object System.Text.StringBuilder 256;
        [Win32]::GetWindowText($hWnd, $title, 256) | Out-Null;
        $titleText = $title.ToString();
        
        if ($titleText -match "Protocol TX") {
            $rect = New-Object Win32+RECT;
            [Win32]::GetWindowRect($hWnd, [ref]$rect) | Out-Null;
            
            $x = $rect.Left;
            $y = $rect.Top;
            $width = $rect.Right - $rect.Left;
            $height = $rect.Bottom - $rect.Top;
            
            if ($titleText -match "Мониторинг|Monitoring") {
                $windows["monitor"] = @{x=$x; y=$y; width=$width; height=$height; title=$titleText}
            } elseif ($titleText -match "Сервер|Server") {
                $windows["server"] = @{x=$x; y=$y; width=$width; height=$height; title=$titleText}
            } elseif ($titleText -match "Клиент|Client|Vite") {
                $windows["client"] = @{x=$x; y=$y; width=$width; height=$height; title=$titleText}
            } elseif ($titleText -match "Логи|Logs") {
                $windows["logs"] = @{x=$x; y=$y; width=$width; height=$height; title=$titleText}
            }
        }
    } catch {}
    return $true
};

[Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null;

$result = @{};
if ($windows["monitor"]) { $result["monitor"] = $windows["monitor"] }
if ($windows["server"]) { $result["server"] = $windows["server"] }
if ($windows["client"]) { $result["client"] = $windows["client"] }
if ($windows["logs"]) { $result["logs"] = $windows["logs"] }

ConvertTo-Json $result -Depth 10
`;

        exec(`pwsh -Command "${psScript}"`, (error, stdout) => {
            if (error || !stdout) {
                console.error('❌ Ошибка получения позиций окон');
                resolve(null);
                return;
            }
            
            try {
                const config = JSON.parse(stdout.trim()) as WindowConfig;
                resolve(config);
            } catch (e) {
                console.error('❌ Ошибка парсинга позиций окон');
                resolve(null);
            }
        });
    });
}

async function main() {
    console.log('📐 Сохранение текущих позиций окон...\n');
    
    const positions = await getWindowPositions();
    
    if (!positions || Object.keys(positions).length === 0) {
        console.error('❌ Не найдено окон Protocol TX');
        console.log('💡 Убедитесь, что все окна открыты и видны на экране');
        process.exit(1);
    }
    
    const configPath = path.join(__dirname, 'window-positions.json');
    
    try {
        fs.writeFileSync(configPath, JSON.stringify(positions, null, 2), 'utf8');
        console.log('✅ Позиции окон сохранены в:', configPath);
        console.log('\n📊 Сохранённые позиции:');
        Object.entries(positions).forEach(([key, pos]) => {
            console.log(`   ${key}: x=${pos.x}, y=${pos.y}, width=${pos.width}, height=${pos.height}`);
        });
        console.log('\n💡 При следующем запуске окна откроются в этих позициях!');
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        process.exit(1);
    }
}

main();


