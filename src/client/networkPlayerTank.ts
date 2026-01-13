/**
 * NetworkPlayerTank - Танк сетевого игрока
 * 
 * ВАЖНО: Создаёт РЕАЛЬНЫЕ детализированные модели танков для сетевых игроков.
 * Использует ту же логику создания, что и локальный танк, но с уникальными именами мешей.
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import type { NetworkPlayer } from "./multiplayer";
import { getChassisById, getCannonById, type ChassisType, type CannonType } from "./tankTypes";
import { createUniqueCannon, type CannonAnimationElements } from "./tank/tankCannon";
import { ChassisDetailsGenerator } from "./garage/chassisDetails";
import { MaterialFactory } from "./garage/materials";

export class NetworkPlayerTank {
    scene: Scene;
    playerId: string;
    
    // Visuals
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    
    // Tank types
    private chassisType: ChassisType;
    private cannonType: CannonType;
    
    // Network player reference
    networkPlayer: NetworkPlayer;
    
    // Interpolation
    private interpolationAlpha: number = 0;
    private readonly INTERPOLATION_SPEED = 15; // ИСПРАВЛЕНО: Было 0.15, теперь 15 для быстрой интерполяции с deltaTime
    private lastNetworkUpdateTime: number = 0;
    
    // КРИТИЧНО: Флаг для мгновенной телепортации при первом обновлении
    private needsInitialSync: boolean = true;
    
    // Cubic interpolation state
    private useCubicInterpolation: boolean = true; // Enable cubic interpolation
    private interpolationStartTime: number = 0;
    
    // Dead reckoning state
    private lastExtrapolatedPosition: Vector3 | null = null;
    private maxExtrapolationTime: number = 500; // Max 500ms extrapolation
    
    // Unique ID for this tank (to avoid mesh name conflicts)
    private uniqueId: string;
    
    constructor(scene: Scene, networkPlayer: NetworkPlayer) {
        this.scene = scene;
        this.playerId = networkPlayer.id;
        this.networkPlayer = networkPlayer;
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
        
        // Mark network update time
        this.lastNetworkUpdateTime = Date.now();
        
        // Уменьшен вывод логов - только один лог
        console.log(`[NetworkPlayerTank] ✅ ${networkPlayer.name || this.playerId} at (${this.chassis.position.x.toFixed(1)}, ${this.chassis.position.y.toFixed(1)}, ${this.chassis.position.z.toFixed(1)})`);
    }
    
    /**
     * Создание ДЕТАЛИЗИРОВАННОГО корпуса танка (как у локального игрока)
     * НЕ удаляет старые меши - это критично для мультиплеера!
     */
    private createDetailedChassis(): Mesh {
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;
        const tankColor = this.networkPlayer.tankColor || this.chassisType.color;
        const color = Color3.FromHexString(tankColor);
        
        // УНИКАЛЬНОЕ имя для сетевого танка (не tankHull_ чтобы не удаляться!)
        const uniqueChassisId = `netTankHull_${this.uniqueId}`;
        
        // Создаём корпус с правильными пропорциями по типу шасси
        let chassis: Mesh;
        
        switch (this.chassisType.id) {
            case "light":
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w * 0.75, height: h * 0.7, depth: d * 1.2 
                }, this.scene);
                break;
            case "scout":
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w * 0.7, height: h * 0.65, depth: d * 0.85 
                }, this.scene);
                break;
            case "heavy":
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w * 1.08, height: h * 1.2, depth: d * 1.08 
                }, this.scene);
                break;
            case "assault":
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w * 1.12, height: h * 1.1, depth: d * 1.05 
                }, this.scene);
                break;
            case "stealth":
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w * 1.05, height: h * 0.7, depth: d * 1.15 
                }, this.scene);
                break;
            case "hover":
                const hoverSize = Math.max(w, d) * 1.1;
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: hoverSize, height: h * 0.95, depth: hoverSize 
                }, this.scene);
                break;
            case "siege":
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w * 1.25, height: h * 1.35, depth: d * 1.2 
                }, this.scene);
                break;
            case "racer":
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w * 0.75, height: h * 0.55, depth: d * 1.3 
                }, this.scene);
                break;
            default: // medium и остальные
                chassis = MeshBuilder.CreateBox(uniqueChassisId, { 
                    width: w, height: h, depth: d 
                }, this.scene);
        }
        
        // Материал корпуса
        const mat = new StandardMaterial(`netChassisMat_${this.uniqueId}`, this.scene);
        mat.diffuseColor = color;
        mat.specularColor = Color3.Black();
        mat.freeze();
        chassis.material = mat;
        
        // Добавляем детали корпуса
        this.addChassisDetails(chassis, w, h, d, color);
        
        chassis.isVisible = true;
        chassis.setEnabled(true);
        
        return chassis;
    }
    
    /**
     * Добавление деталей корпуса (как у локального танка)
     */
    private addChassisDetails(chassis: Mesh, w: number, h: number, d: number, baseColor: Color3): void {
        // Материалы для деталей
        const armorMat = MaterialFactory.createArmorMaterial(this.scene, baseColor, `net_${this.uniqueId}`);
        const accentMat = MaterialFactory.createAccentMaterial(this.scene, baseColor, `net_${this.uniqueId}`);
        
        // Детали только для light, medium, racer, scout (как в оригинале)
        const detailedChassis = ["light", "medium", "racer", "scout"];
        
        if (detailedChassis.includes(this.chassisType.id)) {
            switch (this.chassisType.id) {
                case "light":
                    ChassisDetailsGenerator.createSlopedArmor(this.scene, chassis, new Vector3(0, h * 0.15, d * 0.52), w * 0.88, h * 0.6, 0.2, -Math.PI / 6, armorMat, `net_${this.uniqueId}_light`);
                    for (let i = 0; i < 2; i++) {
                        ChassisDetailsGenerator.createIntake(this.scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45), 0.3, h * 0.65, 0.35, accentMat, `net_${this.uniqueId}_light${i}`);
                    }
                    ChassisDetailsGenerator.createSpoiler(this.scene, chassis, new Vector3(0, h * 0.5, -d * 0.48), w * 1.2, 0.2, 0.25, accentMat, `net_${this.uniqueId}_light`);
                    break;
                    
                case "medium":
                    ChassisDetailsGenerator.createSlopedArmor(this.scene, chassis, new Vector3(0, h * 0.1, d * 0.5), w * 0.9, h * 0.7, 0.18, -Math.PI / 4, armorMat, `net_${this.uniqueId}_medium`);
                    for (let i = 0; i < 2; i++) {
                        ChassisDetailsGenerator.createHatch(this.scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1), 0.22, 0.08, 0.22, armorMat, `net_${this.uniqueId}_medium${i}`);
                    }
                    for (let i = 0; i < 2; i++) {
                        ChassisDetailsGenerator.createExhaust(this.scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.18, -d * 0.45), 0.12, 0.12, 0.18, armorMat, `net_${this.uniqueId}_medium${i}`);
                    }
                    break;
                    
                case "racer":
                    ChassisDetailsGenerator.createSpoiler(this.scene, chassis, new Vector3(0, -h * 0.4, d * 0.48), w * 0.9, 0.12, 0.15, accentMat, `net_${this.uniqueId}_racer`);
                    ChassisDetailsGenerator.createSpoiler(this.scene, chassis, new Vector3(0, h * 0.45, -d * 0.48), w * 1.1, 0.25, 0.2, accentMat, `net_${this.uniqueId}_racerBack`);
                    for (let i = 0; i < 2; i++) {
                        ChassisDetailsGenerator.createFairing(this.scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.1), 0.12, h * 0.6, d * 0.7, accentMat, `net_${this.uniqueId}_racer${i}`);
                    }
                    break;
                    
                case "scout":
                    ChassisDetailsGenerator.createSlopedArmor(this.scene, chassis, new Vector3(0, 0, d * 0.5), w * 0.8, h * 0.7, 0.4, -Math.PI / 4, accentMat, `net_${this.uniqueId}_scout`);
                    for (let i = 0; i < 2; i++) {
                        ChassisDetailsGenerator.createWing(this.scene, chassis, new Vector3((i === 0 ? -1 : 1) * w * 0.48, -h * 0.05, d * 0.3), 0.15, h * 0.85, d * 0.6, accentMat, `net_${this.uniqueId}_scout${i}`);
                    }
                    break;
            }
        }
        
        // Гусеницы для ВСЕХ типов танков
        const trackMat = new StandardMaterial(`netTrackMat_${this.uniqueId}`, this.scene);
        trackMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        trackMat.specularColor = Color3.Black();
        
        const trackWidth = w * 0.15;
        const trackHeight = h * 0.8;
        const trackDepth = d * 1.1;
        
        // Левая гусеница
        const leftTrack = MeshBuilder.CreateBox(
            `netLeftTrack_${this.uniqueId}`,
            { width: trackWidth, height: trackHeight, depth: trackDepth },
            this.scene
        );
        leftTrack.position = new Vector3(-w * 0.55, -h * 0.1, 0);
        leftTrack.parent = chassis;
        leftTrack.material = trackMat;
        
        // Правая гусеница
        const rightTrack = MeshBuilder.CreateBox(
            `netRightTrack_${this.uniqueId}`,
            { width: trackWidth, height: trackHeight, depth: trackDepth },
            this.scene
        );
        rightTrack.position = new Vector3(w * 0.55, -h * 0.1, 0);
        rightTrack.parent = chassis;
        rightTrack.material = trackMat;
        
        // Скосы спереди
        const frontSlope = MeshBuilder.CreateBox(
            `netFrontSlope_${this.uniqueId}`,
            { width: w * 0.95, height: h * 0.4, depth: d * 0.25 },
            this.scene
        );
        frontSlope.position = new Vector3(0, h * 0.3, d * 0.45);
        frontSlope.rotation.x = -0.4;
        frontSlope.parent = chassis;
        frontSlope.material = armorMat;
        
        // Скосы сзади
        const backSlope = MeshBuilder.CreateBox(
            `netBackSlope_${this.uniqueId}`,
            { width: w * 0.95, height: h * 0.3, depth: d * 0.2 },
            this.scene
        );
        backSlope.position = new Vector3(0, h * 0.25, -d * 0.45);
        backSlope.rotation.x = 0.3;
        backSlope.parent = chassis;
        backSlope.material = armorMat;
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
        
        // Материал башни
        const turretColor = this.networkPlayer.turretColor || this.networkPlayer.tankColor || this.chassisType.color;
        const color = Color3.FromHexString(turretColor);
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
        
        // КРИТИЧНО: При первом обновлении - МГНОВЕННАЯ телепортация к серверной позиции
        if (this.needsInitialSync) {
            this.chassis.position.x = targetX;
            this.chassis.position.y = targetY;
            this.chassis.position.z = targetZ;
            this.chassis.rotation.y = np.rotation || 0;
            if (this.turret) {
                this.turret.rotation.y = np.turretRotation || 0;
            }
            if (this.barrel) {
                this.barrel.rotation.x = -(np.aimPitch || 0);
            }
            this.needsInitialSync = false;
            // Логирование телепортации отключено для уменьшения спама
            return;
        }
        
        // УПРОЩЁННАЯ ЛИНЕЙНАЯ ИНТЕРПОЛЯЦИЯ
        // КРИТИЧНО: Увеличен INTERPOLATION_SPEED для более быстрого следования за целью
        const lerpFactor = Math.min(1.0, deltaTime * this.INTERPOLATION_SPEED * 2); // x2 для быстрого движения
        
        // Интерполяция позиции
        this.chassis.position.x += (targetX - this.chassis.position.x) * lerpFactor;
        this.chassis.position.y += (targetY - this.chassis.position.y) * lerpFactor;
        this.chassis.position.z += (targetZ - this.chassis.position.z) * lerpFactor;
        
        // Интерполяция вращения корпуса
        const targetRotation = np.rotation || 0;
        let rotDiff = targetRotation - this.chassis.rotation.y;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        this.chassis.rotation.y += rotDiff * lerpFactor;
        
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
     * Удаление танка
     */
    dispose(): void {
        // Лог dispose отключен для уменьшения спама
        
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
    }
}
