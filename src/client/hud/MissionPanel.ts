/**
 * @module hud/MissionPanel
 * @description Менеджер панели миссий - отображение активных заданий и прогресса
 * 
 * Этот модуль содержит:
 * - Типы миссий и их конфигурацию
 * - Вспомогательные функции для форматирования
 * - Класс менеджера для управления панелью миссий
 */

import { Rectangle, TextBlock, StackPanel, Control, AdvancedDynamicTexture, Button } from "@babylonjs/gui";

// ============================================
// ТИПЫ МИССИЙ
// ============================================

export type MissionType = 
    | "kill" 
    | "survive" 
    | "capture" 
    | "escort" 
    | "collect" 
    | "reach" 
    | "defend" 
    | "destroy"
    | "daily"
    | "weekly"
    | "story";

export type MissionStatus = "available" | "active" | "completed" | "failed" | "claimed";

export type MissionDifficulty = "easy" | "normal" | "hard" | "extreme";

export interface MissionObjective {
    id: string;
    description: string;
    current: number;
    target: number;
    completed: boolean;
    optional?: boolean;
}

export interface MissionReward {
    type: "credits" | "experience" | "item" | "tank" | "skin" | "achievement";
    amount?: number;
    itemId?: string;
    description: string;
}

export interface MissionData {
    id: string;
    type: MissionType;
    title: string;
    description: string;
    status: MissionStatus;
    difficulty: MissionDifficulty;
    objectives: MissionObjective[];
    rewards: MissionReward[];
    timeLimit?: number;          // В секундах
    timeRemaining?: number;
    expiresAt?: number;          // Timestamp
    chainId?: string;            // ID цепочки миссий
    chainIndex?: number;         // Позиция в цепочке
}

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

export interface MissionPanelConfig {
    width: number;
    height: number;
    maxVisibleMissions: number;
    backgroundColor: string;
    borderColor: string;
    completedColor: string;
    failedColor: string;
    activeColor: string;
    progressBarColor: string;
    textColor: string;
}

export const DEFAULT_MISSION_PANEL_CONFIG: MissionPanelConfig = {
    width: 280,
    height: 220,
    maxVisibleMissions: 4,
    backgroundColor: "rgba(0, 10, 0, 0.85)",
    borderColor: "#00ff00",
    completedColor: "#00ff00",
    failedColor: "#ff0000",
    activeColor: "#ffff00",
    progressBarColor: "#00ff00",
    textColor: "#ffffff"
};

export interface MissionItemConfig {
    height: number;
    padding: number;
    fontSize: number;
    progressBarHeight: number;
}

export const DEFAULT_MISSION_ITEM_CONFIG: MissionItemConfig = {
    height: 48,
    padding: 8,
    fontSize: 12,
    progressBarHeight: 4
};

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Получить цвет по статусу миссии
 */
export function getMissionStatusColor(status: MissionStatus, config: MissionPanelConfig = DEFAULT_MISSION_PANEL_CONFIG): string {
    switch (status) {
        case "completed":
        case "claimed":
            return config.completedColor;
        case "failed":
            return config.failedColor;
        case "active":
            return config.activeColor;
        default:
            return config.textColor;
    }
}

/**
 * Получить иконку по типу миссии
 */
export function getMissionTypeIcon(type: MissionType): string {
    const icons: Record<MissionType, string> = {
        kill: "💀",
        survive: "🛡️",
        capture: "🏴",
        escort: "🚛",
        collect: "📦",
        reach: "📍",
        defend: "🏰",
        destroy: "💥",
        daily: "📅",
        weekly: "📆",
        story: "📖"
    };
    return icons[type] || "❓";
}

/**
 * Получить название типа миссии
 */
export function getMissionTypeName(type: MissionType): string {
    const names: Record<MissionType, string> = {
        kill: "Уничтожение",
        survive: "Выживание",
        capture: "Захват",
        escort: "Сопровождение",
        collect: "Сбор",
        reach: "Достижение",
        defend: "Защита",
        destroy: "Разрушение",
        daily: "Ежедневная",
        weekly: "Недельная",
        story: "Сюжет"
    };
    return names[type] || "Неизвестно";
}

