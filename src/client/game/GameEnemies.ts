// ═══════════════════════════════════════════════════════════════════════════
// GAME ENEMIES - Управление врагами и системой сложности
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3, Ray, Scene } from "@babylonjs/core";
import { logger } from "../utils/logger";
import { EnemyTank } from "../enemyTank";
import { EnemyManager } from "../enemy";
import type { SoundManager } from "../soundManager";
import type { EffectsManager } from "../effects";
import type { TankController } from "../tankController";
import type { ChunkSystem } from "../chunkSystem";
import type { HUD } from "../hud";
import type { CurrencyManager } from "../currencyManager";
import type { ExperienceSystem } from "../experienceSystem";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { AchievementsSystem } from "../achievements";
import type { MissionSystem } from "../missionSystem";
import type { MapType, GameSettings } from "../menu";

/**
 * Интерфейс для доступа к системам игры
 */
export interface GameSystemsAccess {
    scene: Scene;
    tank?: TankController;
    soundManager?: SoundManager;
    effectsManager?: EffectsManager;
    chunkSystem?: ChunkSystem;
    hud?: HUD;
    currencyManager?: CurrencyManager;
    experienceSystem?: ExperienceSystem;
    playerProgression?: PlayerProgressionSystem;
    achievementsSystem?: AchievementsSystem;
    missionSystem?: MissionSystem;
    sessionSettings?: { getSettings: () => { enemyCount?: number; aiDifficulty?: string } };
    mainMenu?: { getSettings: () => GameSettings & { enemyCount?: number } };
    currentMapType: MapType;
    gameStarted: boolean;
    survivalStartTime: number;
}

/**
 * GameEnemies - Управление врагами
 * 
 * Отвечает за:
 * - Спавн врагов на разных картах
 * - Управление сложностью и адаптивным скейлингом
 * - Обработку смерти врагов и наград
 * - Систему волн для режима Frontline
 */
export class GameEnemies {
    // Массив врагов
    enemyTanks: EnemyTank[] = [];
    
    // Enemy manager (для турелей)
    enemyManager: EnemyManager | undefined;
    
    // Система волн для Frontline
    private frontlineWaveNumber = 0;
    private frontlineWaveTimer: number | null = null;
    private frontlineMaxEnemies = 12;
    private frontlineWaveInterval = 75000; // 75 секунд между волнами
    
    // Логирование адаптивной сложности
    private _lastAdaptiveDifficultyLogTime = 0;
    
    // Ссылка на системы игры
    private systems: GameSystemsAccess | null = null;
    
    /**
     * Инициализация системы врагов
     */
    initialize(systems: GameSystemsAccess): void {
        this.systems = systems;
        
        // Создаём EnemyManager для турелей
        if (systems.scene) {
            this.enemyManager = new EnemyManager(systems.scene);
        }
        
        logger.log("[GameEnemies] Initialized");
    }
    
    /**
     * Обновление ссылки на системы (для изменений в рантайме)
     */
    updateSystems(systems: GameSystemsAccess): void {
        this.systems = systems;
    }
    
    /**
     * Очистка всех врагов
     */
    clearEnemies(): void {
        this.enemyTanks.forEach(enemy => {
            if (enemy?.chassis) {
                try {
                    enemy.chassis.dispose();
                } catch (e) {
                    // Игнорируем ошибки при dispose
                }
            }
        });
        this.enemyTanks = [];
        
        // Очищаем турели
        if (this.enemyManager?.turrets) {
            this.enemyManager.turrets.forEach(turret => {
                if (turret.base && !turret.base.isDisposed()) turret.base.dispose();
                if (turret.head && !turret.head.isDisposed()) turret.head.dispose();
                if (turret.barrel && !turret.barrel.isDisposed()) turret.barrel.dispose();
            });
            this.enemyManager.turrets = [];
        }
        
        // Останавливаем таймер волн
        if (this.frontlineWaveTimer !== null) {
            clearInterval(this.frontlineWaveTimer);
            this.frontlineWaveTimer = null;
        }
        
        this.frontlineWaveNumber = 0;
        
        logger.log("[GameEnemies] Cleared all enemies");
    }
    
