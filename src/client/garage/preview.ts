/**
 * Garage 3D Preview Module
 * Логика 3D превью танка в гараже из garage.ts
 */

import { 
    Scene, 
    Engine, 
    Mesh, 
    ArcRotateCamera, 
    HemisphericLight, 
    MeshBuilder, 
    StandardMaterial, 
    Color3,
    Color4,
    Vector3 
} from "@babylonjs/core";
import { getChassisById, getCannonById, type ChassisType, type CannonType } from "../tankTypes";
import { getTrackById, type TrackType } from "../trackTypes";
import { MaterialFactory } from "./materials";
import { ChassisDetailsGenerator } from "./chassisDetails";
import { CannonDetailsGenerator } from "./cannonDetails";

export interface PreviewTank {
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    leftTrack?: Mesh;
    rightTrack?: Mesh;
}

export interface PreviewScene {
    engine: Engine;
    scene: Scene;
    camera: ArcRotateCamera;
    light: HemisphericLight;
    canvas: HTMLCanvasElement;
    renderLoop?: number;
}

/**
 * Инициализирует 3D превью сцену
 */
export function initPreviewScene(
    previewContainer: HTMLElement
): PreviewScene | null {
    if (!previewContainer) {
        console.warn("[Garage Preview] Preview container not found");
        return null;
    }
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'garage-preview-canvas';
    canvas.width = 400;
    canvas.height = 300;
    previewContainer.appendChild(canvas);
    
    // Create engine
    const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true
    });
    
    // Create scene
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.05, 0.05, 0.08, 1.0);
    
    // Camera - rotate around tank with mouse controls
    const camera = new ArcRotateCamera(
        "previewCamera",
        Math.PI / 3,
        Math.PI / 3,
        8,
        Vector3.Zero(),
        scene
    );
    // Attach mouse controls for rotation and zoom
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 15;
    camera.wheelDeltaPercentage = 0.01;
    
    // Light
    const light = new HemisphericLight("previewLight", new Vector3(0, 1, 0), scene);
    light.intensity = 0.8;
    light.diffuse = new Color3(0.9, 0.9, 0.85);
    light.groundColor = new Color3(0.2, 0.2, 0.25);
    
    // Simple ground plane
    const ground = MeshBuilder.CreateGround("previewGround", { width: 10, height: 10 }, scene);
    const groundMat = new StandardMaterial("previewGroundMat", scene);
    groundMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
    groundMat.specularColor = Color3.Black();
    ground.material = groundMat;
    ground.position.y = -2;
    
    // Start render loop with limited FPS (30 FPS)
    let lastTime = Date.now();
    const targetFPS = 30;
    const frameTime = 1000 / targetFPS;
    
    const renderLoop = window.setInterval(() => {
        const now = Date.now();
        if (now - lastTime >= frameTime) {
            if (scene && engine) {
                scene.render();
            }
            lastTime = now;
        }
    }, frameTime);
    
    console.log("[Garage Preview] 3D preview initialized");
    
    return { engine, scene, camera, light, canvas, renderLoop };
}

/**
 * Очищает 3D превью сцену
 */
export function cleanupPreviewScene(previewScene: PreviewScene | null): void {
    if (!previewScene) return;
    
    // Stop render loop
    if (previewScene.renderLoop !== undefined) {
        clearInterval(previewScene.renderLoop);
    }
    
    // Dispose scene and engine
    if (previewScene.scene) {
        previewScene.scene.dispose();
    }
    
    if (previewScene.engine) {
        previewScene.engine.dispose();
    }
    
    // Remove canvas
    if (previewScene.canvas) {
        previewScene.canvas.remove();
    }
    
    console.log("[Garage Preview] 3D preview cleaned up");
}

/**
 * Создает превью танка
 */
