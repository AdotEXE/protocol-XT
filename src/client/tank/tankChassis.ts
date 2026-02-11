/**
 * Tank Chassis Creation Module
 * Вынесенная логика создания корпусов танков из tankController.ts
 * 
 * Детали добавляются только для: light, medium, racer, scout
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { ChassisType } from "../tankTypes";
import { loadSelectedSkin, getSkinById, applySkinToTank, applySkinColorToMaterial } from "./tankSkins";
import { ChassisDetailsGenerator } from "../garage/chassisDetails";
import { MaterialFactory } from "../garage/materials";
import { logger } from "../utils/logger";

/**
 * Множители размеров для каждого типа корпуса
 * Используются для синхронизации визуального меша и физического хитбокса
 */
export const CHASSIS_SIZE_MULTIPLIERS: Record<string, { width: number, height: number, depth: number }> = {
    "light": { width: 0.75, height: 0.85, depth: 1.2 },
    "scout": { width: 0.7, height: 0.65, depth: 0.85 },
    "heavy": { width: 1.08, height: 1.2, depth: 1.08 },
    "assault": { width: 1.12, height: 1.1, depth: 1.05 },
    "stealth": { width: 1.05, height: 0.7, depth: 1.15 },
    "hover": { width: 1.1, height: 0.95, depth: 1.1 },
    "siege": { width: 1.25, height: 1.35, depth: 1.2 },
    "racer": { width: 0.75, height: 0.75, depth: 1.3 },
    "amphibious": { width: 1.15, height: 1.1, depth: 1.1 },
    "shield": { width: 1.2, height: 1.1, depth: 1.2 },
    "drone": { width: 1.1, height: 1.12, depth: 1.05 },
    "artillery": { width: 1.2, height: 1.25, depth: 1.15 },
    "destroyer": { width: 0.85, height: 0.75, depth: 1.4 },
    "command": { width: 1.1, height: 1.2, depth: 1.1 },
    "medium": { width: 1.0, height: 1.0, depth: 1.0 },
    "plane": { width: 1.0, height: 1.0, depth: 1.0 }
};

export interface ChassisAnimationElements {
    stealthActive?: boolean;
    stealthMesh?: Mesh;
    hoverThrusters?: Mesh[];
    shieldMesh?: Mesh;
    shieldActive?: boolean;
    droneMeshes?: Mesh[];
    commandAura?: Mesh;
    energyBoosters?: Mesh[];
    animationTime?: number;
}

/**
 * Создает уникальный корпус танка по типу
 */