    /**
     * Возвращает текущую сложность врагов
     */
    getCurrentDifficulty(): "easy" | "medium" | "hard" {
        if (!this.systems) return "medium";
        
        // Приоритет: настройки сессии > настройки меню > medium
        if (this.systems.sessionSettings) {
            const sessionSettings = this.systems.sessionSettings.getSettings();
            const sessionDiff = sessionSettings.aiDifficulty;
            if (sessionDiff === "easy" || sessionDiff === "medium" || sessionDiff === "hard") {
                return sessionDiff;
            }
        }
        
        const menuSettings = this.systems.mainMenu?.getSettings();
        if (menuSettings?.enemyDifficulty) {
            return menuSettings.enemyDifficulty;
        }
        
        return "medium";
    }
    
    /**
     * Мультипликатор наград в зависимости от сложности
     */
    getDifficultyRewardMultiplier(): number {
        const diff = this.getCurrentDifficulty();
        switch (diff) {
            case "easy": return 0.7;
            case "hard": return 1.4;
            case "medium":
            default: return 1.0;
        }
    }
    
    /**
     * Адаптивный множитель сложности врагов
     * Учитывает уровень игрока и длительность сессии
     */
    getAdaptiveDifficultyScale(): number {
        if (!this.systems) return 1.0;
        
        const diff = this.getCurrentDifficulty();
        let base = 1.0;
        if (diff === "easy") base = 0.9;
        else if (diff === "hard") base = 1.1;
        
        // Множитель от уровня игрока (1..50)
        let levelFactor = 1.0;
        if (this.systems.playerProgression) {
            try {
                const level = this.systems.playerProgression.getLevel();
                const normalized = Math.min(Math.max(level - 1, 0), 49) / 49;
                levelFactor = 1 + normalized * 0.5; // до +50%
            } catch {
                // В случае ошибки оставляем 1.0
            }
        }
        
        // Множитель от длительности выживания (до 20 минут)
        let timeFactor = 1.0;
        if (this.systems.survivalStartTime > 0) {
            const survivalSeconds = (Date.now() - this.systems.survivalStartTime) / 1000;
            const clamped = Math.min(Math.max(survivalSeconds, 0), 20 * 60);
            const normalized = clamped / (20 * 60);
            timeFactor = 1 + normalized * 0.4; // до +40%
        }
        
        let scale = base * levelFactor * timeFactor;
        
        // Кламп в разумных пределах
        scale = Math.max(0.7, Math.min(1.8, scale));
        
        // Логирование (раз в 10 секунд)
        const now = Date.now();
        if (now - this._lastAdaptiveDifficultyLogTime > 10000) {
            this._lastAdaptiveDifficultyLogTime = now;
            logger.debug(
                `[GameEnemies] Adaptive scale=${scale.toFixed(2)} (diff=${diff}, level=${levelFactor.toFixed(2)}, time=${timeFactor.toFixed(2)})`
            );
        }
        
        return scale;
    }
    
