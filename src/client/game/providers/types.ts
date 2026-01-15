/**
 * Общие типы для системы провайдеров
 */

import type { Vector3 } from "@babylonjs/core";

/**
 * Награда за действие
 */
export interface Reward {
    experience: number;
    credits: number;
    achievements?: string[];
    missionProgress?: { missionId: string; progress: number }[];
    battlePassXP?: number;
    dailyQuestProgress?: { questId: string; progress: number }[];
}

/**
 * Контекст награды за убийство
 */
export interface RewardContext {
    killerId: string;
    victimId: string;
    isPlayerKill: boolean; // true если убит игрок, false если бот
    weapon?: string;
    position?: Vector3;
    damage?: number;
    isCritical?: boolean;
}

/**
 * Тип провайдера
 */
export type ProviderType = "local" | "network";

/**
 * Базовый интерфейс для всех провайдеров
 */
export interface IBaseProvider {
    initialize(dependencies: any): void;
    isReady(): boolean;
    cleanup(): void;
}
