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
                previewScene.camera.detachControls();
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
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    
    // Используем MaterialFactory для создания материалов
    const armorMat = MaterialFactory.createArmorMaterial(scene, baseColor, "preview");
    const accentMat = MaterialFactory.createAccentMaterial(scene, baseColor, "preview");
    
    switch (chassisType.id) {
    case "light":
        // Light - Прототип: БТ-7 - Наклонная лобовая броня, воздухозаборники, спойлер
        // Наклонная лобовая плита (угол 60°)
        ChassisDetailsGenerator.createSlopedArmor(
            scene, chassis,
            new Vector3(0, h * 0.15, d * 0.52),
            w * 0.88, h * 0.6, 0.2,
            -Math.PI / 6, armorMat, "previewLight"
        );
        
        // Воздухозаборники (угловатые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createIntake(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45),
                0.3, h * 0.65, 0.35,
                accentMat, `previewLight${i}`
            );
        }
        
        // Задний спойлер (угловатый)
        ChassisDetailsGenerator.createSpoiler(
            scene, chassis,
            new Vector3(0, h * 0.5, -d * 0.48),
            w * 1.2, 0.2, 0.25,
            accentMat, "previewLight"
        );
        
        // Боковые обтекатели (угловатые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createFairing(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.5, 0, d * 0.2),
                0.15, h * 0.75, d * 0.55,
                accentMat, `previewLight${i}`
            );
        }
        
        // Люки на крыше (2 штуки)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.48, -d * 0.1),
                0.2, 0.08, 0.2,
                armorMat, `previewLight${i}`
            );
        }
        
        // Выхлопная труба сзади
        ChassisDetailsGenerator.createExhaust(
            scene, chassis,
            new Vector3(w * 0.35, h * 0.2, -d * 0.48),
            0.15, 0.15, 0.2,
            armorMat, "previewLight"
        );
        
        // Фары спереди (маленькие, угловатые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.5),
                0.08, 0.08, 0.06,
                i, "previewLight"
            );
        }
        
        // Инструменты: лопата и топор на корме
        ChassisDetailsGenerator.createShovel(
            scene, chassis,
            new Vector3(-w * 0.4, h * 0.2, -d * 0.48),
            0.12, 0.3, 0.02,
            armorMat, "previewLight"
        );
        
        ChassisDetailsGenerator.createAxe(
            scene, chassis,
            new Vector3(-w * 0.3, h * 0.25, -d * 0.48),
            0.25, 0.08, 0.02,
            armorMat, "previewLight"
        );
        
        // Вентиляционные решетки по бокам (улучшенные)
        for (let i = 0; i < 2; i++) {
            const ventPos = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1);
            ChassisDetailsGenerator.createVent(
                scene, chassis, ventPos,
                0.05, 0.12, 0.15,
                i, "previewLight"
            );
            
            // Детали решетки
            const ventMat = MaterialFactory.createVentMaterial(scene, i, "previewLight");
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, ventPos,
                3, 0.03, 0.1, 0.02, 0.05,
                i, ventMat, "previewLight"
            );
        }
        
        // Перископ на люке
        ChassisDetailsGenerator.createPeriscope(
            scene, chassis,
            new Vector3(0, h * 0.55, -d * 0.1),
            0.15, 0.06,
            0, "previewLight"
        );
        
        // Дополнительная оптика - бинокль на корпусе
        ChassisDetailsGenerator.createBinocular(
            scene, chassis,
            new Vector3(0, h * 0.48, d * 0.4),
            0.2, 0.08, 0.12,
            "previewLight"
        );
        
        // Дополнительные броневые накладки на лобовой части
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3((i - 1) * w * 0.25, h * 0.05, d * 0.48),
                w * 0.25, h * 0.15, 0.08,
                armorMat, `previewLight${i}`
            );
        }
        
        // Верхние вентиляционные решетки на крыше (улучшенные)
        for (let i = 0; i < 3; i++) {
            const roofVentPos = new Vector3((i - 1) * w * 0.3, h * 0.47, d * 0.2);
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis, roofVentPos,
                0.2, 0.05, 0.15,
                i, "previewLight"
            );
            
            // Детали решетки
            const roofVentMat = MaterialFactory.createRoofVentMaterial(scene, i, "previewLight");
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, roofVentPos,
                5, 0.02, 0.04, 0.13, 0.04,
                i, roofVentMat, "previewLightRoof"
            );
        }
        
        // Радиоантенна сзади
        ChassisDetailsGenerator.createAntenna(
            scene, chassis,
            new Vector3(0, h * 0.6, -d * 0.4),
            0.4, 0.02,
            "previewLight"
        );
        
        // Основание антенны
        ChassisDetailsGenerator.createAntennaBase(
            scene, chassis,
            new Vector3(0, h * 0.52, -d * 0.4),
            0.08,
            armorMat, "previewLight"
        );
        
        // Боковые броневые экраны
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createArmorScreen(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, d * 0.05),
                0.12, h * 0.5, d * 0.3,
                0, armorMat, `previewLight${i}`
            );
        }
        
        // Дополнительные фары на боковых панелях
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createSideLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, -d * 0.2),
                0.06, 0.06, 0.04,
                i, "previewLight"
            );
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, -d * 0.49),
                0.05, 0.08, 0.03,
                i, "previewLight"
            );
        }
        break;
    case "scout": 
        // Scout - Прототип: Т-70 - Острый клиновидный нос, минимальный профиль
        // Острый клиновидный нос (угол 45°)
        ChassisDetailsGenerator.createSlopedArmor(
            scene, chassis,
            new Vector3(0, 0, d * 0.5),
            w * 0.8, h * 0.7, 0.4,
            -Math.PI / 4, accentMat, "previewScout"
        );
        
        // Боковые крылья (угловатые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createWing(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.48, -h * 0.05, d * 0.3),
                0.15, h * 0.85, d * 0.6,
                accentMat, `previewScout${i}`
            );
        }
        
        // Задний диффузор (угловатый)
        ChassisDetailsGenerator.createDiffuser(
            scene, chassis,
            new Vector3(0, -h * 0.42, -d * 0.45),
            w * 0.9, 0.15, 0.2,
            accentMat, "previewScout"
        );
        
        // Один люк на крыше
        ChassisDetailsGenerator.createHatch(
            scene, chassis,
            new Vector3(0, h * 0.42, 0),
            0.18, 0.06, 0.18,
            armorMat, "previewScout"
        );
        
        // Радиоантенна на корме (угловатая)
        ChassisDetailsGenerator.createAntenna(
            scene, chassis,
            new Vector3(0, h * 0.45, -d * 0.45),
            0.3, 0.02,
            "previewScout"
        );
        
        // Две фары (очень маленькие, скрытые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48),
                0.06, 0.06, 0.04,
                i, "previewScout"
            );
        }
        
        // Скрытые вентиляционные решетки
        for (let i = 0; i < 2; i++) {
            const vent = MeshBuilder.CreateBox(`previewScoutVent${i}`, { width: 0.04, height: 0.08, depth: 0.12 }, scene);
            vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.05,
                    d * 0.15
                ), "x");
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`previewScoutVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
            vent.material = ventMat;
            
            // Детали решетки
            for (let j = 0; j < 3; j++) {
                const ventBar = MeshBuilder.CreateBox(`previewScoutVentBar${i}_${j}`, { width: 0.02, height: 0.06, depth: 0.1 }, scene);
                ventBar.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.05,
                    d * 0.15 + (j - 1) * 0.04
                ), "x");
                ventBar.parent = chassis;
                ventBar.material = ventMat;
            }
        }
        
        // Перископ на люке
        const scoutPeriscope = MeshBuilder.CreateBox("previewScoutPeriscope", { width: 0.05, height: 0.12, depth: 0.05 }, scene);
        scoutPeriscope.position = addZFightingOffset(new Vector3(0, h * 0.5, 0), "up");
        scoutPeriscope.parent = chassis;
        const scoutPeriscopeMat = new StandardMaterial("previewScoutPeriscopeMat", scene);
        scoutPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        scoutPeriscope.material = scoutPeriscopeMat;
        
        // Оптический прицел на передней части
        const scoutSight = MeshBuilder.CreateBox("previewScoutSight", { width: 0.1, height: 0.06, depth: 0.08 }, scene);
        scoutSight.position = addZFightingOffset(new Vector3(0, h * 0.2, d * 0.48), "forward");
        scoutSight.parent = chassis;
        const scoutSightMat = new StandardMaterial("previewScoutSightMat", scene);
        scoutSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        scoutSight.material = scoutSightMat;
        
        // Линза прицела
        const scoutSightLens = MeshBuilder.CreateBox("previewScoutSightLens", { width: 0.05, height: 0.02, depth: 0.05 }, scene);
        scoutSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.05), "forward");
        scoutSightLens.parent = scoutSight;
        const scoutLensMat = new StandardMaterial("previewScoutSightLensMat", scene);
        scoutLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        scoutLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        scoutSightLens.material = scoutLensMat;
        
        // Легкие броневые накладки на лобовой части
        for (let i = 0; i < 2; i++) {
            const frontArmor = MeshBuilder.CreateBox(`previewScoutFrontArmor${i}`, { width: w * 0.25, height: h * 0.12, depth: 0.06 }, scene);
            frontArmor.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.2,
                    h * 0.02,
                    d * 0.48
                ), "forward");
            frontArmor.parent = chassis;
            frontArmor.material = armorMat;
        }
        
        // Выхлопная труба сзади (маленькая)
        const scoutExhaust = MeshBuilder.CreateBox("previewScoutExhaust", { width: 0.1, height: 0.1, depth: 0.15 }, scene);
        scoutExhaust.position = addZFightingOffset(new Vector3(w * 0.3, h * 0.15, -d * 0.48), "forward");
        scoutExhaust.parent = chassis;
        scoutExhaust.material = armorMat;
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`previewScoutTailLight${i}`, { width: 0.04, height: 0.06, depth: 0.03 }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.12,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`previewScoutTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            const sideLight = MeshBuilder.CreateBox(`previewScoutSideLight${i}`, { width: 0.04, height: 0.05, depth: 0.04 }, scene);
            sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.05,
                    -d * 0.2
                ), "backward");
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`previewScoutSideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
        
        // Верхняя вентиляционная решетка на крыше
        const scoutRoofVent = MeshBuilder.CreateBox("previewScoutRoofVent", { width: 0.15, height: 0.04, depth: 0.1 }, scene);
        scoutRoofVent.position = addZFightingOffset(new Vector3(0, h * 0.44, d * 0.2), "up");
        scoutRoofVent.parent = chassis;
        const scoutRoofVentMat = new StandardMaterial("previewScoutRoofVentMat", scene);
        scoutRoofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
        scoutRoofVent.material = scoutRoofVentMat;
        
        // Детали решетки
        for (let i = 0; i < 4; i++) {
            const ventBar = MeshBuilder.CreateBox(`previewScoutRoofVentBar${i}`, { width: 0.02, height: 0.03, depth: 0.08 }, scene);
            ventBar.position = addZFightingOffset(new Vector3(
                    (i - 1.5) * 0.04,
                    h * 0.44,
                    d * 0.2
                ), "up");
            ventBar.parent = chassis;
            ventBar.material = scoutRoofVentMat;
        }
        
        // Легкие броневые экраны по бокам - уменьшены
        for (let i = 0; i < 2; i++) {
            const sideArmor = MeshBuilder.CreateBox(`previewScoutSideArmor${i}`, { width: 0.07, height: h * 0.3, depth: d * 0.18 }, scene);
            sideArmor.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.06,
                    d * 0.08
                ), "x");
            sideArmor.parent = chassis;
            sideArmor.material = armorMat;
        }
        break;
    case "heavy":
        // Heavy - массивные бронеплиты со всех сторон - ОЧЕНЬ ЗАМЕТНЫЕ
        // Боковые бронеплиты
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(-w * 0.62, 0, 0),
            0.3, h * 0.95, d * 0.75,
            armorMat, "previewHeavy0"
        );
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(w * 0.62, 0, 0),
            0.3, h * 0.95, d * 0.75,
            armorMat, "previewHeavy1"
        );
        // Лобовая бронеплита
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, h * 0.35, d * 0.58),
            w * 0.85, h * 0.35, 0.22,
            armorMat, "previewHeavy2"
        );
        // Нижняя бронеплита
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, -h * 0.35, 0),
            w * 1.05, 0.28, d * 1.05,
            armorMat, "previewHeavy3"
        );
        // Верхняя бронеплита - ОЧЕНЬ БОЛЬШАЯ
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, h * 0.65, 0),
            w * 0.95, 0.25, d * 0.8,
            armorMat, "previewHeavy"
        );
        // Угловые усиления - БОЛЬШЕ
        for (let i = 0; i < 4; i++) {
            const posX = (i % 2 === 0 ? -1 : 1) * w * 0.58;
            const posZ = (i < 2 ? -1 : 1) * d * 0.58;
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3(posX, h * 0.55, posZ),
                0.3, 0.3, 0.3,
                armorMat, `previewHeavy${i}`
            );
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.5),
                0.12, 0.12, 0.1,
                i, "previewHeavy"
            );
        }
        
        // Выхлопные трубы
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createExhaust(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, -d * 0.48),
                0.14, 0.14, 0.2,
                armorMat, `previewHeavy${i}`
            );
        }
        
        // Инструменты: лопата, топор, канистра
        ChassisDetailsGenerator.createShovel(
            scene, chassis,
            new Vector3(-w * 0.45, h * 0.2, -d * 0.45),
            0.15, 0.4, 0.02,
            armorMat, "previewHeavy"
        );
        
        ChassisDetailsGenerator.createAxe(
            scene, chassis,
            new Vector3(-w * 0.35, h * 0.25, -d * 0.45),
            0.3, 0.1, 0.02,
            armorMat, "previewHeavy"
        );
        
        ChassisDetailsGenerator.createCanister(
            scene, chassis,
            new Vector3(w * 0.45, h * 0.22, -d * 0.4),
            0.14, 0.25, 0.14,
            armorMat, "previewHeavy"
        );
        
        // Вентиляционные решетки (большие, с деталями)
        for (let i = 0; i < 4; i++) {
            const posX = (i % 2 === 0 ? -1 : 1) * w * 0.4;
            const posZ = (i < 2 ? -1 : 1) * d * 0.3;
            const ventPos = new Vector3(posX, h * 0.5, posZ);
            ChassisDetailsGenerator.createVent(
                scene, chassis, ventPos,
                0.1, 0.06, 0.12,
                i, "previewHeavy"
            );
            // Детали решетки
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, ventPos,
                5, 0.08, 0.04, 0.02, 0.025,
                i, MaterialFactory.createVentMaterial(scene, i, "previewHeavy"), "previewHeavy"
            );
        }
        
        // Перископы на люках (три штуки)
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i - 1) * w * 0.3, h * 0.75, -d * 0.1),
                0.2, 0.08,
                i, "previewHeavy"
            );
        }
        
        // Люки на крыше (два больших)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.68, -d * 0.1),
                0.25, 0.1, 0.25,
                armorMat, `previewHeavy${i}`
            );
        }
        
        // Энергетические усилители брони (футуристические элементы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createEnergyBooster(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.5, h * 0.3, d * 0.4),
                0.12,
                i, "previewHeavy"
            );
        }
        break;
    case "assault":
        // Assault - агрессивные угловые бронеплиты, шипы
        // Лобовая бронеплита
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, h * 0.25, d * 0.52),
            w * 0.8, h * 0.35, 0.15,
            armorMat, "previewAssault0"
        );
        // Боковые бронеплиты
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(-w * 0.5, 0, d * 0.3),
            0.12, h * 0.6, d * 0.4,
            armorMat, "previewAssault1"
        );
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(w * 0.5, 0, d * 0.3),
            0.12, h * 0.6, d * 0.4,
            armorMat, "previewAssault2"
        );
        
        // Шипы спереди
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createSpike(
                scene, chassis,
                new Vector3((i - 1) * w * 0.25, h * 0.3, d * 0.52),
                0.08, 0.15, 0.12,
                0, accentMat, `previewAssault${i}`
            );
        }
        
        // Фары с защитой
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.48),
                0.1, 0.1, 0.08,
                i, "previewAssault"
            );
            // Защита фары
            ChassisDetailsGenerator.createHeadlightGuard(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.46),
                0.14, 0.14, 0.06,
                i, armorMat, "previewAssault"
            );
        }
        
        // Выхлоп
        ChassisDetailsGenerator.createExhaust(
            scene, chassis,
            new Vector3(w * 0.38, h * 0.18, -d * 0.45),
            0.13, 0.13, 0.18,
            armorMat, "previewAssault"
        );
        
        // Инструменты
        ChassisDetailsGenerator.createShovel(
            scene, chassis,
            new Vector3(-w * 0.4, h * 0.18, -d * 0.45),
            0.13, 0.32, 0.02,
            armorMat, "previewAssault"
        );
        
        ChassisDetailsGenerator.createCanister(
            scene, chassis,
            new Vector3(w * 0.38, h * 0.2, -d * 0.4),
            0.11, 0.18, 0.11,
            armorMat, "previewAssault"
        );
        
        // Вентиляционные решетки (улучшенные)
        for (let i = 0; i < 2; i++) {
            const ventPos = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.35, -d * 0.25);
            ChassisDetailsGenerator.createVent(
                scene, chassis, ventPos,
                0.08, 0.05, 0.1,
                i, "previewAssault"
            );
            // Детали решетки
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, ventPos,
                4, 0.06, 0.03, 0.02, 0.03,
                i, MaterialFactory.createVentMaterial(scene, i, "previewAssault"), "previewAssault"
            );
        }
        
        // Перископы (улучшенные)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1),
                0.16, 0.07,
                i, "previewAssault"
            );
        }
        
        // Агрессивные боковые шипы (дополнительные)
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 3; j++) {
                ChassisDetailsGenerator.createSpike(
                    scene, chassis,
                    new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.05 + j * h * 0.2, d * 0.1 + (j - 1) * d * 0.15),
                    0.06, 0.12, 0.1,
                    (i === 0 ? 1 : -1) * Math.PI / 8, accentMat, `previewAssault${i}_${j}`
                );
            }
        }
        
        // Броневые экраны на лобовой части (угловатые)
        for (let i = 0; i < 4; i++) {
            ChassisDetailsGenerator.createSlopedArmor(
                scene, chassis,
                new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.08 + (i < 2 ? 0 : h * 0.15), d * 0.5),
                w * 0.22, h * 0.18, 0.1,
                -Math.PI / 12, armorMat, `previewAssault${i}`
            );
        }
        
        // Угловые броневые накладки (агрессивный стиль)
        for (let i = 0; i < 4; i++) {
            const posX = (i % 2 === 0 ? -1 : 1) * w * 0.55;
            const posZ = (i < 2 ? -1 : 1) * d * 0.5;
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3(posX, h * 0.45, posZ),
                0.2, 0.25, 0.2,
                armorMat, `previewAssault${i}`
            );
        }
        
        // Верхние вентиляционные решетки (агрессивные, угловатые)
        for (let i = 0; i < 5; i++) {
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis,
                new Vector3((i - 2) * w * 0.25, h * 0.54, (i < 3 ? -1 : 1) * d * 0.25),
                0.15, 0.05, 0.12,
                i, "previewAssault"
            );
        }
        
        // Задние шипы (агрессивный стиль)
        for (let i = 0; i < 4; i++) {
            ChassisDetailsGenerator.createSpike(
                scene, chassis,
                new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.35, h * 0.3 + (i < 2 ? 0 : h * 0.15), -d * 0.48),
                0.08, 0.18, 0.1,
                0, accentMat, `previewAssault${i}`
            );
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49),
                0.06, 0.1, 0.04,
                i, "previewAssault"
            );
        }
        
        // Оптический прицел на лобовой части
        ChassisDetailsGenerator.createSight(
            scene, chassis,
            new Vector3(0, h * 0.22, d * 0.49),
            0.14, 0.09, 0.11,
            "previewAssault"
        );
        
        // Радиоантенна сзади
        ChassisDetailsGenerator.createAntenna(
            scene, chassis,
            new Vector3(0, h * 0.65, -d * 0.3),
            0.45, 0.025,
            "previewAssault"
        );
        
        // Основание антенны
        ChassisDetailsGenerator.createAntennaBase(
            scene, chassis,
            new Vector3(0, h * 0.54, -d * 0.3),
            0.1, armorMat, "previewAssault"
        );
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            const sideLight = MeshBuilder.CreateBox(`previewAssaultSideLight${i}`, { width: 0.05, height: 0.07, depth: 0.05 }, scene);
            sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.1,
                    -d * 0.2
                ), "backward");
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`previewAssaultSideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
        
        // Выхлопная труба (улучшенная, больше)
        const assaultExhaustUpgraded = MeshBuilder.CreateBox("previewAssaultExhaustUpgraded", { width: 0.13, height: 0.22, depth: 0.13 }, scene);
        assaultExhaustUpgraded.position = addZFightingOffset(new Vector3(w * 0.38, h * 0.2, -d * 0.48), "forward");
                assaultExhaustUpgraded.parent = chassis;
        assaultExhaustUpgraded.material = armorMat;
        
        // Выхлопное отверстие
        const assaultExhaustHole = MeshBuilder.CreateBox("previewAssaultExhaustHole", { width: 0.11, height: 0.04, depth: 0.11 }, scene);
        assaultExhaustHole.position = addZFightingOffset(new Vector3(w * 0.38, h * 0.2, -d * 0.52), "forward");
                assaultExhaustHole.parent = chassis;
        const assaultExhaustHoleMat = new StandardMaterial("previewAssaultExhaustHoleMat", scene);
        assaultExhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
        assaultExhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
        assaultExhaustHole.material = assaultExhaustHoleMat;
        break;
        case "medium":
        // Medium - Прототип: Т-34 - Классический средний танк, наклонная броня
        // Наклонная лобовая броня (45°)
            ChassisDetailsGenerator.createSlopedArmor(
                scene, chassis,
                new Vector3(0, h * 0.1, d * 0.5),
                w * 1.0, h * 0.7, 0.18,
                -Math.PI / 4, armorMat, "previewMedium"
            );
        
        // Вентиляционные решетки (угловатые)
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i - 1) * w * 0.28, h * 0.38, -d * 0.28),
                0.06, 0.04, 0.08,
                i, "previewMedium"
            );
        }
        
        // Два люка на крыше
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1),
                0.22, 0.08, 0.22,
                armorMat, `previewMedium${i}`
            );
        }
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createExhaust(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.18, -d * 0.45),
                0.12, 0.12, 0.18,
                armorMat, `previewMedium${i}`
            );
        }
        
        // Фары спереди
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.12, d * 0.48),
                0.1, 0.1, 0.08,
                i, "previewMedium"
            );
        }
        
        // Инструменты: лопата, канистра
        ChassisDetailsGenerator.createShovel(
            scene, chassis,
            new Vector3(-w * 0.42, h * 0.18, -d * 0.45),
            0.14, 0.35, 0.02,
            armorMat, "previewMedium"
        );
        
        ChassisDetailsGenerator.createCanister(
            scene, chassis,
            new Vector3(w * 0.42, h * 0.2, -d * 0.4),
            0.12, 0.2, 0.12,
            armorMat, "previewMedium"
        );
        
        // Вентиляционные решетки (улучшенные)
        for (let i = 0; i < 3; i++) {
            const ventPos = new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3);
            ChassisDetailsGenerator.createVent(
                scene, chassis, ventPos,
                0.08, 0.05, 0.1,
                i, "previewMedium"
            );
            // Детали решетки
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, ventPos,
                4, 0.06, 0.03, 0.02, 0.03,
                i, MaterialFactory.createVentMaterial(scene, i, "previewMedium"), "previewMedium"
            );
        }
        
        // Перископы на люках
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.55, -d * 0.1),
                0.18, 0.07,
                i, "previewMedium"
            );
        }
        
        // Броневые накладки на лобовой части (характерные для Т-34)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.05, d * 0.48),
                w * 0.3, h * 0.2, 0.1,
                armorMat, `previewMedium${i}`
            );
        }
        
        // Центральная броневая накладка на лбу
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, h * 0.2, d * 0.49),
            w * 0.2, h * 0.15, 0.12,
            armorMat, "previewMedium"
        );
        
        // Боковые броневые экраны (противокумулятивные)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createArmorScreen(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.15, d * 0.1),
                0.15, h * 0.6, d * 0.35,
                0, armorMat, `previewMedium${i}`
            );
        }
        
        // Дополнительные вентиляционные решетки на крыше
        for (let i = 0; i < 4; i++) {
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis,
                new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.46, (i < 2 ? -1 : 1) * d * 0.25),
                0.15, 0.04, 0.12,
                i, "previewMedium"
            );
        }
        
        // Радиоантенна сзади (характерная для Т-34)
        ChassisDetailsGenerator.createAntenna(
            scene, chassis,
            new Vector3(0, h * 0.65, -d * 0.35),
            0.5, 0.025,
            "previewMedium"
        );
        
        // Основание антенны
        ChassisDetailsGenerator.createAntennaBase(
            scene, chassis,
            new Vector3(0, h * 0.54, -d * 0.35),
            0.1, armorMat, "previewMedium"
        );
        
        // Оптический прицел на лобовой части
        ChassisDetailsGenerator.createSight(
            scene, chassis,
            new Vector3(0, h * 0.25, d * 0.48),
            0.12, 0.08, 0.1,
            "previewMedium"
        );
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.16, -d * 0.49),
                0.06, 0.1, 0.04,
                i, "previewMedium"
            );
        }
        
        // Дополнительные инструменты на корме
        ChassisDetailsGenerator.createToolBox(
            scene, chassis,
            new Vector3(0, h * 0.22, -d * 0.42),
            0.18, 0.12, 0.14,
            armorMat, "previewMedium"
        );
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createSideLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.08, -d * 0.25),
                0.05, 0.07, 0.05,
                i, "previewMedium"
            );
        }
            break;
    case "stealth":
        // Stealth - угловатые панели, генератор невидимости, низкий профиль
        // Боковые панели
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(-w * 0.45, h * 0.2, d * 0.3),
            0.08, h * 0.3, d * 0.4,
            armorMat, "previewStealth0"
        );
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(w * 0.45, h * 0.2, d * 0.3),
            0.08, h * 0.3, d * 0.4,
            armorMat, "previewStealth1"
        );
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, h * 0.35, -d * 0.35),
            w * 0.4, h * 0.25, w * 0.3,
            armorMat, "previewStealth2"
        );
        
        // Генератор невидимости
        ChassisDetailsGenerator.createStealthGenerator(
            scene, chassis,
            new Vector3(0, h * 0.35, -d * 0.35),
            w * 0.35, h * 0.45, w * 0.35,
            "previewStealth"
        );
        
        // Две фары (очень маленькие, скрытые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.1, d * 0.48),
                0.06, 0.06, 0.04,
                i, "previewStealth"
            );
        }
        
        // Две задние фары (скрытые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.1, -d * 0.49),
                0.04, 0.05, 0.03,
                i, "previewStealth"
            );
        }
        
        // Скрытые вентиляционные решетки по бокам
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15),
                0.04, 0.06, 0.1,
                i, "previewStealth"
            );
        }
            break;
    case "hover":
        // Hover - обтекаемые панели, реактивные двигатели
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.42, 0, 0),
                0.06, h * 0.6, d * 0.5,
                accentMat, `previewHover${i}`
            );
        }
        
        // Реактивные двигатели (4 штуки)
        for (let i = 0; i < 4; i++) {
            const posX = (i % 2 === 0 ? -1 : 1) * w * 0.38;
            const posZ = (i < 2 ? -1 : 1) * d * 0.38;
            ChassisDetailsGenerator.createThruster(
                scene, chassis,
                new Vector3(posX, -h * 0.45, posZ),
                0.25, 0.18,
                i, "previewHover"
            );
        }
        
        // Обтекаемые фары спереди
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlightCylindrical(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.48),
                0.12, 0.08,
                i, "previewHover"
            );
        }
        
        // Обтекаемый люк на крыше (цилиндрический)
        const hoverHatch = MeshBuilder.CreateBox("previewHoverHatch", { width: 0.28, height: 0.08, depth: 0.28 }, scene);
        hoverHatch.position = addZFightingOffset(new Vector3(0, h * 0.52, -d * 0.1), "up");
        hoverHatch.parent = chassis;
        hoverHatch.material = armorMat;
        
        // Перископ на люке (обтекаемый)
        ChassisDetailsGenerator.createPeriscope(
            scene, chassis,
            new Vector3(0, h * 0.58, -d * 0.1),
            0.18, 0.06,
            0, "previewHover"
        );
        
        // Вентиляционные решетки на крыше (обтекаемые)
        for (let i = 0; i < 4; i++) {
            ChassisDetailsGenerator.createRoofVentCylindrical(
                scene, chassis,
                new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.5, (i < 2 ? -1 : 1) * d * 0.25),
                0.12, 0.05,
                i, "previewHover"
            );
        }
        
        // Оптические сенсоры (округлые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createOpticalSensor(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, d * 0.45),
                0.06, 0.08,
                i, "previewHover"
            );
        }
        
        // Задние огни (округлые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLightCylindrical(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.49),
                0.08, 0.04,
                i, "previewHover"
            );
        }
        
        // Обтекаемые воздухозаборники по бокам
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createIntakeCylindrical(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.1, d * 0.2),
                0.15, 0.14,
                `previewHover${i}`
            );
        }
        
        // Стабилизационные панели (обтекаемые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createStabilizer(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.15),
                0.08, h * 0.4, d * 0.3,
                accentMat, `previewHover${i}`
            );
        }
        break;
    case "siege":
        // Siege - массивные многослойные бронеплиты
        // Боковые бронеплиты
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(-w * 0.62, 0, 0),
            0.22, h * 0.95, d * 0.75,
            armorMat, "previewSiege0"
        );
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(w * 0.62, 0, 0),
            0.22, h * 0.95, d * 0.75,
            armorMat, "previewSiege1"
        );
        // Лобовая бронеплита
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, h * 0.35, d * 0.58),
            w * 0.85, h * 0.25, 0.18,
            armorMat, "previewSiege2"
        );
        // Нижняя бронеплита
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, -h * 0.35, 0),
            w * 0.98, 0.2, d * 0.98,
            armorMat, "previewSiege3"
        );
        // Верхняя бронеплита
        ChassisDetailsGenerator.createArmorPlate(
            scene, chassis,
            new Vector3(0, h * 0.6, 0),
            w * 0.9, 0.15, d * 0.8,
            armorMat, "previewSiege4"
        );
        
        // Дополнительные угловые бронеплиты
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI * 2) / 4;
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3(Math.cos(angle) * w * 0.55, h * 0.2, Math.sin(angle) * d * 0.55),
                0.15, h * 0.4, 0.15,
                armorMat, `previewSiege${i}`
            );
        }
        
        // Три люка
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i - 1) * w * 0.3, h * 0.7, -d * 0.1),
                0.25, 0.1, 0.25,
                armorMat, `previewSiege${i}`
            );
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.18, d * 0.5),
                0.14, 0.14, 0.12,
                i, "previewSiege"
            );
        }
        
        // Две выхлопные трубы
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createExhaust(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.48),
                0.16, 0.16, 0.22,
                armorMat, `previewSiege${i}`
            );
        }
        
        // Множество инструментов
        ChassisDetailsGenerator.createShovel(
            scene, chassis,
            new Vector3(-w * 0.48, h * 0.22, -d * 0.45),
            0.16, 0.45, 0.02,
            armorMat, "previewSiege"
        );
        
        ChassisDetailsGenerator.createAxe(
            scene, chassis,
            new Vector3(-w * 0.38, h * 0.28, -d * 0.45),
            0.35, 0.12, 0.02,
            armorMat, "previewSiege"
        );
        
        ChassisDetailsGenerator.createCanister(
            scene, chassis,
            new Vector3(w * 0.48, h * 0.25, -d * 0.4),
            0.16, 0.3, 0.16,
            armorMat, "previewSiege"
        );
        
        // Антенны (большие)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createAntenna(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.8, -d * 0.4),
                0.5, 0.03,
                `previewSiege${i}`
            );
        }
        
        // Перископы на люках
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i - 1) * w * 0.3, h * 0.8, -d * 0.1),
                0.22, 0.09,
                i, "previewSiege"
            );
        }
        
        // Большие вентиляционные решетки на крыше
        for (let i = 0; i < 5; i++) {
            const ventPos = new Vector3((i - 2) * w * 0.25, h * 0.68, d * 0.25);
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis, ventPos,
                0.3, 0.08, 0.2,
                i, "previewSiege"
            );
            // Детали решетки (много планок)
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, ventPos,
                8, 0.04, 0.07, 0.18, 0.04,
                i, MaterialFactory.createRoofVentMaterial(scene, i, "previewSiege"), "previewSiege"
            );
        }
        
        // Массивные выхлопные трубы (большие)
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createExhaustCylindrical(
                scene, chassis,
                new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.48),
                0.3, 0.16,
                `previewSiege${i}`
            );
            // Выхлопное отверстие
            ChassisDetailsGenerator.createExhaustHole(
                scene, chassis,
                new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.52),
                0.05, 0.14,
                i, `previewSiege${i}`
            );
        }
        
        // Оптический прицел на лобовой части (огромный)
        ChassisDetailsGenerator.createSight(
            scene, chassis,
            new Vector3(0, h * 0.3, d * 0.5),
            0.22, 0.15, 0.18,
            "previewSiege"
        );
        
        // Дополнительные броневые накладки на лобовой части (огромные)
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3((i - 1) * w * 0.32, h * 0.1, d * 0.5),
                w * 0.35, h * 0.25, 0.15,
                armorMat, `previewSiege${i}`
            );
        }
        
        // Задние огни (стоп-сигналы, большие)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49),
                0.1, 0.15, 0.06,
                i, "previewSiege"
            );
        }
        
        // Боковые вентиляционные решетки (большие)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.12, d * 0.15),
                0.08, 0.15, 0.2,
                i, "previewSiege"
            );
        }
        break;
    case "racer":
        // Racer - очень низкий, спортивный - гонщик
        // Передний спойлер
        ChassisDetailsGenerator.createSpoiler(
            scene, chassis,
            new Vector3(0, -h * 0.4, d * 0.48),
            w * 0.9, 0.12, 0.15,
            accentMat, "previewRacer"
        );
        
        // Задний спойлер (большой)
        ChassisDetailsGenerator.createSpoiler(
            scene, chassis,
            new Vector3(0, h * 0.45, -d * 0.48),
            w * 1.1, 0.25, 0.2,
            accentMat, "previewRacer"
        );
        
        // Боковые обтекатели (низкопрофильные)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createFairing(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.1),
                0.12, h * 0.6, d * 0.7,
                accentMat, `previewRacer${i}`
            );
        }
        
        // Передние фары (большие, агрессивные)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.32, h * 0.1, d * 0.49),
                0.15, 0.12, 0.1,
                i, "previewRacer"
            );
        }
        
        // Центральная воздухозаборная решетка
        ChassisDetailsGenerator.createIntake(
            scene, chassis,
            new Vector3(0, h * 0.15, d * 0.48),
            w * 0.4, h * 0.25, 0.08,
            MaterialFactory.createVentMaterial(scene, 0, "previewRacer"), "previewRacer"
        );
        
        // Детали решетки
        const intakePos = new Vector3(0, h * 0.15, d * 0.48);
        ChassisDetailsGenerator.createVentBars(
            scene, chassis, intakePos,
            5, 0.02, h * 0.2, 0.06, w * 0.09,
            0, MaterialFactory.createVentMaterial(scene, 0, "previewRacer"), "previewRacer"
        );
        
        // Верхние воздухозаборники на крыше
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createIntake(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.42, d * 0.3),
                0.18, 0.08, 0.12,
                MaterialFactory.createVentMaterial(scene, i, "previewRacer"), `previewRacer${i}`
            );
        }
        
        // Выхлопные трубы (большие, по бокам)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createExhaustCylindrical(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.48),
                0.3, 0.1,
                `previewRacer${i}`
            );
            // Выхлопное отверстие
            ChassisDetailsGenerator.createExhaustHole(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.52),
                0.05, 0.08,
                i, `previewRacer${i}`
            );
        }
        
        // Боковые зеркала
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createMirror(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.35, d * 0.35),
                0.08, 0.05, 0.04,
                i, "previewRacer"
            );
        }
        
        // Задние огни (большие стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.12, -d * 0.49),
                0.08, 0.12, 0.04,
                i, "previewRacer"
            );
        }
        
        // Вентиляционные отверстия на боковых панелях
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 3; j++) {
                ChassisDetailsGenerator.createVent(
                    scene, chassis,
                    new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.05, d * 0.1 + (j - 1) * d * 0.15),
                    0.04, 0.1, 0.04,
                    j, `previewRacer${i}`
                );
            }
        }
        
        // Люк на крыше (спортивный стиль)
        ChassisDetailsGenerator.createHatch(
            scene, chassis,
            new Vector3(0, h * 0.46, -d * 0.1),
            0.3, 0.06, 0.25,
            armorMat, "previewRacer"
        );
        
        // Перископ на люке
        ChassisDetailsGenerator.createPeriscope(
            scene, chassis,
            new Vector3(0, h * 0.56, -d * 0.1),
            0.2, 0.06,
            0, "previewRacer"
        );
        break;
    case "amphibious":
        // Amphibious - большие поплавки, водонепроницаемые панели
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createFloat(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.42, -h * 0.25, 0),
                h * 0.7, w * 0.35,
                accentMat, `previewAmphibious${i}`
            );
        }
        
        // Водонепроницаемые панели
        ChassisDetailsGenerator.createWaterSeal(
            scene, chassis,
            new Vector3(0, h * 0.5, 0),
            w * 1.05, 0.08, d * 1.05,
            armorMat, "previewAmphibious"
        );
        
        // Люки
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1),
                0.2, 0.08, 0.2,
                armorMat, `previewAmphibious${i}`
            );
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48),
                0.1, 0.1, 0.08,
                i, "previewAmphibious"
            );
        }
        
        // Вентиляционные решетки (водонепроницаемые)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25),
                0.08, 0.05, 0.1,
                i, "previewAmphibious"
            );
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.58, -d * 0.1),
                0.18, 0.07,
                i, "previewAmphibious"
            );
        }
        break;
    case "shield":
        // Shield - генератор щита, энергетические панели
        ChassisDetailsGenerator.createEnergyGenerator(
            scene, chassis,
            new Vector3(0, h * 0.45, -d * 0.25),
            w * 0.45,
            "previewShield"
        );
        
        // Энергетические панели по бокам
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createEnergyPanel(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.55, h * 0.15, 0),
                0.1, h * 0.5, d * 0.3,
                i, "previewShield"
            );
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1),
                0.2, 0.08, 0.2,
                armorMat, `previewShield${i}`
            );
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48),
                0.1, 0.1, 0.08,
                i, "previewShield"
            );
        }
        
        // Вентиляционные решетки (энергетические)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25),
                0.08, 0.05, 0.1,
                i, "previewShield"
            );
        }
        
        // Энергетические катушки вокруг генератора
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI * 2) / 4;
            ChassisDetailsGenerator.createEnergyCoil(
                scene, chassis,
                new Vector3(0, h * 0.45, -d * 0.25),
                w * 0.5, 0.06,
                angle,
                i, "previewShield"
            );
        }
        
        // Перископы на люках
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1),
                0.18, 0.07,
                i, "previewShield"
            );
        }
        
        // Энергетические порты (для зарядки щита)
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI * 2) / 4;
            ChassisDetailsGenerator.createEnergyPort(
                scene, chassis,
                new Vector3(Math.cos(angle) * w * 0.4, h * 0.25, -d * 0.25 + Math.sin(angle) * d * 0.2),
                0.08, 0.1,
                angle + Math.PI / 2,
                i, "previewShield"
            );
        }
        
        // Верхние вентиляционные решетки (энергетические)
        for (let i = 0; i < 4; i++) {
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis,
                new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.54, (i < 2 ? -1 : 1) * d * 0.25),
                0.15, 0.04, 0.12,
                i, "previewShield"
            );
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49),
                0.06, 0.1, 0.04,
                i, "previewShield"
            );
        }
        
        // Радиоантенна сзади
        ChassisDetailsGenerator.createAntenna(
            scene, chassis,
            new Vector3(0, h * 0.65, -d * 0.3),
            0.5, 0.025,
            "previewShield"
        );
        
        // Основание антенны
        ChassisDetailsGenerator.createAntennaBase(
            scene, chassis,
            new Vector3(0, h * 0.54, -d * 0.3),
            0.1, armorMat, "previewShield"
        );
        
        // Оптический прицел на лобовой части
        ChassisDetailsGenerator.createSight(
            scene, chassis,
            new Vector3(0, h * 0.22, d * 0.49),
            0.14, 0.09, 0.11,
            "previewShield"
        );
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createExhaustCylindrical(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48),
                0.2, 0.12,
                `previewShield${i}`
            );
        }
        break;
    case "drone":
        // Drone - платформы для дронов, антенны связи
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createDronePlatform(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.65, 0),
                w * 0.45, 0.12, w * 0.45,
                i, "previewDrone"
            );
            
            // Антенны на платформах
            ChassisDetailsGenerator.createAntenna(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.72, 0),
                0.15, 0.03,
                `previewDrone${i}`
            );
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1),
                0.2, 0.08, 0.2,
                armorMat, `previewDrone${i}`
            );
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48),
                0.1, 0.1, 0.08,
                i, "previewDrone"
            );
        }
        
        // Вентиляционные решетки (для охлаждения систем управления дронами)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25),
                0.08, 0.05, 0.1,
                i, "previewDrone"
            );
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.66, -d * 0.1),
                0.18, 0.07,
                i, "previewDrone"
            );
        }
        
        // Сенсорные панели на платформах
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                ChassisDetailsGenerator.createSensor(
                    scene, chassis,
                    new Vector3((i === 0 ? -1 : 1) * w * 0.38 + (j === 0 ? -1 : 1) * 0.1, h * 0.68, (j === 0 ? -1 : 1) * 0.1),
                    0.08, 0.04, 0.08,
                    j, `previewDrone${i}`
                );
            }
        }
        
        // Верхние вентиляционные решетки на крыше
        for (let i = 0; i < 4; i++) {
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis,
                new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.58, (i < 2 ? -1 : 1) * d * 0.25),
                0.12, 0.04, 0.1,
                i, "previewDrone"
            );
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49),
                0.06, 0.1, 0.04,
                i, "previewDrone"
            );
        }
        
        // Оптический прицел на лобовой части
        ChassisDetailsGenerator.createSight(
            scene, chassis,
            new Vector3(0, h * 0.22, d * 0.49),
            0.14, 0.09, 0.11,
            "previewDrone"
        );
        
        // Радиоантенна сзади (для связи с дронами)
        ChassisDetailsGenerator.createAntenna(
            scene, chassis,
            new Vector3(0, h * 0.72, -d * 0.3),
            0.55, 0.025,
            "previewDrone"
        );
        
        // Основание антенны
        ChassisDetailsGenerator.createAntennaBase(
            scene, chassis,
            new Vector3(0, h * 0.6, -d * 0.3),
            0.1, armorMat, "previewDrone"
        );
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createExhaustCylindrical(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48),
                0.2, 0.12,
                `previewDrone${i}`
            );
        }
        break;
    case "artillery":
        // Artillery - массивные стабилизаторы, опорные лапы
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI * 2) / 4;
            ChassisDetailsGenerator.createStabilizerCylindrical(
                scene, chassis,
                new Vector3(Math.cos(angle) * w * 0.65, -h * 0.45, Math.sin(angle) * d * 0.65),
                0.35, 0.25,
                armorMat, `previewArtillery${i}`
            );
            
            // Опорные лапы
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3(Math.cos(angle) * w * 0.7, -h * 0.55, Math.sin(angle) * d * 0.7),
                0.12, 0.2, 0.12,
                armorMat, `previewArtilleryLeg${i}`
            );
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.7, -d * 0.1),
                0.22, 0.1, 0.22,
                armorMat, `previewArtillery${i}`
            );
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.2, d * 0.5),
                0.12, 0.12, 0.1,
                i, "previewArtillery"
            );
        }
        
        // Выхлоп
        ChassisDetailsGenerator.createExhaust(
            scene, chassis,
            new Vector3(w * 0.4, h * 0.22, -d * 0.48),
            0.14, 0.14, 0.2,
            armorMat, "previewArtillery"
        );
        
        // Вентиляционные решетки (большие для артиллерии)
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i - 1) * w * 0.35, h * 0.6, -d * 0.3),
                0.12, 0.08, 0.14,
                i, "previewArtillery"
            );
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.85, -d * 0.1),
                0.22, 0.09,
                i, "previewArtillery"
            );
        }
        
        // Системы наведения (оптические прицелы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createSight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.75, d * 0.45),
                0.16, 0.12, 0.14,
                `previewArtillery${i}`
            );
        }
        
        // Верхние вентиляционные решетки на крыше (большие)
        for (let i = 0; i < 5; i++) {
            const ventPos = new Vector3((i - 2) * w * 0.28, h * 0.72, d * 0.25);
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis, ventPos,
                0.2, 0.06, 0.16,
                i, "previewArtillery"
            );
            // Детали решетки
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, ventPos,
                5, 0.03, 0.05, 0.14, 0.04,
                i, MaterialFactory.createRoofVentMaterial(scene, i, "previewArtillery"), "previewArtillery"
            );
        }
        
        // Радиоантенна сзади
        ChassisDetailsGenerator.createAntenna(
            scene, chassis,
            new Vector3(0, h * 0.9, -d * 0.3),
            0.6, 0.03,
            "previewArtillery"
        );
        
        // Основание антенны
        ChassisDetailsGenerator.createAntennaBase(
            scene, chassis,
            new Vector3(0, h * 0.76, -d * 0.3),
            0.12, armorMat, "previewArtillery"
        );
        
        // Задние огни (стоп-сигналы, большие)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49),
                0.08, 0.14, 0.06,
                i, "previewArtillery"
            );
        }
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createSideLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.15, -d * 0.25),
                0.06, 0.09, 0.06,
                i, "previewArtillery"
            );
        }
        
        // Выхлопная труба (большая)
        ChassisDetailsGenerator.createExhaustCylindrical(
            scene, chassis,
            new Vector3(0, h * 0.25, -d * 0.48),
            0.28, 0.18,
            "previewArtillery"
        );
        
        // Выхлопное отверстие
        ChassisDetailsGenerator.createExhaustHole(
            scene, chassis,
            new Vector3(0, h * 0.25, -d * 0.52),
            0.05, 0.16,
            0, "previewArtillery"
        );
        break;
    case "destroyer":
        // Destroyer - длинный клиновидный нос, низкий профиль
        ChassisDetailsGenerator.createSlopedArmor(
            scene, chassis,
            new Vector3(0, 0, d * 0.52),
            w * 0.85, h * 0.55, 0.35,
            -Math.PI / 6, accentMat, "previewDestroyer"
        );
        
        // Боковые бронеплиты
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.15),
                0.12, h * 0.7, d * 0.5,
                armorMat, `previewDestroyer${i}`
            );
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHatch(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1),
                0.18, 0.06, 0.18,
                armorMat, `previewDestroyer${i}`
            );
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createHeadlight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.1, d * 0.48),
                0.1, 0.1, 0.08,
                i, "previewDestroyer"
            );
        }
        
        // Вентиляционные решетки
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createVent(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.25, -d * 0.25),
                0.08, 0.05, 0.1,
                i, "previewDestroyer"
            );
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createPeriscope(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.54, -d * 0.1),
                0.14, 0.07,
                i, "previewDestroyer"
            );
        }
        
        // Оптический прицел на лобовой части (большой)
        ChassisDetailsGenerator.createSight(
            scene, chassis,
            new Vector3(0, h * 0.2, d * 0.48),
            0.15, 0.1, 0.12,
            "previewDestroyer"
        );
        
        // Дополнительные броневые накладки на лобовой части
        for (let i = 0; i < 3; i++) {
            ChassisDetailsGenerator.createArmorPlate(
                scene, chassis,
                new Vector3((i - 1) * w * 0.28, h * 0.05, d * 0.48),
                w * 0.28, h * 0.18, 0.1,
                armorMat, `previewDestroyer${i}`
            );
        }
        
        // Верхние вентиляционные решетки на крыше
        for (let i = 0; i < 4; i++) {
            const ventPos = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.46, (i < 2 ? -1 : 1) * d * 0.2);
            ChassisDetailsGenerator.createRoofVent(
                scene, chassis, ventPos,
                0.12, 0.04, 0.1,
                i, "previewDestroyer"
            );
            // Детали решетки
            ChassisDetailsGenerator.createVentBars(
                scene, chassis, ventPos,
                3, 0.02, 0.03, 0.08, 0.03,
                i, MaterialFactory.createRoofVentMaterial(scene, i, "previewDestroyer"), "previewDestroyer"
            );
        }
        
        // Выхлопные трубы сзади (большие)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createExhaustCylindrical(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.48),
                0.25, 0.12,
                `previewDestroyer${i}`
            );
            // Выхлопное отверстие
            ChassisDetailsGenerator.createExhaustHole(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.52),
                0.05, 0.1,
                i, `previewDestroyer${i}`
            );
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createTailLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.15, -d * 0.49),
                0.06, 0.1, 0.04,
                i, "previewDestroyer"
            );
        }
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            ChassisDetailsGenerator.createSideLight(
                scene, chassis,
                new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.08, -d * 0.2),
                0.05, 0.07, 0.05,
                i, "previewDestroyer"
            );
        }
        break;
    case "command":
        // Command - аура, множественные антенны, командный модуль
        const commandAura = MeshBuilder.CreateBox("previewCommandAura", { width: w * 1.6, height: 0.06, depth: w * 1.6 }, scene);
        commandAura.position = addZFightingOffset(new Vector3(0, h * 0.55, 0), "up");
                commandAura.parent = chassis;
        const auraMat = new StandardMaterial("previewAuraMat", scene);
        auraMat.diffuseColor = new Color3(1, 0.88, 0);
        auraMat.emissiveColor = new Color3(0.6, 0.5, 0);
        auraMat.disableLighting = true;
        commandAura.material = auraMat;
        
        // Командный модуль сверху
        const commandModule = MeshBuilder.CreateBox("previewCommandModule", { width: w * 0.6, height: h * 0.3, depth: d * 0.4 }, scene);
        commandModule.position = addZFightingOffset(new Vector3(0, h * 0.6, -d * 0.3), "up");
        commandModule.parent = chassis;
        const moduleMat = new StandardMaterial("previewModuleMat", scene);
        moduleMat.diffuseColor = new Color3(1, 0.9, 0.3);
        moduleMat.emissiveColor = new Color3(0.3, 0.27, 0.1);
        commandModule.material = moduleMat;
        
        // Множественные антенны
        for (let i = 0; i < 4; i++) {
            const antenna = MeshBuilder.CreateBox(`previewCmdAntenna${i}`, { width: 0.025, height: 0.5, depth: 0.025 }, scene);
            antenna.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.35,
                    h * 0.7,
                    (i < 2 ? -1 : 1) * d * 0.35
                ), "forward");
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial(`previewCmdAntennaMat${i}`, scene);
            antennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
            antenna.material = antennaMat;
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`previewCommandHatch${i}`, { width: 0.22, height: 0.08, depth: 0.22 }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.6,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`previewCommandHeadlight${i}`, { width: 0.1, height: 0.1, depth: 0.08 }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.15,
                    d * 0.48
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`previewCommandHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Перископы на люках
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateBox(`previewCommandPeriscope${i}`, { width: 0.08, height: 0.2, depth: 0.08 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.68,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`previewCommandPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Радиостанции на командном модуле
        for (let i = 0; i < 2; i++) {
            const radio = MeshBuilder.CreateBox(`previewCommandRadio${i}`, { width: 0.15, height: 0.12, depth: 0.1 }, scene);
            radio.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.22,
                    h * 0.72,
                    -d * 0.3
                ), "backward");
            radio.parent = chassis;
            const radioMat = new StandardMaterial(`previewCommandRadioMat${i}`, scene);
            radioMat.diffuseColor = new Color3(0.8, 0.7, 0.2);
            radioMat.emissiveColor = new Color3(0.2, 0.15, 0.05);
            radio.material = radioMat;
        }
        
        // Сенсорные панели на командном модуле
        for (let i = 0; i < 3; i++) {
            const sensor = MeshBuilder.CreateBox(`previewCommandSensor${i}`, { width: 0.1, height: 0.06, depth: 0.08 }, scene);
            sensor.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.18,
                    h * 0.72,
                    -d * 0.2
                ), "backward");
            sensor.parent = chassis;
            const sensorMat = new StandardMaterial(`previewCommandSensorMat${i}`, scene);
            sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.2);
            sensorMat.emissiveColor = new Color3(0.3, 0.25, 0);
            sensor.material = sensorMat;
        }
        
        // Верхние вентиляционные решетки на крыше
        for (let i = 0; i < 4; i++) {
            const roofVent = MeshBuilder.CreateBox(`previewCommandRoofVent${i}`, { width: 0.15, height: 0.04, depth: 0.12 }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.25,
                    h * 0.58,
                    (i < 2 ? -1 : 1) * d * 0.25
                ), "up");
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`previewCommandRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            roofVent.material = roofVentMat;
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`previewCommandTailLight${i}`, { width: 0.06, height: 0.1, depth: 0.04 }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.16,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`previewCommandTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Радиоантенна сзади (главная)
        const commandAntenna = MeshBuilder.CreateBox("previewCommandAntenna", { width: 0.03, height: 0.6, depth: 0.03 }, scene);
        commandAntenna.position = addZFightingOffset(new Vector3(0, h * 0.8, -d * 0.3), "up");
        commandAntenna.parent = chassis;
        const commandAntennaMat = new StandardMaterial("previewCommandAntennaMat", scene);
        commandAntennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
        commandAntenna.material = commandAntennaMat;
        
        // Основание антенны
        const commandAntennaBase = MeshBuilder.CreateBox("previewCommandAntennaBase", { width: 0.12, height: 0.12, depth: 0.12 }, scene);
        commandAntennaBase.position = addZFightingOffset(new Vector3(0, h * 0.66, -d * 0.3), "up");
        commandAntennaBase.parent = chassis;
        commandAntennaBase.material = armorMat;
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateBox(`previewCommandExhaust${i}`, { width: 0.12, height: 0.2, depth: 0.12 }, scene);
            exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.2,
                    -d * 0.48
                ), "forward");
                        exhaust.parent = chassis;
            exhaust.material = armorMat;
        }
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            const sideLight = MeshBuilder.CreateBox(`previewCommandSideLight${i}`, { width: 0.05, height: 0.07, depth: 0.05 }, scene);
            sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.1,
                    -d * 0.2
                ), "backward");
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`previewCommandSideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
        break;
}

// Antenna for medium/heavy/assault
if (chassisType.id === "medium" || chassisType.id === "heavy" || chassisType.id === "assault") {
    const antenna = MeshBuilder.CreateBox("previewAntenna", { width: 0.025, height: 0.35, depth: 0.025 }, scene);
    antenna.position = addZFightingOffset(new Vector3(w * 0.42, h * 0.65, -d * 0.42), "forward");
    antenna.parent = chassis;
    const antennaMat = new StandardMaterial("previewAntennaMat", scene);
    antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
    antenna.material = antennaMat;
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
