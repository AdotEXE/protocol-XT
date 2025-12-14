/**
 * Garage 3D Preview Module
 * Логика 3D превью танка в гараже из garage.ts
 */

import { Scene, Engine, Mesh, ArcRotateCamera, HemisphericLight, Vector3 } from "@babylonjs/core";

export interface PreviewTank {
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    leftTrack?: Mesh;
    rightTrack?: Mesh;
}

/**
 * Инициализирует 3D превью сцену
 */
export function initPreviewScene(canvas: HTMLCanvasElement): {
    engine: Engine;
    scene: Scene;
    camera: ArcRotateCamera;
    light: HemisphericLight;
} {
    // TODO: Переместить логику инициализации из garage.ts::initPreview()
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    
    const camera = new ArcRotateCamera(
        "previewCamera",
        Math.PI / 2,
        Math.PI / 3,
        15,
        new Vector3(0, 0, 0),
        scene
    );
    
    const light = new HemisphericLight("previewLight", new Vector3(0, 1, 0), scene);
    
    return { engine, scene, camera, light };
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
    // TODO: Переместить логику создания превью из garage.ts::createUniqueChassisPreview() и createUniqueCannonPreview()
    return null;
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
    // TODO: Переместить логику обновления из garage.ts::updatePreview()
    if (previewTank) {
        // Очистить старое
        previewTank.chassis.dispose();
        previewTank.turret.dispose();
        previewTank.barrel.dispose();
    }
    
    // Создать новое
    return createPreviewTank(chassisId, cannonId, trackId, scene);
}

