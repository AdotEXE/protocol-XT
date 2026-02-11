/**
 * @module utils/modelFileLoader
 * @description Утилита для загрузки моделей из файлов
 * 
 * Приоритет загрузки:
 * 1. Статические импорты через Vite (import.meta.glob) — работает без сервера
 * 2. Серверный API (http://hostname:7001) — fallback для динамически добавленных файлов
 * 
 * Проверяет совместимость версий и выполняет миграцию при необходимости.
 */

import { ModelMetadata, ModelWithMetadata, CustomTankConfiguration } from '../workshop/types';
import { migrateModel } from './modelMigration';
import { logger } from './logger';

// Версия игры (внедряется при сборке из .version.json через vite define)
declare const __GAME_VERSION__: string | undefined;
const GAME_VERSION = typeof __GAME_VERSION__ !== 'undefined' ? __GAME_VERSION__ : '0.4.0';

// ==========================================
// === 1. Статические импорты через Vite  ===
// ==========================================
// Загружаем все JSON-модели напрямую из файловой системы.
// Это работает и в dev-режиме (Vite dev server), и в production (бандл).
// Не требует запущенного игрового сервера на порту 7001.
const allModelFiles: Record<string, () => Promise<any>> =
    import.meta.glob('/json_models/**/*.json');

/**
 * Возвращает записи [путь, loader] для конкретной категории
 */
function getStaticModelEntries(
    category: string
): [string, () => Promise<any>][] {
    const prefix = `/json_models/${category}/`;
    return Object.entries(allModelFiles)
        .filter(([path]) => path.startsWith(prefix));
}

// ==========================================
// === 2. Серверный API (fallback)        ===
// ==========================================

// [Opus 4.5] Fixed: Production deployments (Vercel) don't have game server API
// Game server API is only available in local development on port 7001
const getServerURL = (): string | null => {
    if (typeof window !== 'undefined' && (window as any).SERVER_URL) {
        return (window as any).SERVER_URL;
    }
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        // Production hostnames don't have game server API
        if (hostname.includes('vercel.app') ||
            hostname.includes('.netlify.') ||
            hostname.includes('github.io') ||
            (!hostname.includes('localhost') && !hostname.includes('127.0.0.1'))) {
            return null; // No game server in production
        }
        return `http://${hostname}:7001`;
    }
    return 'http://localhost:7001';
};

/** Кэш результата проверки доступности сервера */
let _serverAvailable: boolean | null = null;

/**
 * Быстрая проверка доступности сервера (с таймаутом 2 с).
 * Результат кэшируется на время сессии.
 * 
 * Автоматически возвращает false если страница загружена по HTTPS,
 * а сервер доступен только по HTTP (Mixed Content).
 */
async function isServerAvailable(): Promise<boolean> {
    if (_serverAvailable !== null) return _serverAvailable;

    // [Opus 4.5] If no server URL (production), skip server API
    const serverUrl = getServerURL();
    if (!serverUrl) {
        _serverAvailable = false;
        console.info('[ModelFileLoader] No game server in production — using static imports only');
        return false;
    }

    // Если страница на HTTPS, а сервер на HTTP — браузер заблокирует запрос (Mixed Content)
    if (
        typeof window !== 'undefined' &&
        window.location?.protocol === 'https:' &&
        serverUrl.startsWith('http://')
    ) {
        _serverAvailable = false;
        console.info(
            '[ModelFileLoader] Skipping server API (HTTPS page cannot fetch HTTP server)'
        );
        return false;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`${serverUrl}/health`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        _serverAvailable = response.ok;
    } catch {
        _serverAvailable = false;
    }

    if (!_serverAvailable) {
        console.info(
            '[ModelFileLoader] Game server not reachable — using static imports only'
        );
    }
    return _serverAvailable;
}

// ==========================================
// === Общие утилиты                      ===
// ==========================================

/**
 * Проверяет совместимость версий
 */
function checkCompatibility(metadata: ModelMetadata): { compatible: boolean; reason?: string } {
    if (metadata.compatibility?.minGameVersion) {
        if (compareVersions(GAME_VERSION, metadata.compatibility.minGameVersion) < 0) {
            return {
                compatible: false,
                reason: `Game version ${GAME_VERSION} is older than required ${metadata.compatibility.minGameVersion}`
            };
        }
    }

    if (metadata.compatibility?.maxGameVersion) {
        if (compareVersions(GAME_VERSION, metadata.compatibility.maxGameVersion) > 0) {
            return {
                compatible: false,
                reason: `Game version ${GAME_VERSION} is newer than supported ${metadata.compatibility.maxGameVersion}`
            };
        }
    }

    return { compatible: true };
}

/**
 * Сравнивает версии (простая реализация)
 * Возвращает: -1 если v1 < v2, 0 если v1 == v2, 1 если v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 < part2) return -1;
        if (part1 > part2) return 1;
    }

    return 0;
}

/**
 * Обрабатывает сырые данные модели (метаданные, миграция)
 */
