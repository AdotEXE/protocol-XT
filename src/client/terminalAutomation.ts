/**
 * Terminal Automation - Автоматизация терминала (триггеры, планировщик, условная логика)
 */

import { CommandSystem } from "./commandSystem";
import { logger } from "./utils/logger";

export interface TerminalTrigger {
    id: string;
    name: string;
    condition: string; // JavaScript выражение или команда
    enabled: boolean;
    action: string; // Команда для выполнения
    cooldown: number; // Миллисекунды между срабатываниями
    lastTriggered?: number;
}

export interface ScheduledTask {
    id: string;
    name: string;
    command: string;
    schedule: 'once' | 'interval' | 'cron';
    time: number; // Время выполнения (timestamp или интервал в мс)
    enabled: boolean;
    lastExecuted?: number;
    nextExecution?: number;
}

export class TerminalAutomation {
    private commandSystem: CommandSystem;
    private triggers: Map<string, TerminalTrigger> = new Map();
    private scheduledTasks: Map<string, ScheduledTask> = new Map();
    private game: any = null;
    
    constructor(commandSystem: CommandSystem) {
        this.commandSystem = commandSystem;
        this.loadTriggers();
        this.loadScheduledTasks();
        this.initializeDefaultTriggers();
        this.startScheduler();
    }
    
    setGame(game: any): void {
        this.game = game;
    }
    
    /**
     * Проверка условий триггеров
     */
    checkTriggers(): void {
        this.triggers.forEach(trigger => {
            if (!trigger.enabled) return;
            
            // Проверка кулдауна
            if (trigger.lastTriggered && Date.now() - trigger.lastTriggered < trigger.cooldown) {
                return;
            }
            
            // Выполнение условия
            if (this.evaluateCondition(trigger.condition)) {
                this.executeTrigger(trigger);
                trigger.lastTriggered = Date.now();
            }
        });
    }
    
    /**
     * Вычисление условия
     */
    private evaluateCondition(condition: string): boolean {
        try {
            // Простые условия через команды
            if (condition.startsWith('command:')) {
                const cmd = condition.replace('command:', '').trim();
                // Можно выполнить команду и проверить результат
                void cmd;
                return true; // Упрощённая версия
            }
            
            // JavaScript выражения
            if (this.game) {
                // Безопасное выполнение выражений
                const context = {
                    game: this.game,
                    fps: this.game.engine?.getFps() || 0,
                    time: Date.now()
                };
                
                // Простые проверки
                if (condition.includes('fps')) {
                    const fps = context.fps;
                    return eval(condition.replace(/fps/g, fps.toString()));
                }
                
                return eval(condition);
            }
            
            return false;
        } catch (error) {
            logger.warn(`[TerminalAutomation] Condition evaluation failed: ${condition}`, error);
            return false;
        }
    }
    
    /**
     * Выполнение триггера
     */
    private async executeTrigger(trigger: TerminalTrigger): Promise<void> {
        logger.log(`[TerminalAutomation] Trigger "${trigger.name}" fired`);
        
        try {
            await this.commandSystem.execute(trigger.action);
        } catch (error) {
            logger.error(`[TerminalAutomation] Trigger action failed: ${trigger.action}`, error);
        }
    }
    
    /**
     * Добавление триггера
     */
    addTrigger(trigger: TerminalTrigger): void {
        this.triggers.set(trigger.id, trigger);
        this.saveTriggers();
    }
    
    /**
     * Удаление триггера
     */
    removeTrigger(id: string): boolean {
        const deleted = this.triggers.delete(id);
        if (deleted) {
            this.saveTriggers();
        }
        return deleted;
    }
    
    /**
     * Получение всех триггеров
     */
    getTriggers(): TerminalTrigger[] {
        return Array.from(this.triggers.values());
    }
    
    /**
     * Добавление запланированной задачи
     */
    addScheduledTask(task: ScheduledTask): void {
        this.scheduledTasks.set(task.id, task);
        this.updateTaskSchedule(task);
        this.saveScheduledTasks();
    }
    
    /**
     * Удаление запланированной задачи
     */
    removeScheduledTask(id: string): boolean {
        const deleted = this.scheduledTasks.delete(id);
        if (deleted) {
            this.saveScheduledTasks();
        }
        return deleted;
    }
    
