/**
 * Скрипт для обновления версии проекта
 * Автоматически увеличивает build number при каждом запуске
 */

import fs from 'fs';
import path from 'path';

const VERSION_FILE = path.resolve(__dirname, '../.version.json');
const MENU_TS = path.resolve(__dirname, '../src/client/menu.ts');
const PACKAGE_JSON = path.resolve(__dirname, '../package.json');

interface VersionInfo {
  major: number;
  minor: number;
  build: number;
}

function readVersion(): VersionInfo {
  if (fs.existsSync(VERSION_FILE)) {
    const content = fs.readFileSync(VERSION_FILE, 'utf-8');
    return JSON.parse(content);
  }
  // Дефолтная версия v0.4.20000
  return { major: 0, minor: 4, build: 20000 };
}

function writeVersion(version: VersionInfo): void {
  fs.writeFileSync(VERSION_FILE, JSON.stringify(version, null, 2) + '\n', 'utf-8');
}

function updateMenuTs(version: VersionInfo): void {
  if (!fs.existsSync(MENU_TS)) {
    console.warn('[!] menu.ts not found, skipping version update');
    return;
  }

  let content = fs.readFileSync(MENU_TS, 'utf-8');

  // Обновляем VERSION_MAJOR
  content = content.replace(
    /const VERSION_MAJOR = \d+;/,
    `const VERSION_MAJOR = ${version.major};`
  );

  // Обновляем VERSION_MINOR
  content = content.replace(
    /const VERSION_MINOR = \d+;/,
    `const VERSION_MINOR = ${version.minor};`
  );

  fs.writeFileSync(MENU_TS, content, 'utf-8');
}

function updatePackageJson(version: VersionInfo): void {
  if (!fs.existsSync(PACKAGE_JSON)) {
    console.warn('[!] package.json not found, skipping version update');
    return;
  }

  const content = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8'));
  content.version = `${version.major}.${version.minor}.${version.build}`;
  fs.writeFileSync(PACKAGE_JSON, JSON.stringify(content, null, 2) + '\n', 'utf-8');
}

function updateViteConfig(version: VersionInfo): void {
  const VITE_CONFIG = path.resolve(__dirname, '../vite.config.ts');
  if (!fs.existsSync(VITE_CONFIG)) {
    console.warn('[!] vite.config.ts not found, skipping version update');
    return;
  }

  let content = fs.readFileSync(VITE_CONFIG, 'utf-8');

  // Обновляем версию в versionPlugin
  content = content.replace(
    /const version = `v\d+\.\d+\.\d+/,
    `const version = \`v${version.major}.${version.minor}.${version.build}`
  );

  fs.writeFileSync(VITE_CONFIG, content, 'utf-8');
}

export function incrementVersion(): VersionInfo {
  const version = readVersion();
  version.build += 1;
  writeVersion(version);

  updateMenuTs(version);
  updatePackageJson(version);
  updateViteConfig(version);

  console.log(`[OK] Version updated to v${version.major}.${version.minor}.${version.build}`);

  return version;
}

export function getVersion(): VersionInfo {
  return readVersion();
}

export function setVersion(major: number, minor: number, build: number): void {
  const version: VersionInfo = { major, minor, build };
  writeVersion(version);
  updateMenuTs(version);
  updatePackageJson(version);
  updateViteConfig(version);
  console.log(`[OK] Version set to v${version.major}.${version.minor}.${version.build}`);
}

// Если скрипт запущен напрямую
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === 'set' && args.length === 4) {
    const major = parseInt(args[1] || '0');
    const minor = parseInt(args[2] || '0');
    const build = parseInt(args[3] || '0');
    setVersion(major, minor, build);
  } else if (args[0] === 'increment' || args.length === 0) {
    incrementVersion();
  } else if (args[0] === 'get') {
    const version = getVersion();
    console.log(`v${version.major}.${version.minor}.${version.build}`);
  } else {
    console.log('Usage:');
    console.log('  tsx scripts/update-version.ts [increment|set <major> <minor> <build>|get]');
    console.log('  increment - увеличить build number на 1 (по умолчанию)');
    console.log('  set <major> <minor> <build> - установить версию');
    console.log('  get - показать текущую версию');
  }
}

