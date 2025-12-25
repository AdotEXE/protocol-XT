/**
 * @module world/GarageGenerator
 * @description Генератор гаражей
 */

import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsMotionType,
    Mesh,
    Animation,
    PointLight
} from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Конфигурация гаража
 */
export interface GarageConfig {
    width: number;
    depth: number;
    wallHeight: number;
    wallThickness: number;
    doorWidth: number;
    doorTransparency: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_GARAGE_CONFIG: GarageConfig = {
    width: 16,
    depth: 20,
    wallHeight: 8,
    wallThickness: 0.4,
    doorWidth: 8,
    doorTransparency: 0.5
};

/**
 * Данные ворот гаража
 */
export interface GarageDoorData {
    frontDoor: Mesh;
    backDoor: Mesh;
    frontDoorPhysics: PhysicsAggregate;
    backDoorPhysics: PhysicsAggregate;
    position: Vector3;
    garageDepth: number;
    frontOpenY: number;
    backOpenY: number;
    frontClosedY: number;
    backClosedY: number;
    frontDoorOpen: boolean;
    backDoorOpen: boolean;
    manualControl: boolean;
    manualControlTime: number;
}

/**
 * Данные стен гаража
 */
export interface GarageWallData {
    walls: Mesh[];
    position: Vector3;
    width: number;
    depth: number;
}

/**
 * Точка захвата гаража
 */
export interface GarageCapturePoint {
    wrench: Mesh;
    position: Vector3;
    garageIndex: number;
}

/**
 * Данные гаража
 */
export interface GarageData {
    position: Vector3;
    index: number;
    doors: GarageDoorData;
    walls: GarageWallData;
    capturePoint: GarageCapturePoint;
    floor: Mesh;
    roof: Mesh;
}

/**
 * GarageGenerator - Генератор гаражей
 * 
 * Создаёт гаражи со стенами, воротами и точками захвата.
 */
export class GarageGenerator {
    private scene: Scene;
    private config: GarageConfig;
    private materials: Map<string, StandardMaterial> = new Map();
    
    // Сгенерированные гаражи
    private garages: GarageData[] = [];
    
    // Экспортируемые данные
    public garagePositions: Vector3[] = [];
    public garageDoors: GarageDoorData[] = [];
    public garageWalls: GarageWallData[] = [];
    public garageCapturePoints: GarageCapturePoint[] = [];
    public garageAreas: Array<{ x: number; z: number; width: number; depth: number }> = [];
    
    constructor(scene: Scene, config: Partial<GarageConfig> = {}) {
        this.scene = scene;
        this.config = { ...DEFAULT_GARAGE_CONFIG, ...config };
        this.initMaterials();
    }
    
    /**
     * Инициализация материалов
     */
    private initMaterials(): void {
        // Материал стен
        const wallMat = new StandardMaterial("garageWallMat", this.scene);
        wallMat.diffuseColor = new Color3(0.35, 0.35, 0.4);
        wallMat.specularColor = Color3.Black();
        this.materials.set("wall", wallMat);
        
        // Материал пола
        const floorMat = new StandardMaterial("garageFloorMat", this.scene);
        floorMat.diffuseColor = new Color3(0.25, 0.25, 0.28);
        floorMat.specularColor = Color3.Black();
        this.materials.set("floor", floorMat);
        
        // Материал ворот
        const doorMat = new StandardMaterial("garageDoorMat", this.scene);
        doorMat.diffuseColor = new Color3(0.35, 0.35, 0.4);
        doorMat.specularColor = Color3.Black();
        doorMat.backFaceCulling = false;
        this.materials.set("door", doorMat);
        
        // Материал крыши
        const roofMat = new StandardMaterial("garageRoofMat", this.scene);
        roofMat.diffuseColor = new Color3(0.25, 0.25, 0.28);
        roofMat.specularColor = Color3.Black();
        this.materials.set("roof", roofMat);
        
        // Материал верстака
        const workbenchMat = new StandardMaterial("workbenchMat", this.scene);
        workbenchMat.diffuseColor = new Color3(0.5, 0.4, 0.3);
        workbenchMat.specularColor = Color3.Black();
        this.materials.set("workbench", workbenchMat);
    }
    
