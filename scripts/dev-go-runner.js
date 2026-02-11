#!/usr/bin/env node
/**
 * Cross-platform dev:go — на Windows запускает dev-go.ps1 в новом окне,
 * на Linux/macOS запускает dev-go.sh в текущем терминале.
 */
const { spawn } = require('child_process');
const path = require('path');

const isWin = process.platform === 'win32';
const root = path.resolve(__dirname, '..');

if (isWin) {
  spawn('cmd', ['/c', 'start', 'pwsh', '-NoExit', '-File', path.join(__dirname, 'dev-go.ps1')], {
    cwd: root,
    env: { ...process.env },
    windowsHide: false
  });
} else {
  const child = spawn('bash', [path.join(__dirname, 'dev-go.sh')], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env }
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
