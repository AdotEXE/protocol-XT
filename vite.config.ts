import { defineConfig } from 'vite';
import path from 'path';
import { execSync } from 'child_process';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';
import fs from 'fs';
import { getLocalIP, getAllLocalIPs } from './scripts/get-local-ip';

// Импортируем функцию для получения версии
function getVersionFromFile(): { major: number; minor: number; build: number } {
  const VERSION_FILE = path.resolve(__dirname, '.version.json');
  if (fs.existsSync(VERSION_FILE)) {
    const content = fs.readFileSync(VERSION_FILE, 'utf-8');
    return JSON.parse(content);
  }
  // Дефолтная версия v0.4.20000
  return { major: 0, minor: 4, build: 20000 };
}

// Плагин для вывода версии при сборке
function versionPlugin() {
  return {
    name: 'version-plugin',
    buildStart() {
      const buildInfo = getBuildVersion();
      const versionInfo = getVersionFromFile();
      const version = `v${versionInfo.major}.${versionInfo.minor}.${buildInfo.buildNumber} ${buildInfo.buildTime}`;
      console.log(`> tx@${version} build`);
    },
  };
}

// Плагин для автоматической генерации resource hints (preload/prefetch)
// и сохранения мета-тегов из исходного index.html
function resourceHintsPlugin() {
  
  // Сохраняем мета-теги и ссылки из исходного HTML
  const metaTags = `
    <meta name="description" content="Protocol TX - Advanced tank combat simulator with procedural world generation" />
    <meta name="theme-color" content="#1a1a1c" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="dns-prefetch" href="https://vercel.live" />
    <link rel="dns-prefetch" href="https://vitals.vercel-insights.com" />
    <link rel="dns-prefetch" href="https://firebase.googleapis.com" />
    <link rel="dns-prefetch" href="https://firestore.googleapis.com" />
    <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
    <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
    <link rel="preconnect" href="https://vercel.live" crossorigin />
    <link rel="preconnect" href="https://vitals.vercel-insights.com" crossorigin />
    <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <!-- HavokPhysics.wasm загружается при старте игры, не нужен preload -->
  `;
  
  return {
    name: 'resource-hints-plugin',
    transformIndexHtml(html: string) {
      // Добавляем мета-теги и resource hints после viewport meta, если их еще нет
      if (!html.includes('meta name="description"')) {
        return html.replace(
          /<meta name="viewport"[^>]*>/,
          `$&${metaTags}`
        );
      }
      return html;
    },
    writeBundle() {
      // После сборки добавляем мета-теги и оптимизации в финальный HTML
      const indexPath = path.resolve(__dirname, 'dist/index.html');
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf-8');
        
        // Добавляем мета-теги если их нет
        if (!html.includes('meta name="description"')) {
          html = html.replace(
            /<meta name="viewport"[^>]*>/,
            `$&${metaTags}`
          );
        }
        
        // HavokPhysics.wasm загружается при старте игры, не нужен preload
        
        // Добавляем Google Fonts с font-display: swap если их нет
        if (!html.includes('fonts.googleapis.com')) {
          const fontLink = '<link rel="preload" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" as="style" onload="this.onload=null;this.rel=\'stylesheet\'" />\n    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" /></noscript>';
          html = html.replace(
            /(<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>)/,
            `$1\n    ${fontLink}`
          );
        }
        
        fs.writeFileSync(indexPath, html, 'utf-8');
      }
    },
  };
}

// Генерируем версию во время сборки
function getBuildVersion() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const buildTime = `[${day}.${month}.${year} ${hours}:${minutes}:${seconds}]`;
  
  // Получаем git commit hash (если доступен)
  let commitHash = 'unknown';
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch (e) {
    // Git не доступен (например, в CI/CD)
  }
  
  // Используем build number из .version.json
  const version = getVersionFromFile();
  const buildNumber = version.build;
  
  return {
    buildTime,
    commitHash,
    buildNumber,
  };
}

const buildInfo = getBuildVersion();

// Получаем локальный IP для отображения в консоли
const localIP = getLocalIP();
const allIPs = getAllLocalIPs();