export function createUniqueChassis(
    chassisType: ChassisType,
    scene: Scene,
    position: Vector3,
    animationElements: ChassisAnimationElements,
    overrideColor?: string,
    customIdPrefix?: string
): Mesh {
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    const color = overrideColor ? Color3.FromHexString(overrideColor) : Color3.FromHexString(chassisType.color);

    // КРИТИЧНО: Уникальное имя для каждого меша, чтобы избежать дублирования
    const prefix = customIdPrefix || "tankHull_";
    const uniqueId = `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // КРИТИЧНО: Удаляем все старые меши корпуса с паттерном tankHull_, чтобы избежать дублирования
    const oldMeshes = scene.meshes.filter(mesh =>
        mesh.name && mesh.name.startsWith(prefix) && !mesh.isDisposed()
    );
    oldMeshes.forEach(mesh => {
        try {
            // КРИТИЧНО: Удаляем все дочерние меши перед удалением родительского
            if (mesh.getChildren && mesh.getChildren().length > 0) {
                const children = mesh.getChildren();
                children.forEach((child: any) => {
                    if (child.dispose && !child.isDisposed()) {
                        try {
                            child.dispose();
                        } catch (e) {
                            // Игнорируем ошибки при удалении дочерних мешей
                        }
                    }
                });
            }
            mesh.dispose();
        } catch (e) {
            // Игнорируем ошибки при удалении уже удаленных мешей
        }
    });

    // Base chassis mesh - более выразительные пропорции
    // Используем централизованные множители для синхронизации с физикой
    const multipliers = CHASSIS_SIZE_MULTIPLIERS[chassisType.id] || CHASSIS_SIZE_MULTIPLIERS["medium"] || { width: 1, height: 1, depth: 1 };

    // Для hover и shield используем Math.max для width/depth (как было в оригинале)
    let finalWidth = w * multipliers.width;
    let finalDepth = d * multipliers.depth;

    if (chassisType.id === "hover" || chassisType.id === "shield") {
        const maxSize = Math.max(w, d) * multipliers.width;
        finalWidth = maxSize;
        finalDepth = maxSize;
    }

    const chassis = MeshBuilder.CreateBox(uniqueId, {
        width: finalWidth,
        height: h * multipliers.height,
        depth: finalDepth
    }, scene);

    chassis.position.copyFrom(position);

    // Поднимаем низкопрофильные корпуса выше от пола (fix: касание пола/гусениц)
    const yOffsets: Record<string, number> = {
        "racer": 0.10,   // Racer - небольшой подъём
        "light": 0.08,   // Light - небольшой подъём
        "scout": 0.12    // Scout - низкий
    };
    const yOffset = yOffsets[chassisType.id] || 0;
    chassis.position.y += yOffset;

    // Base material - улучшенный low-poly стиль
    // КРИТИЧНО: Уникальное имя для материала, чтобы избежать конфликтов
    const uniqueMatId = `tankMat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mat = new StandardMaterial(uniqueMatId, scene);

    // КРИТИЧНО: Для сетевых танков используем overrideColor, иначе применяем скин локального игрока
    if (overrideColor) {
        // Для сетевых танков используем переданный цвет напрямую
        mat.diffuseColor = color; // color уже вычислен из overrideColor выше (строка 63)
    } else {
        // Для локального танка применяем скин если выбран
        const selectedSkinId = loadSelectedSkin();
        if (selectedSkinId) {
            const skin = getSkinById(selectedSkinId);
            if (skin) {
                const skinColors = applySkinToTank(skin);
                mat.diffuseColor = skinColors.chassisColor;
                logger.log(`[SKIN] Applied skin "${skin.name}" to chassis during creation`);
            } else {
                mat.diffuseColor = color;
            }
        } else {
            mat.diffuseColor = color;
        }
    }

    mat.specularColor = Color3.Black();
    mat.disableLighting = false;
    mat.freeze();
    chassis.material = mat;

    // Add visual details for specific chassis types only: light, medium, racer, scout
    // КРИТИЧНО: Детали - это ТОЛЬКО визуальные элементы, они НЕ участвуют в физике!
    // Детали привязываются как дочерние меши (parent = chassis) и не имеют physicsBody
    // Хитбокс создаётся ТОЛЬКО для основного корпуса (chassis mesh) как простой прямоугольник
    addChassisDetails(chassis, chassisType, scene, color, animationElements);

    // Для самолёта скрываем основной меш (коробку) - показываем только детали МиГ-31
    if (chassisType.id === "plane") {
        chassis.isVisible = false;
    }

    return chassis;
}

/**
 * Добавляет детали к корпусу танка
 * ДЕТАЛИ ТОЛЬКО ДЛЯ: light, medium, racer, scout
 * 
 * КРИТИЧНО: Детали - это ТОЛЬКО визуальные элементы (люки, фары, выхлопы и т.д.)
 * Они привязываются как дочерние меши (parent = chassis) и НЕ участвуют в физике!
 * Хитбоксы создаются ТОЛЬКО для основного корпуса, башни и ствола как простые прямоугольники.
 */
