/**
 * @module game/FrontlineMode
 * @description Игровой режим "Линия фронта"
 * 
 * Режим с защитой позиций, волнами врагов и поддержкой союзников.
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Конфигурация режима Frontline
 */
export interface FrontlineConfig {
    /** Длительность волны (секунды) */
    waveDuration: number;
    /** Интервал между волнами (секунды) */
    waveInterval: number;
    /** Базовое количество врагов в волне */
    baseEnemyCount: number;
    /** Множитель сложности за волну */
    difficultyMultiplier: number;
    /** Количество защитников */
    defenderCount: number;
    /** Радиус зоны защиты */
    defenseZoneRadius: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_FRONTLINE_CONFIG: FrontlineConfig = {
    waveDuration: 120,
    waveInterval: 30,
    baseEnemyCount: 5,
    difficultyMultiplier: 1.2,
    defenderCount: 3,
    defenseZoneRadius: 50
};

/**
 * Состояние волны
 */
export interface WaveState {
    /** Номер текущей волны */
    currentWave: number;
    /** Время до следующей волны */
    timeToNextWave: number;
    /** Количество врагов в текущей волне */
    enemyCount: number;
    /** Количество убитых врагов */
    enemiesKilled: number;
    /** Активна ли волна */
    isActive: boolean;
}

/**
 * Состояние защитников
 */
export interface DefenderState {
    id: string;
    position: Vector3;
    health: number;
    maxHealth: number;
    isAlive: boolean;
}

/**
 * Тип врага во Frontline
 */
export type FrontlineEnemyType = "defender" | "attacker";

/**
 * Данные врага Frontline
 */
export interface FrontlineEnemy {
    id: string;
    type: FrontlineEnemyType;
    position: Vector3;
    originalPosition: Vector3;
}

/**
 * Менеджер режима Frontline
 */
export class FrontlineMode {
    private config: FrontlineConfig;
    private waveState: WaveState;
    private defenders: Map<string, DefenderState> = new Map();
    private enemies: Map<string, FrontlineEnemy> = new Map();
    private isActive: boolean = false;
    
    // Callbacks
    private onWaveStart?: (wave: number) => void;
    private onWaveComplete?: (wave: number, score: number) => void;
    private onEnemySpawn?: (enemy: FrontlineEnemy) => void;
    private onDefenderDeath?: (defender: DefenderState) => void;
    private onGameOver?: (finalWave: number, totalKills: number) => void;
    
    constructor(config: Partial<FrontlineConfig> = {}) {
        this.config = { ...DEFAULT_FRONTLINE_CONFIG, ...config };
        this.waveState = {
            currentWave: 0,
            timeToNextWave: this.config.waveInterval,
            enemyCount: 0,
            enemiesKilled: 0,
            isActive: false
        };
    }
    
    /**
     * Начать режим
     */
    start(): void {
        this.isActive = true;
        this.waveState.currentWave = 0;
        this.waveState.timeToNextWave = this.config.waveInterval;
        this.spawnDefenders();
    }
    
    /**
     * Остановить режим
     */
    stop(): void {
        this.isActive = false;
        this.defenders.clear();
        this.enemies.clear();
    }
    
    /**
     * Обновление
     * @param deltaTime - Время кадра в секундах
     */
    update(deltaTime: number): void {
        if (!this.isActive) return;
        
        if (!this.waveState.isActive) {
            // Между волнами
            this.waveState.timeToNextWave -= deltaTime;
            if (this.waveState.timeToNextWave <= 0) {
                this.startNextWave();
            }
        } else {
            // Проверить завершение волны
            if (this.waveState.enemiesKilled >= this.waveState.enemyCount) {
                this.completeWave();
            }
        }
        
        // Проверить game over
        if (this.checkGameOver()) {
            this.gameOver();
        }
    }
    
    /**
     * Спавн защитников
     */
    private spawnDefenders(): void {
        for (let i = 0; i < this.config.defenderCount; i++) {
            const angle = (i / this.config.defenderCount) * Math.PI * 2;
            const radius = this.config.defenseZoneRadius * 0.5;
            
            const defender: DefenderState = {
                id: `defender_${i}`,
                position: new Vector3(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius
                ),
                health: 100,
                maxHealth: 100,
                isAlive: true
            };
            
            this.defenders.set(defender.id, defender);
        }
    }
    
