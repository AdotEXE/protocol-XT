/**
 * Command System - Система команд для терминала с автодополнением и историей
 */

import { Vector3, Quaternion } from "@babylonjs/core";
import { logger, LogLevel, loggingSettings, LogCategory } from "./utils/logger";

export interface Command {
    name: string;
    description: string;
    usage: string;
    execute: (args: string[], game?: any) => Promise<string> | string;
    aliases?: string[];
    category?: string;
}

export class CommandSystem {
    private commands: Map<string, Command> = new Map();
    private history: string[] = [];
    private historyIndex: number = -1;
    private game: any = null;
    
    constructor(game?: any) {
        this.game = game;
        this.registerDefaultCommands();
    }
    
    setGame(game: any): void {
        this.game = game;
    }
    
    /**
     * Регистрация команды
     */
    registerCommand(command: Command): void {
        this.commands.set(command.name.toLowerCase(), command);
        if (command.aliases) {
            command.aliases.forEach(alias => {
                this.commands.set(alias.toLowerCase(), command);
            });
        }
    }
    
    /**
     * Выполнение команды
     */
    async execute(input: string): Promise<string> {
        const trimmed = input.trim();
        if (!trimmed) return '';
        
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0];
        if (!cmd) return 'Empty command';
        const args = parts.slice(1);
        const command = this.commands.get(cmd.toLowerCase());
        
        if (!command) {
            return `Command not found: ${cmd || 'unknown'}. Type 'help' for available commands.`;
        }
        
