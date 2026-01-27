/**
 * @module workshop/ConfigurationManager
 * @description Менеджер сохранения и загрузки кастомных конфигураций танков
 * 
 * Использует localStorage для хранения конфигураций
 */

import { CustomTankConfiguration } from './types';

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
            const saved = this.loadAll();
            const index = saved.findIndex(c => c.id === config.id);
            
            // Обновляем метаданные
            config.modifiedAt = Date.now();
            if (!config.createdAt) {
                config.createdAt = Date.now();
            }
            
            if (index >= 0) {
                // Обновляем существующую
                saved[index] = config;
            } else {
                // Добавляем новую
                saved.push(config);
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            console.log(`[Workshop] Saved configuration: ${config.name} (${config.id})`);
        } catch (e) {
            console.error('[Workshop] Failed to save configuration:', e);
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
                console.log(`[Workshop] Loaded configuration: ${config.name} (${id})`);
            }
            return config || null;
        } catch (e) {
            console.error('[Workshop] Failed to load configuration:', e);
            return null;
        }
    }
    
    /**
     * Загрузить все конфигурации
     */
    static loadAll(): CustomTankConfiguration[] {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data) {
                return [];
            }
            const parsed = JSON.parse(data);
            // Валидация - проверяем что это массив
            if (!Array.isArray(parsed)) {
                console.warn('[Workshop] Invalid data format, resetting');
                localStorage.removeItem(STORAGE_KEY);
                return [];
            }
            return parsed as CustomTankConfiguration[];
        } catch (e) {
            console.error('[Workshop] Failed to load configurations:', e);
            // В случае ошибки очищаем повреждённые данные
            localStorage.removeItem(STORAGE_KEY);
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
            console.log(`[Workshop] Deleted configuration: ${id}`);
            return true;
        } catch (e) {
            console.error('[Workshop] Failed to delete configuration:', e);
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
        console.log('[Workshop] Cleared all configurations');
    }
}

export default ConfigurationManager;

