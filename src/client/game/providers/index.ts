/**
 * Provider System - Экспорт всех компонентов
 */

// Типы
export * from "./types";

// Интерфейсы
export * from "./interfaces";

// Фабрика
export { ProviderFactory } from "./ProviderFactory";

// Локальные провайдеры (SP)
export { LocalRewardProvider } from "./local/LocalRewardProvider";
export type { LocalRewardDependencies } from "./local/LocalRewardProvider";

// Сетевые провайдеры (MP)
export { NetworkRewardProvider } from "./network/NetworkRewardProvider";
export type { NetworkRewardDependencies } from "./network/NetworkRewardProvider";
