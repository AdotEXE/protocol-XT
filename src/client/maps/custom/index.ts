/**
 * @module maps/custom
 * @description Экспорт генератора пользовательских карт
 */

export {
    CustomMapGenerator,
    getCustomMapGenerator,
    loadCustomMap,
    type TXMapData,
    type TXPlacedObject,
    type TXMapTrigger,
    type TXTerrainEdit,
    type CustomMapConfig
} from './CustomMapGenerator';

export {
    initCustomMapBridge,
    destroyCustomMapBridge,
    getCustomMapsList,
    getCustomMapData,
    deleteCustomMap
} from './CustomMapBridge';
