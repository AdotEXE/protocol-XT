import { Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, Scene } from "@babylonjs/core";
import { TankController } from "../tankController";
import { TankModule, AttachmentPoint, TankModuleStats } from "../../shared/types/moduleTypes";
import { getModuleById, MODULES } from "../config/moduleRegistry";
import { logger } from "../utils/logger";
import { ChassisType } from "../tankTypes";
import { CHASSIS_SIZE_MULTIPLIERS } from "./tankChassis";

/**
 * ДИНАМИЧЕСКИЙ расчёт offset для модуля на основе РЕАЛЬНЫХ размеров танка.
 * Модули крепятся НАПРЯМУЮ на поверхность корпуса/башни/ствола.
 */
export function getAttachmentOffset(
    attachmentPoint: AttachmentPoint,
    chassisType: ChassisType
): Vector3 {
    // Получаем множители размера
    const multipliers = CHASSIS_SIZE_MULTIPLIERS[chassisType.id] || { width: 1, height: 1, depth: 1 };

    // Применяем множители к базовым размерам
    const w = chassisType.width * multipliers.width;
    const h = chassisType.height * multipliers.height;
    const d = chassisType.depth * multipliers.depth;

    // Размеры башни (пропорциональны к корпусу, как в TankController)
    const turretWidth = w * 0.65;
    const turretHeight = h * 0.75;
    const turretDepth = d * 0.6;

    switch (attachmentPoint) {
        case "chassis_front":
            // На переднем краю корпуса, слегка выше поверхности
            return new Vector3(0, h * 0.05, d * 0.48);

        case "chassis_side":
            // На боку корпуса (правая сторона)
            return new Vector3(w * 0.48, h * 0.05, 0);

        case "chassis_rear":
            // На заднем краю корпуса
            return new Vector3(0, h * 0.1, -d * 0.48);

        case "engine_deck":
            // На крыше моторного отсека (сзади сверху)
            return new Vector3(0, h * 0.52, -d * 0.3);

        case "turret_cheek":
            // На боку башни (локально относительно башни)
            return new Vector3(turretWidth * 0.48, turretHeight * 0.1, turretDepth * 0.1);

        case "turret_roof":
            // На крыше башни (локально относительно башни)
            return new Vector3(0, turretHeight * 0.52, -turretDepth * 0.1);

        case "barrel_mount":
            // На основании ствола (локально относительно ствола)
            return new Vector3(0, 0.03, 0.15);

        default:
            logger.warn(`[Equipment] Unknown attachment point: ${attachmentPoint}`);
            return Vector3.Zero();
    }
}

// Для обратной совместимости - базовые offsets (но НЕ использовать напрямую!)
export const ATTACHMENT_OFFSETS: Record<AttachmentPoint, Vector3> = {
    chassis_front: new Vector3(0, 0.15, 1.5),
    chassis_side: new Vector3(0.8, 0.15, 0),
    chassis_rear: new Vector3(0, 0.3, -1.5),
    engine_deck: new Vector3(0, 0.6, -1.2),
    turret_cheek: new Vector3(0.5, 0.2, 0.3),
    turret_roof: new Vector3(0, 0.6, -0.3),
    barrel_mount: new Vector3(0, 0.1, 0.3)
};

export class TankEquipmentModule {
    private tank: TankController;
    private scene: Scene;

    // Installed modules: AttachmentPoint -> Module ID
    private installedModules: Map<AttachmentPoint, string> = new Map();

    // Visual meshes: AttachmentPoint -> Mesh
    private moduleMeshes: Map<AttachmentPoint, Mesh> = new Map();

    // Aggregated Stats
    public stats: TankModuleStats = {};

    constructor(tank: TankController) {
        this.tank = tank;
        this.scene = tank.scene;
        // DO NOT load modules here! Construction happens before tank visuals are ready.
        // Must call initialize() explicitly after chassis/turret/barrel creation.
    }

    /**
     * Initialize equipment system - call this AFTER tank meshes are created
     */
    public initialize(): void {
        this.loadModules();
    }

    /**
     * Re-creates visuals for all equipped modules
     * Call this after tank is respawned or visuals are rebuilt
     */
    public refreshVisuals(): void {
        // Clear old meshes references (they are likely disposed along with parent)
        this.moduleMeshes.clear();

        // Re-create visuals for all installed modules
        for (const [slot, moduleId] of this.installedModules) {
            const module = getModuleById(moduleId);
            if (module) {
                this.createVisual(module);
            }
        }

        // Re-apply stats just in case
        this.recalculateStats();
    }

