/**
 * NetworkPlayerTank - Танк сетевого игрока
 * 
 * ВАЖНО: Создаёт РЕАЛЬНЫЕ детализированные модели танков для сетевых игроков.
 * Использует ту же логику создания, что и локальный танк, но с уникальными именами мешей.
 */

import { Scene, Vector3, Mesh, AbstractMesh, Node, MeshBuilder, StandardMaterial, Color3, PhysicsAggregate, PhysicsShapeType, PhysicsMotionType, Ray, Matrix, Quaternion, DynamicTexture } from "@babylonjs/core";
import type { NetworkPlayer } from "./multiplayer";
import { vector3Pool } from "./optimization/Vector3Pool";

import { getChassisById, getCannonById, getTrackById, type ChassisType, type CannonType, type TrackType } from "./tankTypes";
import { createUniqueCannon, type CannonAnimationElements } from "./tank/tankCannon";
import { ChassisDetailsGenerator } from "./garage/chassisDetails";
import { MaterialFactory } from "./garage/materials";
import type { EffectsManager } from "./effects";
import { createUniqueChassis, type ChassisAnimationElements, CHASSIS_SIZE_MULTIPLIERS } from "./tank/tankChassis";
import { getAttachmentOffset } from "./tank/tankEquipment";
import { getModuleById } from "./config/moduleRegistry";
import type { TankModule } from "../shared/types/moduleTypes";
// createVisualTracks removed - using createVisualWheels with trackType instead

export class NetworkPlayerTank {
    scene: Scene;
    playerId: string;

    // === ВИЗУАЛЬНЫЕ КОМПОНЕНТЫ ТАНКА ===
    // Основные части
    chassis: Mesh;           // Корпус танка
    turret: Mesh;            // Башня
    barrel: Mesh;            // Ствол пушки

    // Дополнительные части (гусеницы, детали)
    private leftTrack: Mesh | null = null;   // Левая гусеница
    private rightTrack: Mesh | null = null;  // Правая гусеница

    // ОПТИМИЗАЦИЯ: Кэш дочерних мешей для LOD (избегаем getChildMeshes() каждый кадр)
    private _cachedDetailMeshes: AbstractMesh[] | null = null;

    // === МОДУЛИ (ПОДГОТОВКА ДЛЯ БУДУЩЕГО) ===
    // Модули крепятся на танк и отображаются только если приобретены и выбраны
    private attachedModules: Map<string, Mesh> = new Map();
    // Точки крепления для модулей (заполняются при создании танка)
    private moduleAttachPoints: {
        chassis: { front: Vector3; back: Vector3; left: Vector3; right: Vector3; top: Vector3 };
        turret: { front: Vector3; back: Vector3; left: Vector3; right: Vector3; top: Vector3 };
    } | null = null;

    // Physics
    physicsAggregate: PhysicsAggregate | null = null;

    // Tank types
    private chassisType: ChassisType;
    private cannonType: CannonType;
    private trackType: TrackType;

    // Network player reference
    networkPlayer: NetworkPlayer;

    // Interpolation
    private interpolationAlpha: number = 0;
    private readonly INTERPOLATION_SPEED = 15; // КРИТИЧНО: Увеличено до 15 для РЕЗКОГО движения как в шутерах
    private lastNetworkUpdateTime: number = 0;

    // Position buffer for smooth interpolation
    private positionBuffer: { x: number; y: number; z: number; rotation: number; time: number }[] = [];
    private readonly BUFFER_SIZE = 3; // Храним 3 последних позиции для сглаживания

    // ОПТИМИЗАЦИЯ: Кэш усредненной позиции для избежания пересчета каждый кадр
    private _cachedAveragePosition: { x: number; y: number; z: number; rotation: number } | null = null;
    private _cachedAverageFrame = -1;
    private _lastBufferUpdateFrame = -1;

    // Сглаживание Y
    private _smoothedTargetY: number | null = null;
    private _isStationary: boolean = false;

    private _lastBufferHash = 0; // Хэш для отслеживания изменений буфера

    // КРИТИЧНО: Флаг для мгновенной телепортации при первом обновлении
    needsInitialSync: boolean = true;
    // КРИТИЧНО: Флаг для мгновенной телепортации при респавне
    needsRespawnTeleport: boolean = false;

    // Animation State
    private isSpawning: boolean = false;
    private destroyedParts: {
        mesh: AbstractMesh;
        name: string;
        originalParent: Node | null;
        originalLocalPos: Vector3;
        originalLocalRot: Quaternion | null;
    }[] = [];

    // Cubic interpolation state
    private useCubicInterpolation: boolean = true; // Enable cubic interpolation
    private interpolationStartTime: number = 0;

    // Dead reckoning state
    private lastExtrapolatedPosition: Vector3 | null = null;
    private maxExtrapolationTime: number = 0; // ОТКЛЮЧЕНО: Dead reckoning отключён полностью - главный источник дёрганья

    // Health tracking for visual display
    private health: number = 100;
    private maxHealth: number = 100;
    private healthBar: Mesh | null = null;
    private healthBarBackground: Mesh | null = null;

    // HP Bar Refactor: Temporary on-hit display with distance
    private lastHitTime: number = 0;
    private readonly HP_BAR_VISIBLE_DURATION = 3000; // 3 seconds
    private distanceTextPlane: Mesh | null = null;
    private distanceTexture: DynamicTexture | null = null;

    // Unique ID for this tank (to avoid mesh name conflicts)
    private uniqueId: string;

    // Effects
    private effectsManager: EffectsManager | null = null;
    private prevStatus: string = "alive";

    // Debug counter for rotation logging
    private _rotLogCounter: number = 0;

    // Debug counter for update logging
    private _updateCounter: number = 0;

    // ОПТИМИЗАЦИЯ: Счетчик кадров для throttling дорогих операций
    private _frameCounter: number = 0;

    // ОПТИМИЗАЦИЯ: Кэш Euler углов (избегаем toEulerAngles() каждый кадр)
    private _cachedEulerYaw: number = 0;
    private _cachedEulerPitch: number = 0;
    private _cachedEulerRoll: number = 0;

    // ИСПРАВЛЕНИЕ: Сохраняем последнее валидное значение поворота башни
    // чтобы предотвратить "пропадание" поворота при потере пакетов
    private _lastValidTurretRotation: number = 0;

    // Animation elements for chassis (hover, stealth, etc.)
    private chassisAnimationElements: ChassisAnimationElements = {};

    constructor(scene: Scene, networkPlayer: NetworkPlayer, effectsManager?: EffectsManager) {
        this.scene = scene;
        this.playerId = networkPlayer.id;
        this.networkPlayer = networkPlayer;
        this.effectsManager = effectsManager || null;
        this.uniqueId = `net_${this.playerId}_${Date.now()}`;

        // Validate scene
        if (!scene) {
            logger.error(`[NetworkPlayerTank] Cannot create tank: scene is null for player ${this.playerId}`);
            throw new Error("Scene is required to create NetworkPlayerTank");
        }

        // Validate network player
        if (!networkPlayer || !networkPlayer.position) {
            logger.error(`[NetworkPlayerTank] Cannot create tank: invalid networkPlayer for ${this.playerId}`);
            throw new Error("Valid networkPlayer with position is required");
        }

        // Get tank types from network player or use defaults
        this.chassisType = getChassisById(networkPlayer.chassisType || "medium");
        this.cannonType = getCannonById(networkPlayer.cannonType || "standard");
        // Track type from network player
        this.trackType = getTrackById(networkPlayer.trackType || "standard");

        // Create tank visuals using REAL detailed models
        this.chassis = this.createDetailedChassis();
        this.turret = this.createDetailedTurret();
        this.barrel = this.createDetailedBarrel();

        // FIX: Add visual wheels (missing in previous version)
        this.createVisualWheels();

        // Set initial position
        if (networkPlayer.position) {
            this.chassis.position.copyFrom(networkPlayer.position);

            // КРИТИЧНО: Проверяем высоту террейна для правильного спавна
            // Используем отложенную проверку, чтобы карта успела загрузиться
            this.correctSpawnHeight();
        } else {
            this.chassis.position.set(0, 2, 0);
        }

        // Set initial rotation
        this.chassis.rotation.y = networkPlayer.rotation || 0;
        this.turret.rotation.y = networkPlayer.turretRotation || 0;
        this.barrel.rotation.x = -(networkPlayer.aimPitch || 0);

        // КРИТИЧНО: Принудительно делаем танк видимым
        this.chassis.isVisible = true;
        this.chassis.setEnabled(true);
        this.chassis.isPickable = true;

        // Делаем все дочерние меши видимыми
        this.chassis.getChildMeshes().forEach(child => {
            child.isVisible = true;
            child.setEnabled(true);
        });

        if (this.turret) {
            this.turret.isVisible = true;
            this.turret.setEnabled(true);
        }

        if (this.barrel) {
            this.barrel.isVisible = true;
            this.barrel.setEnabled(true);
            this.barrel.getChildMeshes().forEach(child => {
                child.isVisible = true;
                child.setEnabled(true);
            });
        }

        // Initialize Physics (CRITICAL for collisions)
        // Use ANIMATED motion type so it moves via interpolation but still collides
        this.physicsAggregate = new PhysicsAggregate(
            this.chassis,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0, friction: 0 },
            this.scene
        );
        this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
        this.physicsAggregate.body.disablePreStep = false;

        // КРИТИЧНО: Включаем checkCollisions для обнаружения попаданий через raycast
        this.chassis.checkCollisions = true;
        this.chassis.getChildMeshes().forEach(m => m.checkCollisions = true);
        if (this.turret) {
            this.turret.checkCollisions = true;
            this.turret.getChildMeshes().forEach(m => m.checkCollisions = true);
        }
        if (this.barrel) {
            this.barrel.checkCollisions = true;
            this.barrel.getChildMeshes().forEach(m => m.checkCollisions = true);
        }

        // Инициализируем полоску здоровья
        this.createHealthBarVisuals();
        this.updateHealthBarVisuals();

        // Mark network update time
        this.lastNetworkUpdateTime = Date.now();