/**
 * Получить цвет сложности
 */
export function getDifficultyColor(difficulty: MissionDifficulty): string {
    switch (difficulty) {
        case "easy": return "#00ff00";
        case "normal": return "#ffff00";
        case "hard": return "#ff9900";
        case "extreme": return "#ff0000";
        default: return "#ffffff";
    }
}

/**
 * Получить название сложности
 */
export function getDifficultyName(difficulty: MissionDifficulty): string {
    const names: Record<MissionDifficulty, string> = {
        easy: "Лёгкая",
        normal: "Обычная",
        hard: "Сложная",
        extreme: "Экстремальная"
    };
    return names[difficulty] || "Неизвестно";
}

/**
 * Вычислить общий прогресс миссии
 */
export function calculateMissionProgress(objectives: MissionObjective[]): number {
    if (objectives.length === 0) return 0;
    
    const requiredObjectives = objectives.filter(o => !o.optional);
    if (requiredObjectives.length === 0) return objectives.every(o => o.completed) ? 1 : 0;
    
    const totalProgress = requiredObjectives.reduce((sum, obj) => {
        return sum + Math.min(obj.current / obj.target, 1);
    }, 0);
    
    return totalProgress / requiredObjectives.length;
}

/**
 * Проверить, выполнена ли миссия
 */
export function isMissionComplete(mission: MissionData): boolean {
    return mission.objectives
        .filter(o => !o.optional)
        .every(o => o.completed || o.current >= o.target);
}

/**
 * Форматировать время
 */
export function formatMissionTime(seconds: number): string {
    if (seconds < 60) return `${seconds}с`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}м ${secs}с`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}ч ${mins}м`;
}

/**
 * Форматировать награду
 */
export function formatReward(reward: MissionReward): string {
    switch (reward.type) {
        case "credits":
            return `💰 ${reward.amount} кредитов`;
        case "experience":
            return `⭐ ${reward.amount} опыта`;
        case "item":
            return `📦 ${reward.description}`;
        case "tank":
            return `🚀 ${reward.description}`;
        case "skin":
            return `🎨 ${reward.description}`;
        case "achievement":
            return `🏆 ${reward.description}`;
        default:
            return reward.description;
    }
}

/**
 * Сортировать миссии по приоритету
 */
export function sortMissionsByPriority(missions: MissionData[]): MissionData[] {
    const priorityOrder: Record<MissionStatus, number> = {
        active: 0,
        available: 1,
        completed: 2,
        claimed: 3,
        failed: 4
    };
    
    return [...missions].sort((a, b) => {
        // Сначала по статусу
        const statusDiff = priorityOrder[a.status] - priorityOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        
        // Затем по времени (если есть)
        if (a.timeRemaining !== undefined && b.timeRemaining !== undefined) {
            return a.timeRemaining - b.timeRemaining;
        }
        
        // Затем по сложности
        const difficultyOrder: Record<MissionDifficulty, number> = {
            easy: 0, normal: 1, hard: 2, extreme: 3
        };
        return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
    });
}

/**
 * Фильтровать миссии по типу
 */
export function filterMissionsByType(missions: MissionData[], types: MissionType[]): MissionData[] {
    return missions.filter(m => types.includes(m.type));
}

/**
 * Фильтровать миссии по статусу
 */
export function filterMissionsByStatus(missions: MissionData[], statuses: MissionStatus[]): MissionData[] {
    return missions.filter(m => statuses.includes(m.status));
}

// ============================================
// КЛАСС МЕНЕДЖЕРА
// ============================================

/**
 * Менеджер панели миссий
 */
export class MissionPanelManager {
    private guiTexture: AdvancedDynamicTexture | null = null;
    private config: MissionPanelConfig;
    private itemConfig: MissionItemConfig;
    
    private missions: Map<string, MissionData> = new Map();
    private isVisible = false;
    
