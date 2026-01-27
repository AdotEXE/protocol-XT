import { Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, Scene } from "@babylonjs/core";
import { TankController } from "../tankController";
import { TankModule, AttachmentPoint, TankModuleStats } from "../../shared/types/moduleTypes";
import { getModuleById, MODULES } from "../config/moduleRegistry";
import { logger } from "../utils/logger";

// Offsets relative to parent (Chassis or Turret center)
const ATTACHMENT_OFFSETS: Record<AttachmentPoint, Vector3> = {
    chassis_front: new Vector3(0, 0.2, 2.1),   // Front Plate
    chassis_side: new Vector3(1.1, 0.2, 0),    // Side Skirts
    chassis_rear: new Vector3(0, 0.4, -2.3),   // Rear Plate
    engine_deck: new Vector3(0, 0.9, -1.8),    // Engine Deck
    turret_cheek: new Vector3(0.8, 0.3, 0.5),  // Side of Turret
    turret_roof: new Vector3(0, 0.9, -0.5),    // Top of Turret
    barrel_mount: new Vector3(0, 0.2, 0.5)     // Base of Barrel
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
        // Load saved modules on startup
        this.loadModules();
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
                // Default loadout for new players
                // Only equip if nothing saved
                this.equip("module_armor_composite", false);
                this.equip("module_engine_turbo", false);
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
    private createVisual(module: TankModule): void {
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
            logger.warn(`[Equipment] Parent mesh not ready for ${module.name}`);
            return;
        }

        // Create Mesh (Placeholder)
        let mesh: Mesh;
        const color = Color3.FromHexString(module.color || "#ffffff");
        const scale = module.scale || 1;

        if (module.modelPath === "cylinder_pair") {
            // Special case for Engine: Twin pipes
            mesh = new Mesh("mod_" + module.id, this.scene);
            const pipe1 = MeshBuilder.CreateCylinder("p1", { height: 1, diameter: 0.3 }, this.scene);
            const pipe2 = MeshBuilder.CreateCylinder("p2", { height: 1, diameter: 0.3 }, this.scene);
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

        // Positioning
        const offset = ATTACHMENT_OFFSETS[module.attachmentPoint];
        mesh.parent = parent;
        mesh.position = offset.clone(); // Relative to parent
        // mesh.rotation?

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
        // TODO: Ensure TankController initializes _initial values correctly before this runs

        // Speed
        if (this.tank["_initialMoveSpeed"] && this.stats.speedMultiplier) {
            this.tank.moveSpeed = this.tank["_initialMoveSpeed"] * this.stats.speedMultiplier;
        }

        // Turn Speed
        if (this.tank["_initialTurnSpeed"] && this.stats.turnSpeedMultiplier) {
            this.tank.turnSpeed = this.tank["_initialTurnSpeed"] * this.stats.turnSpeedMultiplier;
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
