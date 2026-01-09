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
import { MAP_SIZES, getMapBoundsFromConfig } from "../maps/MapConstants";

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
    isMultiplayer?: boolean; // Флаг мультиплеера - в мультиплеере не спавним ботов
    aiCoordinator?: any; // УЛУЧШЕНО: AI Coordinator для групповой тактики
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
    
    // Система постепенного спавна ботов
    private gradualSpawnTimer: number | null = null;
    private gradualSpawnEnabled = true; // Включить постепенный спавн
    private gradualSpawnMaxBots = 5; // Максимум ботов при постепенном спавне
    private gradualSpawnInterval = 1000; // 1 секунда между спавнами
    private gradualSpawnDelay = 2000; // Задержка перед началом спавна (2 секунды)
    private gradualSpawnCount = 0; // Текущий счётчик заспавненных ботов
    
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
     * Создать ботов из сетевых данных (синхронизированные с сервером)
     */
    spawnNetworkEnemies(enemies: Array<import("../../shared/types").EnemyData>): void {
        if (!this.systems?.scene || !this.systems.soundManager || !this.systems.effectsManager) {
            logger.warn("[GameEnemies] Cannot spawn network enemies: systems not initialized");
            return;
        }
        
        logger.log(`[GameEnemies] Spawning ${enemies.length} network-synchronized enemies`);
        
        // Очищаем существующих врагов перед созданием сетевых
        this.clearEnemies();
        
        for (const enemyData of enemies) {
            if (!enemyData.isAlive) continue;
            
            const position = new Vector3(
                enemyData.position.x,
                enemyData.position.y,
                enemyData.position.z
            );
            
            // Определяем сложность на основе здоровья (можно улучшить)
            const difficulty: "easy" | "medium" | "hard" = 
                enemyData.maxHealth >= 120 ? "hard" :
                enemyData.maxHealth >= 100 ? "medium" : "easy";
            
            const difficultyScale = 1.0; // Базовый масштаб для сетевых ботов
            
            const enemy = this.createEnemy(position, difficulty, difficultyScale);
            if (enemy) {
                // Устанавливаем ID врага для синхронизации
                (enemy as any).networkId = enemyData.id;
                this.enemyTanks.push(enemy);
                logger.log(`[GameEnemies] Created network enemy ${enemyData.id} at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
            }
        }
        
        logger.log(`[GameEnemies] ✅ Spawned ${this.enemyTanks.length} network-synchronized enemies`);
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
        
        // Останавливаем постепенный спавн
        this.stopGradualSpawning();
        
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
        
        return "nightmare"; // NIGHTMARE по умолчанию!
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
     * Получение высоты террейна и нормали поверхности в точке через raycast
     * Возвращает объект с высотой и нормалью
     */
    private getGroundInfo(x: number, z: number): { height: number; normal: Vector3 } {
        const defaultResult = { height: 5.0, normal: Vector3.Up() }; // Безопасная высота по умолчанию
        
        if (!this.systems?.scene) {
            logger.warn(`[GameEnemies] getGroundInfo: No scene available at (${x.toFixed(1)}, ${z.toFixed(1)})`);
            return defaultResult;
        }
        
        // Улучшенный raycast: начинаем выше и с большим диапазоном
        const rayStart = new Vector3(x, 200, z); // Увеличено для надёжности
        const ray = new Ray(rayStart, Vector3.Down(), 400);
        
        // Улучшенный фильтр мешей: проверяем больше паттернов
        const hit = this.systems.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            const name = mesh.name.toLowerCase();
            // Расширенный список паттернов для поиска террейна
            return (name.startsWith("ground_") || 
                    name.includes("terrain") || 
                    name.includes("chunk") ||
                    name.includes("road") ||
                    (name.includes("floor") && !name.includes("garage"))) && 
                   mesh.isEnabled();
        });
        
        if (hit?.hit && hit.pickedPoint) {
            const height = hit.pickedPoint.y;
            if (height > -50 && height < 300) { // Расширенные разумные пределы
                // КРИТИЧНО: Получаем нормаль поверхности для выравнивания
                const normal = hit.getNormal ? hit.getNormal(true) : Vector3.Up();
                logger.debug(`[GameEnemies] getGroundInfo: Raycast found height ${height.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
                return { height, normal: normal || Vector3.Up() };
            } else {
                logger.warn(`[GameEnemies] getGroundInfo: Raycast returned suspicious height ${height.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
            }
        }
        
        // Fallback 1: используем terrain generator с несколькими биомами
        if (this.systems.chunkSystem?.terrainGenerator) {
            const biomes = ["dirt", "city", "residential", "park", "industrial", "concrete"];
            let maxHeight = -Infinity;
            
            for (const biome of biomes) {
                try {
                    const height = this.systems.chunkSystem.terrainGenerator.getHeight(x, z, biome);
                    if (height > maxHeight && height > -50 && height < 300) {
                        maxHeight = height;
                    }
                } catch (e) {
                    // Игнорируем ошибки для конкретного биома
                }
            }
            
            if (maxHeight > -Infinity) {
                logger.debug(`[GameEnemies] getGroundInfo: TerrainGenerator returned ${maxHeight.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
                return { height: maxHeight, normal: Vector3.Up() };
            }
        }
        
        // Fallback 2: пытаемся найти ближайший загруженный чанк
        if (this.systems.chunkSystem) {
            // Ищем ближайшие чанки и проверяем их меши
            const chunkSize = 50; // Примерный размер чанка
            const chunkX = Math.floor(x / chunkSize);
            const chunkZ = Math.floor(z / chunkSize);
            
            // Проверяем текущий чанк и соседние
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const checkX = (chunkX + dx) * chunkSize;
                    const checkZ = (chunkZ + dz) * chunkSize;
                    
                    // Raycast в центре соседнего чанка
                    const checkRayStart = new Vector3(checkX, 200, checkZ);
                    const checkRay = new Ray(checkRayStart, Vector3.Down(), 400);
                    const checkHit = this.systems.scene.pickWithRay(checkRay, (mesh) => {
                        if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                        return mesh.name.startsWith("ground_") && mesh.isEnabled();
                    });
                    
                    if (checkHit?.hit && checkHit.pickedPoint) {
                        const height = checkHit.pickedPoint.y;
                        if (height > -50 && height < 300) {
                            logger.debug(`[GameEnemies] getGroundInfo: Found terrain in nearby chunk at ${height.toFixed(2)}`);
                            return { height, normal: Vector3.Up() };
                        }
                    }
                }
            }
        }
        
        // Последний fallback: минимальная безопасная высота
        logger.warn(`[GameEnemies] getGroundInfo: All methods failed at (${x.toFixed(1)}, ${z.toFixed(1)}), using safe default`);
        return defaultResult;
    }
    
    /**
     * Получение высоты террейна в точке (для обратной совместимости)
     */
    private getGroundHeight(x: number, z: number): number {
        const info = this.getGroundInfo(x, z);
        return info.height;
    }
    
    /**
     * Создание врага с настройками
     * @param skipTargetAssignment - если true, цель НЕ будет установлена (для патрулирования)
     */
    private createEnemy(
        pos: Vector3, 
        difficulty: "easy" | "medium" | "hard",
        difficultyScale: number,
        onDeath?: () => void,
        groundNormal?: Vector3, // Нормаль поверхности для выравнивания
        skipTargetAssignment: boolean = false // УЛУЧШЕНО: Опция пропуска установки цели
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
            difficultyScale,
            groundNormal || Vector3.Up() // Передаём нормаль поверхности
        );
        
        // УЛУЧШЕНО: Устанавливаем цель только если не пропущено
        if (!skipTargetAssignment && this.systems.tank) {
            enemy.setTarget(this.systems.tank);
        }
        
        // УЛУЧШЕНО: Регистрируем бота в AI Coordinator
        if (this.systems.aiCoordinator) {
            enemy.setAiCoordinator(this.systems.aiCoordinator);
            this.systems.aiCoordinator.registerBot(enemy);
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
        
        // В мультиплеере не спавним ботов - их заменяют реальные игроки
        if (this.systems.isMultiplayer) {
            logger.log("[GameEnemies] Multiplayer mode: enemy bots disabled, using real players instead");
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
        
        // Зона боя - используем размеры карты из MapConstants
        const mapBounds = getMapBoundsFromConfig("polygon");
        const arenaHalf = (mapBounds?.maxX ?? 500) * 0.5; // Половина от границы
        
        // Боты спавнятся в центральной области карты
        const combatZone = {
            minX: -arenaHalf * 0.5,
            maxX: arenaHalf * 0.5,
            minZ: -arenaHalf * 0.5,
            maxZ: arenaHalf * 0.5
        };
        
        const botCount = 6; // Увеличиваем для большей карты
        const spawnPositions: Vector3[] = [];
        
        for (let i = 0; i < botCount; i++) {
            let attempts = 0;
            let pos: Vector3;
            
            do {
                const spawnX = combatZone.minX + Math.random() * (combatZone.maxX - combatZone.minX);
                const spawnZ = combatZone.minZ + Math.random() * (combatZone.maxZ - combatZone.minZ);
                const groundHeight = this.getGroundHeight(spawnX, spawnZ);
                // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                const spawnY = groundHeight + 1.0;
                
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
                
                const spawnX = combatZone.minX + Math.random() * (combatZone.maxX - combatZone.minX);
                const spawnZ = combatZone.minZ + Math.random() * (combatZone.maxZ - combatZone.minZ);
                const groundHeight = this.getGroundHeight(spawnX, spawnZ);
                // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                const spawnY = groundHeight + 1.0;
                
                const newPos = new Vector3(spawnX, spawnY, spawnZ);
                
                const newBot = this.createEnemy(newPos, "easy", 1, () => {
                    this.handlePolygonBotDeath(newBot!, combatZone);
                });
                
                if (newBot) {
                    this.enemyTanks.push(newBot);
                    logger.log(`[GameEnemies] Training bot respawned at (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)}, ${spawnZ.toFixed(1)})`);
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
        // Используем размеры карты из MapConstants
        const mapBounds = getMapBoundsFromConfig("frontline");
        const arenaHalf = mapBounds?.maxX ?? 500;
        
        // Защитники спавнятся в центральной-восточной области (между игроком и врагами)
        // Игрок на западе (-150, 0), враги на востоке
        const defenderX = arenaHalf * 0.3; // 30% от края к центру (около 150)
        const defenderPositions = [
            { x: defenderX, z: arenaHalf * 0.1 },      // ~50
            { x: defenderX + 20, z: -arenaHalf * 0.06 },  // ~-30
            { x: defenderX + 40, z: arenaHalf * 0.16 },   // ~80
            { x: defenderX - 20, z: -arenaHalf * 0.2 },   // ~-100
        ];
        
        for (const rawPos of defenderPositions) {
            const groundHeight = this.getGroundHeight(rawPos.x, rawPos.z);
            // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            const spawnY = groundHeight + 1.0;
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
        
        // Спавн атакующих - на восточной стороне карты (враги)
        const mapBounds = getMapBoundsFromConfig("frontline");
        const arenaHalf = mapBounds?.maxX ?? 500;
        
        // Атакующие спавнятся на восточной стороне (50-60% от края)
        const spawnX = arenaHalf * 0.5 + Math.random() * (arenaHalf * 0.1);
        
        for (let i = 0; i < waveCount; i++) {
            // Спавн по всей ширине карты
            const spawnZ = -arenaHalf * 0.4 + Math.random() * (arenaHalf * 0.8);
            const groundHeight = this.getGroundHeight(spawnX, spawnZ);
            // Спавн на 5 метров выше террейна для гарантии
            const spawnY = Math.max(groundHeight + 5.0, 7.0);
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
                    
                    // Респавн в центральной области - используем MapConstants
                    const mapBounds = getMapBoundsFromConfig("frontline");
                    const arenaHalf = mapBounds?.maxX ?? 500;
                    
                    const newX = arenaHalf * 0.3 + Math.random() * (arenaHalf * 0.2);
                    const newZ = -arenaHalf * 0.3 + Math.random() * (arenaHalf * 0.6);
                    const groundHeight = this.getGroundHeight(newX, newZ);
                    // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                    const spawnY = groundHeight + 1.0;
                    const newPos = new Vector3(newX, spawnY, newZ);
                    
                    const difficulty = this.getCurrentDifficulty();
                    const scale = this.getAdaptiveDifficultyScale();
                    
                    const newDefender = this.createEnemy(newPos, difficulty, scale, () => {
                        this.handleFrontlineEnemyDeath(newDefender!, newPos, "defender");
                    });
                    
                    if (newDefender) {
                        this.enemyTanks.push(newDefender);
                        logger.log(`[GameEnemies] Frontline: Defender respawned at (${newX.toFixed(1)}, ${spawnY.toFixed(1)}, ${newZ.toFixed(1)})`);
                    }
                }
            }, 60000);
        }
    }
    
    /**
     * Стандартный спавн врагов для других карт
     * Использует постепенный спавн: начинается со 2-й секунды, по 1 боту каждую секунду, макс 5 ботов
     */
    spawnStandardEnemies(): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) return;
        
        // Используем постепенный спавн если включен
        if (this.gradualSpawnEnabled) {
            this.startGradualSpawning();
            return;
        }
        
        // Fallback - мгновенный спавн (старое поведение)
        this.spawnAllEnemiesAtOnce();
    }
    
    /**
     * Запуск постепенного спавна ботов
     * Начинается через 2 секунды, затем по 1 боту каждую секунду
     * Количество ботов берётся из настроек или рассчитывается автоматически
     */
    private startGradualSpawning(): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) return;
        
        // Сбрасываем счётчик
        this.gradualSpawnCount = 0;
        
        // Определяем реальное количество ботов из настроек (как в spawnAllEnemiesAtOnce)
        let targetBotCount = this.getDefaultEnemyCount();
        
        // Проверяем настройки сессии/меню
        if (this.systems.sessionSettings) {
            const sessionSettings = this.systems.sessionSettings.getSettings();
            if (sessionSettings.enemyCount && sessionSettings.enemyCount > 0) {
                targetBotCount = sessionSettings.enemyCount;
            }
        } else if (this.systems.mainMenu) {
            const menuSettings = this.systems.mainMenu.getSettings();
            if (menuSettings?.enemyCount && menuSettings.enemyCount > 0) {
                targetBotCount = menuSettings.enemyCount;
            }
        }
        
        // Минимум 3 бота
        targetBotCount = Math.max(3, targetBotCount);
        
        // Устанавливаем максимум для постепенного спавна
        this.gradualSpawnMaxBots = targetBotCount;
        
        logger.log(`[GameEnemies] Starting gradual spawn: delay=${this.gradualSpawnDelay}ms, interval=${this.gradualSpawnInterval}ms, maxBots=${this.gradualSpawnMaxBots}`);
        
        // Запускаем спавн через 2 секунды
        setTimeout(() => {
            if (!this.systems) return;
            
            // Спавним первого бота сразу
            this.spawnSingleBot();
            
            // Затем спавним остальных с интервалом 1 секунда
            this.gradualSpawnTimer = window.setInterval(() => {
                if (this.gradualSpawnCount >= this.gradualSpawnMaxBots) {
                    // Достигли максимума - останавливаем таймер
                    if (this.gradualSpawnTimer !== null) {
                        clearInterval(this.gradualSpawnTimer);
                        this.gradualSpawnTimer = null;
                    }
                    logger.log(`[GameEnemies] Gradual spawn complete: ${this.gradualSpawnCount} bots spawned`);
                    return;
                }
                
                this.spawnSingleBot();
            }, this.gradualSpawnInterval);
        }, this.gradualSpawnDelay);
    }
    
    /**
     * Спавн одного бота для постепенного спавна
     */
    private spawnSingleBot(): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) return;
        
        // КРИТИЧНО: Двойная проверка перед спавном
        if (this.gradualSpawnCount >= this.gradualSpawnMaxBots) {
            logger.debug(`[GameEnemies] Max bots reached (${this.gradualSpawnCount}/${this.gradualSpawnMaxBots}), skipping spawn`);
            // Останавливаем таймер если он ещё работает
            if (this.gradualSpawnTimer !== null) {
                clearInterval(this.gradualSpawnTimer);
                this.gradualSpawnTimer = null;
            }
            return;
        }
        
        const minDistance = 60;
        const maxDistance = 180;
        
        const aiDifficulty = this.getCurrentDifficulty();
        const difficultyScale = this.getAdaptiveDifficultyScale();
        
        let attempts = 0;
        let pos: Vector3;
        
        // Для карт "sand", "madness", "expo" и "brest" используем границы карты вместо радиального спавна
        const mapBounds = (this.systems.currentMapType === "sand" || this.systems.currentMapType === "madness" || this.systems.currentMapType === "expo" || this.systems.currentMapType === "brest" || this.systems.currentMapType === "arena")
            ? getMapBoundsFromConfig(this.systems.currentMapType) 
            : null;
        
        const game = (window as any).gameInstance;
        
        do {
            let spawnX: number, spawnZ: number;
            
            if (mapBounds) {
                // Для карты "sand" спавним внутри границ карты
                spawnX = mapBounds.minX + Math.random() * (mapBounds.maxX - mapBounds.minX);
                spawnZ = mapBounds.minZ + Math.random() * (mapBounds.maxZ - mapBounds.minZ);
            } else {
                // Для других карт используем радиальный спавн
                const angle = Math.random() * Math.PI * 2;
                const distance = minDistance + Math.random() * (maxDistance - minDistance);
                spawnX = Math.cos(angle) * distance;
                spawnZ = Math.sin(angle) * distance;
            }
            
            // УЛУЧШЕНО: Спавн на верхней поверхности (крыша или террейн)
            let spawnY: number;
            if (game && typeof game.getTopSurfaceHeight === 'function') {
                const surfaceHeight = game.getTopSurfaceHeight(spawnX, spawnZ);
                spawnY = surfaceHeight + 1.5; // 1.5м над поверхностью
            } else {
                const groundInfo = this.getGroundInfo(spawnX, spawnZ);
                spawnY = Math.max(groundInfo.height + 1.5, 2.0);
            }
            
            pos = new Vector3(spawnX, spawnY, spawnZ);
            
            // Проверяем расстояние до других врагов (минимум 100м между ботами)
            let tooClose = false;
            for (const existingEnemy of this.enemyTanks) {
                if (existingEnemy.chassis && Vector3.Distance(pos, existingEnemy.chassis.absolutePosition) < 100) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                const groundInfo = this.getGroundInfo(spawnX, spawnZ);
                (pos as any).groundNormal = groundInfo.normal;
                break;
            }
            attempts++;
        } while (attempts < 30);
        
        const groundNormal = (pos as any).groundNormal || Vector3.Up();
        // ИСПРАВЛЕНО: Боты СРАЗУ получают цель для агрессивного поведения
        const enemy = this.createEnemy(pos, aiDifficulty, difficultyScale, () => {
            this.handleStandardEnemyDeath(enemy!);
        }, groundNormal, false); // skipTargetAssignment = false - цель назначается СРАЗУ
        
        if (enemy) {
            this.enemyTanks.push(enemy);
            this.gradualSpawnCount++;
            
            // ДОБАВЛЕНО: Проверка после увеличения счётчика
            if (this.gradualSpawnCount > this.gradualSpawnMaxBots) {
                logger.error(`[GameEnemies] BUG: Spawned MORE bots (${this.gradualSpawnCount}) than max (${this.gradualSpawnMaxBots})!`);
            }
            
            logger.log(`[GameEnemies] Bot ${this.gradualSpawnCount}/${this.gradualSpawnMaxBots} spawned at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) - target assigned immediately`);
        }
    }
    
    /**
     * Мгновенный спавн всех врагов (старое поведение, fallback)
     */
    private spawnAllEnemiesAtOnce(): void {
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
        
        // Для карт "sand", "madness", "expo" и "brest" используем границы карты вместо радиального спавна
        const mapBounds = (this.systems.currentMapType === "sand" || this.systems.currentMapType === "madness" || this.systems.currentMapType === "expo" || this.systems.currentMapType === "brest" || this.systems.currentMapType === "arena")
            ? getMapBoundsFromConfig(this.systems.currentMapType) 
            : null;
        
        const game = (window as any).gameInstance;
        
        for (let i = 0; i < enemyCount; i++) {
            let attempts = 0;
            let pos: Vector3;
            
            do {
                let spawnX: number, spawnZ: number;
                
                if (mapBounds) {
                    // Для карты "sand" спавним внутри границ карты
                    spawnX = mapBounds.minX + Math.random() * (mapBounds.maxX - mapBounds.minX);
                    spawnZ = mapBounds.minZ + Math.random() * (mapBounds.maxZ - mapBounds.minZ);
                } else {
                    // Для других карт используем радиальный спавн
                    const angle = Math.random() * Math.PI * 2;
                    const distance = minDistance + Math.random() * (maxDistance - minDistance);
                    spawnX = Math.cos(angle) * distance;
                    spawnZ = Math.sin(angle) * distance;
                }
                
                // УЛУЧШЕНО: Спавн на верхней поверхности (крыша или террейн)
                let spawnY: number;
                if (game && typeof game.getTopSurfaceHeight === 'function') {
                    const surfaceHeight = game.getTopSurfaceHeight(spawnX, spawnZ);
                    spawnY = surfaceHeight + 1.5; // 1.5м над поверхностью
                } else {
                    const groundInfo = this.getGroundInfo(spawnX, spawnZ);
                    spawnY = Math.max(groundInfo.height + 1.5, 2.0);
                }
                
                pos = new Vector3(spawnX, spawnY, spawnZ);
                
                // Проверяем расстояние до других врагов
                let tooClose = false;
                for (const existingPos of spawnPositions) {
                    if (Vector3.Distance(pos, existingPos) < 25) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    // Сохраняем нормаль поверхности для выравнивания
                    const groundInfo = this.getGroundInfo(spawnX, spawnZ);
                    (pos as any).groundNormal = groundInfo.normal;
                    break;
                }
                attempts++;
            } while (attempts < 30);
            
            spawnPositions.push(pos);
            
            const groundNormal = (pos as any).groundNormal || Vector3.Up();
            const enemy = this.createEnemy(pos, aiDifficulty, difficultyScale, () => {
                this.handleStandardEnemyDeath(enemy!);
            }, groundNormal);
            
            if (enemy) {
                this.enemyTanks.push(enemy);
            }
        }
        
        logger.log(`[GameEnemies] Spawned ${this.enemyTanks.length} enemies`);
    }
    
    /**
     * Остановка постепенного спавна (если запущен)
     */
    stopGradualSpawning(): void {
        if (this.gradualSpawnTimer !== null) {
            clearInterval(this.gradualSpawnTimer);
            this.gradualSpawnTimer = null;
        }
        this.gradualSpawnCount = 0;
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
     * Спавн врагов в гаражах
     * @param getPlayerGaragePosition Callback для получения позиции гаража игрока
     * @param onEnemyDeath Callback при смерти врага (для награды)
     */
    spawnEnemiesInGarages(
        getPlayerGaragePosition: () => Vector3 | null,
        onEnemyDeath?: (enemy: EnemyTank, reward: number) => void
    ): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) {
            logger.warn("[GameEnemies] Sound/Effects not ready, skipping garage spawn");
            return;
        }
        
        if (!this.systems.chunkSystem || !this.systems.chunkSystem.garagePositions.length) {
            logger.warn("[GameEnemies] No garages available for garage spawn");
            return;
        }
        
        const playerGaragePos = getPlayerGaragePosition();
        if (!playerGaragePos) {
            logger.error("[GameEnemies] Player garage NOT SET! Aborting enemy spawn!");
            return;
        }
        
        logger.log(`[GameEnemies] Spawning enemies in garages. Player garage: (${playerGaragePos.x.toFixed(1)}, ${playerGaragePos.z.toFixed(1)})`);
        
        const playerGarageX = playerGaragePos.x;
        const playerGarageZ = playerGaragePos.z;
        
        // Фильтруем гаражи, исключая гаражи близко к игроку
        const availableGarages = this.systems.chunkSystem.garagePositions.filter(garage => {
            const distToPlayer = Math.sqrt(
                Math.pow(garage.x - playerGarageX, 2) + 
                Math.pow(garage.z - playerGarageZ, 2)
            );
            return distToPlayer >= 100; // Минимум 100 единиц от гаража игрока
        });
        
        if (availableGarages.length === 0) {
            logger.log("[GameEnemies] No available garages for enemy spawn");
            return;
        }
        
        // Количество врагов
        let enemyCount = Math.min(8, availableGarages.length);
        const adaptiveScale = this.getAdaptiveDifficultyScale();
        const scaledCount = Math.round(enemyCount * (0.7 + (adaptiveScale - 1) * 0.6));
        const minCount = Math.min(enemyCount, Math.max(1, Math.floor(enemyCount * 0.6)));
        const maxCount = Math.min(availableGarages.length, Math.min(10, enemyCount + 2));
        enemyCount = Math.max(minCount, Math.min(scaledCount, maxCount));
        
        // Перемешиваем гаражи
        for (let i = availableGarages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = availableGarages[i]!;
            availableGarages[i] = availableGarages[j]!;
            availableGarages[j] = tmp;
        }
        
        // Спавним врагов
        for (let i = 0; i < enemyCount; i++) {
            const garage = availableGarages[i];
            if (!garage) continue;
            
            const groundHeight = this.getGroundHeight(garage.x, garage.z);
            // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            const spawnY = groundHeight + 1.0;
            const garagePos = new Vector3(garage.x, spawnY, garage.z);
            
            const difficulty = this.getCurrentDifficulty();
            const difficultyScale = adaptiveScale;
            
            const enemyTank = new EnemyTank(
                this.systems.scene, 
                garagePos, 
                this.systems.soundManager, 
                this.systems.effectsManager, 
                difficulty, 
                difficultyScale
            );
            
            if (this.systems.tank) {
                enemyTank.setTarget(this.systems.tank);
            }
            
            const enemyGaragePos = garagePos.clone();
            
            // On death callback
            enemyTank.onDeathObservable.add(() => {
                const baseReward = 100;
                const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
                
                if (onEnemyDeath) {
                    onEnemyDeath(enemyTank, reward);
                } else {
                    // Default reward handling
                    this.giveKillReward(reward);
                }
                
                // Remove from array
                const idx = this.enemyTanks.indexOf(enemyTank);
                if (idx !== -1) this.enemyTanks.splice(idx, 1);
            });
            
            this.enemyTanks.push(enemyTank);
            logger.log(`[GameEnemies] Enemy spawned in garage (${garagePos.x.toFixed(1)}, ${garagePos.z.toFixed(1)})`);
        }
        
        logger.log(`[GameEnemies] Spawned ${enemyCount} enemies in garages`);
    }
    
    /**
     * Респавн врага в гараже
     * @param garagePos Позиция гаража
     * @param getPlayerGaragePosition Callback для получения позиции гаража игрока
     * @param onEnemyDeath Callback при смерти врага (для награды)
     */
    respawnEnemyTank(
        garagePos: Vector3,
        getPlayerGaragePosition: () => Vector3 | null,
        onEnemyDeath?: (enemy: EnemyTank, reward: number) => void
    ): void {
        if (!this.systems?.soundManager || !this.systems.effectsManager) return;
        
        // Проверяем расстояние до гаража игрока
        const playerGaragePos = getPlayerGaragePosition();
        if (playerGaragePos) {
            const distToPlayer = Vector3.Distance(garagePos, playerGaragePos);
            if (distToPlayer < 100) {
                logger.log(`[GameEnemies] BLOCKED: Enemy respawn too close to player garage (${distToPlayer.toFixed(1)}m)`);
                return;
            }
        }
        
        const difficulty = this.getCurrentDifficulty();
        const difficultyScale = this.getAdaptiveDifficultyScale();
        
        const enemyTank = new EnemyTank(
            this.systems.scene, 
            garagePos, 
            this.systems.soundManager, 
            this.systems.effectsManager, 
            difficulty, 
            difficultyScale
        );
        
        if (this.systems.tank) {
            enemyTank.setTarget(this.systems.tank);
        }
        
        const spawnGaragePos = garagePos.clone();
        
        enemyTank.onDeathObservable.add(() => {
            const baseReward = 100;
            const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
            
            if (onEnemyDeath) {
                onEnemyDeath(enemyTank, reward);
            } else {
                this.giveKillReward(reward);
            }
            
            const idx = this.enemyTanks.indexOf(enemyTank);
            if (idx !== -1) this.enemyTanks.splice(idx, 1);
        });
        
        this.enemyTanks.push(enemyTank);
        logger.log(`[GameEnemies] Enemy respawned at garage (${garagePos.x.toFixed(1)}, ${garagePos.z.toFixed(1)})`);
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