    /**
     * Load modules from localStorage
     */
    private loadModules(): void {
        try {
            const saved = localStorage.getItem("tank_modules_config");
            if (saved) {
                const config = JSON.parse(saved);
                for (const [slot, moduleId] of Object.entries(config)) {
                    if (typeof moduleId === 'string' && moduleId) {
                        // false = don't save yet (bulk loading)
                        this.equip(moduleId, false);
                    }
                }
                logger.log("[Equipment] Loaded saved modules");
            } else {
                // ИСПРАВЛЕНО: НЕ добавляем модули по умолчанию!
                // Модули должны быть выбраны игроком в гараже
                logger.log("[Equipment] No saved modules - tank starts without equipment");
            }
        } catch (e) {
            logger.error("[Equipment] Failed to load modules:", e);
        }
    }

    /**
     * Save modules to localStorage
     */
    private saveModules(): void {
        try {
            const config: Record<string, string> = {};
            for (const [slot, modId] of this.installedModules) {
                config[slot] = modId;
            }
            localStorage.setItem("tank_modules_config", JSON.stringify(config));
        } catch (e) {
            logger.error("[Equipment] Failed to save modules:", e);
        }
    }

    /**
     * Equip a module by ID
     */
    public equip(moduleId: string, save: boolean = true): boolean {
        const module = getModuleById(moduleId);
        if (!module) {
            logger.error(`[Equipment] Module not found: ${moduleId}`);
            return false;
        }

        // Unequip existing in this slot if any
        if (this.installedModules.has(module.attachmentPoint)) {
            const currentId = this.installedModules.get(module.attachmentPoint);
            // If already verified same module, skip
            if (currentId === moduleId) return true;
            this.unequip(module.attachmentPoint, false);
        }

        this.installedModules.set(module.attachmentPoint, moduleId);
        this.createVisual(module);
        this.recalculateStats();

        if (save) this.saveModules();

        logger.log(`[Equipment] Equipped ${module.name} to ${module.attachmentPoint}`);
        return true;
    }

    /**
     * Unequip slot
     */
    public unequip(slot: AttachmentPoint, save: boolean = true): void {
        if (this.moduleMeshes.has(slot)) {
            const mesh = this.moduleMeshes.get(slot);
            mesh?.dispose();
            this.moduleMeshes.delete(slot);
        }
        this.installedModules.delete(slot);
        this.recalculateStats();

        if (save) this.saveModules();
    }

    /**
     * Create visual mesh for module
     */
    private createVisual(module: TankModule, retryCount = 0): void {
        const MAX_RETRIES = 20; // 2 seconds total wait time

        // Parent determination
        let parent: Mesh;
        if (module.attachmentPoint.startsWith("turret")) {
            parent = this.tank.turret;
        } else if (module.attachmentPoint.startsWith("barrel")) {
            parent = this.tank.barrel;
        } else {
            parent = this.tank.chassis;
        }

        if (!parent) {
            if (retryCount < MAX_RETRIES) {
                // logger.warn(`[Equipment] Parent mesh not ready for ${module.name}, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
                setTimeout(() => this.createVisual(module, retryCount + 1), 100);
            } else {
                logger.error(`[Equipment] Parent mesh NEVER ready for ${module.name} after ${MAX_RETRIES} retries.`);
            }
            return;
        }

        // Create Mesh (Placeholder)
        let mesh: Mesh;
        const color = Color3.FromHexString(module.color || "#ffffff");
        const scale = module.scale || 1;

        if (module.modelPath === "cylinder_pair") {
            // Special case for Engine: Twin pipes (box вместо cylinder)
            mesh = new Mesh("mod_" + module.id, this.scene);
            const pipe1 = MeshBuilder.CreateBox("p1", { width: 0.3, height: 1, depth: 0.3 }, this.scene);
            const pipe2 = MeshBuilder.CreateBox("p2", { width: 0.3, height: 1, depth: 0.3 }, this.scene);
            pipe1.position.x = 0.3; pipe1.rotation.x = Math.PI / 2;
            pipe2.position.x = -0.3; pipe2.rotation.x = Math.PI / 2;
            pipe1.parent = mesh;
            pipe2.parent = mesh;

            // Material
            const mat = new StandardMaterial("mat_" + module.id, this.scene);
            mat.diffuseColor = color;
            mat.specularColor = new Color3(1, 1, 1);
            pipe1.material = mat;
            pipe2.material = mat;
        } else if (module.modelPath === "box_small") {
            mesh = MeshBuilder.CreateBox("mod_" + module.id, { size: 0.4 * scale }, this.scene);
            const mat = new StandardMaterial("mat_" + module.id, this.scene);
            mat.diffuseColor = color;
            mat.emissiveColor = color.scale(0.5); // Glow
            mesh.material = mat;
        } else {
            // Default Box
            mesh = MeshBuilder.CreateBox("mod_" + module.id, {
                width: 0.8 * scale,
                height: 0.2 * scale,
                depth: 0.8 * scale
            }, this.scene);
            const mat = new StandardMaterial("mat_" + module.id, this.scene);
            mat.diffuseColor = color;
            mesh.material = mat;
        }

        // ИСПРАВЛЕНО: Используем ДИНАМИЧЕСКИЙ расчёт offset на основе реальных размеров танка
        if (!this.tank.chassisType) {
            logger.error(`[Equipment] ChassisType not available for ${module.name}`);
            mesh.dispose();
            return;
        }

        // Получаем offset НАПРЯМУЮ от размеров танка
        const finalPos = getAttachmentOffset(module.attachmentPoint, this.tank.chassisType);

        // Прикрепляем модуль к родителю (chassis/turret/barrel)
        mesh.parent = parent;
        mesh.position = finalPos;

        logger.debug(`[Equipment] Module ${module.name} attached to ${module.attachmentPoint} at local pos: (${finalPos.x.toFixed(2)}, ${finalPos.y.toFixed(2)}, ${finalPos.z.toFixed(2)})`);

        this.moduleMeshes.set(module.attachmentPoint, mesh);
    }

