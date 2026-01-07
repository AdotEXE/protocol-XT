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
    updateInterval: 50, // EXTREME: -50% (было 100) - мгновенная координация!
    maxSquadSize: 8, // EXTREME: +33% (было 6) - огромные отряды
    coordinationRange: 350, // EXTREME: +75% (было 200) - глобальная координация!
    flankDistance: 60 // EXTREME: +33% (было 45) - широкие фланговые охваты
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
    
    // EXTREME: Мгновенная синхронизация атак
    private synchronizedAttackTimer = 0;
    private readonly SYNC_ATTACK_WINDOW = 150; // EXTREME: -50% (было 300) - молниеносная синхронизация!
    private pendingAttackSquad: string | null = null;
    
    // EXTREME: Улучшенная коммуникация между ботами
    private botMessages: Map<string, { type: string, data: any, timestamp: number }> = new Map();
    private readonly MESSAGE_TTL = 10000; // EXTREME: +100% (было 5000) - дольше помнят сообщения
    
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
     * УЛУЧШЕНО: Запрос помощи от бота с приоритетом
     */
    requestHelp(botId: string, threatPosition: Vector3): void {
        const bot = this.bots.get(botId);
        if (!bot) return;
        
        // УЛУЧШЕНО: Найти ближайших союзников и отсортировать по расстоянию
        const nearbyBots = this.getNearbyBots(bot.lastPosition, this.config.coordinationRange);
        nearbyBots.sort((a, b) => {
            const distA = Vector3.Distance(a.lastPosition, bot.lastPosition);
            const distB = Vector3.Distance(b.lastPosition, bot.lastPosition);
            return distA - distB;
        });
        
        // УЛУЧШЕНО: Прикрываем раненых союзников - отправляем ближайших ботов на помощь
        let helpCount = 0;
        const maxHelp = 2; // Максимум 2 бота на помощь
        
        for (const nearbyBot of nearbyBots) {
            if (nearbyBot.id === botId) continue;
            if (helpCount >= maxHelp) break;
            
            // УЛУЧШЕНО: Support боты имеют приоритет для помощи
            if (nearbyBot.role === "support" || !nearbyBot.isEngaged) {
                nearbyBot.assignedTarget = botId;
                this.sendMessage(nearbyBot.id, "help_request", { 
                    targetId: botId, 
                    threatPosition: threatPosition.clone() 
                });
                helpCount++;
                logger.debug(`[AICoordinator] Bot ${nearbyBot.id} sent to help ${botId}`);
            }
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
     * NIGHTMARE AI: Обновление тактик отрядов с окружением игрока!
     */
    private updateSquadTactics(): void {
        // NIGHTMARE: Собираем ВСЕХ живых ботов для координированной атаки
        const allAliveBots: BotData[] = [];
        for (const bot of this.bots.values()) {
            if (bot.tank.isAlive) {
                allAliveBots.push(bot);
            }
        }
        
        // NIGHTMARE: Если есть 2+ ботов - используем тактику КЛЕЩЕЙ!
        if (allAliveBots.length >= 2) {
            this.executePincerMovement(allAliveBots);
        }
        
        for (const [squadId, memberIds] of this.squads) {
            const members = memberIds.map(id => this.bots.get(id)).filter(b => b && b.tank.isAlive) as BotData[];
            if (members.length === 0) continue;
            
            // Анализируем ситуацию отряда
            const averagePosition = this.getAveragePosition(members);
            const distanceToPlayer = Vector3.Distance(averagePosition, this.playerPosition);
            
            // EXTREME NIGHTMARE: Максимально агрессивные атаки!
            if (distanceToPlayer < 200) { // EXTREME: +67% (было 120) - атакуем с огромной дистанции!
                // Близко к игроку - координированная атака
                this.assignAttackFormation(members);
            } else if (distanceToPlayer < 350) { // EXTREME: +75% (было 200) - сближаемся издалека!
                // Средняя дистанция - АГРЕССИВНОЕ сближение
                this.assignApproachFormation(members);
            } else {
                // Далеко - АКТИВНОЕ патрулирование с поиском
                this.assignPatrolFormation(members);
            }
        }
    }
    
    /**
     * EXTREME NIGHTMARE AI: Тактика "Клещи" - окружение игрока со всех сторон!
     */
    private executePincerMovement(bots: BotData[]): void {
        if (bots.length < 2) return;
        
        // EXTREME: Распределяем ботов по кругу вокруг игрока - ближе и плотнее!
        const angleStep = (Math.PI * 2) / bots.length;
        const baseRadius = 25; // EXTREME: -29% (было 35) - ещё ближе окружение!
        
        for (let i = 0; i < bots.length; i++) {
            const bot = bots[i];
            if (!bot) continue;
            const angle = angleStep * i;
            
            // Вычисляем позицию окружения
            const pincerPos = new Vector3(
                this.playerPosition.x + Math.cos(angle) * baseRadius,
                this.playerPosition.y,
                this.playerPosition.z + Math.sin(angle) * baseRadius
            );
            
            // Назначаем позицию для окружения
            bot.assignedTarget = `pincer_${pincerPos.x.toFixed(0)}_${pincerPos.z.toFixed(0)}`;
            
            // Отправляем сообщение боту
            this.sendMessage(bot.id, "pincer_position", { 
                position: pincerPos,
                angle: angle,
                role: i === 0 ? "primary_attacker" : "encircler"
            });
        }
        
        logger.debug(`[AICoordinator] NIGHTMARE: Pincer movement with ${bots.length} bots`);
    }
    
    /**
     * УЛУЧШЕНО: Назначение атакующего построения с синхронизацией
     */
    private assignAttackFormation(members: BotData[]): void {
        const now = Date.now();
        const squadId = this.getSquadIdForMembers(members);
        
        // УЛУЧШЕНО: Синхронизированная атака - все боты атакуют одновременно
        if (!this.pendingAttackSquad || this.pendingAttackSquad !== squadId) {
            // Инициируем синхронизированную атаку
            this.pendingAttackSquad = squadId;
            this.synchronizedAttackTimer = now;
            
            // Отправляем сообщение всем ботам отряда
            for (const bot of members) {
                this.sendMessage(bot.id, "synchronized_attack", { time: now + this.SYNC_ATTACK_WINDOW });
            }
        }
        
        // УЛУЧШЕНО: Координированные фланги - несколько ботов с разных сторон
        const flankers = members.filter(b => b.role === "flanker");
        const flankCount = flankers.length;
        
        for (let i = 0; i < members.length; i++) {
            const bot = members[i]!;
            
            switch (bot.role) {
                case "leader":
                    // Лидер атакует напрямую, принимает урон
                    bot.assignedTarget = "player";
                    break;
                    
                case "flanker":
                    // УЛУЧШЕНО: Фланкеры распределяются по разным сторонам
                    const flankIndex = flankers.indexOf(bot);
                    const flankSide = flankIndex % 2 === 0 ? 1 : -1;
                    const flankOffset = Math.floor(flankIndex / 2) * 15; // Расстояние между фланкерами
                    const flankPos = this.calculateFlankPosition(
                        this.playerPosition, 
                        bot.lastPosition, 
                        flankSide,
                        flankOffset
                    );
                    bot.assignedTarget = `flank_${flankPos.x}_${flankPos.z}`;
                    break;
                    
                case "support":
                    // УЛУЧШЕНО: Поддержка держит дистанцию и прикрывает лидера
                    const leader = members.find(m => m.role === "leader");
                    if (leader) {
                        // Позиция поддержки - за лидером, но с обзором
                        const supportPos = leader.lastPosition.clone();
                        const toPlayer = this.playerPosition.subtract(leader.lastPosition).normalize();
                        supportPos.add(toPlayer.scale(-15)); // 15м за лидером
                        bot.assignedTarget = `support_${supportPos.x}_${supportPos.z}`;
                    } else {
                        bot.assignedTarget = "player";
                    }
                    break;
                    
                case "scout":
                    // Разведчик держит максимальную дистанцию
                    bot.assignedTarget = "player";
                    break;
                    
                case "defender":
                    // Защитник блокирует путь отступления
                    const retreatBlockPos = this.calculateRetreatBlockPosition(this.playerPosition, bot.lastPosition);
                    bot.assignedTarget = `block_${retreatBlockPos.x}_${retreatBlockPos.z}`;
                    break;
            }
        }
    }
    
    /**
     * УЛУЧШЕНО: Вычисление позиции фланга с офсетом
     */
    private calculateFlankPosition(targetPos: Vector3, myPos: Vector3, side: number, offset: number = 0): Vector3 {
        const toTarget = targetPos.subtract(myPos);
        toTarget.y = 0;
        toTarget.normalize();
        
        const perpendicular = new Vector3(toTarget.z * side, 0, -toTarget.x * side);
        const flankBase = myPos.add(perpendicular.scale(this.config.flankDistance + offset));
        
        // УЛУЧШЕНО: Добавляем смещение вперёд для лучшего угла атаки
        const forwardOffset = toTarget.scale(offset * 0.3);
        return flankBase.add(forwardOffset);
    }
    
    /**
     * УЛУЧШЕНО: Вычисление позиции блокировки отступления
     */
    private calculateRetreatBlockPosition(targetPos: Vector3, myPos: Vector3): Vector3 {
        // Позиция за игроком для блокировки отступления
        const toPlayer = targetPos.subtract(myPos);
        toPlayer.y = 0;
        toPlayer.normalize();
        
        // Позиция за игроком на расстоянии 30м
        return targetPos.add(toPlayer.scale(-30));
    }
    
    /**
     * УЛУЧШЕНО: Получение ID отряда для ботов
     */
    private getSquadIdForMembers(members: BotData[]): string | null {
        if (members.length === 0) return null;
        
        for (const [squadId, memberIds] of this.squads) {
            if (memberIds.includes(members[0]!.id)) {
                return squadId;
            }
        }
        
        return null;
    }
    
    /**
     * УЛУЧШЕНО: Отправка сообщения боту
     */
    private sendMessage(botId: string, type: string, data: any): void {
        this.botMessages.set(botId, {
            type,
            data,
            timestamp: Date.now()
        });
    }
    
    /**
     * УЛУЧШЕНО: Получение сообщений для бота
     */
    getMessages(botId: string): Array<{ type: string, data: any }> {
        const message = this.botMessages.get(botId);
        if (!message) return [];
        
        const now = Date.now();
        if (now - message.timestamp > this.MESSAGE_TTL) {
            this.botMessages.delete(botId);
            return [];
        }
        
        return [{ type: message.type, data: message.data }];
    }
    
    /**
     * Назначение построения сближения
     */
    private assignApproachFormation(members: BotData[]): void {
        // СУПЕР: Агрессивное сближение с окружением!
        const angleStep = (Math.PI * 2) / Math.max(members.length, 1);
        
        for (let i = 0; i < members.length; i++) {
            const bot = members[i]!;
            const angle = angleStep * i;
            // СУПЕР: Меньший офсет для более плотного окружения!
            const offset = new Vector3(Math.cos(angle) * 15, 0, Math.sin(angle) * 15);
            // Цель с офсетом - идём к игроку с разных сторон
            const targetPos = this.playerPosition.clone().add(offset);
            bot.assignedTarget = `approach_${targetPos.x.toFixed(0)}_${targetPos.z.toFixed(0)}`;
        }
    }
    
    /**
     * СУПЕР: Назначение АГРЕССИВНОГО патрульного построения
     */
    private assignPatrolFormation(members: BotData[]): void {
        // СУПЕР: Активное патрулирование с поиском игрока!
        for (const bot of members) {
            // СУПЕР: Движемся к последней известной позиции игрока!
            if (this.playerPosition && this.playerPosition.length() > 0) {
                const searchRadius = 50 + Math.random() * 50; // 50-100м от игрока
                const searchAngle = Math.random() * Math.PI * 2;
                const searchOffset = new Vector3(
                    Math.cos(searchAngle) * searchRadius,
                    0,
                    Math.sin(searchAngle) * searchRadius
                );
                const searchPos = this.playerPosition.clone().add(searchOffset);
                bot.assignedTarget = `search_${searchPos.x.toFixed(0)}_${searchPos.z.toFixed(0)}`;
            } else {
                bot.assignedTarget = null;
            }
        }
    }
    
    /**
     * Генерация приказа для бота
     */
    private generateOrder(bot: BotData, squadMembers: BotData[]): TacticalOrder {
        const distanceToPlayer = Vector3.Distance(bot.lastPosition, this.playerPosition);
        
        // СУПЕР: Агрессивные приказы на основе роли!
        switch (bot.role) {
            case "leader":
                if (distanceToPlayer < 150) { // СУПЕР: Увеличено с 100 до 150!
                    return { type: "attack", targetPosition: this.playerPosition.clone(), priority: 1 };
                }
                break;
                
            case "flanker":
                if (distanceToPlayer < 150) { // СУПЕР: Увеличено с 100 до 150!
                    // СУПЕР: Рандомизируем сторону фланга!
                    const side = Math.random() > 0.5 ? 1 : -1;
                    const flankPos = this.calculateFlankPosition(this.playerPosition, bot.lastPosition, side);
                    return { type: "flank", targetPosition: flankPos, priority: 2 };
                }
                break;
                
            case "support":
                // СУПЕР: Поддержка более агрессивна!
                const leader = squadMembers.find(m => m.role === "leader");
                if (leader && distanceToPlayer < 150) { // СУПЕР: Увеличено с 120 до 150!
                    return { type: "cover", targetPosition: leader.lastPosition.clone(), priority: 3 };
                }
                // СУПЕР: Если нет лидера - атакуем сами!
                if (distanceToPlayer < 120) {
                    return { type: "attack", targetPosition: this.playerPosition.clone(), priority: 2 };
                }
                break;
                
            case "scout":
                // СУПЕР: Разведчик тоже атакует если близко!
                if (distanceToPlayer < 100) {
                    return { type: "attack", targetPosition: this.playerPosition.clone(), priority: 3 };
                }
                return { type: "patrol", priority: 4 };
                
            case "defender":
                if (distanceToPlayer < 120) { // СУПЕР: Увеличено с 80 до 120!
                    return { type: "attack", targetPosition: this.playerPosition.clone(), priority: 2 };
                }
                return { type: "patrol", priority: 5 };
        }
        
        // По умолчанию - патруль
        return { type: "patrol", priority: 10 };
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

