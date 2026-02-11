/**
 * Command System - Система команд для терминала с автодополнением и историей
 */

import { Vector3, Quaternion } from "@babylonjs/core";
import { logger, LogLevel, loggingSettings, LogCategory } from "./utils/logger";
import { safeLocalStorage } from "./utils/safeLocalStorage";

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
                    const groundHeight = (game as any).getGroundHeight ? (game as any).getGroundHeight(x, z) : 5.0;
                    // Безопасная высота: +5м над террейном, минимум 7м
                    // Игнорируем customY если он указан - всегда используем высоту над террейном
                    const targetY = Math.max(groundHeight + 5.0, 7.0);

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

                    return `Teleported to (${x.toFixed(1)}, ${targetY.toFixed(1)}, ${z.toFixed(1)}) - terrain: ${groundHeight.toFixed(1)}m`;
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

        // =========================================================================
        // ЧИТ-КОМАНДЫ / CHEAT COMMANDS
        // =========================================================================

        // God Mode - бессмертие
        this.registerCommand({
            name: 'god',
            description: 'Toggle god mode (invincibility)',
            usage: 'god [on|off]',
            category: 'cheats',
            aliases: ['godmode', 'invincible'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'off') {
                    tank.godMode = false;
                    return '☠️ God mode DISABLED';
                } else if (_args[0] === 'on' || !_args[0]) {
                    tank.godMode = !tank.godMode;
                }

                return tank.godMode ? '🛡️ God mode ENABLED - You are invincible!' : '☠️ God mode DISABLED';
            }
        });

        // Noclip - полёт сквозь стены
        this.registerCommand({
            name: 'noclip',
            description: 'Toggle noclip mode (fly through walls)',
            usage: 'noclip [on|off]',
            category: 'cheats',
            aliases: ['ghost', 'clip'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'off') {
                    tank.flyMode = false;
                    if (tank.physicsBody) {
                        tank.physicsBody.setGravityFactor(1);
                    }
                    return '🚶 Noclip DISABLED';
                } else if (_args[0] === 'on' || !_args[0]) {
                    tank.flyMode = !tank.flyMode;
                    if (tank.flyMode && tank.physicsBody) {
                        tank.physicsBody.setGravityFactor(0);
                    } else if (tank.physicsBody) {
                        tank.physicsBody.setGravityFactor(1);
                    }
                }

                return tank.flyMode ? '👻 Noclip ENABLED - Use Q/E for up/down' : '🚶 Noclip DISABLED';
            }
        });

        // Kill player
        this.registerCommand({
            name: 'kill',
            description: 'Kill yourself or target',
            usage: 'kill [self|all|bots]',
            category: 'cheats',
            aliases: ['suicide', 'die'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const target = _args[0] || 'self';

                if (target === 'self' || target === 'me') {
                    (game.tank as any).takeDamage(99999);
                    return '💀 You killed yourself!';
                } else if (target === 'all' || target === 'bots') {
                    if (game.enemyManager) {
                        const enemies = game.enemyManager.enemies || [];
                        let count = 0;
                        enemies.forEach((e: any) => {
                            if (e && e.isAlive) {
                                e.takeDamage(99999);
                                count++;
                            }
                        });
                        return `💀 Killed ${count} enemies!`;
                    }
                    return 'No enemies to kill';
                }

                return `Usage: kill [self|all|bots]`;
            }
        });

        // Heal
        this.registerCommand({
            name: 'heal',
            description: 'Restore health',
            usage: 'heal [amount|full]',
            category: 'cheats',
            aliases: ['hp', 'restore'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                const amount = _args[0] === 'full' ? tank.maxHealth : (parseFloat(_args[0] || '100') || tank.maxHealth);
                tank.currentHealth = Math.min(tank.maxHealth, tank.currentHealth + amount);

                if (tank.hud) tank.hud.updateHealth(tank.currentHealth, tank.maxHealth);

                return `❤️ Healed! HP: ${tank.currentHealth.toFixed(0)}/${tank.maxHealth}`;
            }
        });

        // Damage
        this.registerCommand({
            name: 'damage',
            description: 'Take damage',
            usage: 'damage <amount>',
            category: 'cheats',
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const amount = parseFloat(_args[0] || '10') || 10;

                (game.tank as any).takeDamage(amount);
                const hp = (game.tank as any).currentHealth;

                return `💔 Took ${amount} damage! HP: ${hp.toFixed(0)}`;
            }
        });

        // Speed boost
        this.registerCommand({
            name: 'speed',
            description: 'Set movement speed multiplier',
            usage: 'speed <multiplier> | speed reset',
            category: 'cheats',
            aliases: ['fast', 'slow'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'reset') {
                    tank.moveSpeed = tank.chassisType?.maxSpeed || 24;
                    return `🚗 Speed reset to default: ${tank.moveSpeed}`;
                }

                const multiplier = parseFloat(_args[0] || '2') || 2;
                const baseSpeed = tank.chassisType?.maxSpeed || 24;
                tank.moveSpeed = baseSpeed * multiplier;

                return `⚡ Speed set to ${tank.moveSpeed.toFixed(1)} (${multiplier}x)`;
            }
        });

        // Fly mode
        this.registerCommand({
            name: 'fly',
            description: 'Toggle fly mode',
            usage: 'fly [on|off]',
            category: 'cheats',
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'off') {
                    tank.flyMode = false;
                } else {
                    tank.flyMode = !tank.flyMode;
                }

                if (tank.physicsBody) {
                    tank.physicsBody.setGravityFactor(tank.flyMode ? 0 : 1);
                }

                return tank.flyMode ? '🦅 Fly mode ON - Q=up, E=down' : '🚶 Fly mode OFF';
            }
        });

        // Give items/XP/money
        this.registerCommand({
            name: 'give',
            description: 'Give yourself items, XP, or money',
            usage: 'give <xp|money|fuel|ammo> <amount>',
            category: 'cheats',
            aliases: ['add'],
            execute: (_args, game) => {
                if (!game) return 'Game not available';
                const type = _args[0] || 'xp';
                const amount = parseFloat(_args[1] || '1000') || 1000;

                switch (type.toLowerCase()) {
                    case 'xp':
                    case 'exp':
                        if (game.tank?.playerProgression) {
                            game.tank.playerProgression.addXP(amount);
                        }
                        // Also add through upgradeManager
                        if (typeof (globalThis as any).upgradeManager !== 'undefined') {
                            (globalThis as any).upgradeManager.addXP(amount);
                        }
                        return `🌟 Added ${amount} XP!`;

                    case 'money':
                    case 'coins':
                    case 'credits':
                        const savedCoins = parseInt(safeLocalStorage.get('playerCoins', '0'));
                        safeLocalStorage.set('playerCoins', String(savedCoins + amount));
                        return `💰 Added ${amount} coins! Total: ${savedCoins + amount}`;

                    case 'fuel':
                        if (game.tank) {
                            (game.tank as any).fuel = Math.min((game.tank as any).maxFuel, (game.tank as any).fuel + amount);
                        }
                        return `⛽ Added ${amount} fuel!`;

                    case 'ammo':
                        if (game.tank) {
                            (game.tank as any).ammo = (game.tank as any).ammo + amount;
                        }
                        return `🔫 Added ${amount} ammo!`;

                    default:
                        return 'Usage: give <xp|money|fuel|ammo> <amount>';
                }
            }
        });

        // Kill all enemies
        this.registerCommand({
            name: 'killall',
            description: 'Kill all enemies instantly',
            usage: 'killall [bots|turrets|all]',
            category: 'cheats',
            aliases: ['nuke', 'wipe'],
            execute: (_args, game) => {
                if (!game) return 'Game not available';
                const target = _args[0] || 'all';
                let killed = 0;

                if (target === 'bots' || target === 'all') {
                    if (game.enemyManager?.enemies) {
                        game.enemyManager.enemies.forEach((e: any) => {
                            if (e?.isAlive) {
                                e.takeDamage(99999);
                                killed++;
                            }
                        });
                    }
                }

                if (target === 'turrets' || target === 'all') {
                    if (game.enemyManager?.turrets) {
                        game.enemyManager.turrets.forEach((t: any) => {
                            if (t?.isAlive) {
                                t.takeDamage(99999);
                                killed++;
                            }
                        });
                    }
                }

                return `☠️ KILLALL: Destroyed ${killed} targets!`;
            }
        });

        // Respawn
        this.registerCommand({
            name: 'respawn',
            description: 'Force respawn your tank',
            usage: 'respawn',
            category: 'cheats',
            aliases: ['spawn', 'reset'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';

                (game.tank as any).respawn();
                return '🔄 Tank respawned!';
            }
        });

        // Stats display
        this.registerCommand({
            name: 'stats',
            description: 'Show detailed tank statistics',
            usage: 'stats',
            category: 'info',
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const t = game.tank as any;

                let result = '📊 TANK STATS:\n';
                result += `  HP: ${t.currentHealth?.toFixed(0) || 0}/${t.maxHealth || 100}\n`;
                result += `  Armor: ${t.armor?.toFixed(0) || 0}\n`;
                result += `  Speed: ${t.moveSpeed?.toFixed(1) || 0}\n`;
                result += `  Damage: ${t.cannonType?.damage || 0}\n`;
                result += `  Reload: ${t.cannonType?.reloadTime || 0}s\n`;
                result += `  Chassis: ${t.chassisType?.id || 'unknown'}\n`;
                result += `  Cannon: ${t.cannonType?.id || 'unknown'}\n`;
                result += `  God: ${t.godMode ? 'ON' : 'OFF'}\n`;
                result += `  Fly: ${t.flyMode ? 'ON' : 'OFF'}`;

                return result;
            }
        });

        // Reload weapon instantly
        this.registerCommand({
            name: 'reload',
            description: 'Instant weapon reload',
            usage: 'reload',
            category: 'cheats',
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                tank.isReloading = false;
                tank.reloadProgress = 1;
                tank.canFire = true;

                if (tank.hud) tank.hud.updateReload(1, 1);

                return '🔄 Weapon reloaded instantly!';
            }
        });

        // Gravity control
        this.registerCommand({
            name: 'gravity',
            description: 'Set gravity multiplier',
            usage: 'gravity <multiplier> | gravity off | gravity reset',
            category: 'cheats',
            aliases: ['grav'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (!tank.physicsBody) return 'Physics not available';

                if (_args[0] === 'off' || _args[0] === '0') {
                    tank.physicsBody.setGravityFactor(0);
                    return '🌙 Gravity OFF';
                } else if (_args[0] === 'reset' || _args[0] === 'on') {
                    tank.physicsBody.setGravityFactor(1);
                    return '🌍 Gravity reset to normal';
                }

                const factor = parseFloat(_args[0] || '0.5') || 0.5;
                tank.physicsBody.setGravityFactor(factor);

                return `🌍 Gravity set to ${factor}x`;
            }
        });

        // Explode at position
        this.registerCommand({
            name: 'explode',
            description: 'Create explosion at position',
            usage: 'explode [x] [z] [radius] | explode here [radius]',
            category: 'cheats',
            aliases: ['boom', 'explosion'],
            execute: (_args, game) => {
                if (!game) return 'Game not available';

                let x: number, z: number, radius: number;

                if (_args[0] === 'here' || !_args[0]) {
                    if (!game.tank?.chassis) return 'Tank not available';
                    const pos = game.tank.chassis.position;
                    x = pos.x;
                    z = pos.z;
                    radius = parseFloat(_args[1] || '10') || 10;
                } else {
                    x = parseFloat(_args[0]) || 0;
                    z = parseFloat(_args[1] ?? "") || 0; // [Opus 4.6]
                    radius = parseFloat(_args[2] || '10') || 10;
                }

                const y = game.getGroundHeight ? game.getGroundHeight(x, z) : 5;
                const pos = new Vector3(x, y, z);

                // AOE damage
                if (game.enemyManager?.enemies) {
                    game.enemyManager.enemies.forEach((e: any) => {
                        if (!e?.isAlive || !e.chassis) return;
                        const dist = Vector3.Distance(pos, e.chassis.position);
                        if (dist < radius) {
                            const dmg = Math.round(100 * (1 - dist / radius));
                            e.takeDamage(dmg);
                        }
                    });
                }

                // Visual effect
                if (game.effectsManager) {
                    game.effectsManager.createExplosion(pos, radius / 5);
                }

                return `💥 BOOM! Explosion at (${x.toFixed(0)}, ${z.toFixed(0)}) radius ${radius}m`;
            }
        });

        // Freeze/unfreeze enemies
        this.registerCommand({
            name: 'freeze',
            description: 'Freeze or unfreeze all enemies',
            usage: 'freeze [on|off]',
            category: 'cheats',
            aliases: ['pause', 'stop'],
            execute: (_args, game) => {
                if (!game) return 'Game not available';
                const freeze = _args[0] !== 'off';

                if (game.enemyManager?.enemies) {
                    game.enemyManager.enemies.forEach((e: any) => {
                        if (e) e.frozen = freeze;
                    });
                }
                if (game.enemyManager?.turrets) {
                    game.enemyManager.turrets.forEach((t: any) => {
                        if (t) t.frozen = freeze;
                    });
                }

                return freeze ? '❄️ All enemies FROZEN!' : '🔥 Enemies UNFROZEN!';
            }
        });

        // Time scale
        this.registerCommand({
            name: 'timescale',
            description: 'Set game time scale (slow-mo/fast-forward)',
            usage: 'timescale <multiplier> | timescale reset',
            category: 'cheats',
            aliases: ['time', 'slowmo'],
            execute: (_args, game) => {
                if (!game || !game.scene) return 'Scene not available';

                if (_args[0] === 'reset') {
                    game.scene.getAnimationRatio = () => 1;
                    return '⏱️ Time scale reset to 1.0x';
                }

                const scale = parseFloat(_args[0] || '0.5') || 0.5;
                // Note: This is a simplified approach
                (game as any).timeScale = scale;

                return `⏱️ Time scale set to ${scale}x`;
            }
        });

        // Set armor
        this.registerCommand({
            name: 'armor',
            description: 'Set armor value',
            usage: 'armor <value>',
            category: 'cheats',
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const amount = parseFloat(_args[0] || '100') || 100;

                (game.tank as any).armor = amount;
                return `🛡️ Armor set to ${amount}`;
            }
        });

        // Set damage multiplier
        this.registerCommand({
            name: 'dmg',
            description: 'Set damage multiplier',
            usage: 'dmg <multiplier> | dmg reset',
            category: 'cheats',
            aliases: ['damage_mult', 'power'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'reset') {
                    tank.damageMultiplier = 1;
                    return '⚔️ Damage multiplier reset to 1.0x';
                }

                const mult = parseFloat(_args[0] || '2') || 2;
                tank.damageMultiplier = mult;

                return `⚔️ Damage multiplier set to ${mult}x`;
            }
        });

        // Instant reload (no reload time)
        this.registerCommand({
            name: 'rapidfire',
            description: 'Toggle rapid fire (no reload time)',
            usage: 'rapidfire [on|off]',
            category: 'cheats',
            aliases: ['nocd', 'nocooldown'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'off') {
                    tank.rapidFire = false;
                    tank.reloadTimeOverride = null;
                } else {
                    tank.rapidFire = !tank.rapidFire;
                    tank.reloadTimeOverride = tank.rapidFire ? 0.05 : null;
                }

                return tank.rapidFire ? '🔥 RAPID FIRE enabled!' : '🔫 Normal fire rate';
            }
        });

        // Infinite ammo
        this.registerCommand({
            name: 'infammo',
            description: 'Toggle infinite ammo',
            usage: 'infammo [on|off]',
            category: 'cheats',
            aliases: ['infiniteammo', 'unlimitedammo'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'off') {
                    tank.infiniteAmmo = false;
                } else {
                    tank.infiniteAmmo = !tank.infiniteAmmo;
                }

                return tank.infiniteAmmo ? '♾️ Infinite ammo ON!' : '🔫 Normal ammo';
            }
        });

        // Show trajectory
        this.registerCommand({
            name: 'trajectory',
            description: 'Toggle projectile trajectory display',
            usage: 'trajectory [on|off]',
            category: 'cheats',
            aliases: ['aim', 'aimline'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                if (_args[0] === 'off') {
                    tank.showProjectileTrajectory = false;
                } else if (_args[0] === 'on') {
                    tank.showProjectileTrajectory = true;
                } else {
                    tank.showProjectileTrajectory = !tank.showProjectileTrajectory;
                }

                return tank.showProjectileTrajectory ? '📍 Trajectory ON' : '📍 Trajectory OFF';
            }
        });

        // Map info
        this.registerCommand({
            name: 'map',
            description: 'Show current map info or change map',
            usage: 'map [name]',
            category: 'info',
            aliases: ['level', 'arena'],
            execute: (_args, game) => {
                if (!game) return 'Game not available';

                if (_args[0]) {
                    // Try to change map
                    if (game.loadMap) {
                        game.loadMap(_args[0]);
                        return `🗺️ Loading map: ${_args[0]}`;
                    }
                    return 'Map change not available';
                }

                const mapName = (game as any).currentMapId || 'unknown';
                return `🗺️ Current map: ${mapName}`;
            }
        });

        // Camera commands
        this.registerCommand({
            name: 'cam',
            description: 'Camera controls',
            usage: 'cam <distance|fov|reset> [value]',
            category: 'cheats',
            aliases: ['camera'],
            execute: (_args, game) => {
                if (!game || !game.camera) return 'Camera not available';
                const cam = game.camera as any;

                const sub = _args[0] || 'info';
                const val = parseFloat(_args[1] || '0');

                switch (sub) {
                    case 'distance':
                    case 'dist':
                        if (val > 0) {
                            cam.radius = val;
                            return `📷 Camera distance: ${val}`;
                        }
                        return `📷 Current distance: ${cam.radius?.toFixed(1) || 'N/A'}`;

                    case 'fov':
                        if (val > 0) {
                            cam.fov = val * Math.PI / 180;
                            return `📷 FOV: ${val}°`;
                        }
                        return `📷 Current FOV: ${((cam.fov || 0.8) * 180 / Math.PI).toFixed(0)}°`;

                    case 'reset':
                        cam.radius = 25;
                        cam.fov = 0.8;
                        return '📷 Camera reset to defaults';

                    default:
                        return `📷 Camera: dist=${cam.radius?.toFixed(1)}, fov=${((cam.fov || 0.8) * 180 / Math.PI).toFixed(0)}°`;
                }
            }
        });

        // All cheats at once
        this.registerCommand({
            name: 'iddqd',
            description: 'Classic DOOM cheat - god + infinite ammo + rapid fire',
            usage: 'iddqd',
            category: 'cheats',
            aliases: ['cheat', 'allcheats'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                tank.godMode = true;
                tank.infiniteAmmo = true;
                tank.rapidFire = true;
                tank.reloadTimeOverride = 0.05;
                tank.currentHealth = tank.maxHealth;

                return '🎮 IDDQD ACTIVATED!\n  God Mode: ON\n  Infinite Ammo: ON\n  Rapid Fire: ON';
            }
        });

        // Reset all cheats
        this.registerCommand({
            name: 'nocheats',
            description: 'Disable all cheats',
            usage: 'nocheats',
            category: 'cheats',
            aliases: ['fair', 'legit'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                tank.godMode = false;
                tank.flyMode = false;
                tank.infiniteAmmo = false;
                tank.rapidFire = false;
                tank.reloadTimeOverride = null;
                tank.damageMultiplier = 1;

                if (tank.physicsBody) {
                    tank.physicsBody.setGravityFactor(1);
                }

                tank.moveSpeed = tank.chassisType?.maxSpeed || 24;

                return '✨ All cheats DISABLED - playing fair!';
            }
        });

        // =========================================================================
        // ДОПОЛНИТЕЛЬНЫЕ КОМАНДЫ / EXTENDED COMMANDS
        // =========================================================================

        // Spawn enemy at position
        this.registerCommand({
            name: 'spawnenemy',
            description: 'Spawn an enemy at your position or coordinates',
            usage: 'spawnenemy [type] [x] [z] | spawnenemy here [type]',
            category: 'cheats',
            aliases: ['enemy', 'bot'],
            execute: (_args, game) => {
                if (!game) return 'Game not available';

                let type = 'basic';
                let x: number, z: number;

                if (_args[0] === 'here' || !_args[0]) {
                    if (!game.tank?.chassis) return 'Tank not available';
                    const pos = game.tank.chassis.position;
                    x = pos.x + 10;
                    z = pos.z + 10;
                    type = _args[1] || 'basic';
                } else if (_args.length >= 2 && !isNaN(parseFloat(_args[0]))) {
                    x = parseFloat(_args[0]) || 0;
                    z = parseFloat(_args[1] ?? "") || 0; // [Opus 4.6]
                    type = _args[2] || 'basic';
                } else {
                    type = _args[0] || 'basic';
                    if (!game.tank?.chassis) return 'Tank not available';
                    const pos = game.tank.chassis.position;
                    x = pos.x + 10;
                    z = pos.z + 10;
                }

                const y = game.getGroundHeight ? game.getGroundHeight(x, z) + 2 : 5;

                if (game.gameEnemies?.spawnEnemy) {
                    game.gameEnemies.spawnEnemy(type, new Vector3(x, y, z));
                    return `🤖 Spawned ${type} enemy at (${x.toFixed(0)}, ${z.toFixed(0)})`;
                }

                return 'Enemy system not available';
            }
        });

        // Weather effects
        this.registerCommand({
            name: 'weather',
            description: 'Change weather effects',
            usage: 'weather <clear|rain|fog|storm|snow>',
            category: 'visual',
            aliases: ['wx'],
            execute: (_args, game) => {
                if (!game || !game.scene) return 'Scene not available';
                const weather = _args[0] || 'clear';

                // Store weather state
                (game as any).currentWeather = weather;

                switch (weather) {
                    case 'clear':
                        game.scene.fogMode = 0;
                        game.scene.clearColor.set(0.2, 0.4, 0.8, 1);
                        return '☀️ Weather: Clear skies';
                    case 'fog':
                        game.scene.fogMode = 3;
                        game.scene.fogDensity = 0.01;
                        game.scene.fogColor.set(0.7, 0.7, 0.7);
                        return '🌫️ Weather: Foggy';
                    case 'rain':
                        game.scene.fogMode = 3;
                        game.scene.fogDensity = 0.005;
                        game.scene.fogColor.set(0.5, 0.5, 0.6);
                        return '🌧️ Weather: Rainy';
                    case 'storm':
                        game.scene.fogMode = 3;
                        game.scene.fogDensity = 0.02;
                        game.scene.fogColor.set(0.3, 0.3, 0.4);
                        return '⛈️ Weather: Storm';
                    case 'snow':
                        game.scene.fogMode = 3;
                        game.scene.fogDensity = 0.008;
                        game.scene.fogColor.set(0.9, 0.9, 1.0);
                        return '❄️ Weather: Snowing';
                    default:
                        return `Unknown weather: ${weather}. Try: clear, fog, rain, storm, snow`;
                }
            }
        });

        // Fog control
        this.registerCommand({
            name: 'fog',
            description: 'Control fog density and color',
            usage: 'fog <off|0-1> [r] [g] [b]',
            category: 'visual',
            execute: (_args, game) => {
                if (!game || !game.scene) return 'Scene not available';

                if (_args[0] === 'off' || _args[0] === '0') {
                    game.scene.fogMode = 0;
                    return '🌫️ Fog disabled';
                }

                const density = parseFloat(_args[0] || '0.01') || 0.01;
                game.scene.fogMode = 3;
                game.scene.fogDensity = density;

                if (_args.length >= 4) {
                    const r = parseFloat(_args[1] ?? "") || 0.5; // [Opus 4.6]
                    const g = parseFloat(_args[2] ?? "") || 0.5; // [Opus 4.6]
                    const b = parseFloat(_args[3] ?? "") || 0.5; // [Opus 4.6]
                    game.scene.fogColor.set(r, g, b);
                }

                return `🌫️ Fog density: ${density}`;
            }
        });

        // Matrix mode - green tint
        this.registerCommand({
            name: 'matrix',
            description: 'Toggle Matrix visual mode',
            usage: 'matrix [on|off]',
            category: 'visual',
            aliases: ['neo'],
            execute: (_args, game) => {
                if (!game || !game.scene) return 'Scene not available';

                const enable = _args[0] !== 'off';
                (game as any).matrixMode = enable;

                if (enable) {
                    game.scene.fogMode = 3;
                    game.scene.fogDensity = 0.005;
                    game.scene.fogColor.set(0, 0.3, 0);
                    game.scene.clearColor.set(0, 0.05, 0, 1);
                    return '💊 Welcome to the Matrix, Neo...';
                } else {
                    game.scene.fogMode = 0;
                    game.scene.clearColor.set(0.2, 0.4, 0.8, 1);
                    return '💊 Exiting the Matrix...';
                }
            }
        });

        // Disco mode - color cycling
        this.registerCommand({
            name: 'disco',
            description: 'Toggle disco party mode',
            usage: 'disco [on|off]',
            category: 'visual',
            aliases: ['party', 'rave'],
            execute: (_args, game) => {
                if (!game || !game.scene) return 'Scene not available';

                const enable = _args[0] !== 'off';

                if (enable) {
                    let hue = 0;
                    (game as any).discoInterval = setInterval(() => {
                        hue = (hue + 5) % 360;
                        const r = Math.sin(hue * Math.PI / 180) * 0.5 + 0.5;
                        const g = Math.sin((hue + 120) * Math.PI / 180) * 0.5 + 0.5;
                        const b = Math.sin((hue + 240) * Math.PI / 180) * 0.5 + 0.5;
                        game.scene.clearColor.set(r * 0.3, g * 0.3, b * 0.3, 1);
                        game.scene.ambientColor.set(r, g, b);
                    }, 50);
                    return '🎉 DISCO MODE ACTIVATED! 🕺💃';
                } else {
                    if ((game as any).discoInterval) {
                        clearInterval((game as any).discoInterval);
                        (game as any).discoInterval = null;
                    }
                    game.scene.clearColor.set(0.2, 0.4, 0.8, 1);
                    game.scene.ambientColor.set(0.3, 0.3, 0.3);
                    return '🎉 Disco mode OFF';
                }
            }
        });

        // Night vision
        this.registerCommand({
            name: 'nightvision',
            description: 'Toggle night vision mode',
            usage: 'nightvision [on|off]',
            category: 'visual',
            aliases: ['nv', 'night'],
            execute: (_args, game) => {
                if (!game || !game.scene) return 'Scene not available';

                const enable = _args[0] !== 'off';
                (game as any).nightVision = enable;

                if (enable) {
                    game.scene.fogMode = 3;
                    game.scene.fogDensity = 0.002;
                    game.scene.fogColor.set(0.1, 0.4, 0.1);
                    game.scene.ambientColor.set(0.3, 1.0, 0.3);
                    return '🌙 Night vision ON';
                } else {
                    game.scene.fogMode = 0;
                    game.scene.ambientColor.set(0.3, 0.3, 0.3);
                    return '🌙 Night vision OFF';
                }
            }
        });

        // Shake camera
        this.registerCommand({
            name: 'shake',
            description: 'Shake the camera',
            usage: 'shake [intensity] [duration]',
            category: 'visual',
            aliases: ['earthquake'],
            execute: (_args, game) => {
                if (!game || !game.camera) return 'Camera not available';

                const intensity = parseFloat(_args[0] || '1') || 1;
                const duration = parseFloat(_args[1] || '500') || 500;

                const originalPos = game.camera.position.clone();
                let elapsed = 0;
                const interval = setInterval(() => {
                    elapsed += 16;
                    if (elapsed >= duration) {
                        clearInterval(interval);
                        game.camera.position = originalPos;
                        return;
                    }
                    const factor = 1 - elapsed / duration;
                    game.camera.position.x = originalPos.x + (Math.random() - 0.5) * intensity * factor;
                    game.camera.position.y = originalPos.y + (Math.random() - 0.5) * intensity * factor;
                }, 16);

                return `📳 Camera shake: intensity=${intensity}, duration=${duration}ms`;
            }
        });

        // Warp to predefined locations
        this.registerCommand({
            name: 'warp',
            description: 'Warp to predefined location',
            usage: 'warp <center|north|south|east|west|random|base>',
            category: 'cheats',
            aliases: ['goto', 'location'],
            execute: (_args, game) => {
                if (!game || !game.tank?.chassis) return 'Tank not available';

                const location = _args[0] || 'center';
                let x = 0, z = 0;

                switch (location) {
                    case 'center': x = 0; z = 0; break;
                    case 'north': x = 0; z = -500; break;
                    case 'south': x = 0; z = 500; break;
                    case 'east': x = 500; z = 0; break;
                    case 'west': x = -500; z = 0; break;
                    case 'random':
                        x = (Math.random() - 0.5) * 1000;
                        z = (Math.random() - 0.5) * 1000;
                        break;
                    case 'base':
                    case 'spawn':
                        x = 0; z = 50;
                        break;
                    default:
                        return `Unknown location: ${location}. Try: center, north, south, east, west, random, base`;
                }

                const y = game.getGroundHeight ? game.getGroundHeight(x, z) + 5 : 10;
                game.tank.chassis.position.set(x, y, z);

                if (game.tank.physicsBody) {
                    game.tank.physicsBody.setTargetTransform(
                        new Vector3(x, y, z),
                        game.tank.chassis.rotationQuaternion || Quaternion.Identity()
                    );
                    game.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                }

                return `🌀 Warped to ${location} (${x.toFixed(0)}, ${z.toFixed(0)})`;
            }
        });

        // Players list
        this.registerCommand({
            name: 'players',
            description: 'List online players',
            usage: 'players',
            category: 'info',
            aliases: ['who', 'list'],
            execute: (_args, game) => {
                if (!game?.multiplayerManager) return 'Not in multiplayer';

                const players = game.multiplayerManager.getNetworkPlayers();
                if (!players || players.size === 0) {
                    return '👥 No other players online';
                }

                let result = '👥 Online Players:\n';
                players.forEach((p: any, id: string) => {
                    const status = p.status || 'alive';
                    const icon = status === 'dead' ? '💀' : '🎮';
                    result += `  ${icon} ${p.name || 'Unknown'} (${id.substring(0, 8)}...)\n`;
                });

                return result;
            }
        });

        // Ping
        this.registerCommand({
            name: 'ping',
            description: 'Check network latency',
            usage: 'ping',
            category: 'info',
            aliases: ['latency', 'lag'],
            execute: (_args, game) => {
                if (!game?.multiplayerManager) return 'Not in multiplayer';

                const ping = game.multiplayerManager.getAverageLatency?.() ||
                    game.multiplayerManager.latency || 0;

                let quality = '🟢 Excellent';
                if (ping > 150) quality = '🔴 Poor';
                else if (ping > 80) quality = '🟡 Good';

                return `📡 Ping: ${ping.toFixed(0)}ms ${quality}`;
            }
        });

        // Room info
        this.registerCommand({
            name: 'room',
            description: 'Show room information',
            usage: 'room',
            category: 'info',
            execute: (_args, game) => {
                if (!game?.multiplayerManager) return 'Not in multiplayer';

                const roomId = game.multiplayerManager.getRoomId?.() || 'N/A';
                const playerId = game.multiplayerManager.getPlayerId?.() || 'N/A';
                const players = game.multiplayerManager.getNetworkPlayers()?.size || 0;

                return `🏠 Room: ${roomId.substring(0, 8)}...\n  Your ID: ${playerId.substring(0, 8)}...\n  Players: ${players + 1}`;
            }
        });

        // Switch chassis
        this.registerCommand({
            name: 'chassis',
            description: 'Switch tank chassis',
            usage: 'chassis <type> | chassis list',
            category: 'cheats',
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';

                if (_args[0] === 'list' || !_args[0]) {
                    return 'Available: light, medium, heavy, stealth, artillery, support';
                }

                const type = _args[0];
                if (game.tank.setChassisType) {
                    game.tank.setChassisType(type);
                    return `🚗 Chassis changed to: ${type}`;
                }

                return 'Chassis change not available';
            }
        });

        // Switch cannon
        this.registerCommand({
            name: 'cannon',
            description: 'Switch tank cannon',
            usage: 'cannon <type> | cannon list',
            category: 'cheats',
            aliases: ['weapon', 'gun'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';

                if (_args[0] === 'list' || !_args[0]) {
                    return 'Available: standard, rapid, heavy, sniper, plasma, rocket';
                }

                const type = _args[0];
                if (game.tank.setCannonType) {
                    game.tank.setCannonType(type);
                    return `🔫 Cannon changed to: ${type}`;
                }

                return 'Cannon change not available';
            }
        });

        // Tank color
        this.registerCommand({
            name: 'color',
            description: 'Change tank colors',
            usage: 'color <tank|turret> <#hex>',
            category: 'cheats',
            aliases: ['paint'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';

                const part = _args[0] || 'tank';
                const color = _args[1] || '#FF0000';

                if (part === 'tank' && game.tank.setTankColor) {
                    game.tank.setTankColor(color);
                    return `🎨 Tank color: ${color}`;
                } else if (part === 'turret' && game.tank.setTurretColor) {
                    game.tank.setTurretColor(color);
                    return `🎨 Turret color: ${color}`;
                }

                return 'Usage: color <tank|turret> <#hex>';
            }
        });

        // Time of day
        this.registerCommand({
            name: 'time',
            description: 'Set time of day',
            usage: 'time <day|night|sunset|dawn>',
            category: 'visual',
            aliases: ['daytime', 'tod'],
            execute: (_args, game) => {
                if (!game || !game.scene) return 'Scene not available';

                const time = _args[0] || 'day';

                switch (time) {
                    case 'day':
                        game.scene.clearColor.set(0.4, 0.6, 1.0, 1);
                        game.scene.ambientColor.set(0.6, 0.6, 0.6);
                        return '☀️ Time: Day';
                    case 'night':
                        game.scene.clearColor.set(0.02, 0.02, 0.1, 1);
                        game.scene.ambientColor.set(0.1, 0.1, 0.2);
                        return '🌙 Time: Night';
                    case 'sunset':
                        game.scene.clearColor.set(1.0, 0.4, 0.2, 1);
                        game.scene.ambientColor.set(0.8, 0.4, 0.2);
                        return '🌅 Time: Sunset';
                    case 'dawn':
                        game.scene.clearColor.set(0.6, 0.4, 0.6, 1);
                        game.scene.ambientColor.set(0.5, 0.4, 0.5);
                        return '🌄 Time: Dawn';
                    default:
                        return `Unknown time: ${time}. Try: day, night, sunset, dawn`;
                }
            }
        });

        // Size scale
        this.registerCommand({
            name: 'size',
            description: 'Change tank size (visual)',
            usage: 'size <0.5-3> | size reset',
            category: 'cheats',
            aliases: ['scale', 'giant', 'tiny'],
            execute: (_args, game) => {
                if (!game || !game.tank?.chassis) return 'Tank not available';

                if (_args[0] === 'reset') {
                    game.tank.chassis.scaling.set(1, 1, 1);
                    return '📐 Size reset to normal';
                }

                const scale = Math.min(3, Math.max(0.5, parseFloat(_args[0] || '1') || 1));
                game.tank.chassis.scaling.set(scale, scale, scale);

                return `📐 Tank size: ${scale}x`;
            }
        });

        // Flip tank
        this.registerCommand({
            name: 'flip',
            description: 'Flip your tank right-side up',
            usage: 'flip',
            category: 'cheats',
            aliases: ['unflip', 'reset_rotation'],
            execute: (_args, game) => {
                if (!game || !game.tank?.chassis) return 'Tank not available';

                const pos = game.tank.chassis.position.clone();
                pos.y += 3; // Lift slightly

                game.tank.chassis.rotationQuaternion = Quaternion.Identity();
                game.tank.chassis.position = pos;

                if (game.tank.physicsBody) {
                    game.tank.physicsBody.setTargetTransform(pos, Quaternion.Identity());
                    game.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                    game.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                }

                return '🔄 Tank flipped upright!';
            }
        });

        // Rage mode
        this.registerCommand({
            name: 'rage',
            description: 'RAGE MODE - speed + damage + screen shake',
            usage: 'rage [duration_sec]',
            category: 'cheats',
            aliases: ['berserk', 'fury'],
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                const duration = (parseFloat(_args[0] || '10') || 10) * 1000;

                // Store original values
                const origSpeed = tank.moveSpeed;
                const origDmg = tank.damageMultiplier || 1;

                // Apply rage
                tank.moveSpeed = origSpeed * 2;
                tank.damageMultiplier = 3;
                tank.godMode = true;

                // Screen effect
                if (game.scene) {
                    game.scene.fogMode = 3;
                    game.scene.fogDensity = 0.003;
                    game.scene.fogColor.set(0.5, 0.1, 0.1);
                }

                // Reset after duration
                setTimeout(() => {
                    tank.moveSpeed = origSpeed;
                    tank.damageMultiplier = origDmg;
                    tank.godMode = false;
                    if (game.scene) game.scene.fogMode = 0;
                }, duration);

                return `😤 RAGE MODE for ${duration / 1000}s! Speed 2x, Damage 3x, INVINCIBLE!`;
            }
        });

        // Random explosion effect
        this.registerCommand({
            name: 'fireworks',
            description: 'Create random fireworks',
            usage: 'fireworks [count]',
            category: 'visual',
            execute: (_args, game) => {
                if (!game) return 'Game not available';

                const count = Math.min(20, parseInt(_args[0] || '5') || 5);
                const tank = game.tank?.chassis;
                const basePos = tank ? tank.position : Vector3.Zero();

                for (let i = 0; i < count; i++) {
                    setTimeout(() => {
                        const pos = basePos.add(new Vector3(
                            (Math.random() - 0.5) * 50,
                            Math.random() * 30 + 10,
                            (Math.random() - 0.5) * 50
                        ));
                        if (game.effectsManager?.createExplosion) {
                            game.effectsManager.createExplosion(pos, 2);
                        }
                    }, i * 200);
                }

                return `🎆 Fireworks: ${count} explosions!`;
            }
        });

        // Debug info
        this.registerCommand({
            name: 'debug',
            description: 'Show debug information',
            usage: 'debug [physics|mesh|network|memory]',
            category: 'info',
            execute: (_args, game) => {
                if (!game) return 'Game not available';

                const mode = _args[0] || 'general';

                switch (mode) {
                    case 'physics':
                        const bodies = game.scene?.getPhysicsEngine?.()?.getImpostors?.()?.length || 0;
                        return `⚙️ Physics:\n  Bodies: ${bodies}\n  Engine: ${game.scene?.getPhysicsEngine?.()?.getPhysicsPluginName?.() || 'N/A'}`;

                    case 'mesh':
                        const meshes = game.scene?.meshes?.length || 0;
                        const active = game.scene?.getActiveMeshes?.()?.length || 0;
                        return `📦 Meshes:\n  Total: ${meshes}\n  Active: ${active}`;

                    case 'network':
                        const ping = game.multiplayerManager?.getAverageLatency?.() || 0;
                        const players = game.multiplayerManager?.getNetworkPlayers?.()?.size || 0;
                        return `📡 Network:\n  Ping: ${ping.toFixed(0)}ms\n  Players: ${players}`;

                    case 'memory':
                        const mem = (performance as any).memory;
                        if (mem) {
                            return `💾 Memory:\n  Used: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB\n  Total: ${(mem.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`;
                        }
                        return '💾 Memory info not available (Chrome only)';

                    default:
                        const fps = game.engine?.getFps?.() || 0;
                        const pos = game.tank?.chassis?.position;
                        return `📊 Debug:\n  FPS: ${fps.toFixed(0)}\n  Pos: (${pos?.x?.toFixed(0) || 0}, ${pos?.z?.toFixed(0) || 0})\n  Use: debug <physics|mesh|network|memory>`;
                }
            }
        });

        // Save screenshot (logs info)
        this.registerCommand({
            name: 'screenshot',
            description: 'Take a screenshot',
            usage: 'screenshot',
            category: 'system',
            aliases: ['ss', 'snap'],
            execute: (_args, game) => {
                if (!game?.engine || !game?.scene) return 'Engine not available';

                try {
                    // Use Babylon's built-in screenshot tool
                    const canvas = game.engine.getRenderingCanvas();
                    if (canvas) {
                        const dataUrl = canvas.toDataURL('image/png');
                        const link = document.createElement('a');
                        link.download = `tx_screenshot_${Date.now()}.png`;
                        link.href = dataUrl;
                        link.click();
                        return '📸 Screenshot saved!';
                    }
                } catch (e) {
                    return `📸 Screenshot failed: ${e}`;
                }

                return '📸 Screenshot not available';
            }
        });

        // Secret codes / easter eggs
        this.registerCommand({
            name: 'konami',
            description: 'Konami code easter egg',
            usage: 'konami',
            category: 'cheats',
            execute: (_args, game) => {
                if (!game || !game.tank) return 'Tank not available';
                const tank = game.tank as any;

                tank.godMode = true;
                tank.infiniteAmmo = true;
                tank.moveSpeed = 50;
                tank.damageMultiplier = 10;

                return '⬆️⬆️⬇️⬇️⬅️➡️⬅️➡️🅱️🅰️ START!\n🎮 KONAMI POWER ACTIVATED!\n  Speed: 50\n  Damage: 10x\n  GOD MODE';
            }
        });

        // Random fun facts
        this.registerCommand({
            name: 'fact',
            description: 'Random tank fact',
            usage: 'fact',
            category: 'other',
            aliases: ['trivia'],
            execute: () => {
                const facts = [
                    '🎯 The first tanks were developed in WWI by Britain',
                    '🎯 The word "tank" was used as a code name for secrecy',
                    '🎯 Modern tanks can shoot accurately while moving',
                    '🎯 The M1 Abrams uses a turbine engine',
                    '🎯 The T-90 can fire missiles through its main gun',
                    '🎯 Tanks have been used since 1916',
                    '🎯 The Maus was the heaviest tank ever built (188 tons)',
                    '🎯 Active protection systems can intercept incoming missiles',
                ];
                return facts[Math.floor(Math.random() * facts.length)] || ""; // [Opus 4.6]
            }
        });

        // 8ball fortune
        this.registerCommand({
            name: '8ball',
            description: 'Ask the magic 8-ball',
            usage: '8ball <question>',
            category: 'other',
            aliases: ['fortune', 'ask'],
            execute: (_args) => {
                const answers = [
                    '🎱 Yes, definitely!',
                    '🎱 Without a doubt',
                    '🎱 Most likely',
                    '🎱 Outlook good',
                    '🎱 Signs point to yes',
                    '🎱 Reply hazy, try again',
                    '🎱 Ask again later',
                    '🎱 Cannot predict now',
                    "🎱 Don't count on it",
                    '🎱 My sources say no',
                    '🎱 Outlook not so good',
                    '🎱 Very doubtful',
                ];
                return answers[Math.floor(Math.random() * answers.length)] || ""; // [Opus 4.6]
            }
        });

        // Roll dice
        this.registerCommand({
            name: 'roll',
            description: 'Roll dice',
            usage: 'roll [NdM] (default: 1d6)',
            category: 'other',
            aliases: ['dice'],
            execute: (_args) => {
                const diceStr = _args[0] || '1d6';
                const match = diceStr.match(/(\d+)d(\d+)/i);

                if (!match) return 'Usage: roll NdM (e.g., roll 2d20)';

                const count = Math.min(10, parseInt(match[1] ?? "") || 1); // [Opus 4.6]
                const sides = Math.min(100, parseInt(match[2] ?? "") || 6); // [Opus 4.6]

                const rolls: number[] = [];
                let total = 0;

                for (let i = 0; i < count; i++) {
                    const roll = Math.floor(Math.random() * sides) + 1;
                    rolls.push(roll);
                    total += roll;
                }

                return `🎲 ${diceStr}: [${rolls.join(', ')}] = ${total}`;
            }
        });

        // Coin flip
        this.registerCommand({
            name: 'flip_coin',
            description: 'Flip a coin',
            usage: 'flip_coin',
            category: 'other',
            aliases: ['coin', 'coinflip'],
            execute: () => {
                return Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
            }
        });
    }
}

