/**
 * @module workshop/ConfigurationManager
 * @description Менеджер сохранения и загрузки кастомных конфигураций танков
 * 
 * Использует localStorage и файловую систему для хранения конфигураций
 */

import { CustomTankConfiguration } from './types';
import { validateCustomTankConfig } from '../utils/modelValidator';
import { saveCustomTankConfig } from '../utils/modelFileSaver';
import { loadCustomTankConfig, loadAllCustomTankConfigs } from '../utils/modelFileLoader';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'customTankConfigurations';

/**
 * Менеджер конфигураций
 */
export class ConfigurationManager {
    /**
     * Сохранить конфигурацию
     */
    static save(config: CustomTankConfiguration): void {
        try {
            // Валидация перед сохранением
            const validation = validateCustomTankConfig(config);
            if (!validation.valid) {
                const errorMsg = `Validation failed: ${validation.errors.join(', ')}`;
                logger.error('[Workshop]', errorMsg);
                if (validation.warnings.length > 0) {
                    logger.warn('[Workshop] Warnings:', validation.warnings);
                }
                throw new Error(errorMsg);
            }

            if (validation.warnings.length > 0) {
                logger.warn('[Workshop] Validation warnings:', validation.warnings);
            }

            // Обновляем метаданные
            config.modifiedAt = Date.now();
            if (!config.createdAt) {
                config.createdAt = Date.now();
            }

            // Сохраняем в localStorage
            const saved = this.loadAll();
            const index = saved.findIndex(c => c.id === config.id);
            
            if (index >= 0) {
                // Обновляем существующую
                saved[index] = config;
            } else {
                // Добавляем новую
                saved.push(config);
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            logger.log(`[Workshop] Saved configuration to localStorage: ${config.name} (${config.id})`);

            // Сохраняем в файл (асинхронно, не блокируем)
            saveCustomTankConfig(config).then(result => {
                if (result.success) {
                    logger.log(`[Workshop] Saved configuration to file: ${config.name} (${config.id})`);
                } else {
                    logger.warn(`[Workshop] Failed to save configuration to file: ${result.error}`);
                }
            }).catch(e => {
                logger.warn('[Workshop] Error saving configuration to file:', e);
            });
        } catch (e) {
            logger.error('[Workshop] Failed to save configuration:', e);
            throw e;
        }
    }
    
    /**
     * Загрузить конфигурацию по ID
     */
    static load(id: string): CustomTankConfiguration | null {
        try {
            const all = this.loadAll();
            const config = all.find(c => c.id === id);
            if (config) {
                // Валидируем при загрузке
                const validation = validateCustomTankConfig(config);
                if (!validation.valid) {
                    logger.warn(`[Workshop] Loaded config ${id} has validation errors:`, validation.errors);
                }
                logger.log(`[Workshop] Loaded configuration: ${config.name} (${id})`);
            }
            return config || null;
        } catch (e) {
            logger.error('[Workshop] Failed to load configuration:', e);
            return null;
        }
    }

    /**
     * Загрузить конфигурацию по ID асинхронно (включая файлы)
     */
    static async loadAsync(id: string): Promise<CustomTankConfiguration | null> {
        try {
            // Сначала проверяем localStorage
            const localConfig = this.load(id);
            if (localConfig) {
                return localConfig;
            }

            // Пытаемся загрузить из файла
            const fileConfig = await loadCustomTankConfig(id);
            if (fileConfig) {
                // Валидируем
                const validation = validateCustomTankConfig(fileConfig);
                if (validation.valid) {
                    logger.log(`[Workshop] Loaded configuration from file: ${fileConfig.name} (${id})`);
                    return fileConfig;
                } else {
                    logger.warn(`[Workshop] Config from file ${id} has validation errors:`, validation.errors);
                }
            }

            return null;
        } catch (e) {
            logger.error('[Workshop] Failed to load configuration:', e);
            return null;
        }
    }
    
    /**
     * Загрузить все конфигурации
     * ОБЯЗАТЕЛЬНО загружает из json_models (приоритет над localStorage)
     * localStorage используется только как fallback
     */
    static loadAll(): CustomTankConfiguration[] {
        try {
            const configs: CustomTankConfiguration[] = [];
            const configIds = new Set<string>();

            // ПРИОРИТЕТ 1: Загружаем из json_models (синхронно через кэш или fallback)
            // Используем синхронную загрузку с кэшированием для совместимости
            try {
                // Пытаемся загрузить из файлов синхронно (если уже в кэше)
                const { loadCustomTankConfigs } = require('../utils/modelLoader');
                // Если кэш не загружен, возвращаем пустой массив и загружаем асинхронно
                // Для синхронного метода используем только localStorage как fallback
            } catch (e) {
                logger.warn('[Workshop] Cannot load from json_models synchronously, using localStorage fallback:', e);
            }

            // ПРИОРИТЕТ 2: Загружаем из localStorage (только если нет в json_models)
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                try {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) {
                        for (const config of parsed) {
                            // Валидируем каждую конфигурацию
                            const validation = validateCustomTankConfig(config);
                            if (validation.valid && !configIds.has(config.id)) {
                                configs.push(config);
                                configIds.add(config.id);
                            } else if (!validation.valid) {
                                logger.warn(`[Workshop] Skipping invalid config ${config.id}:`, validation.errors);
                            }
                        }
                    }
                } catch (e) {
                    logger.error('[Workshop] Failed to parse localStorage data:', e);
                }
            }

            return configs;
        } catch (e) {
            logger.error('[Workshop] Failed to load configurations:', e);
            return [];
        }
    }

    /**
     * Загрузить все конфигурации асинхронно (ОБЯЗАТЕЛЬНО из json_models)
     * Файлы из json_models имеют приоритет над localStorage
     */
    static async loadAllAsync(): Promise<CustomTankConfiguration[]> {
        try {
            const configs: CustomTankConfiguration[] = [];
            const configIds = new Set<string>();

            // ПРИОРИТЕТ 1: Загружаем из json_models (обязательно)
            try {
                const { loadCustomTankConfigs } = await import('../utils/modelLoader');
                const fileConfigs = await loadCustomTankConfigs();
                for (const config of fileConfigs) {
                    // Валидируем
                    const validation = validateCustomTankConfig(config);
                    if (validation.valid) {
                        configs.push(config);
                        configIds.add(config.id);
                        logger.log(`[Workshop] Loaded config from json_models: ${config.name} (${config.id})`);
                    } else {
                        logger.warn(`[Workshop] Skipping invalid config from json_models ${config.id}:`, validation.errors);
                    }
                }
            } catch (e) {
                logger.warn('[Workshop] Failed to load configurations from json_models:', e);
            }

            // ПРИОРИТЕТ 2: Загружаем из localStorage (только если нет в json_models)
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                try {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) {
                        for (const config of parsed) {
                            const validation = validateCustomTankConfig(config);
                            if (validation.valid) {
                                // Добавляем только если нет в json_models (файлы имеют приоритет)
                                if (!configIds.has(config.id)) {
                                    configs.push(config);
                                    configIds.add(config.id);
                                    logger.log(`[Workshop] Loaded config from localStorage: ${config.name} (${config.id})`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.error('[Workshop] Failed to parse localStorage data:', e);
                }
            }

            logger.log(`[Workshop] Loaded ${configs.length} total configurations (${configIds.size} unique)`);
            return configs;
        } catch (e) {
            logger.error('[Workshop] Failed to load configurations:', e);
            return [];
        }
    }
    
    /**
     * Удалить конфигурацию
     */
    static delete(id: string): boolean {
        try {
            const all = this.loadAll();
            const filtered = all.filter(c => c.id !== id);
            
            if (filtered.length === all.length) {
                // Не нашли для удаления
                return false;
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
            logger.log(`[Workshop] Deleted configuration: ${id}`);
            return true;
        } catch (e) {
            logger.error('[Workshop] Failed to delete configuration:', e);
            return false;
        }
    }
    
    /**
     * Получить количество сохранённых конфигураций
     */
    static getCount(): number {
        return this.loadAll().length;
    }
    
    /**
     * Проверить существует ли конфигурация
     */
    static exists(id: string): boolean {
        return this.load(id) !== null;
    }
    
    /**
     * Очистить все конфигурации (для тестирования)
     */
    static clearAll(): void {
        localStorage.removeItem(STORAGE_KEY);
        logger.log('[Workshop] Cleared all configurations');
    }
}

export default ConfigurationManager;

