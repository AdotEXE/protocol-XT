/**
 * @module maps/polygon/PolygonGenerator
 * @description Генератор контента для карты "Полигон"
 * 
 * Полигон - это военная тренировочная база с различными зонами:
 * - Стрельбище (shooting) - мишени и тиры
 * - Полоса препятствий (obstacles) - преграды и рампы
 * - Боевая зона (combat) - укрытия для тренировки
 * - Военная база (base) - ангары и здания
 * 
 * Размер арены: 600x600 единиц
 * 
 * @example
 * ```typescript
 * const generator = new PolygonGenerator();
 * generator.initialize(generationContext);
 * generator.generateContent(chunkContext);
 * ```
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 * @see {@link ChunkGenerationContext} - контекст генерации
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";

/**
 * Тип зоны полигона
 */
export type PolygonZone = "shooting" | "obstacles" | "combat" | "base" | "empty";

/**
 * Конфигурация полигона
 */
export interface PolygonConfig {
    /** Размер арены в единицах */
    arenaSize: number;
    /** Высота периметра */
    fenceHeight: number;
    /** Плотность препятствий (0-1) */
    obstacleDensity: number;
    /** Плотность мишеней (0-1) */
    targetDensity: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_POLYGON_CONFIG: PolygonConfig = {
    arenaSize: 600,
    fenceHeight: 3,
    obstacleDensity: 0.7,
    targetDensity: 0.8
};

/**
 * Генератор карты "Полигон"
 * 
 * Военный полигон с ангарами, техникой, складами, кранами и вышками.
 * Разделён на функциональные зоны для разных типов тренировок.
 */
export class PolygonGenerator extends BaseMapGenerator {
    readonly mapType = "polygon";
    readonly displayName = "Полигон";
    readonly description = "Военный полигон с ангарами, техникой, складами, кранами и вышками";
    
    /** Конфигурация генератора */
    private config: PolygonConfig;
    
    /** Ссылка на ChunkSystem для делегирования (временно, пока не перенесён весь код) */
    private chunkSystemDelegate: any = null;
    
    constructor(config: Partial<PolygonConfig> = {}) {
        super();
        this.config = { ...DEFAULT_POLYGON_CONFIG, ...config };
    }
    
    /**
     * Установить делегат ChunkSystem для генерации
     * @deprecated Временное решение до полного переноса логики
     */
    setChunkSystemDelegate(chunkSystem: any): void {
        this.chunkSystemDelegate = chunkSystem;
    }
    
    /**
     * Определить зону полигона по мировым координатам
     * @param x - Мировая X координата
     * @param z - Мировая Z координата
     */
    getZone(x: number, z: number): PolygonZone {
        const arenaHalf = this.config.arenaSize / 2;
        
        // За пределами арены
        if (Math.abs(x) > arenaHalf || Math.abs(z) > arenaHalf) {
            return "empty";
        }
        
        // Квадранты арены для 600x600:
        // Северо-восток (x > 50, z > 50) - стрельбище
        // Северо-запад (x < -50, z > 50) - полоса препятствий
        // Юго-восток (x > 50, z < -50) - зона боя
        // Юго-запад (x < -50, z < -50) - военная база
        
        if (x > 50 && z > 50) return "shooting";
        if (x < -50 && z > 50) return "obstacles";
        if (x > 50 && z < -50) return "combat";
        if (x < -50 && z < -50) return "base";
        
        return "empty";
    }
    
    /**
     * Основной метод генерации контента чанка
     */
    generateContent(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
        
        // Если есть делегат ChunkSystem, используем его методы
        // Это временное решение до полного переноса логики генерации
        if (this.chunkSystemDelegate) {
            // Делегируем генерацию в ChunkSystem
            this.chunkSystemDelegate.generatePolygonContentExternal(
                chunkX, chunkZ, worldX, worldZ, size, random, chunkParent
            );
            return;
        }
        
        // Standalone генерация (когда вся логика перенесена)
        this.generateTerrain(context);
        this.generatePerimeter(context);
        
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;
        const zone = this.getZone(chunkCenterX, chunkCenterZ);
        
        switch (zone) {
            case "shooting":
                this.generateShootingRange(context);
                break;
            case "obstacles":
                this.generateObstacleCourse(context);
                break;
            case "combat":
                this.generateCombatZone(context);
                break;
            case "base":
                this.generateMilitaryBase(context);
                break;
        }
    }
    
    /**
     * Генерация рельефа (холмы, равнины)
     */
    private generateTerrain(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        
        // Смешанная местность: 30-40% холмы
        const hillCount = random.int(2, 4);
        for (let i = 0; i < hillCount; i++) {
            if (!random.chance(0.35)) continue;
            
            const hx = random.range(10, size - 10);
            const hz = random.range(10, size - 10);
            const hWorldX = chunkX * size + hx;
            const hWorldZ = chunkZ * size + hz;
            
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, 5)) continue;
            
            const hillSize = random.range(8, 15);
            const hillHeight = random.range(2, 5);
            
            this.createBox(
                "polygon_hill",
                { width: hillSize, height: hillHeight, depth: hillSize },
                new Vector3(hx, hillHeight / 2, hz),
                "dirt",
                chunkParent,
                true
            );
        }
    }
    
    /**
     * Генерация периметра арены
     */
    private generatePerimeter(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания забора/стен
        // Пока делегируется в ChunkSystem
    }
    
    /**
     * Генерация стрельбища
     */
    private generateShootingRange(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания мишеней
        // Пока делегируется в ChunkSystem
    }
    
    /**
     * Генерация полосы препятствий
     */
    private generateObstacleCourse(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания препятствий
        // Пока делегируется в ChunkSystem
    }
    
    /**
     * Генерация боевой зоны
     */
    private generateCombatZone(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания укрытий
        // Пока делегируется в ChunkSystem
    }
    
    /**
     * Генерация военной базы
     */
    private generateMilitaryBase(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания зданий
        // Пока делегируется в ChunkSystem
    }
}

export default PolygonGenerator;