    private onClaimCallback: ((missionId: string) => void) | null = null;
    
    constructor(
        config: Partial<MissionPanelConfig> = {},
        itemConfig: Partial<MissionItemConfig> = {}
    ) {
        this.config = { ...DEFAULT_MISSION_PANEL_CONFIG, ...config };
        this.itemConfig = { ...DEFAULT_MISSION_ITEM_CONFIG, ...itemConfig };
    }
    
    /**
     * Инициализация
     */
    initialize(guiTexture: AdvancedDynamicTexture): void {
        this.guiTexture = guiTexture;
    }
    
    /**
     * Установить callback для получения награды
     */
    setOnClaimCallback(callback: (missionId: string) => void): void {
        this.onClaimCallback = callback;
    }
    
    /**
     * Добавить миссию
     */
    addMission(mission: MissionData): void {
        this.missions.set(mission.id, mission);
    }
    
    /**
     * Удалить миссию
     */
    removeMission(id: string): void {
        this.missions.delete(id);
    }
    
    /**
     * Обновить миссию
     */
    updateMission(id: string, updates: Partial<MissionData>): void {
        const mission = this.missions.get(id);
        if (mission) {
            Object.assign(mission, updates);
        }
    }
    
    /**
     * Обновить прогресс цели
     */
    updateObjectiveProgress(missionId: string, objectiveId: string, current: number): void {
        const mission = this.missions.get(missionId);
        if (!mission) return;
        
        const objective = mission.objectives.find(o => o.id === objectiveId);
        if (objective) {
            objective.current = current;
            objective.completed = current >= objective.target;
        }
        
        // Проверить, выполнена ли миссия
        if (isMissionComplete(mission)) {
            mission.status = "completed";
        }
    }
    
    /**
     * Получить миссию
     */
    getMission(id: string): MissionData | undefined {
        return this.missions.get(id);
    }
    
    /**
     * Получить все миссии
     */
    getAllMissions(): MissionData[] {
        return Array.from(this.missions.values());
    }
    
    /**
     * Получить активные миссии
     */
    getActiveMissions(): MissionData[] {
        return filterMissionsByStatus(this.getAllMissions(), ["active"]);
    }
    
    /**
     * Получить выполненные миссии (не забранные)
     */
    getCompletedMissions(): MissionData[] {
        return filterMissionsByStatus(this.getAllMissions(), ["completed"]);
    }
    
    /**
     * Получить миссии для отображения (отсортированные)
     */
    getDisplayMissions(): MissionData[] {
        const missions = this.getAllMissions();
        const sorted = sortMissionsByPriority(missions);
        return sorted.slice(0, this.config.maxVisibleMissions);
    }
    
    /**
     * Получить ежедневные миссии
     */
    getDailyMissions(): MissionData[] {
        return filterMissionsByType(this.getAllMissions(), ["daily"]);
    }
    
    /**
     * Переключить видимость панели
     */
    toggle(): boolean {
        this.isVisible = !this.isVisible;
        return this.isVisible;
    }
    
    /**
     * Показать панель
     */
    show(): void {
        this.isVisible = true;
    }
    
    /**
     * Скрыть панель
     */
    hide(): void {
        this.isVisible = false;
    }
    
    /**
     * Получить состояние видимости
     */
    getIsVisible(): boolean {
        return this.isVisible;
    }
    
    /**
     * Забрать награду за миссию
     */
    claimReward(missionId: string): boolean {
        const mission = this.missions.get(missionId);
        if (!mission || mission.status !== "completed") return false;
        
        mission.status = "claimed";
        
        if (this.onClaimCallback) {
            this.onClaimCallback(missionId);
        }
        
        return true;
    }
    
    /**
     * Получить конфигурацию
     */
    getConfig(): MissionPanelConfig {
        return { ...this.config };
    }
    
    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<MissionPanelConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * Очистить все миссии
     */
    clear(): void {
        this.missions.clear();
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.clear();
        this.guiTexture = null;
        this.onClaimCallback = null;
    }
}

export default MissionPanelManager;