    /**
     * Recalculate stats from all modules
     */
    private recalculateStats(): void {
        this.stats = {}; // Reset

        for (const [slot, modId] of this.installedModules) {
            const module = getModuleById(modId);
            if (!module || !module.stats) continue;

            // Sum up stats
            // Multipliers (cumulative)
            this.stats.speedMultiplier = (this.stats.speedMultiplier || 1) * (module.stats.speedMultiplier || 1);
            this.stats.damageMultiplier = (this.stats.damageMultiplier || 1) * (module.stats.damageMultiplier || 1);
            this.stats.armorMultiplier = (this.stats.armorMultiplier || 1) * (module.stats.armorMultiplier || 1);

            // Flat (additive)
            this.stats.massAdd = (this.stats.massAdd || 0) + (module.stats.massAdd || 0);
            this.stats.hpAdd = (this.stats.hpAdd || 0) + (module.stats.hpAdd || 0);

            // Flags (OR)
            if (module.stats.autoRepair) this.stats.autoRepair = true;
            if (module.stats.radarRange) this.stats.radarRange = (this.stats.radarRange || 0) + module.stats.radarRange;
        }

        logger.log("[Equipment] Stats updated:", this.stats);

        // Apply to TankController
        this.applyToTank();
    }

    private applyToTank(): void {
        // Apply stats to TankController
        // We assume TankController has public properties for these

        // FIX: Ensure TankController initializes _initial values correctly before this runs
        // If _initialMoveSpeed is missing, we must set it from current moveSpeed to avoid multiplying undefined or already multiplied values.
        if (this.tank["_initialMoveSpeed"] === undefined) {
            this.tank["_initialMoveSpeed"] = this.tank.moveSpeed || 20; // Default fallback
        }
        if (this.tank["_initialTurnSpeed"] === undefined) {
            this.tank["_initialTurnSpeed"] = this.tank.turnSpeed || 2.0; // Default fallback
        }

        // Speed
        if (this.stats.speedMultiplier) {
            this.tank.moveSpeed = this.tank["_initialMoveSpeed"]! * this.stats.speedMultiplier;
        }

        // Turn Speed
        if (this.stats.turnSpeedMultiplier) {
            this.tank.turnSpeed = this.tank["_initialTurnSpeed"]! * this.stats.turnSpeedMultiplier;
        }

        // Reload (Cooldown)
        // Note: TankController uses 'cooldown' and 'baseCooldown'
        if ((this.tank as any)["_initialCooldown"] && this.stats.reloadMultiplier) {
            // Lower multiplier = faster reload
            this.tank.baseCooldown = (this.tank as any)["_initialCooldown"] * this.stats.reloadMultiplier;
        }

        // Armor / HP
        if (this.stats.hpAdd) {
            // Need to increase maxHealth dynamically
            const baseMaxHealth = (this.tank as any)["_initialMaxHealth"] || 100;
            this.tank.maxHealth = baseMaxHealth + this.stats.hpAdd;
            // If current health is full, boost it too
            if (this.tank.currentHealth >= baseMaxHealth) {
                this.tank.currentHealth = this.tank.maxHealth;
            }
        }

        logger.log(`[Equipment] Applied stats to tank. Speed: ${this.tank.moveSpeed}, HP: ${this.tank.maxHealth}`);
    }
}
