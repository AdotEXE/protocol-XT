/**
 * Garage Module - централизованный экспорт
 */

// Типы
export type { 
    CategoryType, 
    TankUpgrade, 
    TankPart, 
    GarageUIState, 
    GarageExternalSystems 
} from './GarageTypes';

// Данные
export { 
    generateChassisParts,
    generateCannonParts,
    generateTrackParts,
    generateModuleParts,
    generateSupplyParts,
    initializeGarageData
} from './GarageData';

export type { GarageDataStore } from './GarageData';

// UI
export { injectGarageStyles } from './ui';

// Превью
export { 
    initPreviewScene, 
    cleanupPreviewScene, 
    updatePreviewTank 
} from './preview';

// Материалы
export { MaterialFactory } from './materials';

// Детали
export { ChassisDetailsGenerator } from './chassisDetails';
export { CannonDetailsGenerator } from './cannonDetails';
