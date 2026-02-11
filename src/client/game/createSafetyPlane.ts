/**
 * Создание защитной плоскости под картой (Z=-10) для предотвращения падения объектов.
 * Плоскость с зелёной метрической сеткой и коллизией.
 */

import {
    Scene,
    MeshBuilder,
    Vector3,
    StandardMaterial,
    DynamicTexture,
    Color3,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsMotionType
} from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Создаёт горизонтальную плоскость под картой с коллизией и зелёной сеткой.
 * Размер 5500x5500, позиция Y=-10, Z=-10.
 */
export function createSafetyPlane(scene: Scene): void {
    if (!scene) {
        logger.warn("[createSafetyPlane] Scene not available");
        return;
    }

    const safetyPlaneMesh = MeshBuilder.CreateGround("safetyPlane", {
        width: 5500,
        height: 5500,
        subdivisions: 50
    }, scene);

    safetyPlaneMesh.position = new Vector3(0, -10, -10);

    const safetyMaterial = new StandardMaterial("safetyPlaneMat", scene);
    safetyMaterial.disableLighting = true;

    const textureSize = 64;
    const safetyTexture = new DynamicTexture("safetyPlaneTexture", textureSize, scene, false);
    const ctx = safetyTexture.getContext();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, textureSize, textureSize);
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, textureSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(textureSize, 0);
    ctx.stroke();
    safetyTexture.update();
    safetyTexture.wrapU = 1;
    safetyTexture.wrapV = 1;
    safetyTexture.uScale = 110;
    safetyTexture.vScale = 110;

    safetyMaterial.emissiveTexture = safetyTexture;
    safetyMaterial.diffuseColor = Color3.Black();
    safetyMaterial.emissiveColor = new Color3(0, 0.1, 0);
    safetyPlaneMesh.material = safetyMaterial;

    if (scene.getPhysicsEngine()) {
        const safetyPhysics = new PhysicsAggregate(
            safetyPlaneMesh,
            PhysicsShapeType.BOX,
            { mass: 0 },
            scene
        );
        if (safetyPhysics.body) {
            safetyPhysics.body.setMotionType(PhysicsMotionType.STATIC);
        }
        logger.log("[createSafetyPlane] Safety plane created with physics at Z=-10");
    } else {
        logger.warn("[createSafetyPlane] Physics engine not available, plane without collision");
    }

    safetyPlaneMesh.isVisible = true;
    logger.log("[createSafetyPlane] Safety plane created under map at Z=-10 with green metric lines");
}
