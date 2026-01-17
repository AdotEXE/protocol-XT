// ═══════════════════════════════════════════════════════════════════════════
// GAME PHYSICS - Инициализация и управление физикой
// ═══════════════════════════════════════════════════════════════════════════

import { Scene, Vector3 } from "@babylonjs/core";
import { HavokPlugin } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { logger } from "../utils/logger";

/**
 * Параметры конфигурации физики
 */
export interface PhysicsConfig {
    gravity?: Vector3;
    substeps?: number;
    fixedTimeStep?: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
    gravity: new Vector3(0, -19.6, 0),
    substeps: 2,
    fixedTimeStep: 1 / 60
};

/**
 * GamePhysics - Инициализация и управление физикой
 * 
 * Отвечает за:
 * - Инициализацию Havok Physics
 * - Настройку гравитации
 * - Управление физическим движком
 */
export class GamePhysics {
    private scene: Scene | undefined;
    private havokPlugin: HavokPlugin | undefined;
    private havokInstance: any | undefined;
    private config: PhysicsConfig;
    private isInitialized = false;
    
    constructor(config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG) {
        this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config };
    }
    
    /**
     * Инициализация физического движка
     * @returns Promise<boolean> - успешность инициализации
     */
    async initialize(scene: Scene): Promise<boolean> {
        if (this.isInitialized) {
            logger.warn("[GamePhysics] Already initialized");
            return true;
        }
        
        this.scene = scene;
        
        try {
            // Загружаем Havok WASM с указанием пути
            logger.log("[GamePhysics] Loading Havok WASM from /HavokPhysics.wasm...");
            this.havokInstance = await HavokPhysics({
                locateFile: (file: string) => {
                    // WASM файл находится в public/ папке
                    const wasmPath = '/HavokPhysics.wasm';
                    if (file.endsWith('.wasm')) {
                        logger.log("[GamePhysics] Locating WASM file:", file, "=>", wasmPath);
                        return wasmPath;
                    }
                    logger.log("[GamePhysics] Locating file:", file);
                    return file;
                }
            });
            logger.log("[GamePhysics] Havok WASM loaded successfully!");

            // Создаём плагин
            logger.log("[GamePhysics] Creating Havok plugin...");
            this.havokPlugin = new HavokPlugin(true, this.havokInstance);
            logger.log("[GamePhysics] Havok plugin created");

            // Включаем физику в сцене
            const gravity = this.config.gravity || DEFAULT_PHYSICS_CONFIG.gravity;
            logger.log("[GamePhysics] Enabling physics on scene...");
            scene.enablePhysics(gravity, this.havokPlugin);
            logger.log("[GamePhysics] Physics enabled with gravity:", gravity?.toString());

            this.isInitialized = true;
            return true;
        } catch (error) {
            logger.error("[GamePhysics] Failed to initialize physics!");
            logger.error("[GamePhysics] Error details:", error);
            logger.error("[GamePhysics] Stack trace:", (error as Error).stack);
            console.error("[GamePhysics] Full error object:", error);
            return false;
        }
    }
    
    /**
     * Проверка инициализации
     */
    getIsInitialized(): boolean {
        return this.isInitialized;
    }
    
    /**
     * Получение Havok плагина
     */
    getHavokPlugin(): HavokPlugin | undefined {
        return this.havokPlugin;
    }
    
    /**
     * Получение Havok инстанса
     */
    getHavokInstance(): any | undefined {
        return this.havokInstance;
    }
    
    /**
     * Установка гравитации
     */
    setGravity(gravity: Vector3): void {
        this.config.gravity = gravity;
        
        if (this.scene?.getPhysicsEngine()) {
            this.scene.getPhysicsEngine()?.setGravity(gravity);
            logger.debug("[GamePhysics] Gravity set to:", gravity.toString());
        }
    }
    
    /**
     * Получение гравитации
     */
    getGravity(): Vector3 {
        return this.config.gravity || new Vector3(0, -9.81, 0);
    }
    
    /**
     * Пауза физики
     */
    pause(): void {
        // Havok не имеет встроенной паузы, но мы можем управлять через сцену
        // В будущем можно добавить флаг для пропуска обновлений
        logger.debug("[GamePhysics] Physics paused");
    }
    
    /**
     * Возобновление физики
     */
    resume(): void {
        logger.debug("[GamePhysics] Physics resumed");
    }
    
    /**
     * Сброс позиции объекта к указанной точке
     */
    resetObjectPosition(
        physicsBody: any, 
        position: Vector3, 
        stopMotion: boolean = true
    ): void {
        if (!physicsBody) return;
        
        if (stopMotion) {
            physicsBody.setLinearVelocity(Vector3.Zero());
            physicsBody.setAngularVelocity(Vector3.Zero());
        }
        
        physicsBody.setTargetTransform(position, null);
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        // Физический движок очищается вместе со сценой
        this.havokPlugin = undefined;
        this.havokInstance = undefined;
        this.scene = undefined;
        this.isInitialized = false;
        
        logger.log("[GamePhysics] Disposed");
    }
}

