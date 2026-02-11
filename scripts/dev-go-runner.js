#!/usr/bin/env node
/**
 * Cross-platform dev:go — запуск всех систем одной командой.
 * Windows: в новом окне через npm run dev:unified (без .ps1, всё в гите).
 * Linux/macOS: dev-go.sh в текущем терминале (тоже вызывает dev:unified).
 */
const { spawn } = require('child_process');
const path = require('path');

const isWin = process.platform === 'win32';
const root = path.resolve(__dirname, '..');

if (isWin) {
  // Не используем dev-go.ps1 — он в .gitignore и отсутствует в репо. Запускаем dev:unified напрямую.
  const child = spawn('cmd', ['/c', 'start', 'cmd', '/k', 'npm run dev:unified'], {
    cwd: root,
    env: { ...process.env },
    windowsHide: false,
    shell: true
  });
  child.on('error', (err) => {
    console.error('[dev:go] Ошибка запуска:', err.message);
    process.exit(1);
  });
} else {
  const child = spawn('bash', [path.join(__dirname, 'dev-go.sh')], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env }
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