export function createPreviewTank(
    chassisId: string,
    cannonId: string,
    trackId: string,
    scene: Scene
): PreviewTank | null {
    if (!scene) {
        console.warn("[Garage Preview] Scene not initialized");
        return null;
    }
    
    const chassisType = getChassisById(chassisId);
    const cannonType = getCannonById(cannonId);
    const trackType = getTrackById(trackId);
    
    // Use unique models with all details
    const chassis = createUniqueChassisPreview(chassisType, scene);
    const turret = createTurretPreview(chassisType, scene);
    const barrel = createUniqueCannonPreview(cannonType, scene);
    
    barrel.parent = turret;
    turret.parent = chassis;
    
    // Create tracks
    const tracks = createPreviewTracks(chassis, chassisType, trackType, scene);
    
    console.log("[Garage Preview] Tank preview rendered with unique models:", chassisId, cannonId, trackId);
    
    return { chassis, turret, barrel, leftTrack: tracks.left, rightTrack: tracks.right };
}

/**
 * Обновляет превью танка (при смене деталей)
 */
export function updatePreviewTank(
    previewTank: PreviewTank | null,
    chassisId: string,
    cannonId: string,
    trackId: string,
    scene: Scene
): PreviewTank | null {
    // Cleanup old tank
    if (previewTank) {
        previewTank.chassis.dispose();
        previewTank.turret.dispose();
        previewTank.barrel.dispose();
        if (previewTank.leftTrack) previewTank.leftTrack.dispose();
        if (previewTank.rightTrack) previewTank.rightTrack.dispose();
    }
    
    // Create new
    return createPreviewTank(chassisId, cannonId, trackId, scene);
}

// ============ INTERNAL FUNCTIONS ============

/**
 * Create unique chassis using same logic as TankController
 */
function createUniqueChassisPreview(chassisType: ChassisType, scene: Scene): Mesh {
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    const color = Color3.FromHexString(chassisType.color);
    
    let chassis: Mesh;
    
    // Use same unique forms as TankController
    switch (chassisType.id) {
        case "light": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.75, height: h * 0.7, depth: d * 1.2 }, scene); 
            break;
        case "scout": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.7, height: h * 0.65, depth: d * 0.85 }, scene); 
            break;
        case "heavy": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.08, height: h * 1.2, depth: d * 1.08 }, scene); 
            break;
        case "assault": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.12, height: h * 1.1, depth: d * 1.05 }, scene); 
            break;
        case "stealth": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.05, height: h * 0.7, depth: d * 1.15 }, scene); 
            break;
        case "hover": 
            chassis = MeshBuilder.CreateCylinder("previewChassis", { 
                diameter: Math.max(w, d) * 1.1,
                height: h * 0.95,
                tessellation: 8  // Low-poly
            }, scene);
            chassis.rotation.z = Math.PI / 2;
            break;
        case "siege": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.25, height: h * 1.35, depth: d * 1.2 }, scene); 
            break;
        case "racer": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.75, height: h * 0.55, depth: d * 1.3 }, scene); 
            break;
        case "amphibious": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.15, height: h * 1.1, depth: d * 1.1 }, scene); 
            break;
        case "shield": 
            chassis = MeshBuilder.CreateCylinder("previewChassis", { 
                diameter: Math.max(w, d) * 1.2,
                height: h * 1.1,
                tessellation: 8
            }, scene);
            chassis.rotation.z = Math.PI / 2;
            break;
        case "drone": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.1, height: h * 1.12, depth: d * 1.05 }, scene); 
            break;
        case "artillery": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.2, height: h * 1.25, depth: d * 1.15 }, scene); 
            break;
        case "destroyer": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.85, height: h * 0.75, depth: d * 1.4 }, scene); 
            break;
        case "command": 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.1, height: h * 1.2, depth: d * 1.1 }, scene); 
            break;
        default: 
            chassis = MeshBuilder.CreateBox("previewChassis", { width: w, height: h, depth: d }, scene);
    }
    
    chassis.position = Vector3.Zero();
    const mat = new StandardMaterial("previewChassisMat", scene);
    mat.diffuseColor = color;
    mat.specularColor = Color3.Black();
    chassis.material = mat;
    
    // Add visual details
    addChassisDetailsPreview(chassis, chassisType, scene, color);
    
    return chassis;
}

