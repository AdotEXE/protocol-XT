/**
 * Script Engine - Система скриптов и макросов для терминала
 */

import { CommandSystem } from "./commandSystem";
import { logger } from "./utils/logger";

export class ScriptEngine {
    private commandSystem: CommandSystem;
    private scripts: Map<string, string> = new Map();
    private macros: Map<string, string[]> = new Map();
    private isRecording: boolean = false;
    private recordedCommands: string[] = [];
    
    constructor(commandSystem: CommandSystem) {
        this.commandSystem = commandSystem;
        this.loadScripts();
        this.loadMacros();
    }
    
    /**
     * Выполнение скрипта
     */
    async executeScript(script: string): Promise<string[]> {
        const lines = script.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.trim().startsWith('//') && !l.trim().startsWith('#'));
        
        const results: string[] = [];
        
        for (const line of lines) {
            try {
                const result = await this.commandSystem.execute(line);
                results.push(result);
                
                // Небольшая задержка между командами для читаемости
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error: any) {
                results.push(`Error in line "${line}": ${error.message || String(error)}`);
            }
        }
        
        return results;
    }
    
    /**
     * Выполнение сохранённого скрипта
     */
    async runScript(name: string): Promise<string[]> {
        const script = this.scripts.get(name);
        if (!script) {
            throw new Error(`Script "${name}" not found`);
        }
        
        logger.log(`[ScriptEngine] Running script: ${name}`);
        return this.executeScript(script);
    }
    
    /**
     * Сохранение скрипта
     */
    saveScript(name: string, script: string): void {
        this.scripts.set(name, script);
        this.saveScripts();
        logger.log(`[ScriptEngine] Script "${name}" saved`);
    }
    
    /**
     * Удаление скрипта
     */
    deleteScript(name: string): boolean {
        const deleted = this.scripts.delete(name);
        if (deleted) {
            this.saveScripts();
        }
        return deleted;
    }
    
    /**
     * Получить список скриптов
     */
    getScripts(): string[] {
        return Array.from(this.scripts.keys());
    }
    
    /**
     * Получить скрипт
     */
    getScript(name: string): string | undefined {
        return this.scripts.get(name);
    }
    
    /**
     * Начать запись макроса
     */
    startRecording(): void {
        this.isRecording = true;
        this.recordedCommands = [];
        logger.log("[ScriptEngine] Macro recording started");
    }
    
    /**
     * Остановить запись макроса
     */
    stopRecording(): string | null {
        if (!this.isRecording) {
            return null;
        }
        
        this.isRecording = false;
        const macro = this.recordedCommands.join('\n');
        this.recordedCommands = [];
        logger.log("[ScriptEngine] Macro recording stopped");
        return macro;
    }
    
    /**
     * Сохранить макрос
     */
    saveMacro(name: string, commands: string[]): void {
        this.macros.set(name, commands);
        this.saveMacros();
        logger.log(`[ScriptEngine] Macro "${name}" saved`);
    }
    
    /**
     * Выполнить макрос
     */
    async runMacro(name: string): Promise<string[]> {
        const commands = this.macros.get(name);
        if (!commands) {
            throw new Error(`Macro "${name}" not found`);
        }
        
        logger.log(`[ScriptEngine] Running macro: ${name}`);
        return this.executeScript(commands.join('\n'));
    }
    
    /**
     * Записать команду в макрос
     */
    recordCommand(command: string): void {
        if (this.isRecording) {
            this.recordedCommands.push(command);
        }
    }
    
    /**
     * Получить список макросов
     */
    getMacros(): string[] {
        return Array.from(this.macros.keys());
    }
    
    /**
     * Удалить макрос
     */
    deleteMacro(name: string): boolean {
        const deleted = this.macros.delete(name);
        if (deleted) {
            this.saveMacros();
        }
        return deleted;
    }
    
    /**
     * Загрузка скриптов из localStorage
     */
    private loadScripts(): void {
        try {
            const saved = localStorage.getItem('ptx_terminal_scripts');
            if (saved) {
                this.scripts = new Map(JSON.parse(saved));
            }
        } catch (error) {
            logger.warn("[ScriptEngine] Failed to load scripts:", error);
        }
    }
    
    /**
     * Сохранение скриптов в localStorage
     */
    private saveScripts(): void {
        try {
            const scriptsArray = Array.from(this.scripts.entries());
            localStorage.setItem('ptx_terminal_scripts', JSON.stringify(scriptsArray));
        } catch (error) {
            logger.warn("[ScriptEngine] Failed to save scripts:", error);
        }
    }
    
    /**
     * Загрузка макросов из localStorage
     */
    private loadMacros(): void {
        try {
            const saved = localStorage.getItem('ptx_terminal_macros');
            if (saved) {
                this.macros = new Map(JSON.parse(saved));
            }
        } catch (error) {
            logger.warn("[ScriptEngine] Failed to load macros:", error);
        }
    }
    
    /**
     * Сохранение макросов в localStorage
     */
    private saveMacros(): void {
        try {
            const macrosArray = Array.from(this.macros.entries());
            localStorage.setItem('ptx_terminal_macros', JSON.stringify(macrosArray));
        } catch (error) {
            logger.warn("[ScriptEngine] Failed to save macros:", error);
        }
    }
    
    /**
     * Экспорт скрипта
     */
    exportScript(name: string): string {
        const script = this.scripts.get(name);
        if (!script) {
            throw new Error(`Script "${name}" not found`);
        }
        
        return JSON.stringify({
            name,
            script,
            version: "1.0",
            timestamp: Date.now()
        }, null, 2);
    }
    
    /**
     * Импорт скрипта
     */
    importScript(data: string): void {
        try {
            const parsed = JSON.parse(data);
            if (!parsed.name || !parsed.script) {
                throw new Error('Invalid script format');
            }
            
            this.saveScript(parsed.name, parsed.script);
        } catch (error) {
            throw new Error(`Failed to import script: ${error}`);
        }
    }
}