export function addChassisDetails(
    chassis: Mesh,
    chassisType: ChassisType,
    scene: Scene,
    baseColor: Color3,
    animationElements: ChassisAnimationElements
): void {
    // ФИЛЬТР: Детали только для light, medium, racer, scout, plane
    const detailedChassis = ["light", "medium", "racer", "scout", "plane"];
    if (!detailedChassis.includes(chassisType.id)) {
        return; // Нет деталей для других корпусов
    }

    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;

    // Материалы
    const armorMat = MaterialFactory.createArmorMaterial(scene, baseColor, "game");
    const accentMat = MaterialFactory.createAccentMaterial(scene, baseColor, "game");

    switch (chassisType.id) {
        case "light":
            // Light - наклонная броня, воздухозаборники, спойлер
            ChassisDetailsGenerator.createSlopedArmor(scene, chassis, new Vector3(0, h * 0.15, d * 0.52), w * 0.88, h * 0.6, 0.2, -Math.PI / 6, armorMat, "gameLight");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createIntake(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45), 0.3, h * 0.65, 0.35, accentMat, `gameLight${i}`);
            }
            ChassisDetailsGenerator.createSpoiler(scene, chassis, new Vector3(0, h * 0.5, -d * 0.48), w * 1.2, 0.2, 0.25, accentMat, "gameLight");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createFairing(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.5, 0, d * 0.2), 0.15, h * 0.75, d * 0.55, accentMat, `gameLight${i}`);
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createHatch(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.48, -d * 0.1), 0.2, 0.08, 0.2, armorMat, `gameLight${i}`);
            }
            ChassisDetailsGenerator.createExhaust(scene, chassis, new Vector3(w * 0.35, h * 0.2, -d * 0.48), 0.15, 0.15, 0.2, armorMat, "gameLight");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createHeadlight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.5), 0.08, 0.08, 0.06, i, "gameLight");
            }
            ChassisDetailsGenerator.createShovel(scene, chassis, new Vector3(-w * 0.4, h * 0.2, -d * 0.48), 0.12, 0.3, 0.02, armorMat, "gameLight");
            ChassisDetailsGenerator.createAxe(scene, chassis, new Vector3(-w * 0.3, h * 0.25, -d * 0.48), 0.25, 0.08, 0.02, armorMat, "gameLight");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createVent(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1), 0.05, 0.12, 0.15, i, "gameLight");
            }
            ChassisDetailsGenerator.createPeriscope(scene, chassis, new Vector3(0, h * 0.55, -d * 0.1), 0.15, 0.06, 0, "gameLight");
            ChassisDetailsGenerator.createBinocular(scene, chassis, new Vector3(0, h * 0.48, d * 0.4), 0.2, 0.08, 0.12, "gameLight");
            for (let i = 0; i < 3; i++) {
                ChassisDetailsGenerator.createArmorPlate(scene, chassis, new Vector3((i - 1) * w * 0.25, h * 0.05, d * 0.48), w * 0.25, h * 0.15, 0.08, armorMat, `gameLight${i}`);
            }
            ChassisDetailsGenerator.createAntenna(scene, chassis, new Vector3(0, h * 0.6, -d * 0.4), 0.4, 0.02, "gameLight");
            ChassisDetailsGenerator.createAntennaBase(scene, chassis, new Vector3(0, h * 0.52, -d * 0.4), 0.08, armorMat, "gameLight");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createArmorScreen(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, d * 0.05), 0.12, h * 0.5, d * 0.3, 0, armorMat, `gameLight${i}`);
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createTailLight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, -d * 0.49), 0.05, 0.08, 0.03, i, "gameLight");
            }
            break;

        case "medium":
            // Medium - классический Т-34, наклонная броня
            ChassisDetailsGenerator.createSlopedArmor(scene, chassis, new Vector3(0, h * 0.1, d * 0.5), w * 0.9, h * 0.7, 0.18, -Math.PI / 4, armorMat, "gameMedium");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createHatch(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1), 0.22, 0.08, 0.22, armorMat, `gameMedium${i}`);
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createExhaust(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.18, -d * 0.45), 0.12, 0.12, 0.18, armorMat, `gameMedium${i}`);
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createHeadlight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.12, d * 0.48), 0.1, 0.1, 0.08, i, "gameMedium");
            }
            ChassisDetailsGenerator.createShovel(scene, chassis, new Vector3(-w * 0.42, h * 0.18, -d * 0.45), 0.14, 0.35, 0.02, armorMat, "gameMedium");
            ChassisDetailsGenerator.createCanister(scene, chassis, new Vector3(w * 0.42, h * 0.2, -d * 0.4), 0.12, 0.2, 0.12, armorMat, "gameMedium");
            for (let i = 0; i < 3; i++) {
                ChassisDetailsGenerator.createVent(scene, chassis, new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3), 0.08, 0.05, 0.1, i, "gameMedium");
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createPeriscope(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.55, -d * 0.1), 0.18, 0.07, i, "gameMedium");
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createArmorPlate(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.05, d * 0.48), w * 0.3, h * 0.2, 0.1, armorMat, `gameMedium${i}`);
            }
            ChassisDetailsGenerator.createArmorPlate(scene, chassis, new Vector3(0, h * 0.2, d * 0.49), w * 0.2, h * 0.15, 0.12, armorMat, "gameMediumCenter");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createArmorScreen(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.15, d * 0.1), 0.15, h * 0.6, d * 0.35, 0, armorMat, `gameMedium${i}`);
            }
            ChassisDetailsGenerator.createAntenna(scene, chassis, new Vector3(0, h * 0.65, -d * 0.35), 0.5, 0.025, "gameMedium");
            ChassisDetailsGenerator.createAntennaBase(scene, chassis, new Vector3(0, h * 0.54, -d * 0.35), 0.1, armorMat, "gameMedium");
            ChassisDetailsGenerator.createSight(scene, chassis, new Vector3(0, h * 0.25, d * 0.48), 0.12, 0.08, 0.1, "gameMedium");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createTailLight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.15, -d * 0.49), 0.06, 0.1, 0.04, i, "gameMedium");
            }
            break;

        case "racer":
            // Racer - низкий спортивный стиль
            ChassisDetailsGenerator.createSpoiler(scene, chassis, new Vector3(0, -h * 0.4, d * 0.48), w * 0.9, 0.12, 0.15, accentMat, "gameRacer");
            ChassisDetailsGenerator.createSpoiler(scene, chassis, new Vector3(0, h * 0.45, -d * 0.48), w * 1.1, 0.25, 0.2, accentMat, "gameRacerBack");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createFairing(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.1), 0.12, h * 0.6, d * 0.7, accentMat, `gameRacer${i}`);
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createHeadlight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.32, h * 0.1, d * 0.49), 0.15, 0.12, 0.1, i, "gameRacer");
            }
            ChassisDetailsGenerator.createIntake(scene, chassis, new Vector3(0, h * 0.15, d * 0.48), w * 0.4, h * 0.25, 0.08, MaterialFactory.createVentMaterial(scene, 0, "gameRacer"), "gameRacer");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createIntake(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.42, d * 0.3), 0.18, 0.08, 0.12, MaterialFactory.createVentMaterial(scene, i, "gameRacer"), `gameRacerTop${i}`);
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createExhaustCylindrical(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.48), 0.3, 0.1, `gameRacer${i}`);
                ChassisDetailsGenerator.createExhaustHole(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.52), 0.05, 0.08, i, `gameRacer${i}`);
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createMirror(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.35, d * 0.35), 0.08, 0.05, 0.04, i, "gameRacer");
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createTailLight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.12, -d * 0.49), 0.08, 0.12, 0.04, i, "gameRacer");
            }
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 3; j++) {
                    ChassisDetailsGenerator.createVent(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.05, d * 0.1 + (j - 1) * d * 0.15), 0.04, 0.1, 0.04, j, `gameRacer${i}`);
                }
            }
            ChassisDetailsGenerator.createHatch(scene, chassis, new Vector3(0, h * 0.46, -d * 0.1), 0.3, 0.06, 0.25, armorMat, "gameRacer");
            ChassisDetailsGenerator.createPeriscope(scene, chassis, new Vector3(0, h * 0.56, -d * 0.1), 0.2, 0.06, 0, "gameRacer");
            break;

        case "scout":
            // Scout - острый клиновидный нос, минимальный профиль
            ChassisDetailsGenerator.createSlopedArmor(scene, chassis, new Vector3(0, 0, d * 0.5), w * 0.8, h * 0.7, 0.4, -Math.PI / 4, accentMat, "gameScout");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createWing(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.48, -h * 0.05, d * 0.3), 0.15, h * 0.85, d * 0.6, accentMat, `gameScout${i}`);
            }
            ChassisDetailsGenerator.createDiffuser(scene, chassis, new Vector3(0, -h * 0.42, -d * 0.45), w * 0.9, 0.15, 0.2, accentMat, "gameScout");
            ChassisDetailsGenerator.createHatch(scene, chassis, new Vector3(0, h * 0.42, 0), 0.18, 0.06, 0.18, armorMat, "gameScout");
            ChassisDetailsGenerator.createAntenna(scene, chassis, new Vector3(0, h * 0.45, -d * 0.45), 0.3, 0.02, "gameScout");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createHeadlight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48), 0.06, 0.06, 0.04, i, "gameScout");
            }
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createVent(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15), 0.04, 0.08, 0.12, i, "gameScout");
            }
            ChassisDetailsGenerator.createPeriscope(scene, chassis, new Vector3(0, h * 0.5, 0), 0.05, 0.12, 0, "gameScoutPeriscope");
            ChassisDetailsGenerator.createSight(scene, chassis, new Vector3(0, h * 0.2, d * 0.48), 0.1, 0.06, 0.08, "gameScout");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createArmorPlate(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.2, h * 0.02, d * 0.48), w * 0.25, h * 0.12, 0.06, armorMat, `gameScout${i}`);
            }
            ChassisDetailsGenerator.createExhaust(scene, chassis, new Vector3(w * 0.3, h * 0.15, -d * 0.48), 0.1, 0.1, 0.15, armorMat, "gameScout");
            for (let i = 0; i < 2; i++) {
                ChassisDetailsGenerator.createTailLight(scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.12, -d * 0.49), 0.04, 0.06, 0.03, i, "gameScout");
            }
            break;
        case "plane":
            ChassisDetailsGenerator.addPlaneDetails(
                scene, chassis,
                w, h, d,
                baseColor, "game"
            );
            break;
    }
}
