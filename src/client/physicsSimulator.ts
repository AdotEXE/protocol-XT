/**
 * Physics Simulator - Режим симуляции с тестовыми сценариями
 */

import { Scene, Vector3, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import { logger } from "./utils/logger";

export interface SimulationScenario {
    id: string;
    name: string;
    description: string;
    setup: (scene: Scene) => Promise<void>;
    cleanup?: (scene: Scene) => void;
}

export class PhysicsSimulator {
    private scene: Scene;
    private activeScenario: SimulationScenario | null = null;
    private scenarios: Map<string, SimulationScenario> = new Map();
    private isRunning: boolean = false;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.initializeScenarios();
    }
    
    /**
     * Инициализация тестовых сценариев
     */
    private initializeScenarios(): void {
        // Сценарий 1: Падение объектов
        this.addScenario({
            id: 'falling_objects',
            name: 'Падение объектов',
            description: 'Тест гравитации и коллизий при падении объектов',
            setup: async (scene) => {
                // Создаём платформу
                const ground = MeshBuilder.CreateBox('ground', { width: 20, height: 1, depth: 20 }, scene);
                ground.position.y = -5;
                const groundMat = new StandardMaterial('groundMat', scene);
                groundMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                ground.material = groundMat;
                
                // Создаём падающие объекты
                for (let i = 0; i < 10; i++) {
                    const box = MeshBuilder.CreateBox(`box_${i}`, { size: 0.5 }, scene);
                    box.position = new Vector3(
                        (Math.random() - 0.5) * 10,
                        5 + i * 2,
                        (Math.random() - 0.5) * 10
                    );
                    const boxMat = new StandardMaterial(`boxMat_${i}`, scene);
                    boxMat.diffuseColor = new Color3(Math.random(), Math.random(), Math.random());
                    box.material = boxMat;
                }
            },
            cleanup: (scene) => {
                // Удаляем все объекты сценария
                const meshes = scene.meshes.filter(m => 
                    m.name.startsWith('ground') || m.name.startsWith('box_')
                );
                meshes.forEach(m => m.dispose());
            }
        });
        
        // Сценарий 2: Столкновение
        this.addScenario({
            id: 'collision_test',
            name: 'Тест столкновений',
            description: 'Два объекта сталкиваются друг с другом',
            setup: async (scene) => {
                // Объект 1
                const obj1 = MeshBuilder.CreateSphere('obj1', { diameter: 2 }, scene);
                obj1.position = new Vector3(-5, 2, 0);
                const mat1 = new StandardMaterial('mat1', scene);
                mat1.diffuseColor = Color3.Red();
                obj1.material = mat1;
                
                // Объект 2
                const obj2 = MeshBuilder.CreateSphere('obj2', { diameter: 2 }, scene);
                obj2.position = new Vector3(5, 2, 0);
                const mat2 = new StandardMaterial('mat2', scene);
                mat2.diffuseColor = Color3.Blue();
                obj2.material = mat2;
                
                // Платформа
                const ground = MeshBuilder.CreateBox('ground', { width: 20, height: 1, depth: 10 }, scene);
                ground.position.y = -1;
                const groundMat = new StandardMaterial('groundMat', scene);
                groundMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                ground.material = groundMat;
            },
            cleanup: (scene) => {
                const meshes = scene.meshes.filter(m => 
                    m.name === 'obj1' || m.name === 'obj2' || m.name === 'ground'
                );
                meshes.forEach(m => m.dispose());
            }
        });
        
        // Сценарий 3: Башня
        this.addScenario({
            id: 'tower',
            name: 'Башня из кубов',
            description: 'Башня из кубов для теста стабильности',
            setup: async (scene) => {
                const ground = MeshBuilder.CreateBox('ground', { width: 10, height: 1, depth: 10 }, scene);
                ground.position.y = -0.5;
                const groundMat = new StandardMaterial('groundMat', scene);
                groundMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                ground.material = groundMat;
                
                // Строим башню
                for (let i = 0; i < 10; i++) {
                    const box = MeshBuilder.CreateBox(`tower_${i}`, { size: 1 }, scene);
                    box.position = new Vector3(0, i + 0.5, 0);
                    const boxMat = new StandardMaterial(`towerMat_${i}`, scene);
                    boxMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
                    box.material = boxMat;
                }
            },
            cleanup: (scene) => {
                const meshes = scene.meshes.filter(m => 
                    m.name.startsWith('ground') || m.name.startsWith('tower_')
                );
                meshes.forEach(m => m.dispose());
            }
        });
    }
    
    /**
     * Добавление сценария
     */
    addScenario(scenario: SimulationScenario): void {
        this.scenarios.set(scenario.id, scenario);
    }
    
    /**
     * Получение списка сценариев
     */
    getScenarios(): SimulationScenario[] {
        return Array.from(this.scenarios.values());
    }
    
    /**
     * Запуск сценария
     */
    async runScenario(id: string): Promise<void> {
        if (this.isRunning) {
            logger.warn("[PhysicsSimulator] Simulation already running");
            return;
        }
        
        const scenario = this.scenarios.get(id);
        if (!scenario) {
            logger.error(`[PhysicsSimulator] Scenario "${id}" not found`);
            return;
        }
        
        // Очищаем предыдущий сценарий
        if (this.activeScenario && this.activeScenario.cleanup) {
            this.activeScenario.cleanup(this.scene);
        }
        
        this.activeScenario = scenario;
        this.isRunning = true;
        
        try {
            await scenario.setup(this.scene);
            logger.log(`[PhysicsSimulator] Scenario "${scenario.name}" started`);
        } catch (error) {
            logger.error(`[PhysicsSimulator] Failed to start scenario:`, error);
            this.isRunning = false;
            this.activeScenario = null;
        }
    }
    
    /**
     * Остановка симуляции
     */
    stopSimulation(): void {
        if (!this.isRunning) return;
        
        if (this.activeScenario && this.activeScenario.cleanup) {
            this.activeScenario.cleanup(this.scene);
        }
        
        this.activeScenario = null;
        this.isRunning = false;
        logger.log("[PhysicsSimulator] Simulation stopped");
    }
    
    /**
     * Проверка, запущена ли симуляция
     */
    isSimulationRunning(): boolean {
        return this.isRunning;
    }
    
    /**
     * Получение активного сценария
     */
    getActiveScenario(): SimulationScenario | null {
        return this.activeScenario;
    }
}

