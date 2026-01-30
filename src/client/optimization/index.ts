/**
 * @module optimization
 * @description Performance optimization modules
 * 
 * Модули:
 * - PerformanceOptimizer - LOD, culling, pooling
 * - AdaptiveQualityScaler - автоматическая настройка качества
 * - Vector3Pool - пул объектов Vector3
 * - ProjectilePool - пул объектов снарядов
 * - DeviceDetector - определение характеристик устройства
 * - TimeProvider - централизованный провайдер времени
 * - TimerManager - централизованный менеджер таймеров
 */

export { PerformanceOptimizer, DEFAULT_OPTIMIZER_CONFIG } from './PerformanceOptimizer';
export type { OptimizerConfig, LODLevel } from './PerformanceOptimizer';

export { AdaptiveQualityScaler, QUALITY_PRESETS } from './AdaptiveQualityScaler';
export type { QualitySettings, AdaptiveScalerConfig } from './AdaptiveQualityScaler';

export { Vector3Pool, vector3Pool } from './Vector3Pool';

export { ProjectilePool } from './ProjectilePool';
export type { ProjectilePoolConfig } from './ProjectilePool';

export { DeviceDetector, deviceDetector } from './DeviceDetector';
export type { DeviceInfo, DeviceTier } from './DeviceDetector';

export { timeProvider } from './TimeProvider';
export { timerManager } from './TimerManager';