export default defineConfig({
  plugins: [
    // Плагин для отображения сетевых адресов при запуске
    {
      name: 'display-network-addresses',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const address = server.httpServer?.address();
          if (address && typeof address === 'object') {
            setTimeout(() => {
              console.log('\n');
              console.log('╔═══════════════════════════════════════════════════════════╗');
              console.log('║              🌐 СЕТЕВОЙ ДОСТУП К ИГРЕ                    ║');
              console.log('╚═══════════════════════════════════════════════════════════╝');
              console.log('');
              console.log('  📍 Локальный доступ:');
              console.log(`     → http://localhost:${address.port}`);
              console.log(`     → http://127.0.0.1:${address.port}`);
              console.log('');
              
              if (localIP) {
                console.log('  🌐 Сетевой доступ (для других ПК в сети):');
                console.log(`     → http://${localIP}:${address.port}`);
                console.log('');
              }
              
              if (allIPs.length > 1) {
                console.log('  📡 Все доступные IP-адреса:');
                allIPs.forEach(ip => {
                  console.log(`     → http://${ip}:${address.port}`);
                });
                console.log('');
              }
              
              console.log('╚═══════════════════════════════════════════════════════════╝');
              console.log('');
            }, 100);
          }
        });
      },
    },
    versionPlugin(), 
    resourceHintsPlugin(),
    // Compression plugin (gzip and brotli)
    // Note: Vercel automatically handles compression, so these are optional
    // They create pre-compressed files that Vercel can use if available
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // Only compress files larger than 1KB
      deleteOriginFile: false, // Keep original files for Vercel to serve
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
      deleteOriginFile: false, // Keep original files for Vercel to serve
    }),
    // Bundle visualizer (only in analyze mode)
    process.env.ANALYZE === 'true' && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  define: {
    __BUILD_TIME__: JSON.stringify(buildInfo.buildTime),
    __COMMIT_HASH__: JSON.stringify(buildInfo.commitHash),
    __BUILD_NUMBER__: JSON.stringify(buildInfo.buildNumber),
    __GAME_VERSION__: JSON.stringify(`0.4.${getVersionFromFile().build}`),
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: 5001, // Changed from 5000 to avoid conflict with macOS AirPlay Receiver
    host: '0.0.0.0', // Слушаем на всех интерфейсах для доступа из сети
    // Headers настраиваются через middleware, не через server.headers
  },
  // Правильная обработка WASM файлов
  assetsInclude: ['**/*.wasm'],
  publicDir: 'public',
  build: {
    target: 'esnext',
    // Оптимизация бандла
    // Примечание: babylon-core (5.9 MB) и havok (2.1 MB) - это нормальные размеры для этих библиотек
    chunkSizeWarningLimit: 2000,
    // Улучшенная оптимизация для production
    assetsInlineLimit: 4096, // Инлайнить маленькие ассеты (<4KB) в base64
    cssCodeSplit: true, // Разделение CSS для лучшей загрузки
    rollupOptions: {
      // Внешние зависимости, которые не должны быть включены в бандл
      external: (id) => {
        // Опциональные зависимости, загружаются динамически
        if (id === 'jszip' || id.includes('jszip')) return true;
        if (id === 'chart.js/auto' || id.includes('chart.js')) return true;
        // @msgpack/msgpack используется только на сервере, не нужен в клиенте
        if (id === '@msgpack/msgpack' || id.includes('@msgpack/msgpack')) return true;
        return false;
      },
      output: {
        // Code splitting - УПРОЩЁННОЕ разделение для правильного порядка инициализации
        // Проблема: слишком агрессивное разделение создаёт циклические зависимости между чанками
        // Решение: только lazy-loaded модули в отдельных чанках, всё остальное в game-core
        manualChunks(id) {
          // ═══════════════════════════════════════════════════════════════
          // ВНЕШНИЕ БИБЛИОТЕКИ - безопасно разделять, нет взаимных зависимостей
          // ═══════════════════════════════════════════════════════════════
          if (id.includes('node_modules')) {
            if (id.includes('@babylonjs/core')) {
              return 'babylon-core';
            }
            if (id.includes('@babylonjs/gui')) {
              return 'babylon-gui';
            }
            if (id.includes('@babylonjs/havok')) {
              return 'havok';
            }
            if (id.includes('firebase')) {
              return 'firebase';
            }
            if (id.includes('@vercel')) {
              return 'vercel-analytics';
            }
            return 'vendor';
          }
          
          // ═══════════════════════════════════════════════════════════════
          // КЛИЕНТСКИЙ КОД - только lazy-loaded модули отдельно
          // ═══════════════════════════════════════════════════════════════
          if (id.includes('/src/client/')) {
            // ─────────────────────────────────────────────────────────────
            // LAZY-LOADED: Debug инструменты (F3, F4, F7)
            // Загружаются только при нажатии клавиш
            // ─────────────────────────────────────────────────────────────
            if (id.includes('/debugDashboard.ts') || 
                id.includes('/physicsPanel.ts') || 
                id.includes('/physicsEditor.ts') ||
                id.includes('/cheatMenu.ts')) {
              return 'lazy-debug';
            }
            
            // ─────────────────────────────────────────────────────────────
            // LAZY-LOADED: Инструменты и редакторы
            // Загружаются по требованию пользователя
            // ─────────────────────────────────────────────────────────────
            if (id.includes('/mapEditor.ts') || 
                id.includes('/screenshotManager.ts') || 
                id.includes('/screenshotPanel.ts') || 
                id.includes('/adminPanel.ts') ||
                id.includes('/worldGenerationMenu.ts')) {
              return 'lazy-tools';
            }
            
            // ─────────────────────────────────────────────────────────────
            // LAZY-LOADED: Tartaria генератор (большой модуль)
            // Загружается только при выборе карты Tartaria
            // ─────────────────────────────────────────────────────────────
            if (id.includes('/tartuHeightmap.ts') || 
                id.includes('/tartuBiomes.ts') ||
                id.includes('/tartuTerrainGenerator.ts')) {
              return 'lazy-tartaria';
            }
            
            // ─────────────────────────────────────────────────────────────
            // LAZY-LOADED: Real World Generator (очень большой модуль)
            // Загружается только при использовании реальных карт
            // ─────────────────────────────────────────────────────────────
            if (id.includes('/services/RealWorldGenerator')) {
              return 'lazy-realworld';
            }
            
            // ─────────────────────────────────────────────────────────────
            // LAZY-LOADED: Workshop система (большой модуль)
            // Загружается только при открытии воркшопа
            // ─────────────────────────────────────────────────────────────
            if (id.includes('/workshop/') && !id.includes('/workshop/types')) {
              return 'lazy-workshop';
            }
            
            // ─────────────────────────────────────────────────────────────
            // LAZY-LOADED: Garage система (большой модуль)
            // Загружается только при открытии гаража
            // ─────────────────────────────────────────────────────────────
            if (id.includes('/garage.ts') || id.includes('/garage/')) {
              return 'lazy-garage';
            }
            
            // ─────────────────────────────────────────────────────────────
            // LAZY-LOADED: Menu система (большой модуль)
            // Загружается только при открытии меню
            // ─────────────────────────────────────────────────────────────
            if (id.includes('/menu.ts') || (id.includes('/menu/') && !id.includes('/menu/types'))) {
              return 'lazy-menu';
            }
            
            // ─────────────────────────────────────────────────────────────
            // ВСЁ ОСТАЛЬНОЕ → game-core
            // Единый чанк гарантирует правильный порядок инициализации
            // ─────────────────────────────────────────────────────────────
            return 'game-core';
          }
          
          // shared, server и прочее
          return null;
        },
        // Оптимизация для production
        compact: true,
        // Лучшая организация имен файлов
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      // Tree shaking с сохранением порядка инициализации
      treeshake: {
        moduleSideEffects(id) {
          // Сохраняем side effects для всего клиентского кода
          // чтобы гарантировать правильный порядок инициализации
          if (id.includes('/src/client/')) {
            return true;
          }
          return false;
        },
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },
    // Минификация (terser - лучше обрабатывает порядок инициализации классов)
    minify: 'terser',
    // Оптимизация размера
    cssMinify: true,
    // Отключаем source maps в production для производительности
    sourcemap: false,
    // Оптимизация для production
    reportCompressedSize: false, // Ускоряет сборку
  },
  // Оптимизация dev сервера
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/gui', '@babylonjs/havok'],
  },
});
