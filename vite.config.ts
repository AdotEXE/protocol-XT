import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
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
