/**
 * NetworkPlayerTank - Танк сетевого игрока
 * 
 * ВАЖНО: Создаёт РЕАЛЬНЫЕ детализированные модели танков для сетевых игроков.
 * Использует ту же логику создания, что и локальный танк, но с уникальными именами мешей.
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, PhysicsAggregate, PhysicsShapeType, PhysicsMotionType, Quaternion } from "@babylonjs/core";
import type { NetworkPlayer } from "./multiplayer";
import { getChassisById, getCannonById, type ChassisType, type CannonType } from "./tankTypes";
import { createUniqueCannon, type CannonAnimationElements } from "./tank/tankCannon";
import { ChassisDetailsGenerator } from "./garage/chassisDetails";
import { MaterialFactory } from "./garage/materials";
import type { EffectsManager } from "./effects";
import { createUniqueChassis, type ChassisAnimationElements } from "./tank/tankChassis";
import { createVisualTracks } from "./tank/tankTracks";

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

    // Network player reference
    networkPlayer: NetworkPlayer;

    // Interpolation
    private interpolationAlpha: number = 0;
    private readonly INTERPOLATION_SPEED = 3; // КРИТИЧНО: Уменьшено до 3 для МАКСИМАЛЬНО плавного движения
    private lastNetworkUpdateTime: number = 0;

    // Position buffer for smooth interpolation
    private positionBuffer: { x: number; y: number; z: number; rotation: number; time: number }[] = [];
    private readonly BUFFER_SIZE = 3; // Храним 3 последних позиции для сглаживания

    // КРИТИЧНО: Флаг для мгновенной телепортации при первом обновлении
    needsInitialSync: boolean = true;

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

    // Unique ID for this tank (to avoid mesh name conflicts)
    private uniqueId: string;

    // Effects
    private effectsManager: EffectsManager | null = null;
    private prevStatus: string = "alive";

    // Debug counter for rotation logging
    private _rotLogCounter: number = 0;

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
            console.error(`[NetworkPlayerTank] Cannot create tank: scene is null for player ${this.playerId}`);
            throw new Error("Scene is required to create NetworkPlayerTank");
        }

        // Validate network player
        if (!networkPlayer || !networkPlayer.position) {
            console.error(`[NetworkPlayerTank] Cannot create tank: invalid networkPlayer for ${this.playerId}`);
            throw new Error("Valid networkPlayer with position is required");
        }

        // Get tank types from network player or use defaults
        this.chassisType = getChassisById(networkPlayer.chassisType || "medium");
        this.cannonType = getCannonById(networkPlayer.cannonType || "standard");

        // DEBUG: Логируем полученные типы для диагностики синхронизации моделей
        /*
        console.log(`[NetworkPlayerTank] 🔧 Creating tank for ${networkPlayer.name || networkPlayer.id}:`, {
            receivedChassisType: networkPlayer.chassisType,
            receivedCannonType: networkPlayer.cannonType,
            resolvedChassisType: this.chassisType.id,
            resolvedCannonType: this.cannonType.id,
            tankColor: networkPlayer.tankColor,
            turretColor: networkPlayer.turretColor,
            chassisPitch: networkPlayer.chassisPitch,
            chassisRoll: networkPlayer.chassisRoll,
            status: networkPlayer.status
        });
        */

        // Create tank visuals using REAL detailed models
        this.chassis = this.createDetailedChassis();
        this.turret = this.createDetailedTurret();
        this.barrel = this.createDetailedBarrel();

        // Set initial position
        if (networkPlayer.position) {
            this.chassis.position.copyFrom(networkPlayer.position);
            // Ensure tank is above ground
            if (this.chassis.position.y < 1) {
                this.chassis.position.y = 1;
            }
        } else {
            this.chassis.position.set(0, 1, 0);
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
        // Disable pre-step to save performance (we move it manually)
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
        this.createHealthBar();
        this.updateHealthBar();

        // Mark network update time
        this.lastNetworkUpdateTime = Date.now();

        // Уменьшен вывод логов - только один лог
        console.log(`[NetworkPlayerTank] ✅ ${networkPlayer.name || this.playerId} at (${this.chassis.position.x.toFixed(1)}, ${this.chassis.position.y.toFixed(1)}, ${this.chassis.position.z.toFixed(1)})`);
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

        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;

        // Цвет для гусениц (обычно темно-серый)
        // Если у типа гусениц есть цвет, можно использовать его, но в NetworkPlayerTank нет trackType
        // Поэтому используем стандартный цвет
        const trackColor = new Color3(0.15, 0.15, 0.15);

        // Используем общую логику создания гусениц
        const tracks = createVisualTracks(
            this.scene,
            chassis,
            w * 0.15, // ширина гусеницы
            h * 0.8,  // высота гусеницы
            d * 1.1,  // длина гусеницы
            trackColor,
            w,
            h,
            `net_${this.uniqueId}_` // префикс для уникальности
        );

        this.leftTrack = tracks.left;
        this.rightTrack = tracks.right;

        return chassis;
    }


    /**
     * Создание ДЕТАЛИЗИРОВАННОЙ башни танка
     */
    private createDetailedTurret(): Mesh {
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;

        const turretWidth = w * 0.6;
        const turretHeight = h * 0.5;
        const turretDepth = d * 0.5;

        const turret = MeshBuilder.CreateBox(
            `netTurret_${this.uniqueId}`,
            { width: turretWidth, height: turretHeight, depth: turretDepth },
            this.scene
        );

        // Позиционируем башню на корпусе
        turret.position.y = h * 0.5 + turretHeight * 0.5;
        turret.parent = this.chassis;

        // Материал башни - с безопасным парсингом цвета
        // ИСПРАВЛЕНИЕ: Если turretColor серый (дефолтный), используем tankColor
        let turretColorHex = this.networkPlayer.turretColor;
        const isDefaultGray = !turretColorHex || turretColorHex === '#888888' || turretColorHex === '#808080';
        if (isDefaultGray) {
            turretColorHex = this.networkPlayer.tankColor || this.chassisType.color;
        }

        console.log(`[NetworkPlayerTank] 🎨 Turret color for ${this.playerId}:`, {
            turretColor: this.networkPlayer.turretColor,
            tankColor: this.networkPlayer.tankColor,
            chassisColor: this.chassisType.color,
            isDefaultGray,
            finalColor: turretColorHex
        });

        let color: Color3;
        try {
            color = Color3.FromHexString(turretColorHex);
        } catch (e) {
            console.warn(`[NetworkPlayerTank] ⚠️ Failed to parse turret color '${turretColorHex}', using green`);
            color = new Color3(0, 1, 0);
        }

        const turretMat = new StandardMaterial(`netTurretMat_${this.uniqueId}`, this.scene);
        turretMat.diffuseColor = color;
        turretMat.emissiveColor = color.scale(0.15);
        turretMat.specularColor = new Color3(0.2, 0.2, 0.2);
        turret.material = turretMat;

        // Командирская башенка
        const cupola = MeshBuilder.CreateBox(
            `netCupola_${this.uniqueId}`,
            { width: turretWidth * 0.35, height: turretHeight * 0.4, depth: turretDepth * 0.35 },
            this.scene
        );
        cupola.position = new Vector3(0, turretHeight * 0.5 + turretHeight * 0.2, -turretDepth * 0.2);
        cupola.parent = turret;
        cupola.material = turretMat;

        // Скосы башни спереди
        const turretFrontSlope = MeshBuilder.CreateBox(
            `netTurretFrontSlope_${this.uniqueId}`,
            { width: turretWidth * 0.9, height: turretHeight * 0.6, depth: turretDepth * 0.3 },
            this.scene
        );
        turretFrontSlope.position = new Vector3(0, turretHeight * 0.1, turretDepth * 0.4);
        turretFrontSlope.rotation.x = -0.3;
        turretFrontSlope.parent = turret;
        turretFrontSlope.material = turretMat;

        turret.isVisible = true;
        turret.setEnabled(true);

        return turret;
    }

    /**
     * Создание ДЕТАЛИЗИРОВАННОГО ствола пушки (используя createUniqueCannon)
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

        // Позиционируем ствол на башне
        barrel.position = new Vector3(0, 0, barrelLength * 0.5 + this.chassisType.depth * 0.25);
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
     * Пометить, что получено сетевое обновление
     */
    markNetworkUpdate(): void {
        this.lastNetworkUpdateTime = Date.now();
        this.interpolationAlpha = 0;
    }

    /**
     * Обновление танка каждый кадр
     * УПРОЩЕНО: Используем только линейную интерполяцию для стабильности
     */
    update(deltaTime: number): void {
        if (!this.chassis || !this.networkPlayer) return;

        // Безопасное получение позиции (обрабатываем и Vector3, и plain objects)
        const np = this.networkPlayer;
        const targetX = typeof np.position?.x === 'number' ? np.position.x : 0;
        const targetY = typeof np.position?.y === 'number' ? np.position.y : 1;
        const targetZ = typeof np.position?.z === 'number' ? np.position.z : 0;
        const targetRotation = typeof np.rotation === 'number' ? np.rotation : 0;

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

        // =========================================================================
        // БУФЕРИЗАЦИЯ ПОЗИЦИЙ для сглаживания дёрганья
        // Добавляем новую позицию в буфер если она изменилась
        // =========================================================================
        const lastBuffered = this.positionBuffer[this.positionBuffer.length - 1];
        const posChanged = !lastBuffered ||
            Math.abs(lastBuffered.x - targetX) > 0.01 ||
            Math.abs(lastBuffered.z - targetZ) > 0.01;

        if (posChanged) {
            this.positionBuffer.push({ x: targetX, y: targetY, z: targetZ, rotation: targetRotation, time: Date.now() });
            // Ограничиваем размер буфера
            while (this.positionBuffer.length > this.BUFFER_SIZE) {
                this.positionBuffer.shift();
            }
        }

        // Вычисляем усреднённую целевую позицию из буфера для сглаживания
        let avgX = 0, avgY = 0, avgZ = 0, avgRot = 0;
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

        // Используем последнюю позицию с небольшим сглаживанием к средней
        // Это даёт баланс между отзывчивостью и плавностью
        const smoothFactor = 0.7; // 70% к последней позиции, 30% к средней
        const finalTargetX = targetX * smoothFactor + avgX * (1 - smoothFactor);
        const finalTargetY = targetY * smoothFactor + avgY * (1 - smoothFactor);
        const finalTargetZ = targetZ * smoothFactor + avgZ * (1 - smoothFactor);

        // УПРОЩЁННАЯ ЛИНЕЙНАЯ ИНТЕРПОЛЯЦИЯ
        // Используем базовую интерполяцию без экстраполяции (dead reckoning отключён)
        const lerpFactor = Math.min(1.0, deltaTime * this.INTERPOLATION_SPEED);

        // Интерполяция позиции
        this.chassis.position.x += (finalTargetX - this.chassis.position.x) * lerpFactor;
        this.chassis.position.y += (finalTargetY - this.chassis.position.y) * lerpFactor;
        this.chassis.position.z += (finalTargetZ - this.chassis.position.z) * lerpFactor;

        // Интерполяция вращения корпуса (Yaw, Pitch, Roll)
        // КРИТИЧНО: Используем Quaternion, так как PhysicsAggregate может его создать, 
        // и тогда rotation (Euler) будет игнорироваться.

        let currentYaw = this.chassis.rotation.y;
        let currentPitch = this.chassis.rotation.x;
        let currentRoll = this.chassis.rotation.z;

        // Если есть quaternion, конвертируем в Euler для интерполяции
        if (this.chassis.rotationQuaternion) {
            const euler = this.chassis.rotationQuaternion.toEulerAngles();
            currentPitch = euler.x;
            currentYaw = euler.y;
            currentRoll = euler.z;
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
            console.log(`[NPT] 🔄 Rotation: Pitch=${currentPitch.toFixed(2)}, Yaw=${currentYaw.toFixed(2)}, Roll=${currentRoll.toFixed(2)}`);
        }
        */

        // Интерполяция вращения башни
        if (this.turret) {
            const targetTurretRot = np.turretRotation || 0;
            let turretDiff = targetTurretRot - this.turret.rotation.y;
            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
            this.turret.rotation.y += turretDiff * lerpFactor;
        }

        // Интерполяция угла ствола
        if (this.barrel) {
            const targetAimPitch = -(np.aimPitch || 0);
            this.barrel.rotation.x += (targetAimPitch - this.barrel.rotation.x) * lerpFactor;
        }

        // Танк не должен проваливаться под землю
        if (this.chassis.position.y < 0.5) {
            this.chassis.position.y = 0.5;
        }

        // Обновление видимости на основе статуса
        this.updateVisibility();

        // Check for status changes (ANIMATIONS)
        const currentStatus = this.networkPlayer.status || "alive";
        if (currentStatus !== this.prevStatus) {
            // DEBUG: Логируем изменение статуса для диагностики анимаций
            console.log(`[NetworkPlayerTank] 🔄 Status change for ${this.playerId}: ${this.prevStatus} → ${currentStatus}`);

            // Respawn: dead -> alive
            if (this.prevStatus === "dead" && currentStatus === "alive") {
                console.log(`[NetworkPlayerTank] ✨ Playing SPAWN effect for ${this.playerId}`);
                this.playSpawnEffect();
            }
            // Death: alive -> dead (handled usually by onPlayerDied, but good as backup)
            if (this.prevStatus === "alive" && currentStatus === "dead") {
                console.log(`[NetworkPlayerTank] 💀 Playing DEATH effect for ${this.playerId}`);
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
     * Обновление видимости танка
     */
    private updateVisibility(): void {
        const status = this.networkPlayer.status;
        const shouldBeVisible = status === "alive" || status === undefined;

        if (this.chassis) {
            this.chassis.isVisible = shouldBeVisible;
            this.chassis.setEnabled(shouldBeVisible);
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
        this.health = Math.max(0, Math.min(health, maxHealth));
        this.maxHealth = maxHealth;
        this.updateHealthBar();
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
        // console.log(`[NetworkPlayerTank] 🟢 setAlive called for ${this.playerId}, position=${position ? position.toString() : 'none'}`);
        // console.log(`[NetworkPlayerTank] 🟢 Chassis state: exists=${!!this.chassis}, disposed=${this.chassis?.isDisposed()}, enabled=${this.chassis?.isEnabled()}, visible=${this.chassis?.isVisible}`);

        if (position && this.chassis) {
            this.chassis.position.copyFrom(position);
        }

        if (this.chassis) {
            if (this.chassis.isDisposed()) {
                console.error(`[NetworkPlayerTank] ❌ CRITICAL: Chassis was DISPOSED for ${this.playerId}! Cannot restore.`);
                return;
            }

            this.chassis.isVisible = true;
            this.chassis.setEnabled(true);
            this.chassis.checkCollisions = true;

            // КРИТИЧНО: Заново создаем физику при респавне
            if (!this.physicsAggregate) {
                console.log(`[NetworkPlayerTank] 🟢 Recreating physics for ${this.playerId}`);
                this.physicsAggregate = new PhysicsAggregate(
                    this.chassis,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0, friction: 0 },
                    this.scene
                );
                this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
                this.physicsAggregate.body.disablePreStep = false;
            }

            const children = this.chassis.getChildMeshes();
            // console.log(`[NetworkPlayerTank] 🟢 Restoring ${children.length} child meshes for ${this.playerId}`);
            children.forEach(child => {
                child.isVisible = true;
                child.setEnabled(true);
                child.checkCollisions = true;
            });

            // console.log(`[NetworkPlayerTank] ✅ setAlive COMPLETE for ${this.playerId}: visible=${this.chassis.isVisible}, enabled=${this.chassis.isEnabled()}, childCount=${children.length}`);
        } else {
            console.error(`[NetworkPlayerTank] ❌ setAlive FAILED - no chassis for ${this.playerId}`);
        }

        // Сбрасываем здоровье
        this.health = this.maxHealth;
        if (this.healthBar) this.healthBar.isVisible = false;
        if (this.healthBarBackground) this.healthBarBackground.isVisible = false;

        this.playSpawnEffect();
    }

    /**
     * Установить танк в состояние мертвого (скрыть и показать эффект)
     */
    setDead(): void {
        // console.log(`[NetworkPlayerTank] 💀 setDead for ${this.playerId}`);

        this.playDeathEffect();

        if (this.chassis) {
            this.chassis.isVisible = false;
            this.chassis.setEnabled(false);

            // Отключаем коллизии
            this.chassis.checkCollisions = false;
            const children = this.chassis.getChildMeshes();
            children.forEach(child => {
                child.isVisible = false;
                child.setEnabled(false);
                child.checkCollisions = false;
            });

            // Удаляем физику чтобы танк не мешал (будет пересоздана в setAlive)
            if (this.physicsAggregate) {
                this.physicsAggregate.dispose();
                this.physicsAggregate = null;
            }
        }

        if (this.healthBar) this.healthBar.isVisible = false;
        if (this.healthBarBackground) this.healthBarBackground.isVisible = false;
    }

    /**
     * Проиграть эффект появления
     */
    playSpawnEffect(): void {
        if (this.effectsManager && this.chassis && this.scene) {
            // Используем createTeleportEffect или createRespawnEffect
            this.effectsManager.createRespawnEffect(this.chassis.absolutePosition.clone());
        }
    }

    /**
     * Проиграть эффект смерти
     */
    playDeathEffect(): void {
        if (this.effectsManager && this.chassis && this.scene) {
            this.effectsManager.createExplosion(this.chassis.absolutePosition.clone(), 1.5);
        }
    }

    /**
     * Создать визуальную полоску здоровья над танком
     */
    private createHealthBar(): void {
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

        const bgMat = new StandardMaterial(`healthBgMat_${this.uniqueId}`, this.scene);
        bgMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
        bgMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        bgMat.backFaceCulling = false;
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

        const barMat = new StandardMaterial(`healthBarMat_${this.uniqueId}`, this.scene);
        barMat.diffuseColor = new Color3(0.2, 0.8, 0.2); // Зелёный
        barMat.emissiveColor = new Color3(0.1, 0.4, 0.1);
        barMat.backFaceCulling = false;
        this.healthBar.material = barMat;
    }

    /**
     * Обновить визуальную полоску здоровья
     */
    private updateHealthBar(): void {
        // Создаём полоску если ещё не создана
        if (!this.healthBar) {
            this.createHealthBar();
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

        // Скрываем если здоровье полное
        const shouldShow = this.health < this.maxHealth && this.health > 0;
        if (this.healthBar) this.healthBar.isVisible = shouldShow;
        if (this.healthBarBackground) this.healthBarBackground.isVisible = shouldShow;
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
            console.warn(`[NetworkPlayerTank] Module attach points not initialized for ${this.playerId}`);
            return false;
        }

        // Определяем родителя и позицию крепления
        const parent = attachTo === 'chassis' ? this.chassis : this.turret;
        const attachPoint = this.moduleAttachPoints[attachTo][position];

        if (!parent || !attachPoint) {
            console.warn(`[NetworkPlayerTank] Invalid attach point: ${attachTo}.${position}`);
            return false;
        }

        // Устанавливаем родителя и позицию
        moduleMesh.parent = parent;
        moduleMesh.position = attachPoint.clone();
        moduleMesh.isVisible = true;
        moduleMesh.setEnabled(true);

        // Сохраняем ссылку
        this.attachedModules.set(moduleId, moduleMesh);

        console.log(`[NetworkPlayerTank] ✅ Module '${moduleId}' attached to ${attachTo}.${position} for ${this.playerId}`);
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

        console.log(`[NetworkPlayerTank] ✅ Module '${moduleId}' detached from ${this.playerId}`);
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
