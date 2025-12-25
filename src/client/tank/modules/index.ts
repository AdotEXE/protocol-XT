// Экспорт модуля модулей
export type { ModuleType } from './ModuleTypes';
export { MODULE_PRESETS } from './ModuleTypes';

/**
 * Получить модуль по ID
 */
export function getModuleById(id: string): import('./ModuleTypes').ModuleType | undefined {
    const { MODULE_PRESETS } = require('./ModuleTypes');
    return MODULE_PRESETS.find((m: import('./ModuleTypes').ModuleType) => m.id === id);
}
