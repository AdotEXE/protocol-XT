import { defineConfig } from 'vite';
import path from 'path';
import { execSync } from 'child_process';

// Плагин для вывода версии при сборке
function versionPlugin() {
  return {
    name: 'version-plugin',
    buildStart() {
      const buildInfo = getBuildVersion();
      const version = `v0.3.${buildInfo.buildNumber} ${buildInfo.buildTime}`;
      console.log(`> tx@${version} build`);
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
  
  // Генерируем build number из commit hash
  let buildNumber = 0;
  if (commitHash !== 'unknown' && commitHash.length >= 4) {
    buildNumber = parseInt(commitHash.substring(0, 4), 16) % 10000;
  }
  
  return {
    buildTime,
    commitHash,
    buildNumber,
  };
}

const buildInfo = getBuildVersion();

export default defineConfig({
  plugins: [versionPlugin()],
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
    port: 3000,
  },
  build: {
    target: 'esnext',
    // Оптимизация бандла
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Code splitting - разделяем большие библиотеки
        manualChunks: {
          'babylon-core': ['@babylonjs/core'],
          'babylon-gui': ['@babylonjs/gui'],
          'havok': ['@babylonjs/havok'],
        },
        // Оптимизация для production
        compact: true,
      },
    },
    // Минификация (esbuild - быстрее и встроен в Vite)
    minify: 'esbuild',
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