/**
 * Create preview tracks
 */
function createPreviewTracks(chassis: Mesh, chassisType: ChassisType, trackType: TrackType, scene: Scene): { left: Mesh, right: Mesh } {
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    
    // Адаптируем размеры гусениц под размер корпуса
    const trackWidth = trackType.width;
    const trackHeight = trackType.height;
    const trackDepth = trackType.depth * (d / 3.8); // Нормализуем под стандартную глубину
    
    // Создаем материал для гусениц
    const trackMat = new StandardMaterial("previewTrackMat", scene);
    const trackColor = Color3.FromHexString(trackType.color);
    trackMat.diffuseColor = trackColor;
    trackMat.specularColor = Color3.Black();
    trackMat.freeze();
    
    // Left track
    const leftTrack = MeshBuilder.CreateBox("previewLeftTrack", {
        width: trackWidth,
        height: trackHeight,
        depth: trackDepth
    }, scene);
    leftTrack.position = new Vector3(-w * 0.65, -h * 0.2, 0);
    leftTrack.parent = chassis;
    leftTrack.material = trackMat;
    
    // Right track
    const rightTrack = MeshBuilder.CreateBox("previewRightTrack", {
        width: trackWidth,
        height: trackHeight,
        depth: trackDepth
    }, scene);
    rightTrack.position = new Vector3(w * 0.65, -h * 0.2, 0);
    rightTrack.parent = chassis;
    rightTrack.material = trackMat;
    
    return { left: leftTrack, right: rightTrack };
}

/**
 * Create turret preview
 */
function createTurretPreview(chassisType: ChassisType, scene: Scene): Mesh {
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    const turretWidth = w * 0.65;
    const turretHeight = h * 0.75;
    const turretDepth = d * 0.6;
    
    const turret = MeshBuilder.CreateBox("previewTurret", { width: turretWidth, height: turretHeight, depth: turretDepth }, scene);
    turret.position.y = h / 2 + turretHeight / 2;
    const turretColor = Color3.FromHexString(chassisType.color);
    const turretMat = new StandardMaterial("previewTurretMat", scene);
    turretMat.diffuseColor = turretColor.scale(0.8);
    turretMat.specularColor = Color3.Black();
    turret.material = turretMat;
    return turret;
}

/**
 * Add chassis details - ПОЛНАЯ КОПИЯ из TankController
 * NOTE: This is a very large function - will be fully implemented from garage.ts
 * For now, this is a placeholder that needs to be populated with the full ~2000 lines
 * from garage.ts::addChassisDetailsPreview
 */
function addChassisDetailsPreview(chassis: Mesh, chassisType: ChassisType, scene: Scene, baseColor: Color3): void {
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    
    // Используем MaterialFactory для создания материалов
    const armorMat = MaterialFactory.createArmorMaterial(scene, baseColor, "preview");
    const accentMat = MaterialFactory.createAccentMaterial(scene, baseColor, "preview");
    
    // TODO: Copy the full switch statement from garage.ts (lines 759-2932)
    // This is a temporary minimal implementation
    // The full implementation contains detailed cases for all 15 chassis types
    console.warn("[Garage Preview] addChassisDetailsPreview - full implementation pending (2000+ lines to copy from garage.ts)");
    
    // Basic fallback - add minimal details
    switch (chassisType.id) {
        case "medium":
            // Minimal implementation - full version needs to be copied
            ChassisDetailsGenerator.createSlopedArmor(
                scene, chassis,
                new Vector3(0, h * 0.1, d * 0.5),
                w * 1.0, h * 0.7, 0.18,
                -Math.PI / 4, armorMat, "previewMedium"
            );
            break;
        default:
            // No additional details for other types yet
            break;
    }
}

/**
 * Create unique cannon - ПОЛНАЯ КОПИЯ из TankController
 */
