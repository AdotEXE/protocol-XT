/**
 * @module utils/modelFileLoader
 * @description Утилита для загрузки моделей из файлов через серверный API
 * 
 * Проверяет совместимость версий и выполняет миграцию при необходимости.
 */

import { ModelMetadata, ModelWithMetadata, CustomTankConfiguration } from '../workshop/types';
import { migrateModel } from './modelMigration';

// Версия игры
const GAME_VERSION = '0.4.20553'; // TODO: получать из package.json динамически

// URL сервера
const getServerURL = (): string => {
    // Если установлен глобальный SERVER_URL, используем его
    if (typeof window !== 'undefined' && (window as any).SERVER_URL) {
        return (window as any).SERVER_URL;
    }
    // Сервер всегда работает на порту 7001, независимо от порта клиента (5001)
    // Используем hostname из текущего URL, но порт всегда 7001
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol; // http: or https:
        return `${protocol}//${hostname}:7001`;
    }
    return 'http://localhost:7001';
};

const SERVER_URL = getServerURL();

/**
 * Проверяет совместимость версий
 */
function checkCompatibility(metadata: ModelMetadata): { compatible: boolean; reason?: string } {
    // Проверяем минимальную версию игры
    if (metadata.compatibility.minGameVersion) {
        if (compareVersions(GAME_VERSION, metadata.compatibility.minGameVersion) < 0) {
            return {
                compatible: false,
                reason: `Game version ${GAME_VERSION} is older than required ${metadata.compatibility.minGameVersion}`
            };
        }
    }

    // Проверяем максимальную версию игры (если указана)
    if (metadata.compatibility.maxGameVersion) {
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
    try {
        const url = `${SERVER_URL}/api/models/load?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                console.warn('[ModelFileLoader] Model not found:', filename);
                return null;
            }
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[ModelFileLoader] Server error:', errorData.error);
            return null;
        }

        const result = await response.json();
        if (!result.success || !result.data) {
            console.error('[ModelFileLoader] Invalid response format');
            return null;
        }

        // Проверяем формат с метаданными
        if (result.data.metadata && result.data.data) {
            // Модель с метаданными
            const modelWithMetadata = result.data as ModelWithMetadata<T>;
            
            // Проверяем совместимость
            const compatibility = checkCompatibility(modelWithMetadata.metadata);
            if (!compatibility.compatible) {
                console.warn('[ModelFileLoader] Model incompatible:', compatibility.reason);
                // Пытаемся мигрировать
                try {
                    const migrated = migrateModel(
                        modelWithMetadata.data,
                        modelWithMetadata.metadata.version,
                        '1.0' // Текущая версия формата
                    );
                    return migrated as T;
                } catch (e) {
                    console.error('[ModelFileLoader] Migration failed:', e);
                    return null;
                }
            }

            // Если версия формата отличается, мигрируем
            if (modelWithMetadata.metadata.version !== '1.0') {
                try {
                    const migrated = migrateModel(
                        modelWithMetadata.data,
                        modelWithMetadata.metadata.version,
                        '1.0'
                    );
                    return migrated as T;
                } catch (e) {
                    console.warn('[ModelFileLoader] Migration failed, using original:', e);
                    return modelWithMetadata.data;
                }
            }

            return modelWithMetadata.data;
        } else {
            // Старый формат без метаданных - возвращаем как есть
            console.warn('[ModelFileLoader] Model without metadata, using as-is');
            return result.data as T;
        }
    } catch (error) {
        console.error('[ModelFileLoader] Failed to load model:', error);
        return null;
    }
}

/**
 * Загружает все модели из категории
 */
export async function loadAllModelsFromCategory<T>(
    category: 'custom-tanks' | 'base-types' | 'generated-models'
): Promise<T[]> {
    try {
        const url = `${SERVER_URL}/api/models/list?category=${encodeURIComponent(category)}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error('[ModelFileLoader] Failed to list models');
            return [];
        }

        const result = await response.json();
        if (!result.success || !Array.isArray(result.models)) {
            return [];
        }

        const models: T[] = [];
        
        // Загружаем каждую модель
        for (const modelInfo of result.models) {
            const data = await loadModelFromFile<T>(category, modelInfo.filename);
            if (data) {
                models.push(data);
            }
        }

        return models;
    } catch (error) {
        console.error('[ModelFileLoader] Failed to load models from category:', error);
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