function processRawModelData<T>(data: any): T | null {
    if (!data) return null;

    // Формат с метаданными: { metadata: {...}, data: {...} }
    if (data.metadata && data.data) {
        const modelWithMetadata = data as ModelWithMetadata<T>;

        // Проверяем совместимость
        const compatibility = checkCompatibility(modelWithMetadata.metadata);
        if (!compatibility.compatible) {
            logger.warn('[ModelFileLoader] Model incompatible:', compatibility.reason);
            try {
                return migrateModel(
                    modelWithMetadata.data,
                    modelWithMetadata.metadata.version,
                    '1.0'
                ) as T;
            } catch (e) {
                logger.error('[ModelFileLoader] Migration failed:', e);
                return null;
            }
        }

        // Если версия формата отличается — мигрируем
        if (modelWithMetadata.metadata.version !== '1.0') {
            try {
                return migrateModel(
                    modelWithMetadata.data,
                    modelWithMetadata.metadata.version,
                    '1.0'
                ) as T;
            } catch (e) {
                logger.warn('[ModelFileLoader] Migration failed, using original:', e);
                return modelWithMetadata.data;
            }
        }

        return modelWithMetadata.data;
    }

    // Старый формат без метаданных — возвращаем как есть
    return data as T;
}

// ==========================================
// === Публичный API                       ===
// ==========================================

/**
 * Загружает модель из файла
 * 
 * @param category - Категория модели
 * @param filename - Имя файла
 * @returns Promise с данными модели или null при ошибке
 */
export async function loadModelFromFile<T>(
    category: 'custom-tanks' | 'base-types' | 'generated-models',
    filename: string
): Promise<T | null> {
    // --- 1. Пробуем статический импорт через Vite ---
    const staticPath = `/json_models/${category}/${filename}`;
    const loader = allModelFiles[staticPath];
    if (loader) {
        try {
            const module = await loader();
            const raw = module.default ?? module;
            return processRawModelData<T>(raw);
        } catch (e) {
            logger.warn(`[ModelFileLoader] Static import failed for ${staticPath}:`, e);
        }
    }

    // --- 2. Fallback: серверный API ---
    if (!(await isServerAvailable())) {
        return null;
    }

    try {
        const url = `${getServerURL()}/api/models/load?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                logger.warn('[ModelFileLoader] Model not found:', filename);
                return null;
            }
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            logger.error('[ModelFileLoader] Server error:', errorData.error);
            return null;
        }

        const result = await response.json();
        if (!result.success || !result.data) {
            logger.error('[ModelFileLoader] Invalid response format');
            return null;
        }

        return processRawModelData<T>(result.data);
    } catch (error) {
        logger.error('[ModelFileLoader] Failed to load model:', error);
        return null;
    }
}

/**
 * Загружает все модели из категории
 */
export async function loadAllModelsFromCategory<T>(
    category: 'custom-tanks' | 'base-types' | 'generated-models'
): Promise<T[]> {
    const models: T[] = [];

    // --- 1. Пробуем статические импорты через Vite ---
    const staticEntries = getStaticModelEntries(category);
    if (staticEntries.length > 0) {
        for (const [path, loader] of staticEntries) {
            try {
                const module = await loader();
                const raw = module.default ?? module;
                const processed = processRawModelData<T>(raw);
                if (processed) {
                    models.push(processed);
                }
            } catch (e) {
                logger.warn(`[ModelFileLoader] Failed to load static model ${path}:`, e);
            }
        }

        if (models.length > 0) {
            logger.log(
                `[ModelFileLoader] Loaded ${models.length} models from "${category}" (static)`
            );
            return models;
        }
    }

    // --- 2. Fallback: серверный API ---
    if (!(await isServerAvailable())) {
        return [];
    }

    try {
        const url = `${getServerURL()}/api/models/list?category=${encodeURIComponent(category)}`;
        const response = await fetch(url);

        if (!response.ok) {
            logger.error('[ModelFileLoader] Failed to list models from server');
            return [];
        }

        const result = await response.json();
        if (!result.success || !Array.isArray(result.models)) {
            return [];
        }

        for (const modelInfo of result.models) {
            const data = await loadModelFromFile<T>(category, modelInfo.filename);
            if (data) {
                models.push(data);
            }
        }

        if (models.length > 0) {
            logger.log(
                `[ModelFileLoader] Loaded ${models.length} models from "${category}" (server API)`
            );
        }

        return models;
    } catch (error) {
        logger.error('[ModelFileLoader] Failed to load models from server:', error);
        return [];
    }
}

/**
 * Загружает кастомную конфигурацию танка
 */
export async function loadCustomTankConfig(id: string): Promise<CustomTankConfiguration | null> {
    const filename = `custom-tank-${id}.json`;
    return loadModelFromFile<CustomTankConfiguration>('custom-tanks', filename);
}

/**
 * Загружает все кастомные конфигурации танков
 */
export async function loadAllCustomTankConfigs(): Promise<CustomTankConfiguration[]> {
    return loadAllModelsFromCategory<CustomTankConfiguration>('custom-tanks');
}