function createUniqueCannonPreview(cannonType: CannonType, scene: Scene): Mesh {
    const barrelWidth = cannonType.barrelWidth;
    const barrelLength = cannonType.barrelLength;
    const cannonColor = Color3.FromHexString(cannonType.color);
    
    let barrel: Mesh;
    
    // Use EXACT same proportions and details as TankController
    switch (cannonType.id) {
        case "sniper":
            // Sniper - ЭКСТРЕМАЛЬНО ДЛИННАЯ И ТОНКАЯ - УНИКАЛЬНАЯ ФОРМА
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 0.5,
                height: barrelLength * 2.0,
                tessellation: 8
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            // ОГРОМНЫЙ прицел
            CannonDetailsGenerator.createScope(
                scene, barrel,
                new Vector3(barrelWidth * 0.65, barrelWidth * 0.5, barrelLength * 0.6),
                barrelWidth * 1.2, barrelWidth * 0.9,
                "preview"
            );
            const sniperScopeMat = MaterialFactory.createScopeMaterial(scene, "preview");
            // Сошки - БОЛЬШЕ
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createBipod(
                    scene, barrel,
                    new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.45, -barrelWidth * 0.4, barrelLength * 0.75),
                    0.12, barrelWidth * 0.8, 0.12,
                    sniperScopeMat, "preview"
                );
            }
            // Стабилизаторы - БОЛЬШЕ
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.4, -barrelWidth * 0.3, barrelLength * 0.4),
                    0.1, barrelWidth * 0.7, 0.1,
                    sniperScopeMat, "preview"
                );
            }
            break;
        case "gatling":
            // Gatling - Прототип: ГШ-6-30 - Советская скорострельная пушка
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 2.0,
                height: barrelLength * 0.8,
                tessellation: 8  // Low-poly
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            // Стволы (угловатые, low-poly)
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2 / 6);
                CannonDetailsGenerator.createMiniBarrel(
                    scene, barrel,
                    new Vector3(Math.cos(angle) * barrelWidth * 0.6, Math.sin(angle) * barrelWidth * 0.6, 0),
                    barrelLength * 1.1, barrelWidth * 0.35,
                    cannonColor, "preview"
                );
            }
            // Система охлаждения (угловатые кольца, low-poly)
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createCoolingRing(
                    scene, barrel,
                    new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.12),
                    barrelWidth * 1.9, barrelWidth * 0.25,
                    cannonColor, "preview"
                );
            }
            break;
        case "heavy":
            // Heavy - МАССИВНАЯ, ТОЛСТАЯ - УНИКАЛЬНАЯ ФОРМА
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 1.5,
                height: barrelLength * 1.2,
                tessellation: 12
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.48),
                barrelWidth * 1.7, barrelWidth * 1.7, barrelWidth * 1.3,
                cannonColor, "preview"
            );
            CannonDetailsGenerator.createMuzzleBrake(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.55),
                barrelWidth * 0.4, barrelWidth * 1.4,
                cannonColor, "preview"
            );
            break;
        case "rapid":
            // Rapid - КОРОТКАЯ, КОМПАКТНАЯ - УНИКАЛЬНАЯ ФОРМА
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 0.8,
                height: barrelLength * 0.7,
                tessellation: 10
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.35),
                barrelWidth * 1.1, barrelWidth * 1.1, barrelWidth * 0.6,
                cannonColor, "preview"
            );
            break;
        case "plasma":
            // Plasma - ЭНЕРГЕТИЧЕСКАЯ, КОНИЧЕСКАЯ ФОРМА - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameterTop: barrelWidth * 1.8,
                diameterBottom: barrelWidth * 1.0,
                height: barrelLength * 1.2,
                tessellation: 12
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            CannonDetailsGenerator.createPlasmaCore(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.4),
                barrelWidth * 1.2,
                "preview"
            );
            
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createPlasmaCoil(
                    scene, barrel,
                    new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.12),
                    barrelWidth * 1.4, barrelWidth * 0.12,
                    "preview"
                );
            }
            
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createPlasmaStabilizer(
                    scene, barrel,
                    new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.7, 0, barrelLength * 0.1),
                    barrelWidth * 0.15, barrelLength * 0.7, barrelWidth * 0.15,
                    "preview"
                );
            }
            
            CannonDetailsGenerator.createPlasmaEmitter(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.5),
                barrelWidth * 0.4, barrelWidth * 1.8,
                "preview"
            );
            break;
        case "laser":
            // Laser - ОЧЕНЬ ДЛИННАЯ, ТОНКАЯ ТРУБКА - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 0.6,
                height: barrelLength * 1.8,
                tessellation: 12
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            CannonDetailsGenerator.createLens(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.6),
                barrelWidth * 0.5, barrelWidth * 0.9,
                "preview"
            );
            
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createFocusRing(
                    scene, barrel,
                    new Vector3(0, 0, -barrelLength * 0.2 + i * barrelLength * 0.2),
                    barrelWidth * 1.0, barrelWidth * 0.08,
                    "preview"
                );
            }
            
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createLaserChannel(
                    scene, barrel,
                    new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.45, 0, barrelLength * 0.1),
                    barrelWidth * 0.1, barrelLength * 1.2, barrelWidth * 0.1,
                    "preview"
                );
            }
            
            CannonDetailsGenerator.createLaserHousing(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.4, barrelLength * 0.05),
                barrelWidth * 0.9, barrelWidth * 0.3, barrelLength * 1.3,
                cannonColor,
                "preview"
            );
            break;
        case "railgun":
            // Railgun - ЭКСТРЕМАЛЬНО ДЛИННАЯ, С РЕЛЬСАМИ - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 0.6,
                height: barrelLength * 2.0,
                tessellation: 10
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            CannonDetailsGenerator.createRail(
                scene, barrel,
                new Vector3(-barrelWidth * 0.5, 0, 0),
                barrelWidth * 0.18, barrelWidth * 0.9, barrelLength * 1.7,
                "preview"
            );
            
            CannonDetailsGenerator.createRail(
                scene, barrel,
                new Vector3(barrelWidth * 0.5, 0, 0),
                barrelWidth * 0.18, barrelWidth * 0.9, barrelLength * 1.7,
                "preview"
            );
            
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createCapacitor(
                    scene, barrel,
                    new Vector3(0, barrelWidth * 0.6, -barrelLength * 0.5 + i * barrelLength * 0.25),
                    barrelWidth * 0.5, barrelWidth * 0.5,
                    "preview"
                );
            }
            
            for (let i = 0; i < 3; i++) {
                CannonDetailsGenerator.createRailChannel(
                    scene, barrel,
                    new Vector3(0, 0, -barrelLength * 0.4 + i * barrelLength * 0.3),
                    barrelWidth * 0.3, barrelWidth * 0.15, barrelLength * 0.3,
                    "preview"
                );
            }
            
            CannonDetailsGenerator.createMuzzleAmplifier(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.7),
                barrelWidth * 0.3, barrelWidth * 1.2,
                "preview"
            );
            break;
        case "tesla":
            // Tesla - КОРОТКАЯ, ШИРОКАЯ, С КАТУШКАМИ - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 1.8,
                height: barrelLength * 0.9,
                tessellation: 8
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            for (let i = 0; i < 5; i++) {
                CannonDetailsGenerator.createTeslaCoil(
                    scene, barrel,
                    new Vector3(0, 0, -barrelLength * 0.3 + i * barrelLength * 0.15),
                    barrelWidth * 0.8, barrelWidth * 0.15,
                    "preview"
                );
            }
            
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                CannonDetailsGenerator.createTeslaDischarger(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.7,
                        Math.sin(angle) * barrelWidth * 0.5,
                        barrelLength * 0.2
                    ),
                    barrelWidth * 0.4, barrelWidth * 0.2,
                    barrel.material as StandardMaterial,
                    "preview"
                );
            }
            
            CannonDetailsGenerator.createTeslaGenerator(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.35),
                barrelWidth * 0.6,
                "preview"
            );
            break;
        case "rocket":
            // Rocket - ЭКСПЕРИМЕНТАЛЬНЫЙ ДИЗАЙН (синхронизировано с TankController)
            barrel = MeshBuilder.CreateBox("previewBarrel", { 
                width: barrelWidth * 1.7, 
                height: barrelWidth * 1.7, 
                depth: barrelLength * 1.1 
            }, scene);
            
            CannonDetailsGenerator.createRocketTube(
                scene, barrel,
                new Vector3(0, 0, 0),
                barrelLength * 1.0, barrelWidth * 1.5,
                cannonColor,
                "preview"
            );
            
            const rocketTubeMat = MaterialFactory.createBasicMaterial(scene, cannonColor.scale(0.8), "previewRocketTube");
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                CannonDetailsGenerator.createGuide(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.7,
                        Math.sin(angle) * barrelWidth * 0.7,
                        0
                    ),
                    barrelWidth * 0.12, barrelLength * 0.9, barrelWidth * 0.12,
                    rocketTubeMat,
                    "preview"
                );
            }
            
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                CannonDetailsGenerator.createRocketFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.8,
                        Math.sin(angle) * barrelWidth * 0.8,
                        barrelLength * 0.45
                    ),
                    barrelWidth * 0.15, barrelWidth * 0.3, barrelWidth * 0.1,
                    rocketTubeMat,
                    "preview"
                );
            }
            
            CannonDetailsGenerator.createRocketGuidance(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.7, -barrelLength * 0.2),
                barrelWidth * 0.5, barrelWidth * 0.3, barrelWidth * 0.5,
                "preview"
            );
            break;
        case "shotgun":
            // Shotgun - ОГРОМНАЯ, МНОЖЕСТВЕННЫЕ СТВОЛЫ - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 2.2,
                height: barrelLength * 0.75,
                tessellation: 16
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            for (let i = 0; i < 10; i++) {
                const angle = (i * Math.PI * 2) / 10;
                CannonDetailsGenerator.createPelletBarrel(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.6,
                        Math.sin(angle) * barrelWidth * 0.6,
                        0
                    ),
                    barrelLength * 0.7, barrelWidth * 0.18,
                    cannonColor,
                    "preview"
                );
            }
            
            CannonDetailsGenerator.createCenterBarrel(
                scene, barrel,
                new Vector3(0, 0, 0),
                barrelLength * 0.75, barrelWidth * 0.25,
                barrel.material as StandardMaterial,
                "preview"
            );
            
            for (let i = 0; i < 5; i++) {
                const angle = (i * Math.PI * 2) / 5 + Math.PI / 10;
                CannonDetailsGenerator.createShotgunReinforcement(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.8,
                        Math.sin(angle) * barrelWidth * 0.8,
                        barrelLength * 0.1
                    ),
                    barrelWidth * 0.1, barrelLength * 0.5, barrelWidth * 0.1,
                    barrel.material as StandardMaterial,
                    "preview"
                );
            }
            break;
        case "standard":
            // Standard - СБАЛАНСИРОВАННАЯ, КЛАССИЧЕСКАЯ - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                diameter: barrelWidth * 1.0,
                height: barrelLength * 1.0,
                tessellation: 12
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.4),
                barrelWidth * 1.3, barrelWidth * 1.3, barrelWidth * 0.8,
                cannonColor.scale(0.7),
                "preview"
            );
            break;
        default:
            barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth, height: barrelWidth, depth: barrelLength }, scene);
    }
    
    const baseBarrelZ = (cannonType.barrelLength || 2) / 2;
    barrel.position.z = baseBarrelZ;
    barrel.position.y = 0;
    const barrelMat = new StandardMaterial("previewBarrelMat", scene);
    barrelMat.diffuseColor = cannonColor;
    barrelMat.specularColor = Color3.Black();
    barrel.material = barrelMat;
    
    return barrel;
}