        // Apply modules
        this.updateModules(networkPlayer.modules);
    }

    /**
     * Updates the visual parts of the tank (chassis, turret, barrel, colors).
     * Used when receiving DRESS_UPDATE RPC or when player properties change.
     */
    updateParts(data: { chassisType?: string; cannonType?: string; trackType?: string; tankColor?: string; turretColor?: string }): void {
        logger.log(`[NetworkPlayerTank] 🛠️ Updating parts for ${this.playerId}:`, data);

        // Update local data
        if (data.chassisType) this.networkPlayer.chassisType = data.chassisType;
        if (data.cannonType) this.networkPlayer.cannonType = data.cannonType;
        if (data.trackType) this.networkPlayer.trackType = data.trackType;
        if (data.tankColor) this.networkPlayer.tankColor = data.tankColor;
        if (data.turretColor) this.networkPlayer.turretColor = data.turretColor;

        // Resolve new types
        const newChassisType = getChassisById(this.networkPlayer.chassisType || "medium");
        const newCannonType = getCannonById(this.networkPlayer.cannonType || "standard");

        // Check if full recreation is needed
        const chassisChanged = newChassisType.id !== this.chassisType.id;
        const cannonChanged = newCannonType.id !== this.cannonType.id;
        // Also recreate if colors changed significantly (simplest way to apply new materials)
        const colorsChanged = !!data.tankColor || !!data.turretColor;

        if (chassisChanged || colorsChanged) {
            this.chassisType = newChassisType;

            // Эффект переодевания корпуса: голубое свечение корпуса
            if (this.effectsManager && this.chassis) {
                const effectPos = this.chassis.position.clone();
                effectPos.y += this.chassisType.height * 0.5; // Центр корпуса
                // Создаём эффект телепорта (голубое свечение)
                this.effectsManager.createTeleportEffect(effectPos);
            }

            // Dispose old chassis parts (tracks etc are children usually, but we keep refs)
            if (this.leftTrack) this.leftTrack.dispose();
            if (this.rightTrack) this.rightTrack.dispose();

            // Store current transform
            const pos = this.chassis.position.clone();
            const rot = this.chassis.rotationQuaternion ? this.chassis.rotationQuaternion.clone() : null;
            const rotEuler = this.chassis.rotation.clone();

            // Recreate chassis
            // Note: This is complex because we need to dispose the ROOT mesh which destroys everything attached (turret, etc)
            // So we really need to rebuild the whole tank.

            this.rebuildTank();
            return;
        }

        if (cannonChanged) {
            this.cannonType = newCannonType;

            // Эффект переодевания пушки: золотистое свечение ствола
            if (this.effectsManager && this.barrel) {
                const effectPos = this.barrel.position.clone();
                // Эффект телепорта для золотистого свечения ствола
                this.effectsManager.createTeleportEffect(effectPos);
            }

            // If only cannon changed, we could try to just replace the barrel, 
            // but 'createDetailedBarrel' assumes it attaches to 'this.turret'.
            // Safest to just rebuild turret + barrel or the whole tank.
            this.rebuildTank();
            return;
        }

        // Check track type change (if supported in future)
        const newTrackType = getTrackById(this.networkPlayer.trackType || "standard");
        if (newTrackType.id !== this.trackType.id) {
            this.trackType = newTrackType;

            // Эффект переодевания гусениц: искры от гусениц
            if (this.effectsManager && this.chassis) {
                const leftPos = this.chassis.position.clone();
                leftPos.x -= this.chassisType.width * 0.55;
                const rightPos = this.chassis.position.clone();
                rightPos.x += this.chassisType.width * 0.55;
                // Искры от гусениц (используем эффект взрыва с маленьким радиусом)
                this.effectsManager.createExplosion(leftPos, 0.3);
                this.effectsManager.createExplosion(rightPos, 0.3);
            }

            this.rebuildTank();
            return;
        }
    }

    private rebuildTank(): void {
        console.log(`[NetworkPlayerTank] 🔄 Rebuilding tank visual for ${this.playerId}`);

        // Update unique ID to ensure fresh mesh names (prevents caching issues)
        this.uniqueId = `net_${this.playerId}_${Date.now()}`;

        // Save state
        const pos = this.chassis.position.clone();
        const rotQ = this.chassis.rotationQuaternion ? this.chassis.rotationQuaternion.clone() : null;
        const rotE = this.chassis.rotation.clone();
        const turretMsgRot = this.turret ? this.turret.rotation.y : 0;
        const barrelRot = this.barrel ? this.barrel.rotation.x : 0;

        // КРИТИЧНО: Очищаем кэш дочерних мешей перед удалением (старые меши будут удалены)
        this._cachedDetailMeshes = null;

        // КРИТИЧНО: Очищаем анимации перед удалением (старые меши будут удалены)
        this.chassisAnimationElements = {};

        // Dispose everything
        if (this.healthBar) this.healthBar.dispose();
        if (this.healthBarBackground) this.healthBarBackground.dispose();
        if (this.physicsAggregate) this.physicsAggregate.dispose();

        // Disposing chassis recursively disposes children (turret, barrel, tracks)
        if (this.chassis) this.chassis.dispose();

        // Re-run creation logic
        // We can reuse the constructor logic basically, but we need to ensure this class instance stays valid.

        this.chassisType = getChassisById(this.networkPlayer.chassisType || "medium");
        this.cannonType = getCannonById(this.networkPlayer.cannonType || "standard");
        this.trackType = getTrackById(this.networkPlayer.trackType || "standard");

        this.chassis = this.createDetailedChassis();
        this.turret = this.createDetailedTurret();
        this.barrel = this.createDetailedBarrel();
        this.createVisualWheels();

        // Restore transform
        this.chassis.position.copyFrom(pos);
        if (rotQ) {
            this.chassis.rotationQuaternion = rotQ;
        } else {
            this.chassis.rotation.copyFrom(rotE);
        }

        this.turret.rotation.y = turretMsgRot;
        this.barrel.rotation.x = barrelRot;

        // Restore visibility
        this.chassis.isVisible = true;
        this.chassis.setEnabled(true);
        this.chassis.getChildMeshes().forEach(c => { c.isVisible = true; c.setEnabled(true); });

        if (this.turret) {
            this.turret.isVisible = true;
            this.turret.setEnabled(true);
        }
        if (this.barrel) {
            this.barrel.isVisible = true;
            this.barrel.setEnabled(true);
            this.barrel.getChildMeshes().forEach(c => { c.isVisible = true; c.setEnabled(true); });
        }

        // Restore physics
        this.physicsAggregate = new PhysicsAggregate(
            this.chassis,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0, friction: 0 },
            this.scene
        );
        this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
        this.physicsAggregate.body.disablePreStep = false;

        // Restore collisions
        this.chassis.checkCollisions = true;
        this.chassis.getChildMeshes().forEach(m => m.checkCollisions = true);
        if (this.turret) {
            this.turret.checkCollisions = true;
            this.turret.getChildMeshes().forEach(m => m.checkCollisions = true);
        }
        if (this.barrel) {
            this.barrel.checkCollisions = true;
            this.barrel.getChildMeshes().forEach(m => m.checkCollisions = true);
        }

        // Restore health bar
        this.createHealthBarVisuals();
        this.updateHealthBarVisuals();

        // Restore modules
        this.updateModules(this.networkPlayer.modules);

        // КРИТИЧНО: Кэш дочерних мешей будет пересоздан при следующем вызове updateVisibility()
        // (кэш проверяется на null и пересоздается автоматически)
    }

    /**
     * Update attached visual modules
     */
    updateModules(moduleIds?: string[]): void {
        // ОПТИМИЗАЦИЯ: Проверяем, изменились ли модули перед обновлением
        const currentModuleIds = Array.from(this.attachedModules.keys());
        const newModuleIds = moduleIds || [];

        // Если модули не изменились, пропускаем обновление
        if (currentModuleIds.length === newModuleIds.length &&
            currentModuleIds.every((id, idx) => id === newModuleIds[idx])) {
            return; // Модули не изменились, не обновляем
        }

        // Логируем только если модули действительно изменились
        if (newModuleIds.length > 0 || currentModuleIds.length > 0) {
            logger.log(`[NetworkPlayerTank] Updating modules for ${this.playerId}:`, newModuleIds);
        }

        // Clear existing
        for (const mesh of this.attachedModules.values()) {
            mesh.dispose();
        }
        this.attachedModules.clear();

        if (!moduleIds || !Array.isArray(moduleIds) || moduleIds.length === 0) return;

        // Create new visuals
        for (const modId of moduleIds) {
            const module = getModuleById(modId);
            if (module) {
                this.createModuleVisual(module);
            }
        }
    }

    private createModuleVisual(module: TankModule): void {
        // ДИНАМИЧЕСКИЙ расчёт offset на основе реальных размеров танка
        const offset = getAttachmentOffset(module.attachmentPoint, this.chassisType);
        if (offset.length() === 0 && module.attachmentPoint !== "barrel_mount") {
            logger.warn(`[NetworkPlayerTank] ⚠️ Unknown attachment point: ${module.attachmentPoint} for module ${module.id}`);
            return;
        }

        // Determine parent
        let parent: Mesh;
        if (module.attachmentPoint.startsWith("turret")) {
            parent = this.turret;
        } else if (module.attachmentPoint.startsWith("barrel")) {
            parent = this.barrel;
        } else {
            parent = this.chassis;
        }

        if (!parent) {
            logger.warn(`[NetworkPlayerTank] ⚠️ Parent mesh not ready for module ${module.id}`);
            return;
        }

        // Create Mesh (Placeholder logic similar to TankEquipmentModule)
        let mesh: Mesh;
        const color = Color3.FromHexString(module.color || "#ffffff");
        const scale = module.scale || 1;

        if (module.modelPath === "cylinder_pair") {
            mesh = new Mesh("netMod_" + module.id + "_" + this.uniqueId, this.scene);
            const pipe1 = MeshBuilder.CreateCylinder("p1", { height: 1, diameter: 0.3 }, this.scene);
            const pipe2 = MeshBuilder.CreateCylinder("p2", { height: 1, diameter: 0.3 }, this.scene);
            pipe1.position.x = 0.3; pipe1.rotation.x = Math.PI / 2;
            pipe2.position.x = -0.3; pipe2.rotation.x = Math.PI / 2;
            pipe1.parent = mesh;
            pipe2.parent = mesh;

            const mat = new StandardMaterial("mat_" + module.id + "_" + this.uniqueId, this.scene);
            mat.diffuseColor = color;
            pipe1.material = mat;
            pipe2.material = mat;
        } else if (module.modelPath === "box_small") {
            mesh = MeshBuilder.CreateBox("netMod_" + module.id + "_" + this.uniqueId, { size: 0.4 * scale }, this.scene);
            const mat = new StandardMaterial("mat_" + module.id + "_" + this.uniqueId, this.scene);
            mat.diffuseColor = color;
            mat.emissiveColor = color.scale(0.5);
            mesh.material = mat;
        } else {
            mesh = MeshBuilder.CreateBox("netMod_" + module.id + "_" + this.uniqueId, {
                width: 0.8 * scale,
                height: 0.2 * scale,
                depth: 0.8 * scale
            }, this.scene);
            const mat = new StandardMaterial("mat_" + module.id + "_" + this.uniqueId, this.scene);
            mat.diffuseColor = color;
            mesh.material = mat;
        }

        // Прикрепляем модуль НАПРЯМУЮ к родительскому мешу
        mesh.parent = parent;
        mesh.position = offset;
        this.attachedModules.set(module.id, mesh);
    }

    /**
     * Создание ДЕТАЛИЗИРОВАННОГО корпуса танка (как у локального игрока)
     * НЕ удаляет старые меши - это критично для мультиплеера!
     */
    /**
     * Создание ДЕТАЛИЗИРОВАННОГО корпуса танка (как у локального игрока)
     * НЕ удаляет старые меши - это критично для мультиплеера!
     */
    private createDetailedChassis(): Mesh {
        // Используем общую фабрику для создания корпуса, как у локального танка
        this.chassisAnimationElements = {};

        // createUniqueChassis возвращает готовый mesh с примененными материалами и деталями
        const chassis = createUniqueChassis(
            this.chassisType,
            this.scene,
            Vector3.Zero(), // Позиция будет установлена позже
            this.chassisAnimationElements,
            this.networkPlayer.tankColor, // Передаем цвет танка
            `netTankHull_${this.uniqueId}` // Уникальный ID для сетевого танка
        );

        // ВАЖНО: createUniqueChassis генерирует случайное имя, но нам нужно сохранить ссылку
        // Мы не меняем имя меша, так как фабрика заботится об уникальности

        // Включаем физику (точнее, подготавливаем меш для неё, хотя у сетевых танков физика упрощена)
        chassis.isVisible = true;
        chassis.setEnabled(true);

        // ИСПРАВЛЕНО: Гусеницы создаются в createVisualWheels() с правильным trackType
        // Убрано дублирование создания гусениц

        return chassis;
    }


    /**
     * Создание башни танка (ИДЕНТИЧНО локальному игроку)
     * ИСПРАВЛЕНО: Используем те же пропорции что и в TankController.rebuildTankVisuals
     */
    private createDetailedTurret(): Mesh {
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;

        // КРИТИЧНО: Те же пропорции что и у локального игрока (TankController строки 1044-1046)
        const turretWidth = w * 0.65;
        const turretHeight = h * 0.75;
        const turretDepth = d * 0.6;

        const turret = MeshBuilder.CreateBox(
            `netTurret_${this.uniqueId}`,
            { width: turretWidth, height: turretHeight, depth: turretDepth },
            this.scene
        );

        // Позиционируем башню на корпусе (как у локального игрока)
        // Для самолёта перемещаем башню в нос
        const isPlane = this.chassisType.id === "plane";
        if (isPlane) {
            // Башня в носу самолёта (передняя часть по Z)
            turret.position = new Vector3(0, h / 2 + turretHeight / 2, d * 0.6);
        } else {
            turret.position = new Vector3(0, h / 2 + turretHeight / 2, 0);
        }
        turret.parent = this.chassis;

        // Материал башни - используем тот же цвет что и корпус (как у локального игрока)
        let turretColorHex = this.networkPlayer.tankColor || this.chassisType.color;

        // Если есть отдельный цвет башни и он не серый дефолтный - используем его
        if (this.networkPlayer.turretColor &&
            this.networkPlayer.turretColor !== '#888888' &&
            this.networkPlayer.turretColor !== '#808080') {
            turretColorHex = this.networkPlayer.turretColor;
        }

        let color: Color3;
        try {
            color = Color3.FromHexString(turretColorHex || "#00ff00");
        } catch (e) {
            logger.warn(`[NetworkPlayerTank] ⚠️ Failed to parse turret color '${turretColorHex}', using green`);
            color = new Color3(0, 1, 0);
        }

        // Слегка темнее чем корпус (как у локального игрока)
        color = color.scale(0.8);

        const turretMat = new StandardMaterial(`netTurretMat_${this.uniqueId}`, this.scene);
        turretMat.diffuseColor = color;
        turretMat.specularColor = Color3.Black();
        turret.material = turretMat;

        turret.isVisible = true;
        turret.setEnabled(true);
        turret.renderingGroupId = 0;

        return turret;
    }

    /**
     * Создание ДЕТАЛИЗИРОВАННОГО ствола пушки (используя createUniqueCannon)
     * ИСПРАВЛЕНО: Позиция ствола ИДЕНТИЧНА локальному игроку (TankController)
     */
    private createDetailedBarrel(): Mesh {
        const barrelWidth = this.cannonType.barrelWidth || 0.15;
        const barrelLength = this.cannonType.barrelLength || 3;

        // Используем реальную функцию создания пушки!
        // Передаём пустой объект для animationElements (сетевым танкам не нужны анимации)
        const animationElements: CannonAnimationElements = {};

        // КРИТИЧНО: Используем prefix "netBarrel_" чтобы cleanup код в tankController.ts
        // не удалял стволы сетевых танков (он ищет только "barrel_" префикс)
        const barrel = createUniqueCannon(
            this.cannonType,
            this.scene,
            barrelWidth,
            barrelLength,
            animationElements,
            "netBarrel_"
        );

        // ИСПРАВЛЕНИЕ: Не применяем цвет танка к стволу, оставляем серый (как у реальной модели)
        // Код применения цвета удалён по требованию пользователя

        // КРИТИЧНО: Позиция ствола ИДЕНТИЧНА локальному игроку (TankController)
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;
        const turretDepth = d * 0.6; // Те же пропорции что в createDetailedTurret
        
        // Для самолёта ствол в носу: дуло точно в носу корпуса (как в TankController)
        const isPlane = this.chassisType.id === "plane";
        let baseBarrelZ: number;
        if (isPlane) {
            const noseZInTurret = (d / 2) - (d * 0.6);
            baseBarrelZ = noseZInTurret - barrelLength / 2;
        } else {
            baseBarrelZ = turretDepth / 2 + barrelLength / 2;
        }
        barrel.position = new Vector3(0, 0, baseBarrelZ);
        barrel.parent = this.turret;

        // Убеждаемся что ствол смотрит вперёд (rotation = 0)
        barrel.rotation.x = 0;
        barrel.rotation.y = 0;
        barrel.rotation.z = 0;

        barrel.isVisible = true;
        barrel.setEnabled(true);

        return barrel;
    }

    /**
     * Creates visual wheels/tracks for the tank
     * Logic ported from TankController.createVisualWheels
     */
    private createVisualWheels(): void {
        // Remove existing tracks if they exist (createDetailedChassis might have created them via createVisualTracks, 
        // but we want to be consistent with TankController OR use createVisualTracks + Wheels?)

        // Actually, createDetailedChassis calls createVisualTracks which returns {left, right}.
        // TankController.createVisualWheels creates primitive boxes for tracks.
        // If createVisualTracks creates nicer tracks, we should keep them.

        // BUT TankController.createVisualWheels does NOT create wheels (cylinders). It creates tracks.
        // So createDetailedChassis ALREADY did what TankController.createVisualWheels does.

        // However, the user complains about missing details.
        // Maybe TankController DOES create wheels elsewhere?
        // I checked TankController.ts, it calls visualsModule.createVisualWheels().
        // visualsModule delegates to tank.createVisualWheels().
        // TankController.createVisualWheels() creates BOX TRACKS.

        // So NetworkPlayerTank ALREADY has tracks (via createVisualTracks).
        // If I replace them with createVisualWheels logic, it might match TankController better?

        // Wait, NetworkPlayerTank.createDetailedChassis calls createVisualTracks.
        // TankController calls createVisualWheels.

        // Let's implement createVisualWheels as a way to overwrite/ensure tracks are correct using TrackType.
        // Because createDetailedChassis used a default dark gray color and ignored TrackType!

        // Dispose old tracks from createDetailedChassis if we are replacing them
        if (this.leftTrack) {
            this.leftTrack.dispose();
            this.leftTrack = null;
        }
        if (this.rightTrack) {
            this.rightTrack.dispose();
            this.rightTrack = null;
        }

        // === TRACKS WITH SELECTED TYPE ===
        const trackColor = Color3.FromHexString(this.trackType.color);
        const trackMat = new StandardMaterial(`netTrackMat_${this.uniqueId}`, this.scene);
        trackMat.diffuseColor = trackColor;
        trackMat.specularColor = Color3.Black();
        trackMat.freeze();

        // Размеры корпуса
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;

        // КРИТИЧНО: Масштабируем размеры гусениц пропорционально корпусу
        // Гусеницы должны быть видимыми и пропорциональными
        const trackWidth = this.trackType.width;  // Ширина гусениц фиксирована
        const trackHeight = this.trackType.height; // Высота гусениц фиксирована
        const trackDepth = d * 0.95; // Гусеницы почти на всю длину корпуса

        // Left track
        this.leftTrack = MeshBuilder.CreateBox(`netLeftTrack_${this.uniqueId}`, {
            width: trackWidth,
            height: trackHeight,
            depth: trackDepth
        }, this.scene);
        this.leftTrack.position = new Vector3(-w * 0.55, -h * 0.25, 0);
        this.leftTrack.parent = this.chassis;
        this.leftTrack.material = trackMat;
        this.leftTrack.isVisible = true;
        this.leftTrack.setEnabled(true);

        // Right track
        this.rightTrack = MeshBuilder.CreateBox(`netRightTrack_${this.uniqueId}`, {
            width: trackWidth,
            height: trackHeight,
            depth: trackDepth
        }, this.scene);
        this.rightTrack.position = new Vector3(w * 0.55, -h * 0.25, 0);
        this.rightTrack.parent = this.chassis;
        this.rightTrack.material = trackMat;
        this.rightTrack.isVisible = true;
        this.rightTrack.setEnabled(true);

        logger.log(`[NetworkPlayerTank] 🛤️ Tracks created for ${this.playerId}: trackType=${this.trackType.id}, size=${trackWidth}x${trackHeight}x${trackDepth}`);
    }

    /**
     * Корректирует высоту спавна на основе террейна
     * Вызывается с задержкой, чтобы карта успела загрузиться
     */
    private correctSpawnHeight(): void {
        const game = (window as any).gameInstance;
        let targetY = this.chassis.position.y;

        // Если позиция подозрительно низкая или равна 0, пересчитываем высоту террейна
        if (targetY < 0.5 || (game && typeof game.getGroundHeight === 'function')) {
            // Используем requestAnimationFrame для задержки, чтобы карта успела загрузиться
            requestAnimationFrame(() => {
                if (!this.chassis || this.chassis.isDisposed()) return;

                if (game && typeof game.getGroundHeight === 'function') {
                    const groundHeight = game.getGroundHeight(this.chassis.position.x, this.chassis.position.z);
                    // Спавн на 1 метр над поверхностью для безопасности
                    const safeY = groundHeight + 1.0;
                    if (targetY < safeY || targetY < 0.5) {
                        targetY = safeY;
                        this.chassis.position.y = targetY;
                        // Обновляем позицию в networkPlayer для синхронизации
                        if (this.networkPlayer.position instanceof Vector3) {
                            this.networkPlayer.position.y = targetY;
                        }
                        logger.log(`[NetworkPlayerTank] ${this.playerId} ✅ corrected spawn height from ${this.chassis.position.y.toFixed(2)} to ${targetY.toFixed(2)} (ground: ${groundHeight.toFixed(2)})`);
                    }
                } else {
                    // Fallback: минимум 2 метра если game недоступен
                    if (targetY < 2.0) {
                        targetY = 2.0;
                        this.chassis.position.y = targetY;
                        if (this.networkPlayer.position instanceof Vector3) {
                            this.networkPlayer.position.y = targetY;
                        }
                        logger.warn(`[NetworkPlayerTank] ${this.playerId} ⚠️ spawn height too low (${this.chassis.position.y.toFixed(2)}), forcing to 2.0`);
                    }
                }
            });
        } else {
            // Если высота нормальная, просто устанавливаем её
            this.chassis.position.y = targetY;
            if (this.networkPlayer.position instanceof Vector3) {
                this.networkPlayer.position.y = targetY;
            }
        }
    }

    /**
     * Пометить, что получено сетевое обновление
     */
    markNetworkUpdate(): void {
        this.lastNetworkUpdateTime = Date.now();
        this.interpolationAlpha = 0;
    }

    /**
     * Get the world position of the barrel muzzle (tip)
     * Used for spawning projectiles at the correct visual location
     * Для самолёта учитывает, что pivot в носу
     */
    public getBarrelMuzzlePosition(): Vector3 {
        if (!this.barrel) {
            return this.chassis ? this.chassis.getAbsolutePosition().add(new Vector3(0, 2, 0)) : Vector3.Zero();
        }

        this.barrel.computeWorldMatrix(true);
        const barrelLength = this.cannonType.barrelLength || 3;
        const barrelPos = this.barrel.getAbsolutePosition();
        const forward = this.barrel.getDirection(Vector3.Forward()).normalize();
        const isPlane = this.chassisType.id === "plane";
        
        // Для самолёта pivot в носу, дуло точно в носу; для танка небольшой offset
        const muzzleOffset = isPlane ? 0 : 0.2;
        return barrelPos.add(forward.scale(barrelLength / 2 + muzzleOffset));
    }

    /**
     * Проверяет целостность иерархии танка и восстанавливает её при необходимости.
     * Исправляет проблему "разваливания" танка на части.
     */
    private validateParts(): void {
        if (!this.chassis || this.chassis.isDisposed()) return;

        const h = this.chassisType.height;
        const d = this.chassisType.depth;

        // 1. Проверка башни
        if (this.turret && !this.turret.isDisposed()) {
            if (this.turret.parent !== this.chassis) {
                // Восстанавливаем родителя
                this.turret.parent = this.chassis;

                // Восстанавливаем локальную позицию (как в createDetailedTurret)
                const turretHeight = h * 0.75;
                this.turret.position.set(0, h / 2 + turretHeight / 2, 0);
                this.turret.rotation.z = 0;
                this.turret.rotation.x = 0;
            }
        }

        // 2. Проверка ствола
        if (this.barrel && !this.barrel.isDisposed() && this.turret && !this.turret.isDisposed()) {
            if (this.barrel.parent !== this.turret) {
                // Восстанавливаем родителя
                this.barrel.parent = this.turret;

                // Восстанавливаем локальную позицию (как в createDetailedBarrel)
                const barrelLength = this.cannonType.barrelLength || 3;
                const turretDepth = d * 0.6;
                const isPlane = this.chassisType.id === "plane";
                const baseBarrelZ = isPlane
                    ? (d / 2) - (d * 0.6) - barrelLength / 2
                    : turretDepth / 2 + barrelLength / 2;

                this.barrel.position.set(0, 0, baseBarrelZ);
                this.barrel.rotation.y = 0;
                this.barrel.rotation.z = 0;
            }
        }
    }

    /**
     * Обновление танка каждый кадр
     * УПРОЩЕНО: Используем только линейную интерполяцию для стабильности
     */
    update(deltaTime: number): void {
        // ОПТИМИЗАЦИЯ: Инкремент счетчика кадров
        this._frameCounter++;

        // ОПТИМИЗАЦИЯ: Проверяем иерархию только каждые 30 кадров (было каждый кадр)
        if (this._frameCounter % 30 === 0) {
            this.validateParts();
        }

        if (!this.chassis || !this.networkPlayer) return;

        // Безопасное получение позиции (обрабатываем и Vector3, и plain objects)
        const np = this.networkPlayer;
        const targetX = typeof np.position?.x === 'number' ? np.position.x : 0;
        const targetY = typeof np.position?.y === 'number' ? np.position.y : 1;
        const targetZ = typeof np.position?.z === 'number' ? np.position.z : 0;
        const targetRotation = typeof np.rotation === 'number' ? np.rotation : 0;

        // ДИАГНОСТИКА: Логируем обновление позиции только каждые 300 кадров (5 секунд)
        this._updateCounter++;
        if (this._updateCounter < 3 || this._updateCounter % 300 === 0) {
            const currentPos = this.chassis.position;
            const dx = currentPos.x - targetX;
            const dz = currentPos.z - targetZ;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq > 0.01 || this._updateCounter < 3) {
                logger.log(`[NetworkPlayerTank] ${this.playerId} update: target=(${targetX.toFixed(1)}, ${targetZ.toFixed(1)}), dist=${Math.sqrt(distanceSq).toFixed(2)}`);
            }
        }

        // ОПТИМИЗАЦИЯ: Update health bar visibility каждые 10 кадров
        if (this._frameCounter % 10 === 0) {
            this.updateHealthBarVisibilityAndDistance();
        }

        // КРИТИЧНО: При первом обновлении - МГНОВЕННАЯ телепортация к серверной позиции
        if (this.needsInitialSync) {
            this.chassis.position.x = targetX;
            this.chassis.position.y = targetY;
            this.chassis.position.z = targetZ;
            this.chassis.rotation.y = targetRotation;
            if (this.turret) {
                this.turret.rotation.y = np.turretRotation || 0;
            }
            if (this.barrel) {
                this.barrel.rotation.x = -(np.aimPitch || 0);
            }
            this.needsInitialSync = false;
            // Инициализируем буфер начальной позицией
            this.positionBuffer = [{ x: targetX, y: targetY, z: targetZ, rotation: targetRotation, time: Date.now() }];
            return;
        }

        // КРИТИЧНО: При респавне - МГНОВЕННАЯ телепортация (без интерполяции)
        if (this.needsRespawnTeleport) {
            this.chassis.position.x = targetX;
            this.chassis.position.y = targetY;
            this.chassis.position.z = targetZ;
            this.chassis.rotation.y = targetRotation;
            if (this.turret) {
                this.turret.rotation.y = np.turretRotation || 0;
            }
            if (this.barrel) {
                this.barrel.rotation.x = -(np.aimPitch || 0);
            }
            this.needsRespawnTeleport = false;
            // Очищаем буфер и устанавливаем новую позицию
            this.positionBuffer = [{ x: targetX, y: targetY, z: targetZ, rotation: targetRotation, time: Date.now() }];
            return;
        }

        // =========================================================================
        // БУФЕРИЗАЦИЯ ПОЗИЦИЙ для сглаживания дёрганья
        // Добавляем новую позицию в буфер если она изменилась
        // ИСПРАВЛЕНО: Добавлена проверка изменения Y координаты для предотвращения дёрганья
        // =========================================================================
        const lastBuffered = this.positionBuffer[this.positionBuffer.length - 1];
        // КРИТИЧНО: Y координата требует большего порога для предотвращения дёрганья (квантование 0.1м)
        const posChanged = !lastBuffered ||
            Math.abs(lastBuffered.x - targetX) > 0.01 ||
            Math.abs(lastBuffered.y - targetY) > 0.25 || // УВЕЛИЧЕН порог до 0.25м (было 0.15) - фильтр квантования
            Math.abs(lastBuffered.z - targetZ) > 0.01;

        if (posChanged) {
            this.positionBuffer.push({ x: targetX, y: targetY, z: targetZ, rotation: targetRotation, time: Date.now() });
            // Ограничиваем размер буфера
            while (this.positionBuffer.length > this.BUFFER_SIZE) {
                this.positionBuffer.shift();
            }
        }

        // ОПТИМИЗАЦИЯ: Кэшируем усреднённую позицию - вычисляем только при изменении буфера
        const lastPos = this.positionBuffer[this.positionBuffer.length - 1];
        const bufferHash = this.positionBuffer.length + (lastPos ? Math.floor(lastPos.x * 100) : 0);
        const bufferChanged = bufferHash !== this._lastBufferHash;

        let avgX = 0, avgY = 0, avgZ = 0, avgRot = 0;
        if (bufferChanged || !this._cachedAveragePosition) {
            // Вычисляем усреднённую целевую позицию из буфера для сглаживания
            for (const pos of this.positionBuffer) {
                avgX += pos.x;
                avgY += pos.y;
                avgZ += pos.z;
                avgRot += pos.rotation;
            }
            const bufferLen = this.positionBuffer.length || 1;
            avgX /= bufferLen;
            avgY /= bufferLen;
            avgZ /= bufferLen;
            avgRot /= bufferLen;

            // Кэшируем результат
            if (!this._cachedAveragePosition) {
                this._cachedAveragePosition = { x: 0, y: 0, z: 0, rotation: 0 };
            }
            this._cachedAveragePosition.x = avgX;
            this._cachedAveragePosition.y = avgY;
            this._cachedAveragePosition.z = avgZ;
            this._cachedAveragePosition.rotation = avgRot;
            this._lastBufferHash = bufferHash;
        } else {
            // Используем кэшированное значение
            avgX = this._cachedAveragePosition.x;
            avgY = this._cachedAveragePosition.y;
            avgZ = this._cachedAveragePosition.z;
            avgRot = this._cachedAveragePosition.rotation;
        }

        // Используем последнюю позицию с небольшим сглаживанием к средней
        // КРИТИЧНО: Y координата использует более агрессивное сглаживание для устранения дёрганья
        const smoothFactor = 0.7; // 70% к последней позиции, 30% к средней (для X и Z)

        // --- НОВОЕ СГЛАЖИВАНИЕ Y ---
        // 1. Инициализация
        if (this._smoothedTargetY === null) this._smoothedTargetY = targetY;

        // 2. Определение стационарности (если x/z почти не меняются)
        const isMoving = Math.abs(targetX - (this.positionBuffer[0]?.x || targetX)) > 0.1 ||
            Math.abs(targetZ - (this.positionBuffer[0]?.z || targetZ)) > 0.1;
        this._isStationary = !isMoving;

        // 3. Экспоненциальное сглаживание цели
        // Если стоим - очень сильное сглаживание (0.05), в движении - мягкое (0.2)
        const yAlpha = this._isStationary ? 0.05 : 0.2;
        this._smoothedTargetY = this._smoothedTargetY * (1 - yAlpha) + targetY * yAlpha;

        const finalTargetX = targetX * smoothFactor + avgX * (1 - smoothFactor);
        // Используем сглаженную цель вместо сырой
        const finalTargetY = this._smoothedTargetY;
        const finalTargetZ = targetZ * smoothFactor + avgZ * (1 - smoothFactor);

        // ОПТИМИЗАЦИЯ: Пропускаем интерполяцию ПОЗИЦИИ для очень малых изменений
        // КРИТИЧНО: НЕ пропускаем update целиком - башня и ствол должны обновляться всегда!
        const MIN_CHANGE_THRESHOLD = 0.001; // Минимальное изменение для интерполяции
        const dx = finalTargetX - this.chassis.position.x;
        const dy = finalTargetY - this.chassis.position.y;
        const dz = finalTargetZ - this.chassis.position.z;
        const shouldUpdatePosition = Math.abs(dx) >= MIN_CHANGE_THRESHOLD ||
            Math.abs(dy) >= MIN_CHANGE_THRESHOLD ||
            Math.abs(dz) >= MIN_CHANGE_THRESHOLD;

        // УПРОЩЁННАЯ ЛИНЕЙНАЯ ИНТЕРПОЛЯЦИЯ
        // Используем базовую интерполяцию без экстраполяции (dead reckoning отключён)
        // КРИТИЧНО: Y координата интерполируется ОЧЕНЬ медленно для полного устранения дёрганья
        const lerpFactor = Math.min(1.0, deltaTime * this.INTERPOLATION_SPEED);
        const yLerpFactor = Math.min(1.0, deltaTime * this.INTERPOLATION_SPEED * 0.15); // Y интерполируется в 6.7 раз медленнее (было 0.4)

        // Интерполяция позиции (оптимизированная версия)
        // КРИТИЧНО: Обновляем позицию только если есть значимые изменения
        if (shouldUpdatePosition) {
            this.chassis.position.x += dx * lerpFactor;

            // КРИТИЧНО: Фильтрация малых изменений Y (шум квантования)
            // Если изменение меньше 8 см - вообще не двигаем по Y!
            if (Math.abs(dy) > 0.08) {
                this.chassis.position.y += dy * yLerpFactor;
            }
            this.chassis.position.z += dz * lerpFactor;
        }

        // Интерполяция вращения корпуса (Yaw, Pitch, Roll)
        // КРИТИЧНО: Используем Quaternion, так как PhysicsAggregate может его создать, 
        // и тогда rotation (Euler) будет игнорироваться.

        let currentYaw = this._cachedEulerYaw;
        let currentPitch = this._cachedEulerPitch;
        let currentRoll = this._cachedEulerRoll;

        // ОПТИМИЗАЦИЯ: конвертируем quaternion в Euler только каждые 5 кадров
        // toEulerAngles() - дорогая тригонометрическая операция
        if (this.chassis.rotationQuaternion && this._frameCounter % 5 === 0) {
            const euler = this.chassis.rotationQuaternion.toEulerAngles();
            this._cachedEulerPitch = euler.x;
            this._cachedEulerYaw = euler.y;
            this._cachedEulerRoll = euler.z;
            currentPitch = euler.x;
            currentYaw = euler.y;
            currentRoll = euler.z;
        } else if (!this.chassis.rotationQuaternion) {
            currentYaw = this.chassis.rotation.y;
            currentPitch = this.chassis.rotation.x;
            currentRoll = this.chassis.rotation.z;
        }

        // 1. Yaw (Y)
        let yawDiff = targetRotation - currentYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

        if (Math.abs(yawDiff) > 0.1) {
            currentYaw += yawDiff * lerpFactor;
        } else if (Math.abs(yawDiff) > 0.01) {
            currentYaw += yawDiff * Math.min(1.0, lerpFactor * 2);
        } else {
            // Очень близко - просто плавно доводим
            currentYaw += yawDiff * lerpFactor;
        }

        // 2. Pitch (X) & Roll (Z) from Network
        const targetPitch = np.chassisPitch || 0;
        const targetRoll = np.chassisRoll || 0;

        let pitchDiff = targetPitch - currentPitch;
        while (pitchDiff > Math.PI) pitchDiff -= Math.PI * 2;
        while (pitchDiff < -Math.PI) pitchDiff += Math.PI * 2;
        currentPitch += pitchDiff * lerpFactor;

        let rollDiff = targetRoll - currentRoll;
        while (rollDiff > Math.PI) rollDiff -= Math.PI * 2;
        while (rollDiff < -Math.PI) rollDiff += Math.PI * 2;
        currentRoll += rollDiff * lerpFactor;

        // 3. Apply to Chassis
        if (!this.chassis.rotationQuaternion) {
            this.chassis.rotationQuaternion = Quaternion.Identity();
        }
        Quaternion.RotationYawPitchRollToRef(currentYaw, currentPitch, currentRoll, this.chassis.rotationQuaternion);

        // DEBUG: Logging periodically
        this._rotLogCounter++;
        /*
        if (this._rotLogCounter % 120 === 0) {
            logger.log(`[NPT] 🔄 Rotation: Pitch=${currentPitch.toFixed(2)}, Yaw=${currentYaw.toFixed(2)}, Roll=${currentRoll.toFixed(2)}`);
        }
        */

        // Интерполяция вращения башни
        // ИСПРАВЛЕНИЕ: Сохраняем последнее валидное значение для защиты от undefined/NaN
        if (this.turret) {
            let targetTurretRot = np.turretRotation;

            // Проверяем валидность значения
            if (typeof targetTurretRot === 'number' && Number.isFinite(targetTurretRot)) {
                this._lastValidTurretRotation = targetTurretRot;
            } else {
                // Используем последнее валидное значение если текущее невалидно
                targetTurretRot = this._lastValidTurretRotation;
            }

            let turretDiff = targetTurretRot - this.turret.rotation.y;
            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
            this.turret.rotation.y += turretDiff * lerpFactor;
        }

        // Интерполяция угла ствола (IMPROVED: Use history-based smoothing if available)
        if (this.barrel) {
            // Get target aim pitch (negated for correct visual rotation)
            let targetAimPitch: number;

            // Use history for smoother interpolation if available
            if (np.aimPitchHistory && np.aimPitchHistory.length >= 3) {
                // Use weighted average of history for smoother motion
                const h = np.aimPitchHistory;
                targetAimPitch = -(h[0]! * 0.15 + h[1]! * 0.35 + h[2]! * 0.50); // Weighted toward newest
            } else {
                targetAimPitch = -(np.aimPitch ?? 0);
            }

            // Use slightly higher lerp factor for barrel (more responsive than position)
            const barrelLerpFactor = Math.min(lerpFactor * 1.5, 0.3);
            this.barrel.rotation.x += (targetAimPitch - this.barrel.rotation.x) * barrelLerpFactor;
        }

        // Танк не должен проваливаться под землю
        // ОТКЛЮЧЕНО: Конфликтует с сервером! Клиент не должен поднимать танк, если сервер говорит "0.4".
        // Оставляем только защиту от полного проваливания в бездну
        /*
        const game = (window as any).gameInstance;
        if (this.chassis.position.y < 0.5) {
             ... старая логика удалена ...
        }
        */
        // Экстренная защита на случай багов физики
        if (this.chassis.position.y < -10) {
            this.chassis.position.y = 2; // Телепорт обратно наверх
        }

        // ОПТИМИЗАЦИЯ: Обновление видимости каждые 15 кадров (было каждый кадр)
        // updateVisibility() итерирует по всем child meshes - дорогая операция
        if (this._frameCounter % 15 === 0) {
            this.updateVisibility();
        }

        // Check for status changes (ANIMATIONS)
        const currentStatus = this.networkPlayer.status || "alive";
        if (currentStatus !== this.prevStatus) {
            // DEBUG: Логируем изменение статуса для диагностики анимаций
            logger.log(`[NetworkPlayerTank] 🔄 Status change for ${this.playerId}: ${this.prevStatus} → ${currentStatus}`);

            // Respawn: dead -> alive
            if (this.prevStatus === "dead" && currentStatus === "alive") {
                logger.log(`[NetworkPlayerTank] ✨ Playing SPAWN effect for ${this.playerId}`);
                this.playSpawnEffect();
            }
            // Death: alive -> dead (handled usually by onPlayerDied, but good as backup)
            if (this.prevStatus === "alive" && currentStatus === "dead") {
                logger.log(`[NetworkPlayerTank] 💀 Playing DEATH effect for ${this.playerId}`);
                this.playDeathEffect();
            }
            this.prevStatus = currentStatus;
        }
    }

    private playSpawnEffect(): void {
        if (this.effectsManager) {
            // Teleport effect
            this.effectsManager.createTeleportEffect(this.chassis.position);
        }
    }

    private playDeathEffect(): void {
        // Death effect is usually effectively handled by onPlayerDied which creates explosion
        // But we can ensure it here too
        if (this.effectsManager && this.chassis.isVisible) { // Only if was visible
            this.effectsManager.createExplosion(this.chassis.position, 1.5);
        }
    }

    /**
     * Cubic interpolation for position using Hermite spline
     * Uses last 3 positions for smooth curve
     */
    private cubicInterpolatePosition(): Vector3 {
        const history = this.networkPlayer.positionHistory;
        // Safety check: verify history exists and has at least 3 entries BEFORE indexing
        if (!history || !Array.isArray(history) || history.length < 3) {
            return this.networkPlayer.position.clone();
        }

        // Additional safety: verify all required positions exist
        const p0 = history[0];
        const p1 = history[1];
        const p2 = history[2];
        const p3 = this.networkPlayer.position;

        // Safety check - if any point is undefined or null, fall back to current position
        if (!p0 || !p1 || !p2 || !p3) {
            return this.networkPlayer.position.clone();
        }

        // Calculate interpolation factor based on time since last update
        const lastUpdateTime = this.networkPlayer.lastUpdateTime || Date.now();
        const timeSinceUpdate = Date.now() - lastUpdateTime;
        const interpolationDelay = this.networkPlayer.interpolationDelay || 50;
        let t = Math.min(1.0, timeSinceUpdate / Math.max(interpolationDelay, 16)); // Normalize to [0, 1]

        // Hermite interpolation: smooth curve through p1 and p2
        const t2 = t * t;
        const t3 = t2 * t;

        // Hermite basis functions
        const h1 = 2 * t3 - 3 * t2 + 1;
        const h2 = -2 * t3 + 3 * t2;
        const h3 = t3 - 2 * t2 + t;
        const h4 = t3 - t2;

        // Tangents (simplified: use direction to next point)
        const m1 = p2.subtract(p0).scale(0.5);
        const m2 = p3.subtract(p1).scale(0.5);

        // Interpolate each component
        const x = h1 * p1.x + h2 * p2.x + h3 * m1.x + h4 * m2.x;
        const y = h1 * p1.y + h2 * p2.y + h3 * m1.y + h4 * m2.y;
        const z = h1 * p1.z + h2 * p2.z + h3 * m1.z + h4 * m2.z;

        return new Vector3(x, y, z);
    }

    /**
     * Cubic interpolation for rotation using Hermite spline
     */
    private cubicInterpolateRotation(): number {
        const history = this.networkPlayer.rotationHistory;
        // Safety check: verify history exists and has at least 3 entries BEFORE indexing
        if (!history || !Array.isArray(history) || history.length < 3) {
            return this.networkPlayer.rotation;
        }

        // Get values - safe now that we verified length
        const r0 = history[0];
        const r1 = history[1];
        const r2 = history[2];
        const r3 = this.networkPlayer.rotation;

        // Additional safety check - if any value is undefined, fall back to current rotation
        if (r0 === undefined || r1 === undefined || r2 === undefined) {
            return this.networkPlayer.rotation;
        }

        const lastUpdateTime = this.networkPlayer.lastUpdateTime || Date.now();
        const timeSinceUpdate = Date.now() - lastUpdateTime;
        const interpolationDelay = this.networkPlayer.interpolationDelay || 50;
        let t = Math.min(1.0, timeSinceUpdate / Math.max(interpolationDelay, 16));

        // Normalize angles
        const normalizeAngle = (angle: number) => {
            while (angle > Math.PI) angle -= Math.PI * 2;
            while (angle < -Math.PI) angle += Math.PI * 2;
            return angle;
        };

        const t2 = t * t;
        const t3 = t2 * t;
        const h1 = 2 * t3 - 3 * t2 + 1;
        const h2 = -2 * t3 + 3 * t2;
        const h3 = t3 - 2 * t2 + t;
        const h4 = t3 - t2;

        // Calculate angular velocities (tangents)
        const m1 = normalizeAngle(r2 - r0) * 0.5;
        const m2 = normalizeAngle(r3 - r1) * 0.5;

        const result = h1 * r1 + h2 * r2 + h3 * m1 + h4 * m2;
        return normalizeAngle(result);
    }

    /**
     * Cubic interpolation for turret rotation using Hermite spline
     */
    private cubicInterpolateTurretRotation(): number {
        const history = this.networkPlayer.turretRotationHistory;
        // Safety check: verify history exists and has at least 3 entries BEFORE indexing
        if (!history || !Array.isArray(history) || history.length < 3) {
            return this.networkPlayer.turretRotation;
        }

        // Get values - safe now that we verified length
        const r0 = history[0];
        const r1 = history[1];
        const r2 = history[2];
        const r3 = this.networkPlayer.turretRotation;

        // Additional safety check - if any value is undefined, fall back to current turret rotation
        if (r0 === undefined || r1 === undefined || r2 === undefined) {
            return this.networkPlayer.turretRotation;
        }

        const lastUpdateTime = this.networkPlayer.lastUpdateTime || Date.now();
        const timeSinceUpdate = Date.now() - lastUpdateTime;
        const interpolationDelay = this.networkPlayer.interpolationDelay || 50;
        let t = Math.min(1.0, timeSinceUpdate / Math.max(interpolationDelay, 16));

        const normalizeAngle = (angle: number) => {
            while (angle > Math.PI) angle -= Math.PI * 2;
            while (angle < -Math.PI) angle += Math.PI * 2;
            return angle;
        };

        const t2 = t * t;
        const t3 = t2 * t;
        const h1 = 2 * t3 - 3 * t2 + 1;
        const h2 = -2 * t3 + 3 * t2;
        const h3 = t3 - 2 * t2 + t;
        const h4 = t3 - t2;

        const m1 = normalizeAngle(r2 - r0) * 0.5;
        const m2 = normalizeAngle(r3 - r1) * 0.5;

        const result = h1 * r1 + h2 * r2 + h3 * m1 + h4 * m2;
        return normalizeAngle(result);
    }

    /**
     * Обновление видимости танка с LOD оптимизацией
     * Отключает детали на большом расстоянии для улучшения FPS
     */
    private updateVisibility(): void {
        const status = this.networkPlayer.status;
        const shouldBeVisible = status === "alive" || status === undefined;

        if (this.chassis) {
            this.chassis.isVisible = shouldBeVisible;
            this.chassis.setEnabled(shouldBeVisible);

            // LOD оптимизация - отключаем детали на расстоянии > 100м
            const camera = this.scene.activeCamera;
            if (camera && shouldBeVisible) {
                const distanceSq = Vector3.DistanceSquared(this.chassis.position, camera.position);
                const nearDistanceSq = 10000; // 100^2
                const isNear = distanceSq < nearDistanceSq;

                // ОПТИМИЗАЦИЯ: Кэшируем дочерние меши при первом вызове
                // Избегаем getChildMeshes() — дорогой обход scene graph
                if (!this._cachedDetailMeshes) {
                    this._cachedDetailMeshes = this.chassis.getChildMeshes().filter(child =>
                        child !== this.turret && child !== this.barrel &&
                        child !== this.leftTrack && child !== this.rightTrack
                    );
                }

                // Мелкие детали скрываем на большом расстоянии
                for (const child of this._cachedDetailMeshes) {
                    child.isVisible = isNear && shouldBeVisible;
                }

                // Замораживаем world matrix для далёких танков (оптимизация)
                if (!isNear) {
                    this.chassis.freezeWorldMatrix();
                } else {
                    this.chassis.unfreezeWorldMatrix();
                }
            }
        }
    }

    /**
     * Получить позицию танка
     */
    getPosition(): Vector3 {
        return this.chassis?.position?.clone() || new Vector3(0, 0, 0);
    }

    /**
     * Установить здоровье танка и обновить визуальную полоску
     */
    setHealth(health: number, maxHealth: number = 100): void {
        const prevHealth = this.health;
        this.health = Math.max(0, Math.min(health, maxHealth));
        this.maxHealth = maxHealth;

        // Show HP bar on damage (if health decreased)
        if (this.health < prevHealth) {
            this.lastHitTime = Date.now();
            this.updateHealthBarVisibilityAndDistance(); // Force update visibility immediately
        }

        this.updateHealthBarVisuals();
    }

    /**
     * Получить текущее здоровье
     */
    getHealth(): number {
        return this.health;
    }

    /**
     * Установить танк в состояние живого (показать)
     */
    setAlive(position?: Vector3): void {
        // КРИТИЧНО: Устанавливаем флаг для мгновенной телепортации при респавне
        this.needsRespawnTeleport = true;

        if (position && this.chassis) {
            this.chassis.position.copyFrom(position);

            // Также обновляем позицию в networkPlayer
            if (this.networkPlayer) {
                if (this.networkPlayer.position instanceof Vector3) {
                    this.networkPlayer.position.set(position.x, position.y, position.z);
                } else {
                    (this.networkPlayer.position as any) = new Vector3(position.x, position.y, position.z);
                }
                // Сбрасываем буфер интерполяции с новой позицией
                this.positionBuffer = [{
                    x: position.x,
                    y: position.y,
                    z: position.z,
                    rotation: this.networkPlayer.rotation || 0,
                    time: Date.now()
                }];
            }
        }

        if (this.chassis) {
            if (this.chassis.isDisposed()) return;

            // Trigger assembly animation if we have destroyed parts
            if (this.destroyedParts.length > 0) {
                this.isSpawning = true;
                this.animateReassembly(() => {
                    // Ensure visibility is correct after animation
                    this.chassis.isVisible = true;
                    this.chassis.setEnabled(true);
                });
                // Note: animateReassembly handles enabling/visiblity of parts as they lerp
            } else {
                // Determine if this is a "first spawn" or "respawn without death"
                // Just show it if no animation data
                this.chassis.isVisible = true;
                this.chassis.setEnabled(true);
                const children = this.chassis.getChildMeshes();
                children.forEach(child => {
                    child.isVisible = true;
                    child.setEnabled(true);
                });
            }

            this.chassis.checkCollisions = true;

            // Re-create physics if needed logic (same as before)
            if (!this.physicsAggregate) {
                this.physicsAggregate = new PhysicsAggregate(
                    this.chassis,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0, friction: 0 },
                    this.scene
                );
                this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
                this.physicsAggregate.body.disablePreStep = false;
            }
        }

        // Сбрасываем здоровье
        this.health = this.maxHealth;
        if (this.healthBar) this.healthBar.isVisible = false;
        if (this.healthBarBackground) this.healthBarBackground.isVisible = false;

        this.playSpawnEffect();
    }

    /**
     * Установить танк в состояние мертвого (скрыть и показать эффект)
     * IMPLEMENTATION MOVED TO LINE ~1670 to support scattering
     */
    // setDead removed to fix duplicate identifier error



    /**
     * Создать визуальную полоску здоровья над танком
     */
    /**
     * Создать визуальную полоску здоровья над танком
     */
    private createHealthBarVisuals(): void {
        if (this.healthBar) return; // Уже создана

        const barWidth = 2.5;
        const barHeight = 0.15;
        const barY = this.chassisType.height + 2.5; // Над танком

        // Фон (серый)
        this.healthBarBackground = MeshBuilder.CreatePlane(
            `healthBg_${this.uniqueId}`,
            { width: barWidth, height: barHeight },
            this.scene
        );
        this.healthBarBackground.position = new Vector3(0, barY, 0);
        this.healthBarBackground.parent = this.chassis;
        this.healthBarBackground.billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.healthBarBackground.isVisible = false;

        const bgMat = new StandardMaterial(`healthBgMat_${this.uniqueId}`, this.scene);
        bgMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
        bgMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        bgMat.backFaceCulling = false;
        bgMat.disableLighting = true;
        this.healthBarBackground.material = bgMat;

        // Полоска здоровья (зелёная/жёлтая/красная)
        this.healthBar = MeshBuilder.CreatePlane(
            `healthBar_${this.uniqueId}`,
            { width: barWidth, height: barHeight },
            this.scene
        );
        this.healthBar.position = new Vector3(0, barY, -0.01); // Чуть впереди фона
        this.healthBar.parent = this.chassis;
        this.healthBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.healthBar.isVisible = false;

        const barMat = new StandardMaterial(`healthBarMat_${this.uniqueId}`, this.scene);
        barMat.diffuseColor = new Color3(0.2, 0.8, 0.2); // Зелёный
        barMat.emissiveColor = new Color3(0.1, 0.4, 0.1);
        barMat.backFaceCulling = false;
        barMat.disableLighting = true;
        this.healthBar.material = barMat;

        // Текст дистанции (над полоской)
        // Плоскость 1.5x0.5, текстура 128x64 (2:1 aspect ratio match)
        this.distanceTextPlane = MeshBuilder.CreatePlane(
            `distText_${this.uniqueId}`,
            { width: 1.5, height: 0.5 },
            this.scene
        );
        // Позиция: Справа от полоски (barWidth/2 + offset)
        this.distanceTextPlane.position = new Vector3(barWidth / 2 + 0.9, barY, 0);
        this.distanceTextPlane.parent = this.chassis;
        this.distanceTextPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.distanceTextPlane.isVisible = false;

        this.distanceTexture = new DynamicTexture(`distTex_${this.uniqueId}`, { width: 256, height: 85 }, this.scene, false); // Increased resolution
        this.distanceTexture.hasAlpha = true;

        const textMat = new StandardMaterial(`distTextMat_${this.uniqueId}`, this.scene);
        textMat.diffuseTexture = this.distanceTexture;
        textMat.emissiveColor = Color3.White();
        textMat.diffuseColor = Color3.White();
        textMat.backFaceCulling = false;
        textMat.disableLighting = true;
        textMat.useAlphaFromDiffuseTexture = true;
        this.distanceTextPlane.material = textMat;
    }

    /**
     * Обновить визуальную полоску здоровья
     */
    /**
     * Обновить визуальную полоску здоровья (ТОЛЬКО ЦВЕТ И ШКАЛА)
     */
    private updateHealthBarVisuals(): void {
        // Создаём полоску если ещё не создана
        if (!this.healthBar) {
            this.createHealthBarVisuals();
        }

        if (!this.healthBar) return;

        const healthPercent = this.maxHealth > 0 ? this.health / this.maxHealth : 0;
        const barWidth = 2.5;

        // Масштабируем полоску по ширине
        this.healthBar.scaling.x = healthPercent;
        // Смещаем влево чтобы полоска уменьшалась справа
        this.healthBar.position.x = -barWidth * (1 - healthPercent) * 0.5;

        // Меняем цвет в зависимости от здоровья
        const mat = this.healthBar.material as StandardMaterial;
        if (mat) {
            if (healthPercent > 0.6) {
                // Зелёный
                mat.diffuseColor = new Color3(0.2, 0.8, 0.2);
                mat.emissiveColor = new Color3(0.1, 0.4, 0.1);
            } else if (healthPercent > 0.3) {
                // Жёлтый
                mat.diffuseColor = new Color3(0.9, 0.8, 0.2);
                mat.emissiveColor = new Color3(0.45, 0.4, 0.1);
            } else {
                // Красный
                mat.diffuseColor = new Color3(0.9, 0.2, 0.2);
                mat.emissiveColor = new Color3(0.45, 0.1, 0.1);
            }
        }
    }

    /**
     * Обновляет видимость и текст дистанции (вызывать в loop)
     */
    public updateHealthBarVisibilityAndDistance(): void {
        // If bar not created yet, don't create it here (wait for first damage)
        // But if lastHitTime is set, we might need to create it?
        // Actually setHealth calls updateHealthBarVisuals which creates it.
        // So just check existence.
        if (!this.healthBar || !this.healthBarBackground || !this.distanceTextPlane || !this.chassis) return;

        const now = Date.now();
        // Visible if hit recently AND health < max AND health > 0
        const isVisible = (now - this.lastHitTime < this.HP_BAR_VISIBLE_DURATION) && this.health < this.maxHealth && this.health > 0;

        if (this.healthBar.isVisible !== isVisible) {
            this.healthBar.isVisible = isVisible;
            this.healthBarBackground.isVisible = isVisible;
            this.distanceTextPlane.isVisible = isVisible;
        }

        if (isVisible) {
            // Update distance text
            const camera = this.scene.activeCamera;
            if (camera) {
                const dist = Vector3.Distance(camera.position, this.chassis.absolutePosition);

                // Throttling updates? Simple integer check is enough
                const distInt = Math.round(dist);
                // We could cache distInt to avoid canvas repaint
                if ((this as any)._lastDistInt !== distInt) {
                    (this as any)._lastDistInt = distInt;
                    const ctx = this.distanceTexture?.getContext() as unknown as CanvasRenderingContext2D;
                    if (ctx && this.distanceTexture) {
                        ctx.clearRect(0, 0, 256, 85);
                        // ctx.fillStyle = "rgba(0,0,0,0.5)";
                        // ctx.fillRect(0,0,128,64);
                        ctx.font = "bold 60px 'Press Start 2P', monospace";
                        ctx.fillStyle = "white";
                        ctx.textAlign = "left";
                        ctx.textBaseline = "middle";
                        ctx.fillText(`${distInt}m`, 10, 42);
                        this.distanceTexture.update();
                    }
                }
            }
        }
    }

    // === ANIMATION METHODS ===

    /**
     * Визуальная анимация разброса части (без физики)
     * Ported from TankHealthModule
     */
    private animatePartScatter(mesh: AbstractMesh, velocity: Vector3, angularVelocity: Vector3, duration: number): void {
        const startTime = Date.now();
        const startPos = mesh.position.clone();
        const gravity = -15; // Гравитация

        const animate = () => {
            if (mesh.isDisposed()) return;

            const elapsed = (Date.now() - startTime) / 1000; // в секундах
            const progress = Math.min(elapsed / (duration / 1000), 1.0);

            // Позиция с гравитацией: pos = startPos + vel*t + 0.5*g*t^2
            const newPos = startPos.add(velocity.scale(elapsed));
            newPos.y += 0.5 * gravity * elapsed * elapsed;

            // Не даём уйти под землю (локальная симуляция)
            // Note: Since positions are relative if parented, checking world Y is hard if not absolute.
            // But we unparent them before calling this.
            if (newPos.y < 0.1) {
                newPos.y = 0.1;
                velocity.y = 0;
                velocity.x *= 0.9; // Затухание
                velocity.z *= 0.9;
            }

            mesh.position.copyFrom(newPos);

            // Вращение
            if (mesh.rotationQuaternion) {
                const rotDelta = Quaternion.FromEulerAngles(
                    angularVelocity.x * 0.016,
                    angularVelocity.y * 0.016,
                    angularVelocity.z * 0.016
                );
                mesh.rotationQuaternion = mesh.rotationQuaternion.multiply(rotDelta);
            }

            // Затухание угловой скорости
            angularVelocity.scaleInPlace(0.98);

            // Прозрачность в конце
            if (progress > 0.7 && mesh.material) {
                const fadeProgress = (progress - 0.7) / 0.3;
                (mesh.material as any).alpha = 1 - fadeProgress * 0.3;
            }

            if (progress < 1.0) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Анимирует сборку танка
     */
    private animateReassembly(onComplete?: () => void): void {
        if (this.destroyedParts.length === 0) {
            // Если частей нет, просто включаем видимость
            this.setHierarchyVisibility(this.chassis, 1);
            if (onComplete) onComplete();
            return;
        }

        const duration = 1500;
        const startTime = Date.now();

        // Текущие позиции частей (разбросанные)
        const startPositions = this.destroyedParts.map(p => p.mesh.position.clone());
        const startRotations = this.destroyedParts.map(p => p.mesh.rotationQuaternion ? p.mesh.rotationQuaternion.clone() : Quaternion.Identity());

        // Целевые позиции (локальные относительно шасси, которое уже в точке респавна)
        // Но так как части сейчас detached, нам нужно пересчитать их целевые world позиции
        // Или проще: приаттачить их обратно СРАЗУ, но задать им локальные оффсеты, и интерполировать к 0?
        // Нет, лучше анимировать в мировых координатах, а в конце приаттачить.

        const targetPositions: Vector3[] = [];
        const targetRotations: Quaternion[] = [];

        const chassisPos = this.chassis.absolutePosition; // Шасси уже перемещено в точку респавна (невидимое)

        // Восстанавливаем иерархию виртуально для расчета позиций
        // КРИТИЧНО: Используем матрицу трансформации корпуса, чтобы учесть поворот танка
        const chassisWorldMatrix = this.chassis.computeWorldMatrix(true);

        for (const part of this.destroyedParts) {
            let targetWorldPos: Vector3;

            // Если это сам корпус - он уже на месте
            if (part.name === "chassis") {
                targetWorldPos = chassisPos.clone();
            } else {
                // Для остальных частей вычисляем их мировую позицию относительно корпуса
                let localOffset = part.originalLocalPos.clone();

                // СПЕЦИАЛЬНЫЙ КЕЙС: Ствол (barrel) является дочерним к башне (turret)
                // Нам нужно добавить смещение башни, чтобы получить смещение относительно корпуса
                if (part.name === "barrel") {
                    const turretPart = this.destroyedParts.find(p => p.name === "turret");
                    if (turretPart) {
                        // Прибавляем позицию башни (грубо, считая что башня смотрит прямо, что ок для респавна)
                        localOffset.addInPlace(turretPart.originalLocalPos);
                    }
                }

                // Трансформируем локальное смещение в мировые координаты через матрицу корпуса
                // Это автоматически учтёт поворот и позицию танка
                targetWorldPos = Vector3.TransformCoordinates(localOffset, chassisWorldMatrix);
            }

            targetPositions.push(targetWorldPos);

            // Вращение: возвращаем к оригинальному локальному вращению
            // Так как части detached, нам нужно применить и вращение родителя (корпуса)
            // Но для простоты "сборки" визуально достаточно вернуть локальное вращение
            // (или можно заморочиться с умножением кватернионов, но при быстром полете это не критично)
            targetRotations.push(part.originalLocalRot || Quaternion.Identity());
        }

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1.0);

            // Easing
            const easedProgress = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            for (let i = 0; i < this.destroyedParts.length; i++) {
                const part = this.destroyedParts[i];
                if (!part) continue;
                const mesh = part.mesh;
                if (mesh.isDisposed()) continue;

                // Lerp
                if (startPositions[i] && targetPositions[i]) {
                    const currentPos = Vector3.Lerp(startPositions[i]!, targetPositions[i]!, easedProgress);
                    mesh.position.copyFrom(currentPos);
                }

                if (startRotations[i] && targetRotations[i]) {
                    const currentRot = Quaternion.Slerp(startRotations[i]!, targetRotations[i]!, easedProgress);
                    if (mesh.rotationQuaternion) {
                        mesh.rotationQuaternion.copyFrom(currentRot);
                    } else {
                        mesh.rotationQuaternion = currentRot.clone();
                    }
                }

                if (mesh.material && (mesh.material as any).alpha < 1) {
                    (mesh.material as any).alpha = Math.min(1, (mesh.material as any).alpha + 0.05);
                }
            }

            if (Date.now() - startTime < duration) {
                requestAnimationFrame(animate);
            } else {
                // КРИТИЧНО: Сначала восстанавливаем иерархию, потом вызываем callback
                // Это исправляет баг когда части танка оставались detached после респавна
                this.finishReassembly();
                if (onComplete) onComplete();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Set visibility for a hierarchy
     */
    private setHierarchyVisibility(node: Node, alpha: number): void {
        if (node instanceof AbstractMesh) {
            node.isVisible = alpha > 0;
            if (node.material) {
                // Force alpha mode if needed
                if (alpha < 1) {
                    node.material.needDepthPrePass = true;
                }
                (node.material as any).alpha = alpha;
            }
        }

        const children = node.getChildMeshes();
        for (const child of children) {
            child.isVisible = alpha > 0;
            if (child.material) {
                if (alpha < 1) {
                    child.material.needDepthPrePass = true;
                }
                (child.material as any).alpha = alpha;
            }
        }
    }

    private finishReassembly(): void {
        this.isSpawning = false;

        // Restore hierarchy
        for (const part of this.destroyedParts) {
            if (part && part.mesh && !part.mesh.isDisposed()) {
                const mesh = part.mesh;
                if (part.originalParent) {
                    mesh.setParent(part.originalParent);
                }
                // Restore precise locals
                mesh.position.copyFrom(part.originalLocalPos);
                if (part.originalLocalRot) {
                    mesh.rotationQuaternion = part.originalLocalRot.clone();
                } else {
                    mesh.rotationQuaternion = Quaternion.Identity();
                }
                mesh.setEnabled(true);
                mesh.isVisible = true;
                // Restore alpha
                if (mesh.material) (mesh.material as any).alpha = 1;
            }
        }
        this.destroyedParts = [];
        this.updateVisibility();
    }

    /**
     * Установить танк в состояние мертвого
     */
    setDead(): void {
        this.playDeathEffect();

        if (this.chassis && !this.chassis.isDisposed()) {
            // Prepare parts for scattering
            const parts: { mesh: AbstractMesh; name: string }[] = [];
            parts.push({ mesh: this.chassis, name: "chassis" });

            if (this.turret) parts.push({ mesh: this.turret, name: "turret" });
            if (this.barrel) parts.push({ mesh: this.barrel, name: "barrel" });
            if (this.leftTrack) parts.push({ mesh: this.leftTrack, name: "leftTrack" });
            if (this.rightTrack) parts.push({ mesh: this.rightTrack, name: "rightTrack" });

            // Scatter them
            for (const part of parts) {
                const mesh = part.mesh;
                const originalParent = mesh.parent;
                const originalLocalPos = mesh.position.clone();
                const originalLocalRot = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null;

                // Detach
                mesh.setParent(null);

                // Calculate scatter velocity
                const direction = new Vector3(
                    (Math.random() - 0.5) * 2,
                    Math.random() * 0.5 + 0.5,
                    (Math.random() - 0.5) * 2
                ).normalize();

                const velocity = direction.scale(10 + Math.random() * 5);
                const angularVelocity = new Vector3(
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 5
                );

                this.animatePartScatter(mesh, velocity, angularVelocity, 2000);

                this.destroyedParts.push({
                    mesh,
                    name: part.name,
                    originalParent,
                    originalLocalPos,
                    originalLocalRot
                });
            }
        }

        // Hide health bar
        if (this.healthBar) this.healthBar.isVisible = false;
        if (this.healthBarBackground) this.healthBarBackground.isVisible = false;
        if (this.distanceTextPlane) this.distanceTextPlane.isVisible = false;

        // Disable collisions / physics on chassis if it remains
        if (this.chassis) {
            this.chassis.checkCollisions = false;
            // Disable physics body
            if (this.physicsAggregate) {
                this.physicsAggregate.dispose();
                this.physicsAggregate = null;
            }
        }
    }

    // === МЕТОДЫ ДЛЯ РАБОТЫ С МОДУЛЯМИ (ПОДГОТОВКА ДЛЯ БУДУЩЕГО) ===

    /**
     * Прикрепить модуль к танку
     * @param moduleId - ID модуля
     * @param moduleMesh - Меш модуля
     * @param attachTo - Куда крепить: 'chassis' или 'turret'
     * @param position - Позиция: 'front', 'back', 'left', 'right', 'top'
     */
    attachModule(moduleId: string, moduleMesh: Mesh, attachTo: 'chassis' | 'turret', position: 'front' | 'back' | 'left' | 'right' | 'top'): boolean {
        if (!this.moduleAttachPoints) {
            logger.warn(`[NetworkPlayerTank] Module attach points not initialized for ${this.playerId}`);
            return false;
        }

        // Определяем родителя и позицию крепления
        const parent = attachTo === 'chassis' ? this.chassis : this.turret;
        const attachPoint = this.moduleAttachPoints[attachTo][position];

        if (!parent || !attachPoint) {
            logger.warn(`[NetworkPlayerTank] Invalid attach point: ${attachTo}.${position}`);
            return false;
        }

        // Устанавливаем родителя и позицию
        moduleMesh.parent = parent;
        moduleMesh.position = attachPoint.clone();
        moduleMesh.isVisible = true;
        moduleMesh.setEnabled(true);

        // Сохраняем ссылку
        this.attachedModules.set(moduleId, moduleMesh);

        logger.log(`[NetworkPlayerTank] ✅ Module '${moduleId}' attached to ${attachTo}.${position} for ${this.playerId}`);
        return true;
    }

    /**
     * Удалить модуль с танка
     * @param moduleId - ID модуля для удаления
     */
    detachModule(moduleId: string): boolean {
        const moduleMesh = this.attachedModules.get(moduleId);
        if (!moduleMesh) {
            return false;
        }

        moduleMesh.parent = null;
        moduleMesh.dispose();
        this.attachedModules.delete(moduleId);

        logger.log(`[NetworkPlayerTank] ✅ Module '${moduleId}' detached from ${this.playerId}`);
        return true;
    }

    /**
     * Получить список прикреплённых модулей
     */
    getAttachedModules(): string[] {
        return Array.from(this.attachedModules.keys());
    }

    /**
     * Проверить, прикреплён ли модуль
     */
    hasModule(moduleId: string): boolean {
        return this.attachedModules.has(moduleId);
    }

    /**
     * Синхронизировать модули с серверными данными
     * Удаляет старые модули и добавляет новые
     * @param modules - массив модулей от сервера [{id, attachTo, position, visualConfig}]
     */
    syncModules(modules: Array<{
        id: string;
        attachTo: 'chassis' | 'turret';
        position: 'front' | 'back' | 'left' | 'right' | 'top';
        visualConfig?: {
            width?: number;
            height?: number;
            depth?: number;
            color?: string;
        };
    }>): void {
        // Получаем текущие модули
        const currentModuleIds = new Set(this.attachedModules.keys());
        const newModuleIds = new Set(modules.map(m => m.id));

        // Удаляем модули, которых нет в новых данных
        for (const oldId of currentModuleIds) {
            if (!newModuleIds.has(oldId)) {
                this.detachModule(oldId);
            }
        }

        // Добавляем новые модули
        for (const moduleData of modules) {
            if (!currentModuleIds.has(moduleData.id)) {
                // Create mesh from config
                const config = moduleData.visualConfig || {
                    width: 0.5,
                    height: 0.5,
                    depth: 0.5,
                    color: '#FFD700'
                };
                const mesh = MeshBuilder.CreateBox(moduleData.id, {
                    width: config.width || 0.5,
                    height: config.height || 0.5,
                    depth: config.depth || 0.5
                }, this.scene);
                const mat = new StandardMaterial(moduleData.id + "_mat", this.scene);
                mat.diffuseColor = Color3.FromHexString(config.color || '#FFD700');
                mesh.material = mat;

                this.attachModule(
                    moduleData.id,
                    mesh,
                    moduleData.attachTo,
                    moduleData.position
                );
            }
        }

        logger.log(`[NetworkPlayerTank] 🔄 Modules synced for ${this.playerId}: ${modules.length} modules`);
    }

    /**
     * Удаление танка
     */
    dispose(): void {
        // Лог dispose отключен для уменьшения спама

        // Dispose physics first!
        if (this.physicsAggregate) {
            this.physicsAggregate.dispose();
            this.physicsAggregate = null;
        }

        // Удаляем прикреплённые модули
        this.attachedModules.forEach((mesh, moduleId) => {
            try {
                mesh.dispose();
            } catch (e) { /* ignore */ }
        });
        this.attachedModules.clear();

        // Удаляем полоску здоровья
        if (this.healthBar) {
            this.healthBar.dispose();
            this.healthBar = null;
        }
        if (this.healthBarBackground) {
            this.healthBarBackground.dispose();
            this.healthBarBackground = null;
        }
        if (this.distanceTextPlane) {
            this.distanceTextPlane.dispose();
            this.distanceTextPlane = null;
        }
        if (this.distanceTexture) {
            this.distanceTexture.dispose();
            this.distanceTexture = null;
        }

        // Удаляем гусеницы
        if (this.leftTrack) {
            this.leftTrack.dispose();
            this.leftTrack = null;
        }
        if (this.rightTrack) {
            this.rightTrack.dispose();
            this.rightTrack = null;
        }

        // Удаляем все меши
        if (this.barrel) {
            // Удаляем дочерние меши ствола
            const barrelChildren = this.barrel.getChildMeshes();
            barrelChildren.forEach(child => {
                try { child.dispose(); } catch (e) { /* ignore */ }
            });
            this.barrel.dispose();
        }
        if (this.turret) {
            // Удаляем дочерние меши башни
            const turretChildren = this.turret.getChildMeshes();
            turretChildren.forEach(child => {
                try { child.dispose(); } catch (e) { /* ignore */ }
            });
            this.turret.dispose();
        }
        if (this.chassis) {
            // Dispose children first
            const children = this.chassis.getChildMeshes();
            children.forEach(child => {
                try {
                    child.dispose();
                } catch (e) {
                    // Ignore errors
                }
            });
            this.chassis.dispose();
        }

        // Очищаем точки крепления
        this.moduleAttachPoints = null;
    }
}