    /**
     * Получение всех задач
     */
    getScheduledTasks(): ScheduledTask[] {
        return Array.from(this.scheduledTasks.values());
    }
    
    /**
     * Обновление расписания задачи
     */
    private updateTaskSchedule(task: ScheduledTask): void {
        if (!task.enabled) {
            task.nextExecution = undefined;
            return;
        }
        
        const now = Date.now();
        
        switch (task.schedule) {
            case 'once':
                task.nextExecution = task.time > now ? task.time : undefined;
                break;
                
            case 'interval':
                if (task.lastExecuted) {
                    task.nextExecution = task.lastExecuted + task.time;
                } else {
                    task.nextExecution = now + task.time;
                }
                break;
                
            case 'cron':
                // Упрощённая версия cron (можно расширить)
                task.nextExecution = now + task.time;
                break;
        }
    }
    
    /**
     * Запуск планировщика
     */
    private startScheduler(): void {
        setInterval(() => {
            this.checkScheduledTasks();
            this.checkTriggers();
        }, 1000); // Проверка каждую секунду
    }
    
    /**
     * Проверка запланированных задач
     */
    private async checkScheduledTasks(): Promise<void> {
        const now = Date.now();
        
        this.scheduledTasks.forEach(async (task) => {
            if (!task.enabled) return;
            if (!task.nextExecution) return;
            
            if (now >= task.nextExecution) {
                await this.executeScheduledTask(task);
                task.lastExecuted = now;
                this.updateTaskSchedule(task);
            }
        });
    }
    
    /**
     * Выполнение запланированной задачи
     */
    private async executeScheduledTask(task: ScheduledTask): Promise<void> {
        logger.log(`[TerminalAutomation] Executing scheduled task: ${task.name}`);
        
        try {
            await this.commandSystem.execute(task.command);
            
            // Если задача одноразовая, отключаем её
            if (task.schedule === 'once') {
                task.enabled = false;
                this.saveScheduledTasks();
            }
        } catch (error) {
            logger.error(`[TerminalAutomation] Scheduled task failed: ${task.command}`, error);
        }
    }
    
    /**
     * Инициализация триггеров по умолчанию
     */
    private initializeDefaultTriggers(): void {
        if (this.triggers.size > 0) return;
        
        // Пример триггера: низкий FPS
        this.addTrigger({
            id: 'low_fps_auto',
            name: 'Автоматическое логирование при низком FPS',
            condition: 'fps < 30',
            enabled: false,
            action: 'echo FPS dropped below 30',
            cooldown: 10000
        });
    }
    
    /**
     * Загрузка триггеров из localStorage
     */
    private loadTriggers(): void {
        try {
            const saved = localStorage.getItem('ptx_terminal_triggers');
            if (saved) {
                const triggers: TerminalTrigger[] = JSON.parse(saved);
                triggers.forEach(trigger => {
                    this.triggers.set(trigger.id, trigger);
                });
            }
        } catch (error) {
            logger.warn("[TerminalAutomation] Failed to load triggers:", error);
        }
    }
    
    /**
     * Сохранение триггеров в localStorage
     */
    private saveTriggers(): void {
        try {
            const triggers = Array.from(this.triggers.values());
            localStorage.setItem('ptx_terminal_triggers', JSON.stringify(triggers));
        } catch (error) {
            logger.warn("[TerminalAutomation] Failed to save triggers:", error);
        }
    }
    
    /**
     * Загрузка задач из localStorage
     */
    private loadScheduledTasks(): void {
        try {
            const saved = localStorage.getItem('ptx_terminal_scheduled_tasks');
            if (saved) {
                const tasks: ScheduledTask[] = JSON.parse(saved);
                tasks.forEach(task => {
                    this.scheduledTasks.set(task.id, task);
                    this.updateTaskSchedule(task);
                });
            }
        } catch (error) {
            logger.warn("[TerminalAutomation] Failed to load scheduled tasks:", error);
        }
    }
    
    /**
     * Сохранение задач в localStorage
     */
    private saveScheduledTasks(): void {
        try {
            const tasks = Array.from(this.scheduledTasks.values());
            localStorage.setItem('ptx_terminal_scheduled_tasks', JSON.stringify(tasks));
        } catch (error) {
            logger.warn("[TerminalAutomation] Failed to save scheduled tasks:", error);
        }
    }
}

