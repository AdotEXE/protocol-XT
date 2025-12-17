#!/usr/bin/env node

/**
 * Bundle Analysis Script
 * Анализирует размер бандла и выводит статистику
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist', 'assets');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function analyzeBundle() {
  console.log('\n📊 Bundle Analysis\n');
  console.log('═'.repeat(60));
  
  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ dist/assets directory not found. Run "npm run build" first.');
    process.exit(1);
  }
  
  const files = fs.readdirSync(DIST_DIR);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  const cssFiles = files.filter(f => f.endsWith('.css'));
  const wasmFiles = files.filter(f => f.endsWith('.wasm'));
  
  let totalSize = 0;
  const chunks = [];
  
  // Анализ JS файлов
  jsFiles.forEach(file => {
    const filePath = path.join(DIST_DIR, file);
    const stats = fs.statSync(filePath);
    const size = stats.size;
    totalSize += size;
    
    // Определяем тип чанка по имени
    let chunkType = 'other';
    if (file.includes('babylon-core')) chunkType = 'babylon-core';
    else if (file.includes('babylon-gui')) chunkType = 'babylon-gui';
    else if (file.includes('havok')) chunkType = 'havok';
    else if (file.includes('firebase')) chunkType = 'firebase';
    else if (file.includes('game-core')) chunkType = 'game-core';
    else if (file.includes('game-ui')) chunkType = 'game-ui';
    else if (file.includes('game-systems')) chunkType = 'game-systems';
    else if (file.includes('game-menu')) chunkType = 'game-menu';
    else if (file.includes('game-garage')) chunkType = 'game-garage';
    else if (file.includes('game-modes')) chunkType = 'game-modes';
    else if (file.includes('game-debug')) chunkType = 'game-debug';
    else if (file.includes('game-multiplayer')) chunkType = 'game-multiplayer';
    else if (file.includes('game-firebase')) chunkType = 'game-firebase';
    else if (file.includes('game-utils')) chunkType = 'game-utils';
    else if (file.includes('game-tank')) chunkType = 'game-tank';
    else if (file.includes('vercel-analytics')) chunkType = 'vercel-analytics';
    else if (file.includes('vendor')) chunkType = 'vendor';
    else if (file.includes('index')) chunkType = 'index';
    
    chunks.push({
      name: file,
      type: chunkType,
      size: size,
    });
  });
  
  // Анализ CSS файлов
  cssFiles.forEach(file => {
    const filePath = path.join(DIST_DIR, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    chunks.push({
      name: file,
      type: 'css',
      size: stats.size,
    });
  });
  
  // Анализ WASM файлов
  wasmFiles.forEach(file => {
    const filePath = path.join(DIST_DIR, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    chunks.push({
      name: file,
      type: 'wasm',
      size: stats.size,
    });
  });
  
  // Группируем по типам
  const grouped = {};
  chunks.forEach(chunk => {
    if (!grouped[chunk.type]) {
      grouped[chunk.type] = { count: 0, size: 0, files: [] };
    }
    grouped[chunk.type].count++;
    grouped[chunk.type].size += chunk.size;
    grouped[chunk.type].files.push(chunk.name);
  });
  
  // Сортируем по размеру
  const sorted = Object.entries(grouped)
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.size - a.size);
  
  console.log('\n📦 Chunk Sizes:\n');
  sorted.forEach(({ type, size, count, files }) => {
    const percentage = ((size / totalSize) * 100).toFixed(1);
    console.log(`  ${type.padEnd(20)} ${formatBytes(size).padStart(10)} (${percentage}%) - ${count} file(s)`);
  });
  
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${'TOTAL'.padEnd(20)} ${formatBytes(totalSize).padStart(10)} (100%)`);
  console.log('═'.repeat(60));
  
  // Предупреждения
  console.log('\n⚠️  Warnings:\n');
  const warnings = [];
  
  sorted.forEach(({ type, size }) => {
    if (size > 2 * 1024 * 1024 && type !== 'babylon-core' && type !== 'havok' && type !== 'wasm') {
      warnings.push(`  ${type} is larger than 2MB (${formatBytes(size)})`);
    }
  });
  
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(w));
  } else {
    console.log('  ✓ No warnings');
  }
  
  console.log('\n');
}

analyzeBundle();

