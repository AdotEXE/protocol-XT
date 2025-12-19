#!/usr/bin/env node
/**
 * Start All Systems
 * Запускает все системы проекта в отдельных окнах терминала:
 * 1. Мониторинг
 * 2. Сервер
 * 3. Клиент
 */

import { exec } from 'child_process';
import WebSocket from 'ws';

async function startInNewWindow(title: string, command: string, workingDir: string) {
    return new Promise<void>((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        
        if (isWindows) {
            // Используем PowerShell для открытия нового окна
            // Экранируем путь и команду для PowerShell
            const escapedDir = workingDir.replace(/\\/g, '\\\\').replace(/'/g, "''");
            const escapedCmd = command.replace(/'/g, "''");
            // Формируем PowerShell команду с правильным экранированием
            const psScript = `Start-Process pwsh -ArgumentList '-NoExit', '-Command', 'cd ''${escapedDir}''; ${escapedCmd}' -WindowStyle Normal`;
            
            exec(`powershell -Command "${psScript}"`, (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`✓ Запущено: ${title}`);
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
    console.log('🚀 Запуск всех систем Protocol TX в отдельных окнах...\n');
    
    const workingDir = process.cwd();
    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    try {
        // 1. Запускаем сервер ПЕРВЫМ
        console.log('🖥️  Запуск сервера...');
        await startInNewWindow(
            'Protocol TX - Сервер (порт 8080)',
            `${npmCmd} run server:dev`,
            workingDir
        );

        // Ждем, пока сервер станет доступен
        console.log('⏳ Ожидание готовности сервера...');
        const serverReady = await waitForServer('localhost', 8080, 30, 2000);
        
        if (serverReady) {
            console.log('✅ Сервер готов!\n');
        } else {
            console.log('⚠️  Сервер не ответил за отведенное время, но продолжаем...\n');
        }

        // 2. Теперь запускаем мониторинг (он будет подключаться к уже работающему серверу)
        console.log('📊 Запуск мониторинга...');
        await startInNewWindow(
            'Protocol TX - Мониторинг',
            `${npmCmd} run monitor:only`,
            workingDir
        );

        // Даем мониторингу время на запуск
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Запускаем клиент последним
        console.log('🌐 Запуск клиента...');
        await startInNewWindow(
            'Protocol TX - Клиент (Vite, порт 3000)',
            `${npmCmd} run dev`,
            workingDir
        );

        console.log('\n✅ Все системы запущены в отдельных окнах!');
        console.log('📊 Мониторинг: отдельное окно терминала');
        console.log('🖥️  Сервер: http://localhost:8080');
        console.log('🌐 Клиент: http://localhost:3000');
        console.log('\n💡 Закройте окна терминалов для остановки систем\n');
        
        // Завершаем главный процесс - все остальное в отдельных окнах
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Ошибка запуска:', error);
        process.exit(1);
    }
}

main();


