/**
 * @module ai/EnemyCombat
 * @description Боевая система AI - стрельба, выбор цели, тактика
 * 
 * Этот модуль содержит:
 * - Типы и конфигурацию боевой системы
 * - Вспомогательные функции для боя
 */

import { Vector3 } from "@babylonjs/core";
import { AIConfig, AIStateData, DEFAULT_AI_CONFIG } from "./EnemyAI";

// ============================================
// ТИПЫ ЦЕЛЕЙ
// ============================================

export type TargetType = "player" | "enemy" | "turret" | "structure" | "vehicle";

export interface Target {
    id: string;
    type: TargetType;
    position: Vector3;
    velocity: Vector3;
    health: number;
    maxHealth: number;
    threat: number;          // Уровень угрозы (0-1)
    lastSeenTime: number;
    isVisible: boolean;
    isPriorityTarget: boolean;
}

// ============================================
// КОНФИГУРАЦИЯ БОЕВОЙ СИСТЕМЫ
// ============================================

export interface CombatConfig {
    // Атака
    minAttackRange: number;
    maxAttackRange: number;
    optimalRange: number;
    
    // Выбор цели
    targetSwitchCooldown: number;    // Минимальное время между сменой цели (мс)
    priorityTargetBonus: number;     // Бонус приоритета для приоритетных целей
    lowHealthBonus: number;          // Бонус приоритета для раненых целей
    closeRangeBonus: number;         // Бонус приоритета для близких целей
    
    // Стрельба
    aimTime: number;                 // Время прицеливания (мс)
    aimCorrection: number;           // Скорость коррекции прицела
    predictiveAiming: boolean;       // Упреждение
    
    // Тактика
    maintainDistance: boolean;       // Держать дистанцию
    circleTarget: boolean;           // Кружить вокруг цели
    useTerrainAdvantage: boolean;    // Использовать рельеф
}

export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
    // Атака
    minAttackRange: 10,
    maxAttackRange: 150,
    optimalRange: 80,
    
    // Выбор цели
    targetSwitchCooldown: 2000,
    priorityTargetBonus: 0.3,
    lowHealthBonus: 0.2,
    closeRangeBonus: 0.2,
    
    // Стрельба
    aimTime: 500,
    aimCorrection: 0.1,
    predictiveAiming: true,
    
    // Тактика
    maintainDistance: true,
    circleTarget: false,
    useTerrainAdvantage: true
};

// ============================================
// СОСТОЯНИЕ БОЯ
// ============================================

export interface CombatState {
    isInCombat: boolean;
    combatStartTime: number;
    lastAttackTime: number;
    lastTargetSwitchTime: number;
    
    currentTarget: Target | null;
    targets: Map<string, Target>;
    
    aimProgress: number;             // 0-1
    currentAimPoint: Vector3;
    predictedAimPoint: Vector3;
    
    shotsHit: number;
    shotsMissed: number;
    damageDealt: number;
    damageReceived: number;
    
    killCount: number;
    assistCount: number;
}

