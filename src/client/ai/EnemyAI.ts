/**
 * @module ai/EnemyAI
 * @description Система AI врагов - поведение, патрулирование, атака
 * 
 * Этот модуль содержит:
 * - Типы состояний AI
 * - Конфигурацию поведения
 * - Вспомогательные функции для AI
 */

import { Vector3 } from "@babylonjs/core";

// ============================================
// СОСТОЯНИЯ AI
// ============================================

export type AIState = 
    | "idle"
    | "patrol"
    | "chase"
    | "attack"
    | "flank"
    | "retreat"
    | "cover"
    | "support"
    | "search"
    | "dead";

export type AIBehaviorType = 
    | "aggressive"    // Атакует при любой возможности
    | "defensive"     // Держит позицию, контратакует
    | "flanker"       // Обходит с флангов
    | "sniper"        // Стреляет с дистанции
    | "support"       // Поддерживает союзников
    | "kamikaze"      // Идёт на таран
    | "coward";       // Убегает при опасности

export type AIAwareness = "unaware" | "suspicious" | "alert" | "combat";

// ============================================
// КОНФИГУРАЦИЯ AI
// ============================================

export interface AIConfig {
    // Восприятие
    viewDistance: number;
    viewAngle: number;              // Угол обзора (градусы)
    hearingDistance: number;
    alertDuration: number;          // Время в состоянии тревоги (мс)
    
    // Поведение
    behaviorType: AIBehaviorType;
    aggressionLevel: number;        // 0-1
    cautiousness: number;           // 0-1
    teamworkLevel: number;          // 0-1
    
    // Движение
    moveSpeed: number;
    turnSpeed: number;
    patrolRadius: number;
    chaseDistance: number;
    retreatHealthThreshold: number; // % HP для отступления
    
    // Стрельба
    accuracy: number;               // 0-1
    reactionTime: number;           // Время реакции (мс)
    burstLength: number;            // Длина очереди
    burstPause: number;             // Пауза между очередями (мс)
    leadTarget: boolean;            // Упреждение по движущейся цели
    
    // Тактика
    useСover: boolean;
    flanksAllowed: boolean;
    retreatAllowed: boolean;
    supportAllies: boolean;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
    // EXTREME: Восприятие - видят всё!
    viewDistance: 300, // EXTREME: +100% (было 150)
    viewAngle: 180, // EXTREME: +50% (было 120) - почти полный обзор!
    hearingDistance: 100, // EXTREME: +100% (было 50) - слышат издалека
    alertDuration: 20000, // EXTREME: +100% (было 10000) - долго помнят угрозу
    
    // EXTREME: Поведение - максимальная агрессия!
    behaviorType: "aggressive",
    aggressionLevel: 0.95, // EXTREME: +36% (было 0.7)
    cautiousness: 0.1, // EXTREME: -67% (было 0.3) - меньше осторожности
    teamworkLevel: 0.9, // EXTREME: +80% (было 0.5) - отличная координация
    
    // EXTREME: Движение - быстрые и манёвренные!
    moveSpeed: 18, // EXTREME: +80% (было 10)
    turnSpeed: 4, // EXTREME: +100% (было 2)
    patrolRadius: 100, // EXTREME: +100% (было 50) - патрулируют большую область
    chaseDistance: 200, // EXTREME: +100% (было 100) - преследуют дальше
    retreatHealthThreshold: 0.05, // EXTREME: -75% (было 0.2) - сражаются до последнего!
    
    // EXTREME: Стрельба - идеальная точность!
    accuracy: 0.95, // EXTREME: +58% (было 0.6)
    reactionTime: 100, // EXTREME: -80% (было 500) - молниеносная реакция!
    burstLength: 5, // EXTREME: +67% (было 3) - длиннее очереди
    burstPause: 500, // EXTREME: -50% (было 1000) - короче пауза
    leadTarget: true,
    