    /**
     * Начать следующую волну
     */
    private startNextWave(): void {
        this.waveState.currentWave++;
        this.waveState.isActive = true;
        this.waveState.enemiesKilled = 0;
        
        // Рассчитать количество врагов
        const difficultyScale = Math.pow(
            this.config.difficultyMultiplier, 
            this.waveState.currentWave - 1
        );
        this.waveState.enemyCount = Math.floor(
            this.config.baseEnemyCount * difficultyScale
        );
        
        // Вызвать callback
        this.onWaveStart?.(this.waveState.currentWave);
        
        // Спавнить врагов
        for (let i = 0; i < this.waveState.enemyCount; i++) {
            this.spawnEnemy(i);
        }
    }
    
    /**
     * Спавн врага
     */
    private spawnEnemy(index: number): void {
        const angle = (index / this.waveState.enemyCount) * Math.PI * 2;
        const spawnRadius = this.config.defenseZoneRadius * 2;
        
        const enemy: FrontlineEnemy = {
            id: `enemy_wave${this.waveState.currentWave}_${index}`,
            type: "attacker",
            position: new Vector3(
                Math.cos(angle) * spawnRadius,
                0,
                Math.sin(angle) * spawnRadius
            ),
            originalPosition: new Vector3(
                Math.cos(angle) * spawnRadius,
                0,
                Math.sin(angle) * spawnRadius
            )
        };
        
        this.enemies.set(enemy.id, enemy);
        this.onEnemySpawn?.(enemy);
    }
    
    /**
     * Завершить волну
     */
    private completeWave(): void {
        this.waveState.isActive = false;
        this.waveState.timeToNextWave = this.config.waveInterval;
        
        const waveScore = this.waveState.enemiesKilled * this.waveState.currentWave * 100;
        this.onWaveComplete?.(this.waveState.currentWave, waveScore);
    }
    
    /**
     * Обработать смерть врага
     */
    onEnemyKilled(enemyId: string): void {
        if (this.enemies.has(enemyId)) {
            this.enemies.delete(enemyId);
            this.waveState.enemiesKilled++;
        }
    }
    
    /**
     * Обработать урон защитника
     */
    damageDefender(defenderId: string, damage: number): void {
        const defender = this.defenders.get(defenderId);
        if (defender && defender.isAlive) {
            defender.health -= damage;
            if (defender.health <= 0) {
                defender.health = 0;
                defender.isAlive = false;
                this.onDefenderDeath?.(defender);
            }
        }
    }
    
    /**
     * Проверить game over
     */
    private checkGameOver(): boolean {
        // Game over если все защитники мертвы
        for (const defender of this.defenders.values()) {
            if (defender.isAlive) return false;
        }
        return true;
    }
    
    /**
     * Game over
     */
    private gameOver(): void {
        this.isActive = false;
        const totalKills = this.getTotalKills();
        this.onGameOver?.(this.waveState.currentWave, totalKills);
    }
    
    /**
     * Получить общее количество убийств
     */
    getTotalKills(): number {
        return (this.waveState.currentWave - 1) * this.config.baseEnemyCount + 
               this.waveState.enemiesKilled;
    }
    
    /**
     * Получить состояние волны
     */
    getWaveState(): WaveState {
        return { ...this.waveState };
    }
    
    /**
     * Получить защитников
     */
    getDefenders(): DefenderState[] {
        return Array.from(this.defenders.values());
    }
    
    /**
     * Установить callbacks
     */
    setCallbacks(callbacks: {
        onWaveStart?: (wave: number) => void;
        onWaveComplete?: (wave: number, score: number) => void;
        onEnemySpawn?: (enemy: FrontlineEnemy) => void;
        onDefenderDeath?: (defender: DefenderState) => void;
        onGameOver?: (finalWave: number, totalKills: number) => void;
    }): void {
        this.onWaveStart = callbacks.onWaveStart;
        this.onWaveComplete = callbacks.onWaveComplete;
        this.onEnemySpawn = callbacks.onEnemySpawn;
        this.onDefenderDeath = callbacks.onDefenderDeath;
        this.onGameOver = callbacks.onGameOver;
    }
    
    /**
     * Активен ли режим
     */
    getIsActive(): boolean {
        return this.isActive;
    }
}

export default FrontlineMode;

