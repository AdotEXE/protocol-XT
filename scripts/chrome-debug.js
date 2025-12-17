#!/usr/bin/env node

/**
 * Скрипт для запуска Chrome с включенной поддержкой удаленной отладки
 * для работы с DevTools MCP Server
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Определяем путь к Chrome в зависимости от ОС
function getChromePath() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows - проверяем несколько возможных путей
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
    
    // Если не нашли, пробуем найти через where
    return 'chrome.exe'; // Будет искаться в PATH
  } else if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    // Linux
    return 'google-chrome';
  }
}

// Создаем временный профиль для отладки
function getProfileDir() {
  const platform = process.platform;
  const baseDir = os.tmpdir();
  
  if (platform === 'win32') {
    return path.join(baseDir, 'chrome-debug-profile');
  } else {
    return path.join(baseDir, 'chrome-debug-profile');
  }
}

// Параметры командной строки
const chromePath = getChromePath();
const profileDir = getProfileDir();
const port = process.env.CHROME_DEBUG_PORT || '9222';
const userDataDir = process.env.CHROME_USER_DATA_DIR || profileDir;

// Аргументы для Chrome
const args = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--disable-web-security', // Для разработки
  '--disable-features=IsolateOrigins,site-per-process', // Для разработки
  '--no-first-run',
  '--no-default-browser-check',
  // Открываем локальный dev сервер, если он запущен
  process.env.VITE_DEV_URL || 'http://localhost:5173'
];

console.log('🚀 Запуск Chrome с поддержкой удаленной отладки...');
console.log(`📁 Профиль: ${userDataDir}`);
console.log(`🔌 Порт отладки: ${port}`);
console.log(`🌐 URL: ${args[args.length - 1]}`);
console.log('');

// Создаем директорию профиля, если её нет
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

// Запускаем Chrome
const chrome = spawn(chromePath, args, {
  stdio: 'inherit',
  shell: platform === 'win32'
});

chrome.on('error', (error) => {
  console.error('❌ Ошибка при запуске Chrome:', error.message);
  console.error('');
  console.error('💡 Убедитесь, что Chrome установлен и доступен в PATH');
  console.error('💡 Или укажите путь к Chrome через переменную окружения CHROME_PATH');
  process.exit(1);
});

chrome.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Chrome завершился с кодом: ${code}`);
  }
});

// Обработка сигналов для корректного завершения
process.on('SIGINT', () => {
  console.log('\n🛑 Завершение работы...');
  chrome.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  chrome.kill();
  process.exit(0);
});

console.log('✅ Chrome запущен. Для остановки нажмите Ctrl+C');
console.log('');
console.log('📝 Для подключения DevTools MCP Server используйте:');
console.log(`   npm run mcp:devtools`);
console.log('');

