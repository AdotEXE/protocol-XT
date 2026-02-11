// Экспорт модуля припасов
export type { SupplyType } from './SupplyTypes';
export { SUPPLY_PRESETS } from './SupplyTypes';

/**
 * Получить припас по ID
 */
export function getSupplyById(id: string): import('./SupplyTypes').SupplyType | undefined {
    const { SUPPLY_PRESETS } = require('./SupplyTypes');
    return SUPPLY_PRESETS.find((s: import('./SupplyTypes').SupplyType) => s.id === id);
}
