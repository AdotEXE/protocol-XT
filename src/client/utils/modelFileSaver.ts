/**
 * @module utils/modelFileSaver
 * @description Утилита для сохранения моделей в файлы через серверный API
 * 
 * Валидирует модели перед сохранением и добавляет метаданные версионирования.
 */

import { ModelMetadata, ModelWithMetadata } from '../workshop/types';
import { validateCustomTankConfig } from './modelValidator';
import { CustomTankConfiguration } from '../workshop/types';

// Версия игры из package.json (можно получить динамически или захардкодить)
const GAME_VERSION = '0.4.20553'; // TODO: получать из package.json динамически
const MODEL_FORMAT_VERSION = '1.0';

// URL сервера (по умолчанию localhost:7001)
// В браузере process.env может быть недоступен, используем window.location или дефолт
const getServerURL = (): string => {
    // Если установлен глобальный SERVER_URL, используем его
    if (typeof window !== 'undefined' && (window as any).SERVER_URL) {
        return (window as any).SERVER_URL;
    }
    // Сервер всегда работает на порту 7001, независимо от порта клиента (5001)
    // Используем hostname из текущего URL, но порт всегда 7001
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        return `http://${hostname}:7001`;
    }
    return 'http://localhost:7001';
};

const SERVER_URL = getServerURL();

/**
 * Создает метаданные для модели
 */
function createMetadata(
    minGameVersion?: string,
    maxGameVersion?: string
): ModelMetadata {
    return {
        version: MODEL_FORMAT_VERSION,
        gameVersion: GAME_VERSION,
        savedAt: Date.now(),
        compatibility: {
            minGameVersion,
            maxGameVersion
        }
    };
}

/**
 * Сохраняет модель в файл через серверный API
 * 
 * @param modelName - Имя файла (без расширения .json)
 * @param data - Данные модели
 * @param category - Категория: 'custom-tanks', 'base-types', 'generated-models'
 * @param validate - Валидировать модель перед сохранением (по умолчанию true)
 * @returns Promise с результатом сохранения
 */
export async function saveModelToFile<T>(
    modelName: string,
    data: T,
    category: 'custom-tanks' | 'base-types' | 'generated-models',
    validate: boolean = true
): Promise<{ success: boolean; error?: string }> {
    try {
        // Валидация кастомных танков
        if (validate && category === 'custom-tanks') {
            const config = data as unknown as CustomTankConfiguration;
            const validation = validateCustomTankConfig(config);
            
            if (!validation.valid) {
                const errorMsg = `Validation failed: ${validation.errors.join(', ')}`;
                console.error('[ModelFileSaver]', errorMsg);
                if (validation.warnings.length > 0) {
                    console.warn('[ModelFileSaver] Warnings:', validation.warnings);
                }
                return { success: false, error: errorMsg };
            }

            if (validation.warnings.length > 0) {
                console.warn('[ModelFileSaver] Validation warnings:', validation.warnings);
            }
        }

        // Добавляем метаданные
        const metadata = createMetadata();
        const modelWithMetadata: ModelWithMetadata<T> = {
            metadata,
            data
        };

        // Формируем имя файла
        const filename = modelName.endsWith('.json') ? modelName : `${modelName}.json`;

        // Отправляем запрос на сервер
        const url = `${SERVER_URL}/api/models/save`;
        console.log(`[ModelFileSaver] Sending request to: ${url} for ${category}/${filename}`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename,
                category,
                data: modelWithMetadata // Используем 'data' вместо 'content' для совместимости с сервером
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            const errorMsg = errorData.error || `HTTP ${response.status}`;
            console.error('[ModelFileSaver] Server error:', errorMsg);
            return { success: false, error: errorMsg };
        }

        const result = await response.json();
        console.log('[ModelFileSaver] Model saved successfully:', filename);
        return { success: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[ModelFileSaver] Failed to save model:', errorMsg);
        
        // Fallback на localStorage для кастомных танков
        if (category === 'custom-tanks') {
            console.warn('[ModelFileSaver] Falling back to localStorage');
            try {
                const config = data as unknown as CustomTankConfiguration;
                const existing = JSON.parse(localStorage.getItem('customTankConfigurations') || '[]');
                const index = existing.findIndex((c: CustomTankConfiguration) => c.id === config.id);
                
                if (index >= 0) {
                    existing[index] = config;
                } else {
                    existing.push(config);
                }
                
                localStorage.setItem('customTankConfigurations', JSON.stringify(existing));
                return { success: true };
            } catch (e) {
                console.error('[ModelFileSaver] localStorage fallback failed:', e);
            }
        }
        
        return { success: false, error: errorMsg };
    }
}

/**
 * Сохраняет кастомную конфигурацию танка
 */
export async function saveCustomTankConfig(
    config: CustomTankConfiguration
): Promise<{ success: boolean; error?: string }> {
    const filename = `custom-tank-${config.id}.json`;
    return saveModelToFile(filename, config, 'custom-tanks', true);
}

/**
 * Сохраняет базовый тип танка
 */
export async function saveBaseTankType<T>(
    typeName: string,
    type: T,
    typeCategory: 'chassis' | 'cannon' | 'track'
): Promise<{ success: boolean; error?: string }> {
    const filename = `base-${typeCategory}-types.json`;
    return saveModelToFile(filename, type, 'base-types', false);
}

/**
 * Сохраняет сгенерированную модель
 */
export async function saveGeneratedModel<T>(
    modelName: string,
    model: T
): Promise<{ success: boolean; error?: string }> {
    const filename = modelName.endsWith('.json') ? modelName : `${modelName}.json`;
    return saveModelToFile(filename, model, 'generated-models', false);
}