    /**
     * Получение высоты террейна в точке через raycast
     */
    private getGroundHeight(x: number, z: number): number {
        if (!this.systems?.scene) return 0;
        
        const rayStart = new Vector3(x, 100, z);
        const ray = new Ray(rayStart, Vector3.Down(), 200);
        
        const hit = this.systems.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            return (mesh.name.startsWith("ground_") || 
                    mesh.name.includes("terrain") || 
                    mesh.name.includes("chunk")) && 
                   mesh.isEnabled();
        });
        
        if (hit?.hit && hit.pickedPoint) {
            return hit.pickedPoint.y;
        }
        
        // Fallback: используем terrain generator
        if (this.systems.chunkSystem?.terrainGenerator) {
            return this.systems.chunkSystem.terrainGenerator.getHeight(x, z, "dirt");
        }
        
        return 0;
    }
    
    /**
     * Создание врага с настройками
     */
    private createEnemy(
        pos: Vector3, 
        difficulty: "easy" | "medium" | "hard",
        difficultyScale: number,
        onDeath?: () => void
    ): EnemyTank | null {
        if (!this.systems?.scene || !this.systems.soundManager || !this.systems.effectsManager) {
            return null;
        }
        
        const enemy = new EnemyTank(
            this.systems.scene, 
            pos, 
            this.systems.soundManager, 
            this.systems.effectsManager, 
            difficulty, 
            difficultyScale
        );
        
        if (this.systems.tank) {
            enemy.setTarget(this.systems.tank);
        }
        
        if (onDeath) {
            enemy.onDeathObservable.add(onDeath);
        }
        
        return enemy;
    }
    
    /**
     * Обработка награды за убийство врага
     */
    private giveKillReward(baseReward: number, message?: string): void {
        if (!this.systems) return;
        
        const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
        
        // Кредиты
        if (this.systems.currencyManager) {
            this.systems.currencyManager.addCurrency(reward);
            if (this.systems.hud) {
                this.systems.hud.setCurrency(this.systems.currencyManager.getCurrency());
                this.systems.hud.showMessage(message || `+${reward} кредитов!`, "#ffaa00", 2000);
            }
        }
        
        // Опыт
        if (this.systems.experienceSystem && this.systems.tank) {
            this.systems.experienceSystem.recordKill(
                this.systems.tank.chassisType.id,
                this.systems.tank.cannonType.id,
                false
            );
        }
        
        // Прогресс
        if (this.systems.playerProgression) {
            this.systems.playerProgression.recordKill();
            this.systems.playerProgression.addCredits(reward);
        }
    }
    
    /**
     * Обновление достижений при убийстве
     */
    private trackKillAchievements(): void {
        if (!this.systems) return;
        
        if (this.systems.achievementsSystem) {
            this.systems.achievementsSystem.updateProgress("first_blood", 1);
            this.systems.achievementsSystem.updateProgress("tank_hunter", 1);
            this.systems.achievementsSystem.updateProgress("tank_ace", 1);
            
            // Comeback achievement
            if (this.systems.tank && this.systems.tank.currentHealth / this.systems.tank.maxHealth < 0.2) {
                this.systems.achievementsSystem.updateProgress("comeback", 1);
            }
        }
        
        if (this.systems.missionSystem) {
            this.systems.missionSystem.updateProgress("kill", 1);
        }
        
        if (this.systems.hud) {
            this.systems.hud.addKill();
        }
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // СПАВН ВРАГОВ НА РАЗНЫХ КАРТАХ
    // ════════════════════════════════════════════════════════════════════════
    
    /**
     * Главный метод спавна врагов - выбирает логику в зависимости от карты
     */
    spawnEnemies(): void {
        if (!this.systems) {
            logger.warn("[GameEnemies] Cannot spawn: systems not initialized");
            return;
        }
        
        logger.log(`[GameEnemies] Spawning enemies for map: ${this.systems.currentMapType}`);
        
        // Sandbox - без врагов
        if (this.systems.currentMapType === "sandbox") {
            logger.log("[GameEnemies] Sandbox mode: no enemies");
            return;
        }
        
        // Polygon - тренировочные боты
        if (this.systems.currentMapType === "polygon") {
            this.spawnPolygonBots();
            return;
        }
        
        // Frontline - система волн
        if (this.systems.currentMapType === "frontline") {
            this.spawnFrontlineEnemies();
            return;
        }
        
        // Остальные карты - стандартный спавн
        this.spawnStandardEnemies();
    }
    
    /**
     * Спавн тренировочных ботов для Polygon
     */
    spawnPolygonBots(): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) return;
        
        logger.log("[GameEnemies] Polygon: Spawning training bots");
        
        // Зона боя - юго-восточный квадрант
        const combatZone = {
            minX: 30, maxX: 90,
            minZ: -90, maxZ: -30
        };
        
        const botCount = 4;
        const spawnPositions: Vector3[] = [];
        
        for (let i = 0; i < botCount; i++) {
            let attempts = 0;
            let pos: Vector3;
            
            do {
                const spawnX = combatZone.minX + Math.random() * (combatZone.maxX - combatZone.minX);
                const spawnZ = combatZone.minZ + Math.random() * (combatZone.maxZ - combatZone.minZ);
                const groundHeight = this.getGroundHeight(spawnX, spawnZ);
                const spawnY = Math.max(groundHeight, 0) + 1.2;
                
                pos = new Vector3(spawnX, spawnY, spawnZ);
                
                // Проверяем расстояние до других ботов
                let tooClose = false;
                for (const existingPos of spawnPositions) {
                    if (Vector3.Distance(pos, existingPos) < 20) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) break;
                attempts++;
            } while (attempts < 30);
            
            spawnPositions.push(pos);
        }
        
        // Создаём ботов
        for (const pos of spawnPositions) {
            const bot = this.createEnemy(pos, "easy", 1, () => {
                this.handlePolygonBotDeath(bot!, combatZone);
            });
            
            if (bot) {
                this.enemyTanks.push(bot);
            }
        }
        
        logger.log(`[GameEnemies] Polygon: Spawned ${this.enemyTanks.length} training bots`);
    }
    
    /**
     * Обработка смерти тренировочного бота
     */
    private handlePolygonBotDeath(
        bot: EnemyTank, 
        combatZone: { minX: number; maxX: number; minZ: number; maxZ: number }
    ): void {
        logger.log("[GameEnemies] Training bot destroyed");
        
        this.trackKillAchievements();
        this.giveKillReward(50, "+50 кредитов (тренировка)");
        
        // Удаляем из массива
        const idx = this.enemyTanks.indexOf(bot);
        if (idx !== -1) this.enemyTanks.splice(idx, 1);
        
        // Респавн через 30 секунд
        setTimeout(() => {
            if (this.systems?.currentMapType === "polygon" && 
                this.systems.soundManager && this.systems.effectsManager) {
                
                const newPos = new Vector3(
                    combatZone.minX + Math.random() * (combatZone.maxX - combatZone.minX),
                    1.2,
                    combatZone.minZ + Math.random() * (combatZone.maxZ - combatZone.minZ)
                );
                
                const newBot = this.createEnemy(newPos, "easy", 1, () => {
                    this.handlePolygonBotDeath(newBot!, combatZone);
                });
                
                if (newBot) {
                    this.enemyTanks.push(newBot);
                    logger.log("[GameEnemies] Training bot respawned");
                }
            }
        }, 30000);
    }
    
    /**
     * Инициализация режима Frontline (система волн)
     */
    spawnFrontlineEnemies(): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) return;
        
        logger.log("[GameEnemies] Frontline: Initializing wave system");
        
        this.frontlineWaveNumber = 0;
        
        // Спавним защитников
        this.spawnFrontlineDefenders();
        
        // Первая волна через 10 секунд
        setTimeout(() => {
            this.spawnFrontlineWave();
        }, 10000);
        
        // Таймер волн
        this.frontlineWaveTimer = window.setInterval(() => {
            this.spawnFrontlineWave();
        }, this.frontlineWaveInterval);
    }
    
    /**
     * Спавн защитников на Frontline
     */
    private spawnFrontlineDefenders(): void {
        const defenderPositions = [
            { x: 180, z: 50 },
            { x: 200, z: -30 },
            { x: 220, z: 80 },
            { x: 160, z: -100 },
        ];
        
        for (const rawPos of defenderPositions) {
            const groundHeight = this.getGroundHeight(rawPos.x, rawPos.z);
            const spawnY = Math.max(groundHeight, 0) + 1.2;
            const pos = new Vector3(rawPos.x, spawnY, rawPos.z);
            
            const difficulty = this.getCurrentDifficulty();
            const scale = this.getAdaptiveDifficultyScale();
            
            const defender = this.createEnemy(pos, difficulty, scale, () => {
                this.handleFrontlineEnemyDeath(defender!, pos, "defender");
            });
            
            if (defender) {
                this.enemyTanks.push(defender);
            }
        }
        
        logger.log(`[GameEnemies] Frontline: Spawned ${defenderPositions.length} defenders`);
    }
    
    /**
     * Спавн волны атакующих на Frontline
     */
    private spawnFrontlineWave(): void {
        if (!this.systems) return;
        
        this.frontlineWaveNumber++;
        
        // Расчёт количества врагов
        const baseCount = 3;
        const waveBonus = Math.min(this.frontlineWaveNumber - 1, 4);
        const capacity = this.frontlineMaxEnemies - this.enemyTanks.length;
        
        if (capacity <= 0) {
            logger.log("[GameEnemies] Frontline: No capacity, skipping wave");
            return;
        }
        
        const adaptiveScale = this.getAdaptiveDifficultyScale();
        const scaledBase = Math.max(1, Math.round(baseCount * (0.8 + (adaptiveScale - 1) * 0.5)));
        let waveCount = Math.min(scaledBase + waveBonus, capacity);
        
        const minWaveCount = Math.min(capacity, Math.max(1, Math.floor((baseCount + waveBonus) * 0.6)));
        waveCount = Math.max(waveCount, minWaveCount);
        
        if (waveCount <= 0) return;
        
        // Уведомление
        if (this.systems.hud) {
            this.systems.hud.showMessage(`⚔️ ВОЛНА ${this.frontlineWaveNumber}: ${waveCount} врагов!`, "#ff4444", 3000);
        }
        
        logger.log(`[GameEnemies] Frontline: Wave ${this.frontlineWaveNumber} with ${waveCount} attackers`);
        
        // Спавн атакующих
        const spawnX = 250 + Math.random() * 40;
        
        for (let i = 0; i < waveCount; i++) {
            const spawnZ = -200 + Math.random() * 400;
            const groundHeight = this.getGroundHeight(spawnX, spawnZ);
            const spawnY = Math.max(groundHeight, 0) + 1.2;
            const pos = new Vector3(spawnX, spawnY, spawnZ);
            
            // Сложность растёт с волнами
            let difficulty: "easy" | "medium" | "hard" = "easy";
            if (this.frontlineWaveNumber >= 3) difficulty = "medium";
            if (this.frontlineWaveNumber >= 6) difficulty = "hard";
            
            const attacker = this.createEnemy(pos, difficulty, adaptiveScale, () => {
                this.handleFrontlineEnemyDeath(attacker!, pos, "attacker");
            });
            
            if (attacker) {
                this.enemyTanks.push(attacker);
            }
        }
    }
    
    /**
     * Обработка смерти врага на Frontline
     */
    private handleFrontlineEnemyDeath(
        enemy: EnemyTank, 
        _originalPos: Vector3, 
        type: "defender" | "attacker"
    ): void {
        logger.log(`[GameEnemies] Frontline ${type} destroyed`);
        
        this.trackKillAchievements();
        
        const baseReward = type === "defender" ? 120 : 80;
        this.giveKillReward(baseReward);
        
        // Удаляем из массива
        const idx = this.enemyTanks.indexOf(enemy);
        if (idx !== -1) this.enemyTanks.splice(idx, 1);
        
        // Респавн защитников
        if (type === "defender" && this.systems?.currentMapType === "frontline") {
            setTimeout(() => {
                if (this.systems?.currentMapType === "frontline" && 
                    this.systems.soundManager && this.systems.effectsManager) {
                    
                    const newX = 150 + Math.random() * 100;
                    const newZ = -150 + Math.random() * 300;
                    const newPos = new Vector3(newX, 0.6, newZ);
                    
                    const difficulty = this.getCurrentDifficulty();
                    const scale = this.getAdaptiveDifficultyScale();
                    
                    const newDefender = this.createEnemy(newPos, difficulty, scale, () => {
                        this.handleFrontlineEnemyDeath(newDefender!, newPos, "defender");
                    });
                    
                    if (newDefender) {
                        this.enemyTanks.push(newDefender);
                        logger.log("[GameEnemies] Frontline: Defender respawned");
                    }
                }
            }, 60000);
        }
    }
    
    /**
     * Стандартный спавн врагов для других карт
     */
    spawnStandardEnemies(): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) return;
        
        const minDistance = 60;
        const maxDistance = 180;
        
        // Определяем количество врагов
        let enemyCount = this.getDefaultEnemyCount();
        const aiDifficulty = this.getCurrentDifficulty();
        let enemyCountOverridden = false;
        
        // Проверяем настройки сессии/меню
        if (this.systems.sessionSettings) {
            const sessionSettings = this.systems.sessionSettings.getSettings();
            if (sessionSettings.enemyCount && sessionSettings.enemyCount > 0) {
                enemyCount = sessionSettings.enemyCount;
                enemyCountOverridden = true;
            }
        } else if (this.systems.mainMenu) {
            const menuSettings = this.systems.mainMenu.getSettings();
            if (menuSettings?.enemyCount && menuSettings.enemyCount > 0) {
                enemyCount = menuSettings.enemyCount;
                enemyCountOverridden = true;
            }
        }
        
        // Адаптивное масштабирование (если не задано вручную)
        if (!enemyCountOverridden) {
            const adaptiveScale = this.getAdaptiveDifficultyScale();
            const scaledCount = Math.round(enemyCount * adaptiveScale);
            const minCount = Math.max(4, Math.floor(enemyCount * 0.6));
            const maxCount = Math.min(enemyCount + 8, Math.round(enemyCount * 1.6));
            enemyCount = Math.max(minCount, Math.min(scaledCount, maxCount));
        }
        
        // Минимум 3 врага
        enemyCount = Math.max(3, enemyCount);
        
        logger.log(`[GameEnemies] Standard spawn: count=${enemyCount}, difficulty=${aiDifficulty}`);
        
        const spawnPositions: Vector3[] = [];
        const difficultyScale = this.getAdaptiveDifficultyScale();
        
        for (let i = 0; i < enemyCount; i++) {
            let attempts = 0;
            let pos: Vector3;
            
            do {
                const angle = Math.random() * Math.PI * 2;
                const distance = minDistance + Math.random() * (maxDistance - minDistance);
                const spawnX = Math.cos(angle) * distance;
                const spawnZ = Math.sin(angle) * distance;
                const groundHeight = this.getGroundHeight(spawnX, spawnZ);
                const spawnY = Math.max(groundHeight, 0) + 1.2;
                
                pos = new Vector3(spawnX, spawnY, spawnZ);
                
                // Проверяем расстояние до других врагов
                let tooClose = false;
                for (const existingPos of spawnPositions) {
                    if (Vector3.Distance(pos, existingPos) < 25) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) break;
                attempts++;
            } while (attempts < 30);
            
            spawnPositions.push(pos);
            
            const enemy = this.createEnemy(pos, aiDifficulty, difficultyScale, () => {
                this.handleStandardEnemyDeath(enemy!);
            });
            
            if (enemy) {
                this.enemyTanks.push(enemy);
            }
        }
        
        logger.log(`[GameEnemies] Spawned ${this.enemyTanks.length} enemies`);
    }
    
    /**
     * Количество врагов по умолчанию для карты
     */
    private getDefaultEnemyCount(): number {
        if (!this.systems) return 3;
        
        switch (this.systems.currentMapType) {
            case "normal":
            case "industrial":
            case "urban_warfare":
            case "ruins":
            case "canyon":
            case "underground":
            case "coastal":
                return 3;
            default:
                return 3;
        }
    }
    
    /**
     * Обработка смерти стандартного врага
     */
    private handleStandardEnemyDeath(enemy: EnemyTank): void {
        logger.log("[GameEnemies] Enemy destroyed");
        
        this.trackKillAchievements();
        this.giveKillReward(100);
        
        // Удаляем из массива
        const idx = this.enemyTanks.indexOf(enemy);
        if (idx !== -1) this.enemyTanks.splice(idx, 1);
    }
    
    /**
     * Установка цели для всех врагов
     */
    setTargetForAll(tank: TankController): void {
        for (const enemy of this.enemyTanks) {
            enemy.setTarget(tank);
        }
    }
    
    /**
     * Получение массива врагов
     */
    getEnemies(): EnemyTank[] {
        return this.enemyTanks;
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        this.clearEnemies();
        
        if (this.enemyManager) {
            // EnemyManager может иметь свой dispose
        }
        
        this.systems = null;
        logger.log("[GameEnemies] Disposed");
    }
}