    /**
     * Создание гаража в указанной позиции
     */
    createGarage(x: number, z: number, index: number = 0): GarageData {
        const position = new Vector3(x, 0, z);
        const cfg = this.config;
        
        // Добавляем область гаража для исключения
        this.garageAreas.push({
            x: x,
            z: z,
            width: cfg.width + 4,
            depth: cfg.depth + 4
        });
        
        // Создаём элементы гаража
        const floor = this.createFloor(x, z, index);
        const walls = this.createWalls(x, z, index);
        const doors = this.createDoors(x, z, index);
        const roof = this.createRoof(x, z, index);
        const capturePoint = this.createCapturePoint(x, z, index);
        
        // Позиция спавна
        this.garagePositions.push(new Vector3(x, 1.0, z));
        
        const garageData: GarageData = {
            position,
            index,
            doors,
            walls,
            capturePoint,
            floor,
            roof
        };
        
        this.garages.push(garageData);
        this.garageDoors.push(doors);
        this.garageWalls.push(walls);
        this.garageCapturePoints.push(capturePoint);
        
        logger.debug(`[GarageGenerator] Created garage ${index} at (${x}, ${z})`);
        
        return garageData;
    }
    
    /**
     * Создание пола
     */
    private createFloor(x: number, z: number, index: number): Mesh {
        const cfg = this.config;
        
        const floor = MeshBuilder.CreateBox(`garageFloor_${index}`, {
            width: cfg.width - 0.5,
            height: 0.15,
            depth: cfg.depth - 0.5
        }, this.scene);
        floor.position = new Vector3(x, 0.075, z);
        floor.material = this.materials.get("floor")!;
        
        // Коллизионный пол
        const collisionFloor = MeshBuilder.CreateBox(`garageFloorCollision_${index}`, {
            width: cfg.width - 0.5,
            height: 0.15,
            depth: cfg.depth - 0.5
        }, this.scene);
        collisionFloor.position = new Vector3(x, 0.075, z);
        collisionFloor.isVisible = false;
        new PhysicsAggregate(collisionFloor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        return floor;
    }
    
    /**
     * Создание стен
     */
    private createWalls(x: number, z: number, index: number): GarageWallData {
        const cfg = this.config;
        const wallMat = this.materials.get("wall")!;
        const walls: Mesh[] = [];
        
        const doorPartWidth = (cfg.width - cfg.doorWidth) / 2;
        
        // Задняя стена - левая часть
        const backLeftWall = MeshBuilder.CreateBox(`garageBackLeft_${index}`, {
            width: doorPartWidth,
            height: cfg.wallHeight,
            depth: cfg.wallThickness
        }, this.scene);
        backLeftWall.position = new Vector3(
            x - cfg.width / 2 + doorPartWidth / 2 + cfg.wallThickness / 2,
            cfg.wallHeight / 2,
            z - cfg.depth / 2 + cfg.wallThickness / 2
        );
        backLeftWall.material = wallMat;
        new PhysicsAggregate(backLeftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(backLeftWall);
        
        // Задняя стена - правая часть
        const backRightWall = MeshBuilder.CreateBox(`garageBackRight_${index}`, {
            width: doorPartWidth,
            height: cfg.wallHeight,
            depth: cfg.wallThickness
        }, this.scene);
        backRightWall.position = new Vector3(
            x + cfg.width / 2 - doorPartWidth / 2 - cfg.wallThickness / 2,
            cfg.wallHeight / 2,
            z - cfg.depth / 2 + cfg.wallThickness / 2
        );
        backRightWall.material = wallMat;
        new PhysicsAggregate(backRightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(backRightWall);
        
        // Перемычка над задним проёмом
        const backLintel = MeshBuilder.CreateBox(`garageBackLintel_${index}`, {
            width: cfg.doorWidth + 0.5,
            height: cfg.wallHeight * 0.25,
            depth: cfg.wallThickness
        }, this.scene);
        backLintel.position = new Vector3(x, cfg.wallHeight * 0.875, z - cfg.depth / 2 + cfg.wallThickness / 2);
        backLintel.material = wallMat;
        new PhysicsAggregate(backLintel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(backLintel);
        
        // Левая стена
        const leftWall = MeshBuilder.CreateBox(`garageLeft_${index}`, {
            width: cfg.wallThickness,
            height: cfg.wallHeight,
            depth: cfg.depth
        }, this.scene);
        leftWall.position = new Vector3(x - cfg.width / 2 + cfg.wallThickness / 2, cfg.wallHeight / 2, z);
        leftWall.material = wallMat;
        new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(leftWall);
        
        // Правая стена
        const rightWall = MeshBuilder.CreateBox(`garageRight_${index}`, {
            width: cfg.wallThickness,
            height: cfg.wallHeight,
            depth: cfg.depth
        }, this.scene);
        rightWall.position = new Vector3(x + cfg.width / 2 - cfg.wallThickness / 2, cfg.wallHeight / 2, z);
        rightWall.material = wallMat;
        new PhysicsAggregate(rightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(rightWall);
        
        // Передняя стена - левая часть
        const frontLeftWall = MeshBuilder.CreateBox(`garageFrontLeft_${index}`, {
            width: doorPartWidth,
            height: cfg.wallHeight,
            depth: cfg.wallThickness
        }, this.scene);
        frontLeftWall.position = new Vector3(
            x - cfg.width / 2 + doorPartWidth / 2 + cfg.wallThickness / 2,
            cfg.wallHeight / 2,
            z + cfg.depth / 2 - cfg.wallThickness / 2
        );
        frontLeftWall.material = wallMat;
        new PhysicsAggregate(frontLeftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(frontLeftWall);
        
        // Передняя стена - правая часть
        const frontRightWall = MeshBuilder.CreateBox(`garageFrontRight_${index}`, {
            width: doorPartWidth,
            height: cfg.wallHeight,
            depth: cfg.wallThickness
        }, this.scene);
        frontRightWall.position = new Vector3(
            x + cfg.width / 2 - doorPartWidth / 2 - cfg.wallThickness / 2,
            cfg.wallHeight / 2,
            z + cfg.depth / 2 - cfg.wallThickness / 2
        );
        frontRightWall.material = wallMat;
        new PhysicsAggregate(frontRightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(frontRightWall);
        
        // Перемычка над передним проёмом
        const frontLintel = MeshBuilder.CreateBox(`garageFrontLintel_${index}`, {
            width: cfg.doorWidth + 0.5,
            height: cfg.wallHeight * 0.25,
            depth: cfg.wallThickness
        }, this.scene);
        frontLintel.position = new Vector3(x, cfg.wallHeight * 0.875, z + cfg.depth / 2 - cfg.wallThickness / 2);
        frontLintel.material = wallMat;
        new PhysicsAggregate(frontLintel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        walls.push(frontLintel);
        
        return {
            walls,
            position: new Vector3(x, 0, z),
            width: cfg.width,
            depth: cfg.depth
        };
    }
    
    /**
     * Создание ворот
     */
    private createDoors(x: number, z: number, index: number): GarageDoorData {
        const cfg = this.config;
        const doorMat = this.materials.get("door")!;
        
        const doorHeight = cfg.wallHeight * 0.7;
        const frontClosedY = cfg.wallHeight * 0.35;
        const frontOpenY = cfg.wallHeight + 1.0;
        const backClosedY = cfg.wallHeight * 0.35;
        const backOpenY = cfg.wallHeight + 1.0;
        
        // Передние ворота
        const frontDoor = MeshBuilder.CreateBox(`garageFrontDoor_${index}`, {
            width: cfg.doorWidth - 0.2,
            height: doorHeight,
            depth: cfg.wallThickness * 0.8
        }, this.scene);
        frontDoor.position = new Vector3(x, frontClosedY, z + cfg.depth / 2 - cfg.wallThickness / 2);
        frontDoor.material = doorMat;
        frontDoor.visibility = cfg.doorTransparency;
        frontDoor.isPickable = true;
        const frontDoorPhysics = new PhysicsAggregate(frontDoor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        frontDoorPhysics.body.setMotionType(PhysicsMotionType.ANIMATED);
        
        // Задние ворота
        const backDoor = MeshBuilder.CreateBox(`garageBackDoor_${index}`, {
            width: cfg.doorWidth - 0.2,
            height: doorHeight,
            depth: cfg.wallThickness * 0.8
        }, this.scene);
        backDoor.position = new Vector3(x, backClosedY, z - cfg.depth / 2 + cfg.wallThickness / 2);
        backDoor.material = doorMat;
        backDoor.visibility = cfg.doorTransparency;
        backDoor.isPickable = true;
        const backDoorPhysics = new PhysicsAggregate(backDoor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        backDoorPhysics.body.setMotionType(PhysicsMotionType.ANIMATED);
        
        return {
            frontDoor,
            backDoor,
            frontDoorPhysics,
            backDoorPhysics,
            position: new Vector3(x, 0, z),
            garageDepth: cfg.depth,
            frontOpenY,
            backOpenY,
            frontClosedY,
            backClosedY,
            frontDoorOpen: false,
            backDoorOpen: false,
            manualControl: false,
            manualControlTime: 0
        };
    }
    
    /**
     * Создание крыши
     */
    private createRoof(x: number, z: number, index: number): Mesh {
        const cfg = this.config;
        
        const roof = MeshBuilder.CreateBox(`garageRoof_${index}`, {
            width: cfg.width,
            height: 0.3,
            depth: cfg.depth
        }, this.scene);
        roof.position = new Vector3(x, cfg.wallHeight + 0.15, z);
        roof.material = this.materials.get("roof")!;
        new PhysicsAggregate(roof, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Освещение
        const light = new PointLight(`garageLight_${index}`, new Vector3(x, cfg.wallHeight - 1, z), this.scene);
        light.intensity = 0.3;
        light.diffuse = new Color3(1, 0.95, 0.8);
        light.range = cfg.width * 1.5;
        
        return roof;
    }
    
    /**
     * Создание точки захвата (верстак)
     */
    private createCapturePoint(x: number, z: number, index: number): GarageCapturePoint {
        const cfg = this.config;
        
        // Верстак
        const workbench = MeshBuilder.CreateBox(`workbench_${index}`, {
            width: 3,
            height: 1,
            depth: 1.5
        }, this.scene);
        workbench.position = new Vector3(x - cfg.width / 2 + 3, 0.5, z);
        workbench.material = this.materials.get("workbench")!;
        workbench.metadata = { type: "capturePoint", garageIndex: index };
        
        return {
            wrench: workbench,
            position: workbench.position.clone(),
            garageIndex: index
        };
    }
    
    /**
     * Анимация открытия/закрытия ворот
     */
    animateDoor(door: Mesh, targetY: number, duration: number = 1000): void {
        const startY = door.position.y;
        
        const animation = new Animation(
            "doorAnimation",
            "position.y",
            60,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CONSTANT
        );
        
        const frames = Math.round(duration / 1000 * 60);
        animation.setKeys([
            { frame: 0, value: startY },
            { frame: frames, value: targetY }
        ]);
        
        door.animations = [animation];
        this.scene.beginAnimation(door, 0, frames, false);
    }
    
    /**
     * Открыть передние ворота
     */
    openFrontDoor(doorData: GarageDoorData): void {
        if (!doorData.frontDoorOpen) {
            this.animateDoor(doorData.frontDoor, doorData.frontOpenY);
            doorData.frontDoorOpen = true;
        }
    }
    
    /**
     * Закрыть передние ворота
     */
    closeFrontDoor(doorData: GarageDoorData): void {
        if (doorData.frontDoorOpen) {
            this.animateDoor(doorData.frontDoor, doorData.frontClosedY);
            doorData.frontDoorOpen = false;
        }
    }
    
    /**
     * Открыть задние ворота
     */
    openBackDoor(doorData: GarageDoorData): void {
        if (!doorData.backDoorOpen) {
            this.animateDoor(doorData.backDoor, doorData.backOpenY);
            doorData.backDoorOpen = true;
        }
    }
    
    /**
     * Закрыть задние ворота
     */
    closeBackDoor(doorData: GarageDoorData): void {
        if (doorData.backDoorOpen) {
            this.animateDoor(doorData.backDoor, doorData.backClosedY);
            doorData.backDoorOpen = false;
        }
    }
    
    /**
     * Получить все гаражи
     */
    getGarages(): GarageData[] {
        return this.garages;
    }
    
    /**
     * Проверка, находится ли точка внутри гаража
     */
    isInsideGarage(position: Vector3): { inside: boolean; garageIndex: number } {
        for (let i = 0; i < this.garageAreas.length; i++) {
            const area = this.garageAreas[i];
            if (!area) continue; // Защита от undefined
            
            if (
                position.x >= area.x - area.width / 2 &&
                position.x <= area.x + area.width / 2 &&
                position.z >= area.z - area.depth / 2 &&
                position.z <= area.z + area.depth / 2
            ) {
                return { inside: true, garageIndex: i };
            }
        }
        return { inside: false, garageIndex: -1 };
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        for (const garage of this.garages) {
            garage.floor?.dispose();
            garage.roof?.dispose();
            garage.doors.frontDoor?.dispose();
            garage.doors.backDoor?.dispose();
            garage.capturePoint.wrench?.dispose();
            for (const wall of garage.walls.walls) {
                wall?.dispose();
            }
        }
        
        this.garages = [];
        this.garagePositions = [];
        this.garageDoors = [];
        this.garageWalls = [];
        this.garageCapturePoints = [];
        this.garageAreas = [];
        
        for (const mat of this.materials.values()) {
            mat.dispose();
        }
        this.materials.clear();
        
        logger.log("[GarageGenerator] Disposed");
    }
}