    // EXTREME: Тактика - все тактики включены!
    useСover: true,
    flanksAllowed: true,
    retreatAllowed: false, // EXTREME: НЕ отступают!
    supportAllies: true
};

// ============================================
// ПРЕСЕТЫ ПОВЕДЕНИЯ
// ============================================

// EXTREME: Все пресеты значительно усилены!
export const AI_PRESETS: Record<AIBehaviorType, Partial<AIConfig>> = {
    aggressive: {
        aggressionLevel: 1.0, // EXTREME: Максимальная агрессия!
        cautiousness: 0.0, // EXTREME: Нет осторожности!
        retreatAllowed: false,
        chaseDistance: 300, // EXTREME: +100% (было 150)
        reactionTime: 50, // EXTREME: Мгновенная реакция!
        accuracy: 1.0 // EXTREME: Идеальная точность!
    },
    defensive: {
        aggressionLevel: 0.7, // EXTREME: +75% (было 0.4)
        cautiousness: 0.4, // EXTREME: -43% (было 0.7)
        useСover: true,
        patrolRadius: 60, // EXTREME: +100% (было 30)
        accuracy: 0.95 // EXTREME: Высокая точность!
    },
    flanker: {
        aggressionLevel: 0.9, // EXTREME: +50% (было 0.6)
        flanksAllowed: true,
        moveSpeed: 24, // EXTREME: +100% (было 12)
        turnSpeed: 5, // EXTREME: Быстрый поворот!
        cautiousness: 0.2 // EXTREME: -50% (было 0.4)
    },
    sniper: {
        accuracy: 1.0, // EXTREME: Идеальная точность (было 0.9)
        viewDistance: 400, // EXTREME: +60% (было 250)
        chaseDistance: 100, // EXTREME: +100% (было 50)
        cautiousness: 0.5, // EXTREME: -37% (было 0.8)
        reactionTime: 100 // EXTREME: Быстрая реакция!
    },
    support: {
        teamworkLevel: 1.0, // EXTREME: Идеальная координация (было 0.9)
        supportAllies: true,
        aggressionLevel: 0.6, // EXTREME: +100% (было 0.3)
        accuracy: 0.9 // EXTREME: Хорошая точность!
    },
    kamikaze: {
        aggressionLevel: 1.0,
        cautiousness: 0,
        retreatAllowed: false,
        chaseDistance: 400, // EXTREME: +100% (было 200)
        moveSpeed: 30, // EXTREME: Максимальная скорость!
        reactionTime: 0 // EXTREME: Мгновенная реакция!
    },
    coward: {
        aggressionLevel: 0.3, // EXTREME: +200% (было 0.1) - даже трусы атакуют!
        cautiousness: 0.6, // EXTREME: -33% (было 0.9)
        retreatHealthThreshold: 0.2, // EXTREME: -60% (было 0.5)
        retreatAllowed: true,
        accuracy: 0.85 // EXTREME: Неплохая точность!
    }
};

// ============================================
// СОСТОЯНИЕ AI
// ============================================

export interface AIStateData {
    currentState: AIState;
    previousState: AIState;
    stateStartTime: number;
    
    awareness: AIAwareness;
    lastKnownTargetPos: Vector3 | null;
    lastSeenTime: number;
    
    currentTarget: string | null;
    targetPriority: number;
    
    patrolPoints: Vector3[];
    currentPatrolIndex: number;
    
    coverPosition: Vector3 | null;
    flankDirection: number;         // -1 = left, 1 = right
    
    shotsFired: number;
    lastShotTime: number;
    nextShotTime: number;
    
    healthAtCombatStart: number;
    damageReceived: number;
    
    allies: string[];
    supportTarget: string | null;
}