export function createInitialCombatState(): CombatState {
    return {
        isInCombat: false,
        combatStartTime: 0,
        lastAttackTime: 0,
        lastTargetSwitchTime: 0,
        
        currentTarget: null,
        targets: new Map(),
        
        aimProgress: 0,
        currentAimPoint: Vector3.Zero(),
        predictedAimPoint: Vector3.Zero(),
        
        shotsHit: 0,
        shotsMissed: 0,
        damageDealt: 0,
        damageReceived: 0,
        
        killCount: 0,
        assistCount: 0
    };
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Добавить/обновить цель
 */
export function updateTarget(
    state: CombatState,
    target: Target
): void {
    target.lastSeenTime = Date.now();
    state.targets.set(target.id, target);
}

/**
 * Удалить цель
 */
export function removeTarget(state: CombatState, targetId: string): void {
    state.targets.delete(targetId);
    if (state.currentTarget?.id === targetId) {
        state.currentTarget = null;
    }
}

/**
 * Вычислить приоритет цели
 */
export function calculateCombatPriority(
    aiPosition: Vector3,
    target: Target,
    config: CombatConfig
): number {
    let priority = 0;
    
    // Базовый приоритет
    priority += target.threat * 0.3;
    
    // Приоритетная цель
    if (target.isPriorityTarget) {
        priority += config.priorityTargetBonus;
    }
    
    // Раненая цель
    const healthPercent = target.health / target.maxHealth;
    if (healthPercent < 0.5) {
        priority += config.lowHealthBonus * (1 - healthPercent);
    }
    
    // Близкая цель
    const distance = Vector3.Distance(aiPosition, target.position);
    if (distance < config.optimalRange) {
        const closeness = 1 - (distance / config.optimalRange);
        priority += config.closeRangeBonus * closeness;
    }
    
    // Видимая цель
    if (target.isVisible) {
        priority += 0.1;
    }
    
    return Math.min(1, priority);
}

/**
 * Выбрать лучшую цель
 */
export function selectBestTarget(
    state: CombatState,
    aiPosition: Vector3,
    config: CombatConfig
): Target | null {
    let bestTarget: Target | null = null;
    let bestPriority = -Infinity;
    
    const now = Date.now();
    
    for (const target of state.targets.values()) {
        // Игнорируем старые цели
        if (now - target.lastSeenTime > 10000) continue;
        
        // Игнорируем мёртвые цели
        if (target.health <= 0) continue;
        
        const priority = calculateCombatPriority(aiPosition, target, config);
        
        // Бонус за текущую цель (избегаем частого переключения)
        const isCurrent = state.currentTarget?.id === target.id;
        const adjustedPriority = isCurrent ? priority + 0.15 : priority;
        
        if (adjustedPriority > bestPriority) {
            bestPriority = adjustedPriority;
            bestTarget = target;
        }
    }
    
    return bestTarget;
}

/**
 * Проверить, можно ли сменить цель
 */
export function canSwitchTarget(state: CombatState, config: CombatConfig): boolean {
    if (!state.currentTarget) return true;
    
    const now = Date.now();
    return now - state.lastTargetSwitchTime >= config.targetSwitchCooldown;
}

/**
 * Сменить цель
 */
export function switchTarget(state: CombatState, newTarget: Target | null): void {
    state.currentTarget = newTarget;
    state.lastTargetSwitchTime = Date.now();
    state.aimProgress = 0;
}

/**
 * Обновить прицеливание
 */
export function updateAiming(
    state: CombatState,
    config: CombatConfig,
    deltaMs: number
): void {
    if (!state.currentTarget) {
        state.aimProgress = 0;
        return;
    }
    
    // Увеличиваем прогресс прицеливания
    const aimRate = deltaMs / config.aimTime;
    state.aimProgress = Math.min(1, state.aimProgress + aimRate);
    
    // Интерполируем к цели
    state.currentAimPoint = Vector3.Lerp(
        state.currentAimPoint,
        state.predictedAimPoint,
        config.aimCorrection * (deltaMs / 16)
    );
}

/**
 * Вычислить точку прицеливания с упреждением
 */
export function calculateAimPoint(
    shooterPosition: Vector3,
    target: Target,
    projectileSpeed: number,
    config: CombatConfig
): Vector3 {
    if (!config.predictiveAiming || target.velocity.length() < 0.1) {
        return target.position.clone();
    }
    
    const distance = Vector3.Distance(shooterPosition, target.position);
    const flightTime = distance / projectileSpeed;
    
    // Предсказанная позиция с учётом скорости цели
    return target.position.add(target.velocity.scale(flightTime));
}

/**
 * Проверить, готов ли AI к выстрелу
 */
export function isReadyToShoot(
    state: CombatState,
    aiConfig: AIConfig,
    combatConfig: CombatConfig
): boolean {
    if (!state.currentTarget) return false;
    if (!state.isInCombat) return false;
    if (state.aimProgress < 0.8) return false;
    
    const now = Date.now();
    if (now - state.lastAttackTime < aiConfig.reactionTime) return false;
    
    return true;
}

/**
 * Вычислить точность выстрела
 */
export function calculateShotAccuracy(
    state: CombatState,
    aiConfig: AIConfig,
    isMoving: boolean,
    targetDistance: number
): number {
    let accuracy = aiConfig.accuracy;
    
    // Штраф за неполное прицеливание
    accuracy *= state.aimProgress;
    
    // Штраф за движение
    if (isMoving) {
        accuracy *= 0.7;
    }
    
    // Штраф за дистанцию
    if (targetDistance > 100) {
        accuracy *= 0.9;
    }
    if (targetDistance > 150) {
        accuracy *= 0.8;
    }
    
    return Math.max(0.1, accuracy);
}

/**
 * Записать попадание
 */
export function recordHit(state: CombatState, damage: number): void {
    state.shotsHit++;
    state.damageDealt += damage;
}

/**
 * Записать промах
 */
export function recordMiss(state: CombatState): void {
    state.shotsMissed++;
}

/**
 * Записать получение урона
 */
export function recordDamageReceived(state: CombatState, damage: number): void {
    state.damageReceived += damage;
}

/**
 * Записать убийство
 */
export function recordKill(state: CombatState, targetId: string): void {
    state.killCount++;
    removeTarget(state, targetId);
}

/**
 * Записать ассист
 */
export function recordAssist(state: CombatState): void {
    state.assistCount++;
}

/**
 * Войти в бой
 */
export function enterCombat(state: CombatState): void {
    if (state.isInCombat) return;
    
    state.isInCombat = true;
    state.combatStartTime = Date.now();
}

/**
 * Выйти из боя
 */
export function exitCombat(state: CombatState): void {
    state.isInCombat = false;
    state.currentTarget = null;
    state.aimProgress = 0;
}

/**
 * Получить направление для поддержания дистанции
 */
export function getDistanceMaintenanceDirection(
    aiPosition: Vector3,
    targetPosition: Vector3,
    optimalRange: number
): Vector3 {
    const toTarget = targetPosition.subtract(aiPosition);
    const distance = toTarget.length();
    const direction = toTarget.normalize();
    
    if (distance < optimalRange * 0.8) {
        // Слишком близко - отступаем
        return direction.scale(-1);
    } else if (distance > optimalRange * 1.2) {
        // Слишком далеко - приближаемся
        return direction;
    }
    
    // Оптимальная дистанция - стреляем на месте
    return Vector3.Zero();
}

/**
 * Получить направление для кружения вокруг цели
 */
export function getCirclingDirection(
    aiPosition: Vector3,
    targetPosition: Vector3,
    clockwise: boolean = true
): Vector3 {
    const toTarget = targetPosition.subtract(aiPosition);
    const perpendicular = new Vector3(
        clockwise ? -toTarget.z : toTarget.z,
        0,
        clockwise ? toTarget.x : -toTarget.x
    );
    return perpendicular.normalize();
}

/**
 * Вычислить статистику боя
 */
export function getCombatStats(state: CombatState): {
    accuracy: number;
    kd: number;
    damagePerMinute: number;
    combatTime: number;
} {
    const totalShots = state.shotsHit + state.shotsMissed;
    const accuracy = totalShots > 0 ? state.shotsHit / totalShots : 0;
    const kd = state.killCount; // Делим на deaths, но deaths нет в state
    
    const combatTime = state.isInCombat 
        ? (Date.now() - state.combatStartTime) / 60000 // минуты
        : 0;
    
    const damagePerMinute = combatTime > 0 
        ? state.damageDealt / combatTime 
        : 0;
    
    return { accuracy, kd, damagePerMinute, combatTime };
}

export default {
    DEFAULT_COMBAT_CONFIG
};

