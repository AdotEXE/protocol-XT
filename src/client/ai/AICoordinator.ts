/**
 * @module ai/AICoordinator
 * @description Координатор группового поведения AI
 */

import { Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { EnemyTank } from "../enemyTank";

/**
 * Тактическая роль бота
 */
export type TacticalRole = "leader" | "flanker" | "support" | "scout" | "defender";

/**
 * Данные о боте для координации
 */
export interface BotData {
    id: string;
    tank: EnemyTank;
    role: TacticalRole;
    assignedTarget: string | null;
    lastPosition: Vector3;
    isEngaged: boolean;
}

/**
 * Тактический приказ
 */
export interface TacticalOrder {
    type: "attack" | "flank" | "retreat" | "regroup" | "cover" | "patrol";
    targetPosition?: Vector3;
    targetId?: string;
    priority: number;
}

/**
 * Конфигурация координатора
 */
export interface CoordinatorConfig {
    updateInterval: number;     // Интервал обновления (мс)
    maxSquadSize: number;       // Максимум ботов в отряде
    coordinationRange: number;  // Радиус координации
    flankDistance: number;      // Дистанция для фланга
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
    updateInterval: 1000,
    maxSquadSize: 4,
    coordinationRange: 100,
    flankDistance: 40
};

/**
 * AICoordinator - Координатор групповых тактик AI
 * 
 * Отвечает за:
 * - Распределение ролей между ботами
 * - Координацию атак и отступлений
 * - Фланговые манёвры
 * - Прикрытие друг друга
 */
export class AICoordinator {
    private config: CoordinatorConfig;
    private bots: Map<string, BotData> = new Map();
    private squads: Map<string, string[]> = new Map(); // squadId -> botIds
    private playerPosition: Vector3 = Vector3.Zero();
    private lastUpdateTime: number = 0;
    
    constructor(config: Partial<CoordinatorConfig> = {}) {
        this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config };
    }
    
    /**
     * Регистрация бота
     */
    registerBot(tank: EnemyTank): void {
        const id = tank.getId().toString(); // Преобразуем number в string
        const role = this.assignRole(this.bots.size);
        
        this.bots.set(id, {
            id,
            tank,
            role,
            assignedTarget: null,
            lastPosition: tank.chassis?.absolutePosition?.clone() || Vector3.Zero(),
            isEngaged: false
        });
        
        // Добавляем в отряд
        this.assignToSquad(id);
        
        logger.debug(`[AICoordinator] Registered bot ${id} with role: ${role}`);
    }
    
    /**
     * Удаление бота
     */
    unregisterBot(id: string): void {
        const bot = this.bots.get(id);
        if (!bot) return;
        
        // Удаляем из отряда
        for (const [squadId, members] of this.squads) {
            const index = members.indexOf(id);
            if (index !== -1) {
                members.splice(index, 1);
                if (members.length === 0) {
                    this.squads.delete(squadId);
                }
                break;
            }
        }
        
        this.bots.delete(id);
        logger.debug(`[AICoordinator] Unregistered bot ${id}`);
    }
    
    /**
     * Обновление позиции игрока
     */
    updatePlayerPosition(position: Vector3): void {
        this.playerPosition = position.clone();
    }
    
    /**
     * Обновление координации (вызывается периодически)
     */
    update(): void {
        const now = Date.now();
        if (now - this.lastUpdateTime < this.config.updateInterval) return;
        this.lastUpdateTime = now;
        
        // Обновляем данные о ботах
        this.updateBotData();
        
        // Выдаём тактические приказы отрядам
        this.updateSquadTactics();
    }
    
    /**
     * Получение тактического приказа для бота
     */
    getOrder(botId: string): TacticalOrder | null {
        const bot = this.bots.get(botId);
        if (!bot) return null;
        
        // Найти отряд бота
        let squadId: string | null = null;
        for (const [sid, members] of this.squads) {
            if (members.includes(botId)) {
                squadId = sid;
                break;
            }
        }
        
        if (!squadId) return null;
        
        const squadMembers = this.squads.get(squadId) || [];
        const squadBots = squadMembers.map(id => this.bots.get(id)).filter(b => b) as BotData[];
        
        // Генерируем приказ на основе роли и ситуации
        return this.generateOrder(bot, squadBots);
    }
    
    /**
     * Запрос помощи от бота
     */
    requestHelp(botId: string, threatPosition: Vector3): void {
        const bot = this.bots.get(botId);
        if (!bot) return;
        
        // Найти ближайших союзников
        const nearbyBots = this.getNearbyBots(bot.lastPosition, this.config.coordinationRange);
        
        for (const nearbyBot of nearbyBots) {
            if (nearbyBot.id === botId) continue;
            if (nearbyBot.isEngaged) continue;
            
            // Направляем на помощь
            nearbyBot.assignedTarget = botId;
            
            logger.debug(`[AICoordinator] Bot ${nearbyBot.id} sent to help ${botId}`);
        }
    }
    
    /**
     * Получение ботов в радиусе
     */
    getNearbyBots(position: Vector3, radius: number): BotData[] {
        const result: BotData[] = [];
        
        for (const bot of this.bots.values()) {
            if (!bot.tank.isAlive) continue;
            
            const distance = Vector3.Distance(position, bot.lastPosition);
            if (distance <= radius) {
                result.push(bot);
            }
        }
        
        return result;
    }
    
    /**
     * Назначение роли
     */
    private assignRole(index: number): TacticalRole {
        const roles: TacticalRole[] = ["leader", "flanker", "support", "flanker", "scout", "defender"];
        const role = roles[index % roles.length];
        return role || "scout"; // Fallback на scout если что-то пошло не так
    }
    
    /**
     * Добавление в отряд
     */
    private assignToSquad(botId: string): void {
        // Ищем неполный отряд
        for (const [squadId, members] of this.squads) {
            if (members.length < this.config.maxSquadSize) {
                members.push(botId);
                return;
            }
        }
        
        // Создаём новый отряд
        const newSquadId = `squad_${this.squads.size}`;
        this.squads.set(newSquadId, [botId]);
    }
    
    /**
     * Обновление данных о ботах
     */
    private updateBotData(): void {
        for (const bot of this.bots.values()) {
            if (!bot.tank.isAlive) continue;
            
            bot.lastPosition = bot.tank.chassis?.absolutePosition?.clone() || bot.lastPosition;
            bot.isEngaged = bot.tank.getState() === "attack" || bot.tank.getState() === "chase";
        }
    }
    
    /**
     * Обновление тактик отрядов
     */
    private updateSquadTactics(): void {
        for (const [squadId, memberIds] of this.squads) {
            const members = memberIds.map(id => this.bots.get(id)).filter(b => b && b.tank.isAlive) as BotData[];
            if (members.length === 0) continue;
            
            // Анализируем ситуацию отряда
            const averagePosition = this.getAveragePosition(members);
            const distanceToPlayer = Vector3.Distance(averagePosition, this.playerPosition);
            
            // Назначаем тактику
            if (distanceToPlayer < 60) {
                // Близко к игроку - координированная атака
                this.assignAttackFormation(members);
            } else if (distanceToPlayer < 120) {
                // Средняя дистанция - сближение
                this.assignApproachFormation(members);
            } else {
                // Далеко - патрулирование
                this.assignPatrolFormation(members);
            }
        }
    }
    
    /**
     * Назначение атакующего построения
     */
    private assignAttackFormation(members: BotData[]): void {
        for (const bot of members) {
            switch (bot.role) {
                case "leader":
                    // Лидер атакует напрямую
                    bot.assignedTarget = "player";
                    break;
                case "flanker":
                    // Фланкеры обходят
                    const flankSide = Math.random() > 0.5 ? 1 : -1;
                    const flankPos = this.calculateFlankPosition(this.playerPosition, bot.lastPosition, flankSide);
                    // Устанавливаем цель фланга через tank API если доступно
                    break;
                case "support":
                    // Поддержка держит дистанцию
                    bot.assignedTarget = "player";
                    break;
            }
        }
    }
    
    /**
     * Назначение построения сближения
     */
    private assignApproachFormation(members: BotData[]): void {
        // Все движутся к игроку, но с разных направлений
        const angleStep = (Math.PI * 2) / Math.max(members.length, 1);
        
        for (let i = 0; i < members.length; i++) {
            const bot = members[i];
            const angle = angleStep * i;
            const offset = new Vector3(Math.cos(angle) * 20, 0, Math.sin(angle) * 20);
            // Цель с офсетом
        }
    }
    
    /**
     * Назначение патрульного построения
     */
    private assignPatrolFormation(members: BotData[]): void {
        // Распределяем по зонам патрулирования
        for (const bot of members) {
            bot.assignedTarget = null;
        }
    }
    
    /**
     * Генерация приказа для бота
     */
    private generateOrder(bot: BotData, squadMembers: BotData[]): TacticalOrder {
        const distanceToPlayer = Vector3.Distance(bot.lastPosition, this.playerPosition);
        
        // Базовый приказ на основе роли
        switch (bot.role) {
            case "leader":
                if (distanceToPlayer < 100) {
                    return { type: "attack", targetPosition: this.playerPosition.clone(), priority: 1 };
                }
                break;
                
            case "flanker":
                if (distanceToPlayer < 100) {
                    const flankPos = this.calculateFlankPosition(this.playerPosition, bot.lastPosition, 1);
                    return { type: "flank", targetPosition: flankPos, priority: 2 };
                }
                break;
                
            case "support":
                // Поддержка следует за лидером
                const leader = squadMembers.find(m => m.role === "leader");
                if (leader && distanceToPlayer < 120) {
                    return { type: "cover", targetPosition: leader.lastPosition.clone(), priority: 3 };
                }
                break;
                
            case "scout":
                return { type: "patrol", priority: 4 };
                
            case "defender":
                if (distanceToPlayer < 80) {
                    return { type: "attack", targetPosition: this.playerPosition.clone(), priority: 2 };
                }
                return { type: "patrol", priority: 5 };
        }
        
        // По умолчанию - патруль
        return { type: "patrol", priority: 10 };
    }
    
    /**
     * Вычисление позиции фланга
     */
    private calculateFlankPosition(targetPos: Vector3, myPos: Vector3, side: number): Vector3 {
        const toTarget = targetPos.subtract(myPos);
        toTarget.y = 0;
        toTarget.normalize();
        
        const perpendicular = new Vector3(toTarget.z * side, 0, -toTarget.x * side);
        return myPos.add(perpendicular.scale(this.config.flankDistance));
    }
    
    /**
     * Вычисление средней позиции
     */
    private getAveragePosition(bots: BotData[]): Vector3 {
        if (bots.length === 0) return Vector3.Zero();
        
        const sum = bots.reduce(
            (acc, bot) => acc.add(bot.lastPosition),
            Vector3.Zero()
        );
        
        return sum.scale(1 / bots.length);
    }
    
    /**
     * Количество ботов
     */
    getBotCount(): number {
        return this.bots.size;
    }
    
    /**
     * Количество отрядов
     */
    getSquadCount(): number {
        return this.squads.size;
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        this.bots.clear();
        this.squads.clear();
        logger.log("[AICoordinator] Disposed");
    }
}

