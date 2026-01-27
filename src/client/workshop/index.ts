/**
 * @module workshop
 * @description Workshop Editor - система для создания и редактирования кастомных танков
 */

export { CustomTankConfiguration, PartialTankConfiguration, getDefaultConfiguration, vector3ToCoords, coordsToVector3 } from './types';
export { ConfigurationManager } from './ConfigurationManager';
export { default as ModelSelector } from './ModelSelector';
export { default as ParameterEditor } from './ParameterEditor';
export { default as AttachmentPointEditor } from './AttachmentPointEditor';
export { default as VisualEditor } from './VisualEditor';
export { default as WorkshopUI } from './WorkshopUI';