export function createInitialAIState(): AIStateData {
    return {
        currentState: "idle",
        previousState: "idle",
        stateStartTime: Date.now(),
        
        awareness: "unaware",
        lastKnownTargetPos: null,
        lastSeenTime: 0,
        
        currentTarget: null,
        targetPriority: 0,
        
        patrolPoints: [],
        currentPatrolIndex: 0,
        
        coverPosition: null,
        flankDirection: 1,
        
        shotsFired: 0,
        lastShotTime: 0,
        nextShotTime: 0,
        
        healthAtCombatStart: 1,
        damageReceived: 0,
        
        allies: [],
        supportTarget: null
    };
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Проверить, видит ли AI цель
 */
export function canSeeTarget(
    aiPosition: Vector3,
    aiForward: Vector3,
    targetPosition: Vector3,
    config: AIConfig
): boolean {
    const toTarget = targetPosition.subtract(aiPosition);
    const distance = toTarget.length();
    
    if (distance > config.viewDistance) return false;
    
    const direction = toTarget.normalize();
    const dot = Vector3.Dot(aiForward.normalize(), direction);
    const angle = Math.acos(dot) * 180 / Math.PI;
    
    return angle <= config.viewAngle / 2;
}

/**
 * Вычислить приоритет цели
 */
export function calculateTargetPriority(
    aiPosition: Vector3,
    targetPosition: Vector3,
    targetHealth: number,
    targetThreat: number,
    isCurrentTarget: boolean
): number {
    const distance = Vector3.Distance(aiPosition, targetPosition);
    
    // Близкие цели приоритетнее
    const distancePriority = Math.max(0, 1 - distance / 200);
    
    // Слабые цели приоритетнее
    const healthPriority = 1 - targetHealth;
    
    // Угрожающие цели приоритетнее
    const threatPriority = targetThreat;
    
    // Бонус за текущую цель (избегаем частого переключения)
    const currentBonus = isCurrentTarget ? 0.2 : 0;
    
    return distancePriority * 0.3 + healthPriority * 0.2 + threatPriority * 0.3 + currentBonus + 0.2;
}

/**
 * Выбрать следующее состояние
 */
export function selectNextState(
    state: AIStateData,
    config: AIConfig,
    healthPercent: number,
    canSeeEnemy: boolean,
    distanceToTarget: number
): AIState {
    // Мертв
    if (healthPercent <= 0) return "dead";
    
    // Отступление при низком здоровье
    if (config.retreatAllowed && healthPercent < config.retreatHealthThreshold) {
        return "retreat";
    }
    
    // Если видим врага
    if (canSeeEnemy && state.currentTarget) {
        // Достаточно близко для атаки
        if (distanceToTarget < config.viewDistance * 0.7) {
            // Решаем: атаковать или обходить
            if (config.flanksAllowed && Math.random() < 0.3) {
                return "flank";
            }
            return "attack";
        }
        // Преследуем
        return "chase";
    }
    
    // Не видим, но знаем где был
    if (state.lastKnownTargetPos && Date.now() - state.lastSeenTime < config.alertDuration) {
        return "search";
    }
    
    // Всё спокойно - патрулируем
    if (state.patrolPoints.length > 0) {
        return "patrol";
    }
    
    return "idle";
}

/**
 * Вычислить точку для обхода с фланга
 */
export function calculateFlankPosition(
    aiPosition: Vector3,
    targetPosition: Vector3,
    flankDirection: number,
    distance: number = 30
): Vector3 {
    const toTarget = targetPosition.subtract(aiPosition).normalize();
    
    // Перпендикулярное направление
    const perpendicular = new Vector3(toTarget.z * flankDirection, 0, -toTarget.x * flankDirection);
    
    // Точка сбоку от цели
    return targetPosition.add(perpendicular.scale(distance));
}

/**
 * Вычислить позицию для укрытия
 */
export function calculateCoverPosition(
    aiPosition: Vector3,
    threatPosition: Vector3,
    coverPoints: Vector3[],
    minDistance: number = 10
): Vector3 | null {
    // Ищем укрытие, которое находится между AI и угрозой не слишком близко
    let bestCover: Vector3 | null = null;
    let bestScore = -Infinity;
    
    for (const cover of coverPoints) {
        const distToAI = Vector3.Distance(cover, aiPosition);
        const distToThreat = Vector3.Distance(cover, threatPosition);
        
        if (distToAI < minDistance) continue;
        
        // Укрытие должно быть дальше от угрозы чем AI
        const score = distToThreat - distToAI;
        
        if (score > bestScore) {
            bestScore = score;
            bestCover = cover;
        }
    }
    
    return bestCover;
}

/**
 * Вычислить упреждение для стрельбы
 */
export function calculateLeadPosition(
    shooterPosition: Vector3,
    targetPosition: Vector3,
    targetVelocity: Vector3,
    projectileSpeed: number
): Vector3 {
    const distance = Vector3.Distance(shooterPosition, targetPosition);
    const flightTime = distance / projectileSpeed;
    
    // Предсказанная позиция
    return targetPosition.add(targetVelocity.scale(flightTime));
}

/**
 * Добавить разброс к направлению
 */
export function applyAccuracySpread(
    direction: Vector3,
    accuracy: number,
    maxSpread: number = 0.1
): Vector3 {
    const spread = maxSpread * (1 - accuracy);
    
    const randomX = (Math.random() - 0.5) * 2 * spread;
    const randomY = (Math.random() - 0.5) * 2 * spread;
    const randomZ = (Math.random() - 0.5) * 2 * spread;
    
    return direction.add(new Vector3(randomX, randomY, randomZ)).normalize();
}

/**
 * Проверить, пора ли стрелять
 */
export function shouldShoot(
    state: AIStateData,
    config: AIConfig,
    now: number
): boolean {
    if (now < state.nextShotTime) return false;
    if (!state.currentTarget) return false;
    if (state.currentState !== "attack") return false;
    
    return true;
}

/**
 * Обновить время следующего выстрела
 */
export function updateNextShotTime(
    state: AIStateData,
    config: AIConfig,
    now: number
): number {
    state.shotsFired++;
    state.lastShotTime = now;
    
    // Пауза после очереди
    if (state.shotsFired >= config.burstLength) {
        state.shotsFired = 0;
        return now + config.burstPause;
    }
    
    // Короткая пауза между выстрелами в очереди
    return now + 100 + Math.random() * 200;
}

/**
 * Генерировать точки патрулирования
 */
export function generatePatrolPoints(
    center: Vector3,
    radius: number,
    count: number = 4
): Vector3[] {
    const points: Vector3[] = [];
    const angleStep = (Math.PI * 2) / count;
    
    for (let i = 0; i < count; i++) {
        const angle = i * angleStep + (Math.random() - 0.5) * 0.5;
        const dist = radius * (0.5 + Math.random() * 0.5);
        
        points.push(new Vector3(
            center.x + Math.cos(angle) * dist,
            center.y,
            center.z + Math.sin(angle) * dist
        ));
    }
    
    return points;
}

/**
 * Получить следующую точку патрулирования
 */
export function getNextPatrolPoint(state: AIStateData): Vector3 | null {
    if (state.patrolPoints.length === 0) return null;
    
    state.currentPatrolIndex = (state.currentPatrolIndex + 1) % state.patrolPoints.length;
    return state.patrolPoints[state.currentPatrolIndex] || null;
}

/**
 * Изменить состояние AI
 */
export function changeAIState(state: AIStateData, newState: AIState): void {
    if (state.currentState === newState) return;
    
    state.previousState = state.currentState;
    state.currentState = newState;
    state.stateStartTime = Date.now();
}

/**
 * Получить конфиг с пресетом
 */
export function getAIConfigWithPreset(behaviorType: AIBehaviorType): AIConfig {
    const preset = AI_PRESETS[behaviorType] || {};
    return { ...DEFAULT_AI_CONFIG, ...preset, behaviorType };
}

export default {
    DEFAULT_AI_CONFIG,
    AI_PRESETS
};

