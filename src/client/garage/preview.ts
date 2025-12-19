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
import { addZFightingOffset } from "../tank/zFightingFix";
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
    animationGroups?: { stop: () => void; dispose?: () => void }[];
}

/**
 * Инициализирует 3D превью сцену
 */
export function initPreviewScene(
    previewContainer: HTMLElement
): PreviewScene | null {
    if (!previewContainer) {
        // Preview container not found - это нормально при первой инициализации
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
    
    // 3D preview initialized
    
    return { engine, scene, camera, light, canvas, renderLoop };
}

/**
 * Очищает 3D превью сцену
 */
export function cleanupPreviewScene(previewScene: PreviewScene | null): void {
    if (!previewScene) return;
    
    try {
        // 1. Остановить render loop ПЕРВЫМ
        if (previewScene.renderLoop !== undefined) {
            clearInterval(previewScene.renderLoop);
            previewScene.renderLoop = undefined;
        }
        
        // 2. Отключить камеру от canvas ПЕРЕД dispose
        if (previewScene.camera && previewScene.canvas) {
            try {
                previewScene.camera.detachControl();
            } catch (e) {
                // Игнорируем ошибки при отключении (может быть уже отключена)
            }
        }
        
        // 3. Удалить canvas из DOM ПЕРЕД dispose engine
        if (previewScene.canvas && previewScene.canvas.parentNode) {
            previewScene.canvas.parentNode.removeChild(previewScene.canvas);
        }
        
        // 4. Dispose сцены (это также dispose все меши, материалы, камеры, свет)
        if (previewScene.scene && !previewScene.scene.isDisposed) {
            previewScene.scene.dispose();
        }
        
        // 5. Dispose engine ПОСЛЕДНИМ
        if (previewScene.engine && !previewScene.engine.isDisposed) {
            previewScene.engine.dispose();
        }
    } catch (error) {
        console.error("[Garage Preview] Error during cleanup:", error);
    }
    
    // 3D preview cleaned up
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
        // Scene not initialized - это нормально при первой инициализации
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
    
    // Tank preview rendered with unique models
    
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
            const hoverSize = Math.max(w, d) * 1.1;
            chassis = MeshBuilder.CreateBox("previewChassis", { 
                width: hoverSize,
                height: h * 0.95,
                depth: hoverSize
            }, scene);
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
            const shieldSize = Math.max(w, d) * 1.2;
            chassis = MeshBuilder.CreateBox("previewChassis", { 
                width: shieldSize,
                height: h * 1.1,
                depth: shieldSize
            }, scene);
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
    
    // Позиционируем танк так, чтобы:
    // - Нижняя часть была не ниже пола (y >= -2)
    // - Верхняя часть была не выше y=2
    // Центр танка находится на y = 0, нижняя часть на y = -h/2, верхняя на y = h/2
    // Чтобы верхняя часть была на y=2, нужно: h/2 = 2, значит h = 4
    // Для танков с h < 4, поднимаем так чтобы верхняя часть была на y=2: chassisCenterY = 2 - h/2
    // Для танков с h >= 4, опускаем так чтобы нижняя часть была на y=-2: chassisCenterY = -2 + h/2
    const maxTopY = 2;
    const minBottomY = -2;
    const chassisCenterY = Math.min(maxTopY - h / 2, Math.max(minBottomY + h / 2, 0));
    chassis.position = addZFightingOffset(new Vector3(0, chassisCenterY, 0), "forward");
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
    
    // Left track - ближе к корпусу для избежания глитчей
    const leftTrack = MeshBuilder.CreateBox("previewLeftTrack", {
        width: trackWidth,
        height: trackHeight,
        depth: trackDepth
    }, scene);
    leftTrack.position = addZFightingOffset(new Vector3(-w * 0.55, -h * 0.25, 0), "forward");
    leftTrack.parent = chassis;
    leftTrack.material = trackMat;
    
    // Right track - ближе к корпусу для избежания глитчей
    const rightTrack = MeshBuilder.CreateBox("previewRightTrack", {
        width: trackWidth,
        height: trackHeight,
        depth: trackDepth
    }, scene);
    rightTrack.position = addZFightingOffset(new Vector3(w * 0.55, -h * 0.25, 0), "forward");
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
    
    // Убеждаемся, что башня не повёрнута
    turret.rotation.x = 0;
    turret.rotation.y = 0;
    turret.rotation.z = 0;
    
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
function addChassisDetailsPreview(chassis: Mesh, chassisType: any, scene: Scene, baseColor: Color3): void {
    // ВСЕ ДЕТАЛИ ОТКЛЮЧЕНЫ - оставляем только простой прямоугольник корпуса
    // Весь код деталей был удалён по требованию пользователя
    return;
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
            // Sniper - ЭКСТРЕМАЛЬНО ДЛИННАЯ, ТОЛЩЕ - УНИКАЛЬНАЯ ФОРМА
            barrel = MeshBuilder.CreateBox("previewBarrel", { 
                width: barrelWidth * 0.75,
                height: barrelWidth * 0.75,
                depth: barrelLength * 2.0
            }, scene);
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
            // Утолщение у основания ствола
            CannonDetailsGenerator.createBaseThickening(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.3),
                barrelWidth * 0.9, barrelWidth * 0.9, barrelWidth * 0.4,
                sniperScopeMat, "preview"
            );
            
            // Глушитель на конце ствола (средний размер)
            CannonDetailsGenerator.createSuppressor(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 1.0),
                barrelWidth * 1.125, barrelWidth * 1.125, barrelLength * 0.3,
                sniperScopeMat, "preview"
            );
            
            // Детали глушителя (вентиляционные отверстия) - 8 маленьких Box
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI * 2) / 8;
                CannonDetailsGenerator.createSuppressorVent(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.4,
                        Math.sin(angle) * barrelWidth * 0.4,
                        barrelLength * 1.0
                    ),
                    angle,
                    barrelWidth * 0.06, barrelWidth * 0.06, barrelLength * 0.25,
                    sniperScopeMat, `previewSuppressorVent${i}`
                );
            }
            break;
        case "gatling":
            // Gatling - Прототип: ГШ-6-30 - Советская скорострельная пушка
            barrel = MeshBuilder.CreateBox("previewBarrel", { 
                width: barrelWidth * 2.0,
                height: barrelWidth * 2.0,
                depth: barrelLength * 0.8
            }, scene);
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
            barrel = MeshBuilder.CreateBox("previewBarrel", { 
                width: barrelWidth * 1.5,
                height: barrelWidth * 1.5,
                depth: barrelLength * 1.2
            }, scene);
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
            barrel = MeshBuilder.CreateBox("previewBarrel", { 
                width: barrelWidth * 0.8,
                height: barrelWidth * 0.8,
                depth: barrelLength * 0.7
            }, scene);
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.35),
                barrelWidth * 1.1, barrelWidth * 1.1, barrelWidth * 0.6,
                cannonColor, "preview"
            );
            break;
        case "plasma":
            // Plasma - ЭНЕРГЕТИЧЕСКАЯ, ПРЯМОУГОЛЬНАЯ ФОРМА - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateBox("previewBarrel", { 
                width: barrelWidth * 1.4,
                height: barrelWidth * 1.4,
                depth: barrelLength * 1.2
            }, scene);
            
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
            barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth * 0.6, height: barrelLength * 1.8, depth: barrelWidth * 0.6 }, scene);
            
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
            
            // Короткие горизонтальные детали вокруг ствола (без вертикальных полосок)
            // Маленькие кольца вокруг ствола (6 штук, короткие)
            const laserRingMat = new StandardMaterial("laserRingMat", scene);
            laserRingMat.diffuseColor = new Color3(0.7, 0, 0);
            laserRingMat.emissiveColor = new Color3(0.25, 0, 0);
            for (let i = 0; i < 6; i++) {
                const ringZ = -barrelLength * 0.1 + i * barrelLength * 0.35;
                const ringSize = barrelWidth * 0.95;
                const ringThickness = barrelWidth * 0.05;
                CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    laserRingMat, `previewLaserRing${i}`
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
            // Railgun - ЭКСТРЕМАЛЬНО ДЛИННАЯ, С КОРОТКИМИ ДЕТАЛЯМИ - УНИКАЛЬНЫЙ ДИЗАЙН
            barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth * 0.6, height: barrelLength * 2.0, depth: barrelWidth * 0.6 }, scene);
            
            const railMat = new StandardMaterial("railMat", scene);
            railMat.diffuseColor = new Color3(0.1, 0.3, 0.8);
            railMat.emissiveColor = new Color3(0.05, 0.15, 0.4);
            
            // Короткие детали вокруг ствола вместо вертикальных рельсов
            // Кольца вокруг ствола (6 штук)
            for (let i = 0; i < 6; i++) {
                const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.4;
                const ringSize = barrelWidth * 0.75;
                const ringThickness = barrelWidth * 0.06;
                CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    railMat, `previewRailgunRing${i}`
                );
            }
            
            // Маленькие пластины/ребра жесткости вокруг ствола (12 штук)
            for (let i = 0; i < 12; i++) {
                const plateAngle = (i * Math.PI * 2) / 12;
                const plateZ = -barrelLength * 0.25 + (i % 6) * barrelLength * 0.4;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(plateAngle) * barrelWidth * 0.42,
                        Math.sin(plateAngle) * barrelWidth * 0.42,
                        plateZ
                    ),
                    plateAngle,
                    barrelWidth * 0.12, barrelWidth * 0.08, barrelWidth * 0.12,
                    railMat, `previewRailgunPlate${i}`
                );
            }
            
            // Ребра охлаждения (10 штук, короткие, перпендикулярно стволу)
            for (let i = 0; i < 10; i++) {
                const finAngle = (i * Math.PI * 2) / 10;
                const finZ = -barrelLength * 0.2 + (i % 5) * barrelLength * 0.4;
                CannonDetailsGenerator.createCoolingFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(finAngle) * barrelWidth * 0.4,
                        Math.sin(finAngle) * barrelWidth * 0.4,
                        finZ
                    ),
                    finAngle,
                    barrelWidth * 0.14, barrelWidth * 0.1, barrelWidth * 0.05,
                    railMat, `previewRailgunFin${i}`
                );
            }
            
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
            barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth * 1.8, height: barrelLength * 0.9, depth: barrelWidth * 1.8 }, scene);
            
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
            barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth * 2.2, height: barrelLength * 0.75, depth: barrelWidth * 2.2 }, scene);
            
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
            // ИСПРАВЛЕНИЕ: height должен быть barrelWidth, а не barrelLength (иначе ствол вертикальный!)
            barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth * 1.0, height: barrelWidth * 1.0, depth: barrelLength * 1.0 }, scene);
            const standardBreechMat = MaterialFactory.createBasicMaterial(scene, cannonColor.scale(0.7), "previewStandardBreech");
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.4),
                barrelWidth * 1.3, barrelWidth * 1.3, barrelWidth * 0.8,
                cannonColor.scale(0.7),
                "preview"
            );
            // Дульный тормоз (2 слоя)
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createStandardMuzzle(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.5),
                    i, barrelWidth * 1.1, barrelWidth * 0.1,
                    barrelWidth * 0.15,
                    standardBreechMat, "preview"
                );
            }
            // Защитный кожух ствола
            CannonDetailsGenerator.createStandardShield(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.4, barrelLength * 0.1),
                barrelWidth * 1.1, barrelWidth * 0.3, barrelLength * 0.6,
                standardBreechMat, "preview"
            );
            // Стабилизаторы (4 штуки)
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3((i === 0 || i === 2 ? -1 : 1) * barrelWidth * 0.5, 0, barrelLength * 0.1),
                    barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.25,
                    standardBreechMat, `previewStandardStabilizer${i}`
                );
            }
            break;
        case "mortar":
        // Mortar - Прототип: Миномет / 2Б9 Василек
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 2.5,
            height: barrelWidth * 2.5,
            depth: barrelLength * 0.6
        }, scene);
        
        const mortarBaseMat = MaterialFactory.createBasicMaterial(scene, cannonColor.scale(0.6), "previewMortarBase");
        for (let i = 0; i < 3; i++) {
            CannonDetailsGenerator.createMortarBaseLayer(
                scene, barrel,
                new Vector3(0, -barrelWidth * 0.7, 0),
                i, barrelWidth * 2.4, barrelWidth * 0.2,
                mortarBaseMat, "preview"
            );
        }
        
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3;
            CannonDetailsGenerator.createMortarLeg(
                scene, barrel,
                new Vector3(
                    Math.cos(angle) * barrelWidth * 0.95,
                    -barrelWidth * 0.95,
                    Math.sin(angle) * barrelWidth * 0.25
                ),
                angle,
                barrelWidth * 0.18, barrelWidth * 0.45, barrelWidth * 0.18,
                mortarBaseMat, `previewMortarLeg${i}`
            );
        }
        
        for (let i = 0; i < 2; i++) {
            // Усилители миномета - короткие детали вместо длинных вертикальных
            for (let j = 0; j < 4; j++) {
                const zOffset = (j % 2) * barrelWidth * 0.4;
                CannonDetailsGenerator.createMortarReinforcement(
                    scene, barrel,
                    new Vector3(barrelWidth * 1.05, 0, 0),
                    (i === 0 ? -1 : 1), zOffset,
                    barrelWidth * 0.3, barrelWidth * 0.3, barrelWidth * 0.3,
                    mortarBaseMat, `previewMortarReinforcement${i}_${j}`
                );
            }
        }
        break;
        case "cluster":
        // Cluster - Прототип: РСЗО / Катюша
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.8, 
            height: barrelWidth * 1.8, 
            depth: barrelLength * 1.1 
        }, scene);
        
        const clusterTubeMat = MaterialFactory.createBasicMaterial(scene, cannonColor.scale(0.9), "previewClusterTube");
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2 / 6);
            CannonDetailsGenerator.createClusterTube(
                scene, barrel,
                new Vector3(
                    Math.cos(angle) * barrelWidth * 0.5,
                    Math.sin(angle) * barrelWidth * 0.5,
                    0
                ),
                angle,
                barrelWidth * 0.35, barrelWidth * 0.35, barrelLength * 0.9,
                clusterTubeMat, `previewClusterTube${i}`
            );
        }
        
        CannonDetailsGenerator.createClusterCenterTube(
            scene, barrel,
            new Vector3(0, 0, 0),
            barrelWidth * 0.4, barrelWidth * 0.4, barrelLength * 0.95,
            barrel.material as StandardMaterial, "preview"
        );
        
        // Стабилизаторы кластера - короткие детали вместо длинных вертикальных
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2 / 8) + Math.PI / 8;
            const zOffset = (i % 4) * barrelWidth * 0.3;
            CannonDetailsGenerator.createStabilizer(
                scene, barrel,
                new Vector3(
                    Math.cos(angle) * barrelWidth * 0.75,
                    Math.sin(angle) * barrelWidth * 0.75,
                    barrelLength * 0.1 + zOffset
                ),
                barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.25,
                barrel.material as StandardMaterial, `previewClusterStabilizer${i}`
            );
        }
        break;
        case "explosive":
        // Explosive - Прототип: ИСУ-152 / МЛ-20
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.6,
            height: barrelWidth * 1.6,
            depth: barrelLength * 1.0
        }, scene);
        
        const explosiveBreechMat = MaterialFactory.createBasicMaterial(scene, cannonColor.scale(0.7), "previewExplosiveBreech");
        CannonDetailsGenerator.createBreech(
            scene, barrel,
            new Vector3(0, 0, -barrelLength * 0.5),
            barrelWidth * 1.9, barrelWidth * 1.9, barrelWidth * 1.3,
            cannonColor.scale(0.7),
            "preview"
        );
        
        CannonDetailsGenerator.createExplosiveMuzzle(
            scene, barrel,
            new Vector3(0, 0, barrelLength * 0.5),
            barrelWidth * 1.6, barrelWidth * 0.5, barrelWidth * 1.6,
            explosiveBreechMat, "preview"
        );
        
        for (let i = 0; i < 4; i++) {
            // Каналы взрывной пушки - короткие детали вместо длинных вертикальных
            const angle = (i * Math.PI * 2) / 4;
            CannonDetailsGenerator.createExplosiveChannel(
                scene, barrel,
                new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.65,
                    barrelLength * 0.05
                ),
                angle,
                barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.3,
                explosiveBreechMat, `previewExplosiveChannel${i}`
            );
        }
        break;
        
        // === SPECIAL EFFECT WEAPONS ===            break;
        case "flamethrower":
        // Flamethrower - Прототип: Огнемет / РПО-А
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.6,
            height: barrelWidth * 1.6,
            depth: barrelLength * 0.8
        }, scene);
        
        const nozzleMat = new StandardMaterial("flamethrowerNozzleMat", scene);
        nozzleMat.diffuseColor = new Color3(0.7, 0.25, 0);
        nozzleMat.emissiveColor = new Color3(0.25, 0.08, 0);
        for (let j = 0; j < 4; j++) {
            CannonDetailsGenerator.createFlamethrowerNozzle(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.45),
                j, barrelWidth * 1.0, barrelWidth * 0.1,
                barrelLength * 0.1,
                nozzleMat, "preview"
            );
        }
        
        const flamethrowerTankMat = MaterialFactory.createBasicMaterial(scene, cannonColor.scale(0.8), "previewFlamethrowerTank");
        for (let i = 0; i < 2; i++) {
            CannonDetailsGenerator.createFlamethrowerTank(
                scene, barrel,
                new Vector3(barrelWidth * 0.6, 0, -barrelLength * 0.1),
                (i === 0 ? -1 : 1),
                barrelWidth * 0.4, barrelWidth * 0.4, barrelLength * 0.7,
                flamethrowerTankMat, `previewFlamethrowerTank${i}`
            );
            
            CannonDetailsGenerator.createFlamethrowerVent(
                scene, barrel,
                new Vector3(barrelWidth * 0.6, barrelWidth * 0.25, -barrelLength * 0.15),
                (i === 0 ? -1 : 1),
                barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.08,
                flamethrowerTankMat, `previewFlamethrowerVent${i}`
            );
        }
        
        for (let i = 0; i < 2; i++) {
            CannonDetailsGenerator.createFlamethrowerHose(
                scene, barrel,
                new Vector3(barrelWidth * 0.35, barrelWidth * 0.25, barrelLength * 0.1),
                (i === 0 ? -1 : 1),
                barrelWidth * 0.1, barrelWidth * 0.5, barrelWidth * 0.1,
                (i === 0 ? 1 : -1) * Math.PI / 8,
                nozzleMat, `previewFlamethrowerHose${i}`
            );
        }
        break;
        case "acid":
        // Acid - Прототип: Химический распылитель
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.2,
            height: barrelWidth * 1.2,
            depth: barrelLength * 1.0
        }, scene);
        
        const acidTankMat = new StandardMaterial("acidTankMat", scene);
        acidTankMat.diffuseColor = new Color3(0.15, 0.7, 0.15);
        acidTankMat.emissiveColor = new Color3(0.05, 0.3, 0.05);
        CannonDetailsGenerator.createAcidTank(
            scene, barrel,
            new Vector3(0, barrelWidth * 0.6, -barrelLength * 0.3),
            barrelWidth * 1.0, barrelWidth * 1.8, barrelWidth * 1.0,
            acidTankMat, "preview"
        );
        
        CannonDetailsGenerator.createAcidVent(
            scene, barrel,
            new Vector3(0, barrelWidth * 1.0, -barrelLength * 0.3),
            barrelWidth * 0.1, barrelWidth * 0.1, barrelWidth * 0.1,
            acidTankMat, "preview"
        );
        
        const indicatorMat = new StandardMaterial("acidIndicatorMat", scene);
        indicatorMat.diffuseColor = new Color3(0, 1, 0);
        indicatorMat.emissiveColor = new Color3(0, 0.5, 0);
        CannonDetailsGenerator.createAcidIndicator(
            scene, barrel,
            new Vector3(barrelWidth * 0.5, barrelWidth * 0.4, -barrelLength * 0.3),
            barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.05,
            indicatorMat, "preview"
        );
        
        for (let i = 0; i < 3; i++) {
            CannonDetailsGenerator.createAcidChannel(
                scene, barrel,
                new Vector3(
                    (i - 1) * barrelWidth * 0.25,
                    barrelWidth * 0.15,
                    barrelLength * 0.1
                ),
                barrelWidth * 0.15, barrelWidth * 0.15, barrelLength * 0.6,
                acidTankMat, `previewAcidChannel${i}`
            );
        }
        
        for (let j = 0; j < 3; j++) {
            CannonDetailsGenerator.createAcidSprayer(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.5),
                j, barrelWidth * 1.3, barrelWidth * 0.1,
                barrelWidth * 0.1,
                acidTankMat, "preview"
            );
        }
        break;
        case "freeze":
        // Freeze - Прототип: Криогенная установка
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.2,
            height: barrelWidth * 1.2,
            depth: barrelLength * 1.0
        }, scene);
        
        // Ребра замораживателя - короткие детали вместо длинных вертикальных
        const freezeFinMat = new StandardMaterial("freezeFinMat", scene);
        freezeFinMat.diffuseColor = new Color3(0.4, 0.6, 0.9);
        freezeFinMat.emissiveColor = new Color3(0.08, 0.15, 0.25);
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2 / 8);
            const zOffset = (i % 4) * barrelWidth * 0.3;
            CannonDetailsGenerator.createCoolingFin(
                scene, barrel,
                new Vector3(
                    Math.cos(angle) * barrelWidth * 0.55,
                    Math.sin(angle) * barrelWidth * 0.55,
                    -barrelLength * 0.2 + zOffset
                ),
                angle,
                barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.4,
                freezeFinMat, `previewFreezeFin${i}`
            );
        }
        
        const cryoMat = new StandardMaterial("cryoTankMat", scene);
        cryoMat.diffuseColor = new Color3(0.25, 0.5, 0.9);
        cryoMat.emissiveColor = new Color3(0.08, 0.15, 0.3);
        CannonDetailsGenerator.createCryoTank(
            scene, barrel,
            new Vector3(0, barrelWidth * 0.45, -barrelLength * 0.3),
            barrelWidth * 0.7, barrelWidth * 0.6, barrelWidth * 0.7,
            cryoMat, "preview"
        );
        
        CannonDetailsGenerator.createCryoVent(
            scene, barrel,
            new Vector3(0, barrelWidth * 0.75, -barrelLength * 0.3),
            barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.08,
            cryoMat, "preview"
        );
        
        for (let j = 0; j < 3; j++) {
            CannonDetailsGenerator.createFreezeEmitter(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.5),
                j, barrelWidth * 1.3, barrelWidth * 0.1,
                barrelWidth * 0.13,
                cryoMat, "preview"
            );
        }
        break;
        case "poison":
        // Poison - Прототип: Химический инжектор
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.1,
            height: barrelWidth * 1.1,
            depth: barrelLength * 0.95
        }, scene);
        
        const poisonTankMat = new StandardMaterial("poisonTankMat", scene);
        poisonTankMat.diffuseColor = new Color3(0.3, 0.7, 0.15);
        poisonTankMat.emissiveColor = new Color3(0.15, 0.35, 0.08);
        CannonDetailsGenerator.createPoisonTank(
            scene, barrel,
            new Vector3(0, barrelWidth * 0.4, -barrelLength * 0.25),
            barrelWidth * 0.6, barrelWidth * 1.2, barrelWidth * 0.6,
            poisonTankMat, "preview"
        );
        
        CannonDetailsGenerator.createPoisonVent(
            scene, barrel,
            new Vector3(0, barrelWidth * 0.7, -barrelLength * 0.25),
            barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.08,
            poisonTankMat, "preview"
        );
        
        for (let j = 0; j < 3; j++) {
            CannonDetailsGenerator.createPoisonInjector(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.45),
                j, barrelWidth * 0.5, barrelWidth * 0.05,
                barrelWidth * 0.2,
                poisonTankMat, "preview"
            );
        }
        
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI * 2) / 4;
            CannonDetailsGenerator.createPoisonNeedle(
                scene, barrel,
                new Vector3(
                    Math.cos(angle) * barrelWidth * 0.25,
                    Math.sin(angle) * barrelWidth * 0.25,
                    barrelLength * 0.5
                ),
                angle,
                barrelWidth * 0.06, barrelWidth * 0.3, barrelWidth * 0.06,
                poisonTankMat, `previewPoisonNeedle${i}`
            );
        }
        
        // Каналы яда - короткие детали вместо длинных вертикальных
        for (let i = 0; i < 4; i++) {
            const side = i < 2 ? -1 : 1;
            const zOffset = (i % 2) * barrelWidth * 0.35;
            CannonDetailsGenerator.createPoisonChannel(
                scene, barrel,
                new Vector3(barrelWidth * 0.3, barrelWidth * 0.15, barrelLength * 0.1),
                side, zOffset,
                barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.3,
                poisonTankMat, `previewPoisonChannel${i}`
            );
        }
        break;
        case "emp":
        // EMP - Прототип: ЭМИ излучатель
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.6,
            height: barrelWidth * 1.6,
            depth: barrelLength * 1.0
        }, scene);
        
        const empDishMat = new StandardMaterial("empDishMat", scene);
        empDishMat.diffuseColor = new Color3(0.7, 0.7, 0.15);
        empDishMat.emissiveColor = new Color3(0.3, 0.3, 0.08);
        CannonDetailsGenerator.createEMPDish(
            scene, barrel,
            new Vector3(0, 0, barrelLength * 0.5),
            barrelWidth * 1.8, barrelWidth * 0.3, barrelWidth * 1.8,
            empDishMat, "preview"
        );
        
        for (let i = 0; i < 3; i++) {
            const ringSize = barrelWidth * 1.3;
            const ringThickness = barrelWidth * 0.1;
            const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
            CannonDetailsGenerator.createRing(
                scene, barrel,
                new Vector3(0, 0, ringZ),
                ringSize, ringThickness,
                empDishMat, `previewEMPRing${i}`
            );
        }
        
        const empGenMat = new StandardMaterial("empGenMat", scene);
        empGenMat.diffuseColor = new Color3(0.9, 0.9, 0.25);
        empGenMat.emissiveColor = new Color3(0.4, 0.4, 0.12);
        empGenMat.disableLighting = true;
        CannonDetailsGenerator.createGenerator(
            scene, barrel,
            new Vector3(0, 0, -barrelLength * 0.4),
            barrelWidth * 0.7, 3, barrelWidth * 0.05,
            empGenMat, "previewEMPGen"
        );
        break;
        
        // === MULTI-SHOT WEAPONS ===            break;
        case "multishot":
        // Multishot - Прототип: Трехствольная пушка
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 2.2, 
            height: barrelWidth * 1.6, 
            depth: barrelLength * 1.0 
        }, scene);
        
        const multishotBarrelMat = MaterialFactory.createBasicMaterial(scene, cannonColor.scale(0.9), "previewMultishotBarrel");
        for (let i = 0; i < 3; i++) {
            CannonDetailsGenerator.createMultishotBarrel(
                scene, barrel,
                new Vector3((i - 1) * barrelWidth * 0.55, 0, 0),
                barrelWidth * 0.5, barrelWidth * 0.5, barrelLength * 1.05,
                multishotBarrelMat, `previewMultishotBarrel${i}`
            );
        }
        
        CannonDetailsGenerator.createMultishotConnector(
            scene, barrel,
            new Vector3(0, 0, -barrelLength * 0.4),
            barrelWidth * 1.9, barrelWidth * 0.9, barrelWidth * 0.7,
            barrel.material as StandardMaterial, "preview"
        );
        
        // Стабилизаторы мульти-выстрела - короткие детали вместо длинных вертикальных
        for (let i = 0; i < 4; i++) {
            const side = i < 2 ? -1 : 1;
            const zOffset = (i % 2) * barrelWidth * 0.4;
            CannonDetailsGenerator.createStabilizer(
                scene, barrel,
                new Vector3(side * barrelWidth * 0.25, 0, barrelLength * 0.1 + zOffset),
                barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                barrel.material as StandardMaterial, `previewMultishotStabilizer${i}`
            );
        }
        break;
        
        // === ADVANCED WEAPONS ===            break;
        case "homing":
        // Homing - Прототип: ПТУР / Конкурс
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.3,
            height: barrelWidth * 1.3,
            depth: barrelLength * 1.0
        }, scene);
        
        const homingGuidanceMat = new StandardMaterial("homingGuidanceMat", scene);
        homingGuidanceMat.diffuseColor = new Color3(0.08, 0.8, 0.08);
        homingGuidanceMat.emissiveColor = new Color3(0.03, 0.35, 0.03);
        
        CannonDetailsGenerator.createHomingGuidance(
            scene, barrel,
            new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.2),
            barrelWidth * 0.75, barrelWidth * 0.55, barrelWidth * 0.75,
            homingGuidanceMat, "preview"
        );
        
        CannonDetailsGenerator.createHomingControl(
            scene, barrel,
            new Vector3(0, barrelWidth * 0.85, -barrelLength * 0.2),
            barrelWidth * 0.5, barrelWidth * 0.3, barrelWidth * 0.5,
            homingGuidanceMat, "preview"
        );
        
        for (let i = 0; i < 2; i++) {
            CannonDetailsGenerator.createHomingAntenna(
                scene, barrel,
                new Vector3(barrelWidth * 0.45, barrelWidth * 0.75, -barrelLength * 0.15),
                (i === 0 ? -1 : 1),
                barrelWidth * 0.08, barrelWidth * 0.35, barrelWidth * 0.08,
                homingGuidanceMat, `previewHomingAntenna${i}`
            );
        }
        
        // Стабилизаторы самонаведения - короткие детали вместо длинных вертикальных
        for (let i = 0; i < 4; i++) {
            const side = i < 2 ? -1 : 1;
            const zOffset = (i % 2) * barrelWidth * 0.35;
            CannonDetailsGenerator.createStabilizer(
                scene, barrel,
                new Vector3(side * barrelWidth * 0.55, 0, barrelLength * 0.1 + zOffset),
                barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                homingGuidanceMat, `previewHomingStabilizer${i}`
            );
        }
        break;
        case "piercing":
        // Piercing - Прототип: Бронебойная пушка / БС-3
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 0.55,
            height: barrelWidth * 0.55,
            depth: barrelLength * 1.8
        }, scene);
        
        const piercingTipMat = new StandardMaterial("piercingTipMat", scene);
        piercingTipMat.diffuseColor = new Color3(0.85, 0.85, 0.85);
        piercingTipMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        for (let j = 0; j < 4; j++) {
            CannonDetailsGenerator.createPiercingTip(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.7),
                j, barrelWidth * 0.3, barrelWidth * 0.05,
                barrelLength * 0.075,
                piercingTipMat, "preview"
            );
        }
        
        // Короткие детали вокруг ствола вместо вертикальных кондуитов
        // Кольца вокруг ствола (6 штук)
        for (let i = 0; i < 6; i++) {
            const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.4;
            const ringSize = barrelWidth * 0.7;
            const ringThickness = barrelWidth * 0.05;
            CannonDetailsGenerator.createRing(
                scene, barrel,
                new Vector3(0, 0, ringZ),
                ringSize, ringThickness,
                barrel.material as StandardMaterial, `previewPiercingRing${i}`
            );
        }
        
        // Маленькие пластины/ребра жесткости вокруг ствола (10 штук)
        for (let i = 0; i < 10; i++) {
            const plateAngle = (i * Math.PI * 2) / 10;
            const plateZ = -barrelLength * 0.2 + (i % 5) * barrelLength * 0.4;
            CannonDetailsGenerator.createPlate(
                scene, barrel,
                new Vector3(
                    Math.cos(plateAngle) * barrelWidth * 0.38,
                    Math.sin(plateAngle) * barrelWidth * 0.38,
                    plateZ
                ),
                plateAngle,
                barrelWidth * 0.1, barrelWidth * 0.07, barrelWidth * 0.1,
                barrel.material as StandardMaterial, `previewPiercingPlate${i}`
            );
        }
        
        // Ребра охлаждения (8 штук, короткие, перпендикулярно стволу)
        for (let i = 0; i < 8; i++) {
            const finAngle = (i * Math.PI * 2) / 8;
            const finZ = -barrelLength * 0.15 + (i % 4) * barrelLength * 0.5;
            CannonDetailsGenerator.createCoolingFin(
                scene, barrel,
                new Vector3(
                    Math.cos(finAngle) * barrelWidth * 0.36,
                    Math.sin(finAngle) * barrelWidth * 0.36,
                    finZ
                ),
                finAngle,
                barrelWidth * 0.13, barrelWidth * 0.09, barrelWidth * 0.04,
                barrel.material as StandardMaterial, `previewPiercingFin${i}`
            );
        }
        
        for (let i = 0; i < 3; i++) {
            const ringSize = barrelWidth * 0.75;
            const ringThickness = barrelWidth * 0.06;
            const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
            CannonDetailsGenerator.createRing(
                scene, barrel,
                new Vector3(0, 0, ringZ),
                ringSize, ringThickness,
                barrel.material as StandardMaterial, `previewPiercingRing${i}`
            );
        }
        break;
        case "shockwave":
        // Shockwave - Прототип: Ударная волна
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 2.2,
            height: barrelWidth * 2.2,
            depth: barrelLength * 0.85
        }, scene);
        
        const shockwaveAmpMat = new StandardMaterial("shockwaveAmpMat", scene);
        shockwaveAmpMat.diffuseColor = cannonColor.scale(0.8);
        shockwaveAmpMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
        for (let j = 0; j < 3; j++) {
            CannonDetailsGenerator.createShockwaveAmplifier(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.45),
                j, barrelWidth * 2.2, barrelWidth * 0.1,
                barrelWidth * 0.2,
                shockwaveAmpMat, "preview"
            );
        }
        
        // УБРАНЫ длинные вертикальные эмиттеры - заменены на короткие горизонтальные детали
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6;
            const zOffset = (i % 3) * barrelWidth * 0.15;
            CannonDetailsGenerator.createShockwaveEmitter(
                scene, barrel,
                new Vector3(barrelWidth * 0.85, barrelWidth * 0.85, barrelLength * 0.1),
                angle, zOffset,
                barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                shockwaveAmpMat, `previewShockwaveEmitter${i}`
            );
        }
        
        CannonDetailsGenerator.createGenerator(
            scene, barrel,
            new Vector3(0, 0, -barrelLength * 0.35),
            barrelWidth * 0.8, 2, barrelWidth * 0.1,
            shockwaveAmpMat, "previewShockwaveGen"
        );
        break;
        case "beam":
        // Beam - Прототип: Лучовая пушка
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 0.85,
            height: barrelWidth * 0.85,
            depth: barrelLength * 1.6
        }, scene);
        
        const beamFocuserMat = new StandardMaterial("beamFocuserMat", scene);
        beamFocuserMat.diffuseColor = new Color3(0.9, 0.4, 0);
        beamFocuserMat.emissiveColor = new Color3(0.35, 0.15, 0);
        beamFocuserMat.disableLighting = true;
        for (let j = 0; j < 4; j++) {
            CannonDetailsGenerator.createBeamFocuser(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.65),
                j, barrelWidth * 0.9, barrelWidth * 0.05,
                barrelWidth * 0.125,
                beamFocuserMat, "preview"
            );
        }
        
        for (let i = 0; i < 3; i++) {
            CannonDetailsGenerator.createBeamLens(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.25 + i * barrelLength * 0.15),
                barrelWidth * 0.85, barrelWidth * 0.2, barrelWidth * 0.85,
                beamFocuserMat, `previewBeamLens${i}`
            );
        }
        
        // Короткие детали вокруг ствола вместо вертикальных каналов
        // Кольца вокруг ствола (5 штук)
        for (let i = 0; i < 5; i++) {
            const ringZ = -barrelLength * 0.2 + i * barrelLength * 0.35;
            const ringSize = barrelWidth * 1.05;
            const ringThickness = barrelWidth * 0.06;
            CannonDetailsGenerator.createRing(
                scene, barrel,
                new Vector3(0, 0, ringZ),
                ringSize, ringThickness,
                beamFocuserMat, `previewBeamRing${i}`
            );
        }
        
        // Маленькие пластины/ребра жесткости вокруг ствола (10 штук)
        for (let i = 0; i < 10; i++) {
            const plateAngle = (i * Math.PI * 2) / 10;
            const plateZ = -barrelLength * 0.15 + (i % 5) * barrelLength * 0.3;
            CannonDetailsGenerator.createPlate(
                scene, barrel,
                new Vector3(
                    Math.cos(plateAngle) * barrelWidth * 0.5,
                    Math.sin(plateAngle) * barrelWidth * 0.5,
                    plateZ
                ),
                plateAngle,
                barrelWidth * 0.12, barrelWidth * 0.08, barrelWidth * 0.12,
                beamFocuserMat, `previewBeamPlate${i}`
            );
        }
        
        // Ребра охлаждения (8 штук, короткие, перпендикулярно стволу)
        for (let i = 0; i < 8; i++) {
            const finAngle = (i * Math.PI * 2) / 8;
            const finZ = -barrelLength * 0.1 + (i % 4) * barrelLength * 0.4;
            CannonDetailsGenerator.createCoolingFin(
                scene, barrel,
                new Vector3(
                    Math.cos(finAngle) * barrelWidth * 0.48,
                    Math.sin(finAngle) * barrelWidth * 0.48,
                    finZ
                ),
                finAngle,
                barrelWidth * 0.15, barrelWidth * 0.1, barrelWidth * 0.05,
                beamFocuserMat, `previewBeamFin${i}`
            );
        }
        break;
        case "vortex":
        // Vortex - Прототип: Вихревой генератор
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.7,
            height: barrelWidth * 1.7,
            depth: barrelLength * 1.0
        }, scene);
        
        const vortexRingMat = new StandardMaterial("vortexRingMat", scene);
        vortexRingMat.diffuseColor = new Color3(0.4, 0.15, 0.7);
        vortexRingMat.emissiveColor = new Color3(0.15, 0.08, 0.3);
        for (let i = 0; i < 5; i++) {
            const ringSize = barrelWidth * (1.2 + i * 0.15);
            const ringThickness = barrelWidth * 0.12;
            const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.15;
            CannonDetailsGenerator.createRing(
                scene, barrel,
                new Vector3(0, 0, ringZ),
                ringSize, ringThickness,
                vortexRingMat, `previewVortexRing${i}`
            );
        }
        
        const vortexGenMat = new StandardMaterial("vortexGenMat", scene);
        vortexGenMat.diffuseColor = new Color3(0.5, 0.25, 0.9);
        vortexGenMat.emissiveColor = new Color3(0.25, 0.12, 0.4);
        vortexGenMat.disableLighting = true;
        CannonDetailsGenerator.createGenerator(
            scene, barrel,
            new Vector3(0, 0, -barrelLength * 0.4),
            barrelWidth * 0.7, 3, barrelWidth * 0.05,
            vortexGenMat, "previewVortexGen"
        );
        break;
        case "support":
        // Support - Прототип: Ремонтный луч
        barrel = MeshBuilder.CreateBox("barrel", { 
            width: barrelWidth * 1.3,
            height: barrelWidth * 1.3,
            depth: barrelLength * 1.0
        }, scene);
        
        const supportEmitterMat = new StandardMaterial("supportEmitterMat", scene);
        supportEmitterMat.diffuseColor = new Color3(0, 0.9, 0.45);
        supportEmitterMat.emissiveColor = new Color3(0, 0.35, 0.18);
        supportEmitterMat.disableLighting = true;
        for (let j = 0; j < 4; j++) {
            CannonDetailsGenerator.createSupportEmitter(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.15),
                j, barrelWidth * 0.9, barrelWidth * 0.05,
                barrelWidth * 0.15,
                supportEmitterMat, "preview"
            );
        }
        
        for (let i = 0; i < 3; i++) {
            const ringSize = barrelWidth * (0.9 + i * 0.15);
            const ringThickness = barrelWidth * 0.1;
            const ringZ = -barrelLength * 0.15 + i * barrelLength * 0.15;
            CannonDetailsGenerator.createRing(
                scene, barrel,
                new Vector3(0, 0, ringZ),
                ringSize, ringThickness,
                supportEmitterMat, `previewSupportRing${i}`
            );
        }
        
        CannonDetailsGenerator.createGenerator(
            scene, barrel,
            new Vector3(0, 0, -barrelLength * 0.35),
            barrelWidth * 0.6, 2, barrelWidth * 0.05,
            supportEmitterMat, "previewRepairGen"
        );
        break;

        default:
            barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth, height: barrelWidth, depth: barrelLength }, scene);
            break;
    }
    
    const baseBarrelZ = (cannonType.barrelLength || 2) / 2;
    barrel.position.z = baseBarrelZ;
    barrel.position.y = 0;
    
    // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что ствол смотрит прямо (не вверх)
    barrel.rotation.x = 0;
    barrel.rotation.y = 0;
    barrel.rotation.z = 0;
    
    const barrelMat = new StandardMaterial("previewBarrelMat", scene);
    barrelMat.diffuseColor = cannonColor;
    barrelMat.specularColor = Color3.Black();
    barrel.material = barrelMat;
    
    return barrel;
}
