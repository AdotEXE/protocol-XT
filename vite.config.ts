import { defineConfig } from 'vite';
import path from 'path';
import { execSync } from 'child_process';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';
import fs from 'fs';

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

export default defineConfig({
  plugins: [
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
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: 5000,
    host: '0.0.0.0', // Доступен для других устройств в сети
    headers: {
      // Required for WebAssembly with SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // WASM MIME type is handled automatically by Vite
    },
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
        // Code splitting - логическое разделение модулей для лучшей загрузки
        manualChunks(id) {
          // Внешние библиотеки
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
            // Остальные node_modules
            return 'vendor';
          }
          
          // Собственные модули - ОПТИМИЗИРОВАННОЕ РАЗДЕЛЕНИЕ
          if (id.includes('/src/client/')) {
            // КРИТИЧНО: Game modules должны быть в game-core chunk вместе с game.ts
            // для правильного порядка инициализации
            if (id.includes('/src/client/game/')) {
              return 'game-core';
            }
            
            // Основной код игры + UI
            if (id.includes('/game.ts') || id.includes('/tankController.ts') || id.includes('/enemyTank.ts') ||
                id.includes('/menu.ts') || id.includes('/garage.ts') || id.includes('/hud.ts') || 
                id.includes('/chatSystem.ts')) {
              return 'game-core';
            }
            
            // Генераторы карт (модульная структура)
            if (id.includes('/maps/')) {
              return 'game-maps';
            }
            
            // Компоненты танка (модульная структура)
            if (id.includes('/tank/')) {
              return 'game-tank';
            }
            
            // Tartaria специфичные модули
            if (id.includes('/tartu')) {
              return 'game-tartaria';
            }
            
            // Игровые системы
            if (id.includes('/chunkSystem.ts') || id.includes('/effects.ts') || id.includes('/soundManager.ts') || 
                id.includes('/consumables.ts') || id.includes('/experienceSystem.ts') || id.includes('/playerProgression.ts') ||
                id.includes('/achievements.ts') || id.includes('/missionSystem.ts') || id.includes('/playerStats.ts') ||
                id.includes('/aimingSystem.ts') || id.includes('/destructionSystem.ts') ||
                id.includes('/coverGenerator.ts') || id.includes('/poiSystem.ts') || id.includes('/roadNetwork.ts') || 
                id.includes('/terrainGenerator.ts') || id.includes('/garage/') || id.includes('/menu/') ||
                id.includes('/utils/') || id.includes('/tankTypes.ts') || id.includes('/trackTypes.ts') || 
                id.includes('/skillTreeConfig.ts') || id.includes('/jsfxr.ts') || id.includes('/hud/')) {
              return 'game-systems';
            }
            
            // Мультиплеер + Firebase + режимы
            if (id.includes('/multiplayer.ts') || id.includes('/networkPlayerTank.ts') ||
                id.includes('/firebaseService.ts') || id.includes('/socialSystem.ts') || id.includes('/leaderboard.ts') ||
                id.includes('/battleRoyale.ts') || id.includes('/ctfVisualizer.ts') || id.includes('/replaySystem.ts') || 
                id.includes('/voiceChat.ts')) {
              return 'game-multiplayer';
            }
            
            // Debug инструменты (lazy loaded)
            if (id.includes('/debugDashboard.ts') || id.includes('/physicsPanel.ts') || id.includes('/cheatMenu.ts')) {
              return 'game-debug';
            }
          }
          
          // ВСЕ остальные файлы из src/client также идут в game-systems
          if (id.includes('/src/client/')) {
            return 'game-systems';
          }
          
          // Остальные файлы (shared, server и т.д.)
          return null;
        },
        // Оптимизация для production
        compact: true,
        // Лучшая организация имен файлов
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      // Более агрессивное удаление неиспользуемого кода
      // ВАЖНО: moduleSideEffects должен быть функцией для модулей игры, чтобы сохранить порядок инициализации
      treeshake: {
        moduleSideEffects(id) {
          // Сохраняем side effects для модулей игры, чтобы избежать проблем с порядком инициализации
          if (id.includes('/src/client/game/')) {
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