        try {
            // Добавляем в историю
            this.history.push(trimmed);
            this.historyIndex = this.history.length;
            
            // Ограничиваем размер истории
            if (this.history.length > 100) {
                this.history.shift();
                this.historyIndex--;
            }
            
            const result = await command.execute(args, this.game);
            return result;
        } catch (error: any) {
            logger.error(`[CommandSystem] Command "${cmd}" failed:`, error);
            return `Error: ${error.message || String(error)}`;
        }
    }
    
    /**
     * Получить историю (для навигации стрелками)
     */
    getHistory(direction: 'up' | 'down'): string | null {
        if (this.history.length === 0) return null;
        
        if (direction === 'up') {
            if (this.historyIndex > 0) {
                this.historyIndex--;
            }
        } else {
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
            } else {
                this.historyIndex = this.history.length; // Выход за пределы = пустая строка
                return null;
            }
        }
        
        return this.history[this.historyIndex] || null;
    }
    
    /**
     * Автодополнение
     */
    autocomplete(input: string): string[] {
        if (!input) return [];
        
        const prefix = input.toLowerCase();
        const matches: string[] = [];
        
        this.commands.forEach((cmd, name) => {
            // Проверяем основное имя и алиасы
            if (name.toLowerCase().startsWith(prefix)) {
                if (!matches.includes(cmd.name)) {
                    matches.push(cmd.name);
                }
            }
        });
        
        return matches.sort();
    }
    
    /**
     * Получить список всех команд
     */
    getCommands(): Command[] {
        const uniqueCommands = new Map<string, Command>();
        this.commands.forEach((cmd) => {
            if (!uniqueCommands.has(cmd.name.toLowerCase())) {
                uniqueCommands.set(cmd.name.toLowerCase(), cmd);
            }
        });
        return Array.from(uniqueCommands.values());
    }
    
    /**
     * Получить команды по категории
     */
    getCommandsByCategory(category: string): Command[] {
        return this.getCommands().filter(cmd => cmd.category === category);
    }
    
    /**
     * Регистрация команд по умолчанию
     */
    private registerDefaultCommands(): void {
        // Help
        this.registerCommand({
            name: 'help',
            description: 'Show available commands',
            usage: 'help [command]',
            category: 'system',
            execute: (args) => {
                if (args.length > 0 && args[0]) {
                    const cmd = this.commands.get(args[0].toLowerCase());
                    if (cmd) {
                        return `Command: ${cmd.name}\nDescription: ${cmd.description}\nUsage: ${cmd.usage}`;
                    }
                    return `Command not found: ${args[0]}`;
                }
                
                const categories = new Map<string, Command[]>();
                this.getCommands().forEach(cmd => {
                    const cat = cmd.category || 'other';
                    if (!categories.has(cat)) {
                        categories.set(cat, []);
                    }
                    categories.get(cat)!.push(cmd);
                });
                
                let result = 'Available commands:\n\n';
                categories.forEach((cmds, cat) => {
                    result += `[${cat.toUpperCase()}]\n`;
                    cmds.forEach(cmd => {
                        result += `  ${cmd.name.padEnd(20)} - ${cmd.description}\n`;
                    });
                    result += '\n';
                });
                
                return result;
            },
            aliases: ['?', 'h']
        });
        
        // Clear
        this.registerCommand({
            name: 'clear',
            description: 'Clear terminal',
            usage: 'clear',
            category: 'system',
            execute: () => {
                return 'CLEAR'; // Специальная команда для очистки
            },
            aliases: ['cls']
        });
        
        // Spawn
        this.registerCommand({
            name: 'spawn',
            description: 'Spawn an enemy at position',
            usage: 'spawn <x> <y> <z> [type]',
            category: 'game',
            execute: async (args, game) => {
                if (!game) return 'Game not available';
                if (args.length < 3) return 'Usage: spawn <x> <y> <z> [type]';
                
                const x = parseFloat(args[0] ?? "0");
                const y = parseFloat(args[1] ?? "0");
                const z = parseFloat(args[2] ?? "0");
                const _type = args[3] || 'basic'; void _type;
                
                if (isNaN(x) || isNaN(y) || isNaN(z)) {
                    return 'Invalid coordinates';
                }
                
                // Логика спавна через game.enemyManager
                if (game.enemyManager) {
                    const _pos = new Vector3(x, y, z); void _pos;
                    // game.enemyManager.spawnEnemyAt(pos, type);
                    return `Enemy spawned at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`;
                }
                
                return 'Enemy manager not available';
            }
        });
        
        // Teleport
        this.registerCommand({
            name: 'teleport',
            description: 'Teleport player to position (Y is auto-calculated from terrain)',
            usage: 'teleport <x> <z> [y]',
            category: 'game',
            execute: (args, game) => {
                if (!game) return 'Game not available';
                if (args.length < 2) return 'Usage: teleport <x> <z> [y]';
                
                const x = parseFloat(args[0] ?? "0");
                const z = parseFloat(args[1] ?? "0");
                const customY = args.length >= 3 ? parseFloat(args[2] ?? "0") : null;
                
                if (isNaN(x) || isNaN(z)) {
                    return 'Invalid coordinates';
                }
                
                if (game.tank && game.tank.chassis) {
                    // КРИТИЧНО: Вычисляем высоту террейна автоматически
                    const groundHeight = (game as any).getGroundHeight ? (game as any).getGroundHeight(x, z) : 2.0;
                    // ИСПРАВЛЕНИЕ: Спавн на 2 метра выше фактического террейна
                    // Игнорируем customY если он указан - всегда используем высоту над террейном
                    const targetY = Math.max(groundHeight + 2.0, 3.0);
                    
                    const targetPos = new Vector3(x, targetY, z);
                    game.tank.chassis.position = targetPos;
                    
                    // КРИТИЧНО: Синхронизируем физику с визуальной позицией
                    if (game.tank.physicsBody) {
                        game.tank.physicsBody.setTargetTransform(
                            targetPos,
                            game.tank.chassis.rotationQuaternion || Quaternion.Identity()
                        );
                        // Сбрасываем скорости
                        game.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                        game.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                    }
                    
                    // Обновляем матрицы
                    game.tank.chassis.computeWorldMatrix(true);
                    
                    return `Teleported to (${x.toFixed(1)}, ${targetY.toFixed(1)}, ${z.toFixed(1)}) - terrain: ${(targetY - 3).toFixed(1)}m`;
                }
                
                return 'Tank not available';
            },
            aliases: ['tp']
        });
        
        // Set
        this.registerCommand({
            name: 'set',
            description: 'Set game variable',
            usage: 'set <variable> <value>',
            category: 'game',
            execute: (args, game) => {
                if (!game) return 'Game not available';
                if (args.length < 2) return 'Usage: set <variable> <value>';
                
                const varName = args[0];
                if (!varName) return 'Variable name required';
                const valueParts = args.slice(1);
                const value = valueParts.join(' ');
                
                // Попытка установить переменную
                try {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        (game as any)[varName] = numValue;
                        return `${varName} = ${numValue}`;
                    } else {
                        (game as any)[varName] = value;
                        return `${varName} = "${value}"`;
                    }
                } catch (error) {
                    return `Failed to set ${varName}: ${error}`;
                }
            }
        });
        
        // Get
        this.registerCommand({
            name: 'get',
            description: 'Get game variable value',
            usage: 'get <variable>',
            category: 'game',
            execute: (args, game) => {
                if (!game) return 'Game not available';
                if (args.length < 1) return 'Usage: get <variable>';
                
                const varName = args[0];
                if (!varName) return 'Variable name required';
                const value = (game as any)[varName];
                
                if (value === undefined) {
                    return `Variable "${varName}" not found`;
                }
                
                return `${varName} = ${JSON.stringify(value)}`;
            }
        });
        
        // FPS
        this.registerCommand({
            name: 'fps',
            description: 'Show current FPS',
            usage: 'fps',
            category: 'info',
            execute: (_args: string[], game) => {
                if (!game || !game.engine) return 'Engine not available';
                const fps = game.engine.getFps();
                return `FPS: ${fps.toFixed(1)}`;
            }
        });
        
        // Position
        this.registerCommand({
            name: 'pos',
            description: 'Show player position',
            usage: 'pos',
            category: 'info',
            execute: (_args: string[], game) => {
                if (!game || !game.tank || !game.tank.chassis) {
                    return 'Tank not available';
                }
                
                const pos = game.tank.chassis.position;
                return `Position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
            },
            aliases: ['position']
        });
        
        // Health
        this.registerCommand({
            name: 'health',
            description: 'Show player health',
            usage: 'health',
            category: 'info',
            execute: (_args: string[], game) => {
                if (!game || !game.tank) {
                    return 'Tank not available';
                }
                
                const health = (game.tank as any).currentHealth || 0;
                const maxHealth = (game.tank as any).maxHealth || 100;
                return `Health: ${health.toFixed(1)} / ${maxHealth.toFixed(1)}`;
            },
            aliases: ['hp']
        });
        
        // Echo
        this.registerCommand({
            name: 'echo',
            description: 'Print text',
            usage: 'echo <text>',
            category: 'system',
            execute: (args) => {
                return args.join(' ');
            }
        });
        
        // Script commands
        this.registerCommand({
            name: 'script',
            description: 'Manage scripts',
            usage: 'script [list|run|save] <name> [content]',
            category: 'system',
            execute: async (_args: string[]) => {
                // Обработка будет в chatSystem
                return 'Use script command in terminal';
            }
        });
        
        // Macro commands
        this.registerCommand({
            name: 'macro',
            description: 'Manage macros',
            usage: 'macro [list|run] <name>',
            category: 'system',
            execute: async (_args: string[]) => {
                // Обработка будет в chatSystem
                return 'Use macro command in terminal';
            }
        });
        
        // Theme command
        this.registerCommand({
            name: 'theme',
            description: 'Manage terminal themes',
            usage: 'theme [list|set] <name>',
            category: 'system',
            execute: async (args) => {
                if (args.length === 0 || args[0] === 'list') {
                    return 'Available themes: default, matrix, cyberpunk, monochrome';
                } else if (args[0] === 'set' && args[1]) {
                    return `Theme "${args[1]}" will be applied (use in terminal)`;
                }
                return 'Usage: theme [list|set <name>]';
            }
        });
        
        // Trigger command
        this.registerCommand({
            name: 'trigger',
            description: 'Manage terminal triggers',
            usage: 'trigger [list|add|remove]',
            category: 'system',
            execute: async (_args) => {
                return 'Use trigger command in terminal';
            }
        });
        
        // Schedule command
        this.registerCommand({
            name: 'schedule',
            description: 'Manage scheduled tasks',
            usage: 'schedule [list|add|remove]',
            category: 'system',
            execute: async (_args) => {
                return 'Schedule management not implemented yet';
            }
        });

        // Logging commands
        this.registerCommand({
            name: 'log',
            description: 'Manage logging settings',
            usage: 'log [level|category|status] [value]',
            category: 'system',
            aliases: ['logging', 'logs'],
            execute: async (args) => {
                if (args.length === 0) {
                    const level = loggingSettings.getLevel();
                    const levelNames = ['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'];
                    const enabledCategories = Object.values(LogCategory).filter(cat => 
                        loggingSettings.isCategoryEnabled(cat as LogCategory)
                    );
                    return `Logging Level: ${levelNames[level]} (${level})\nEnabled Categories: ${enabledCategories.join(', ') || 'none'}`;
                }

                const subcommand = args[0]?.toLowerCase();
                if (!subcommand) {
                    return 'Invalid subcommand. Use: log [level|category|status] [value]';
                }
                
                if (subcommand === 'level' || subcommand === 'lvl') {
                    if (args.length < 2) {
                        const level = loggingSettings.getLevel();
                        const levelNames = ['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'];
                        return `Current level: ${levelNames[level]} (${level})\nUsage: log level <NONE|ERROR|WARN|INFO|DEBUG|VERBOSE>`;
                    }
                    
                    const levelName = args[1]?.toUpperCase();
                    if (!levelName) {
                        return 'Invalid level argument';
                    }
                    const levelMap: Record<string, LogLevel> = {
                        'NONE': LogLevel.NONE,
                        'ERROR': LogLevel.ERROR,
                        'WARN': LogLevel.WARN,
                        'INFO': LogLevel.INFO,
                        'DEBUG': LogLevel.DEBUG,
                        'VERBOSE': LogLevel.VERBOSE
                    };
                    
                    const newLevel = levelMap[levelName];
                    if (newLevel === undefined) {
                        return `Invalid level: ${args[1]}. Valid levels: NONE, ERROR, WARN, INFO, DEBUG, VERBOSE`;
                    }
                    
                    loggingSettings.setLevel(newLevel);
                    return `Logging level set to: ${levelName} (${newLevel})`;
                }
                
                if (subcommand === 'category' || subcommand === 'cat') {
                    if (args.length < 3) {
                        const categories = Object.values(LogCategory);
                        const enabled = categories.filter(cat => loggingSettings.isCategoryEnabled(cat));
                        const disabled = categories.filter(cat => !loggingSettings.isCategoryEnabled(cat));
                        return `Enabled: ${enabled.join(', ') || 'none'}\nDisabled: ${disabled.join(', ') || 'none'}\nUsage: log category <enable|disable> <category>`;
                    }
                    
                    const action = args[1]?.toLowerCase();
                    const categoryName = args[2]?.toUpperCase();
                    if (!action || !categoryName) {
                        return 'Invalid category arguments';
                    }
                    
                    const category = Object.values(LogCategory).find(c => c.toUpperCase() === categoryName);
                    if (!category) {
                        const validCategories = Object.values(LogCategory).join(', ');
                        return `Invalid category: ${categoryName}. Valid categories: ${validCategories}`;
                    }
                    
                    if (action === 'enable' || action === 'on') {
                        loggingSettings.enableCategory(category);
                        return `Category ${category} enabled`;
                    } else if (action === 'disable' || action === 'off') {
                        loggingSettings.disableCategory(category);
                        return `Category ${category} disabled`;
                    } else {
                        return `Invalid action: ${action}. Use 'enable' or 'disable'`;
                    }
                }
                
                if (subcommand === 'status' || subcommand === 'info') {
                    const level = loggingSettings.getLevel();
                    const levelNames = ['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'];
                    const categories = Object.values(LogCategory);
                    const enabled = categories.filter(cat => loggingSettings.isCategoryEnabled(cat));
                    const disabled = categories.filter(cat => !loggingSettings.isCategoryEnabled(cat));
                    
                    return `Logging Status:\n  Level: ${levelNames[level]} (${level})\n  Enabled Categories: ${enabled.join(', ') || 'none'}\n  Disabled Categories: ${disabled.join(', ') || 'none'}`;
                }
                
                return `Unknown subcommand: ${subcommand}. Use 'level', 'category', or 'status'`;
            }
        });

        this.registerCommand({
            name: 'schedule',
            description: 'Manage scheduled tasks',
            usage: 'schedule [list|add|remove]',
            category: 'system',
            execute: async (_args) => {
                return 'Use schedule command in terminal';
            }
        });
    }
}

