// ═══════════════════════════════════════════════════════════════════════════
// POI SYSTEM - Функциональная система точек интереса
// ═══════════════════════════════════════════════════════════════════════════

import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    PhysicsAggregate,
    PhysicsShapeType,
    TransformNode,
    Animation,
    ParticleSystem,
    Texture,
    Color4
} from "@babylonjs/core";
import { getTartuLandmarksInChunk, TartuLandmark } from "./tartuPOI";
import { generateBuildingsAlongRoads } from "./tartuBuildings";

// Seeded random
class SeededRandom {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    range(min: number, max: number): number { return min + this.next() * (max - min); }
    int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
    chance(p: number): boolean { return this.next() < p; }
}

export type POIType = 
    | "capturePoint" 
    | "ammoDepot" 
    | "repairStation" 
    | "fuelDepot" 
    | "radarStation";

export type POIOwner = "player" | "enemy" | null;

export interface POI {
    id: string;
    type: POIType;
    position: Vector3;
    worldPosition: Vector3; // Абсолютная позиция в мире
    meshes: Mesh[];
    radius: number;
    capturable: boolean;
    ownerId: POIOwner;
    captureProgress: number; // 0-100
    capturingBy: POIOwner; // Кто сейчас захватывает
    contested: boolean; // Есть ли контест
    active: boolean;
    destroyed: boolean;
    lastBonusTime: number; // Для бонусов за удержание
    cooldownUntil: number; // Для кулдаунов
    metadata: POIMetadata;
}

export interface POIMetadata {
    // Ammo depot
    ammoStock?: number;
    maxAmmoStock?: number;
    lastAmmoRefill?: number;
    specialAmmoChance?: number;
    
    // Repair station
    repairRate?: number;
    lastRepairTime?: number;
    
    // Fuel depot
    fuelStock?: number;
    maxFuelStock?: number;
    explosive?: boolean;
    explosionRadius?: number;
    explosionDamage?: number;
    fuelTanks?: Mesh[];
    
    // Radar
    detectionRadius?: number;
    lastPingTime?: number;
    detectedEnemies?: Vector3[];
    
    // Capture point
    captureTime?: number; // Время для захвата (сек)
    xpPerSecond?: number;
    creditsPerSecond?: number;
    
    // General
    respawnPoint?: boolean;
}

// Callback types for game integration
export interface POICallbacks {
    onCapture?: (poi: POI, newOwner: POIOwner) => void;
    onContestStart?: (poi: POI) => void;
    onContestEnd?: (poi: POI) => void;
    onAmmoPickup?: (poi: POI, amount: number, special: boolean) => void;
    onRepair?: (poi: POI, amount: number) => void;
    onFuelRefill?: (poi: POI, amount: number) => void;
    onExplosion?: (poi: POI, position: Vector3, radius: number, damage: number) => void;
    onRadarPing?: (poi: POI, detectedPositions: Vector3[]) => void;
    onBonusXP?: (amount: number) => void;
    onBonusCredits?: (amount: number) => void;
}

interface POISystemConfig {
    worldSeed: number;
    poiSpacing: number;
    mapType?: string;
}

export class POISystem {
    private scene: Scene;
    private config: POISystemConfig;
    private materials: Map<string, StandardMaterial> = new Map();
    private pois: Map<string, POI> = new Map();
    private chunkPOIs: Map<string, string[]> = new Map();
    private callbacks: POICallbacks = {};
    private particleSystems: Map<string, ParticleSystem> = new Map();
    private isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean;
    
    // Constants
    private readonly CAPTURE_POINT_TIME = 30; // seconds
    private readonly AMMO_DEPOT_CAPTURE_TIME = 10;
    private readonly REPAIR_CAPTURE_TIME = 10;
    private readonly FUEL_CAPTURE_TIME = 10;
    private readonly RADAR_CAPTURE_TIME = 30;
    
    private readonly AMMO_REFILL_RATE = 1; // per second
    private readonly REPAIR_RATE = 5; // % HP per second
    private readonly FUEL_REFILL_RATE = 10; // L per second
    private readonly RADAR_PING_INTERVAL = 3000; // ms
    private readonly RADAR_DETECTION_RADIUS = 300;
    
    private readonly XP_PER_SECOND = 1;
    private readonly CREDITS_PER_SECOND = 0.5;
    private readonly BONUS_INTERVAL = 1000; // ms
    
    // Множитель плотности POI (управляется из WorldGenerationMenu через applySettings)
    public poiDensityMultiplier = 1.0;
    
    constructor(scene: Scene, config?: Partial<POISystemConfig>, isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean) {
        this.scene = scene;
        this.config = {
            worldSeed: Date.now(),
            poiSpacing: 150,
            ...config
        };
        this.isPositionInGarageArea = isPositionInGarageArea;
        this.createMaterials();
    }
    
    setCallbacks(callbacks: POICallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
    
    private createMaterials(): void {
        // Neutral
        const captureNeutral = new StandardMaterial("poiCaptureNeutral", this.scene);
        captureNeutral.diffuseColor = new Color3(0.5, 0.5, 0.5);
        captureNeutral.emissiveColor = new Color3(0.1, 0.1, 0.1);
        captureNeutral.freeze();
        this.materials.set("captureNeutral", captureNeutral);
        
        // Player owned
        const capturePlayer = new StandardMaterial("poiCapturePlayer", this.scene);
        capturePlayer.diffuseColor = new Color3(0.1, 0.7, 0.1);
        capturePlayer.emissiveColor = new Color3(0.05, 0.3, 0.05);
        capturePlayer.freeze();
        this.materials.set("capturePlayer", capturePlayer);
        
        // Enemy owned
        const captureEnemy = new StandardMaterial("poiCaptureEnemy", this.scene);
        captureEnemy.diffuseColor = new Color3(0.7, 0.1, 0.1);
        captureEnemy.emissiveColor = new Color3(0.3, 0.05, 0.05);
        captureEnemy.freeze();
        this.materials.set("captureEnemy", captureEnemy);
        
        // Contested
        const captureContested = new StandardMaterial("poiCaptureContested", this.scene);
        captureContested.diffuseColor = new Color3(0.8, 0.6, 0.1);
        captureContested.emissiveColor = new Color3(0.3, 0.2, 0.05);
        captureContested.freeze();
        this.materials.set("captureContested", captureContested);
        
        // Ammo depot
        const ammoMat = new StandardMaterial("poiAmmo", this.scene);
        ammoMat.diffuseColor = new Color3(0.4, 0.35, 0.2);
        ammoMat.specularColor = new Color3(0.1, 0.1, 0.1);
        ammoMat.freeze();
        this.materials.set("ammo", ammoMat);
        
        // Special ammo - AP (blue)
        const ammoAP = new StandardMaterial("poiAmmoAP", this.scene);
        ammoAP.diffuseColor = new Color3(0.2, 0.3, 0.6);
        ammoAP.emissiveColor = new Color3(0.1, 0.15, 0.3);
        ammoAP.freeze();
        this.materials.set("ammoAP", ammoAP);
        
        // Special ammo - HE (orange)
        const ammoHE = new StandardMaterial("poiAmmoHE", this.scene);
        ammoHE.diffuseColor = new Color3(0.7, 0.4, 0.1);
        ammoHE.emissiveColor = new Color3(0.3, 0.15, 0.05);
        ammoHE.freeze();
        this.materials.set("ammoHE", ammoHE);
        
        // Repair station
        const repairMat = new StandardMaterial("poiRepair", this.scene);
        repairMat.diffuseColor = new Color3(0.2, 0.5, 0.7);
        repairMat.specularColor = new Color3(0.2, 0.2, 0.2);
        repairMat.freeze();
        this.materials.set("repair", repairMat);
        
        // Fuel depot
        const fuelMat = new StandardMaterial("poiFuel", this.scene);
        fuelMat.diffuseColor = new Color3(0.7, 0.35, 0.1);
        fuelMat.specularColor = new Color3(0.2, 0.1, 0.05);
        fuelMat.freeze();
        this.materials.set("fuel", fuelMat);
        
        // Radar
        const radarMat = new StandardMaterial("poiRadar", this.scene);
        radarMat.diffuseColor = new Color3(0.3, 0.35, 0.4);
        radarMat.specularColor = new Color3(0.3, 0.3, 0.3);
        radarMat.freeze();
        this.materials.set("radar", radarMat);
        
        // Flag materials
        const flagWhite = new StandardMaterial("poiFlagWhite", this.scene);
        flagWhite.diffuseColor = new Color3(0.9, 0.9, 0.9);
        flagWhite.freeze();
        this.materials.set("flagWhite", flagWhite);
        
        const flagGreen = new StandardMaterial("poiFlagGreen", this.scene);
        flagGreen.diffuseColor = new Color3(0.1, 0.7, 0.1);
        flagGreen.freeze();
        this.materials.set("flagGreen", flagGreen);
        
        const flagRed = new StandardMaterial("poiFlagRed", this.scene);
        flagRed.diffuseColor = new Color3(0.7, 0.1, 0.1);
        flagRed.freeze();
        this.materials.set("flagRed", flagRed);
        
        // Destroyed/ruins
        const ruinsMat = new StandardMaterial("poiRuins", this.scene);
        ruinsMat.diffuseColor = new Color3(0.25, 0.22, 0.2);
        ruinsMat.specularColor = Color3.Black();
        ruinsMat.freeze();
        this.materials.set("ruins", ruinsMat);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CAPTURE POINT
    // ═══════════════════════════════════════════════════════════════════════
    
    private createCapturePoint(position: Vector3, id: string, parent: TransformNode, worldPos: Vector3): POI {
        const meshes: Mesh[] = [];
        
        // Large square platform (replaced cylinder with box)
        const platform = MeshBuilder.CreateBox(`${id}_platform`, {
            width: 12,
            height: 0.4,
            depth: 12
        }, this.scene);
        platform.position = position.clone();
        platform.position.y = 0.2;
        platform.material = this.materials.get("captureNeutral")!;
        platform.parent = parent;
        meshes.push(platform);
        
        // Inner ring (progress indicator) - replaced torus with box
        const innerRing = MeshBuilder.CreateBox(`${id}_ring`, {
            width: 8,
            height: 0.3,
            depth: 8
        }, this.scene);
        innerRing.position = position.clone();
        innerRing.position.y = 0.5;
        innerRing.material = this.materials.get("captureNeutral")!;
        innerRing.parent = parent;
        meshes.push(innerRing);
        
        // Flag pole (replaced cylinder with box)
        const pole = MeshBuilder.CreateBox(`${id}_pole`, {
            width: 0.3,
            height: 8,
            depth: 0.3
        }, this.scene);
        pole.position = position.clone();
        pole.position.y = 4;
        pole.material = this.materials.get("captureNeutral")!;
        pole.parent = parent;
        meshes.push(pole);
        
        // Flag
        const flag = MeshBuilder.CreateBox(`${id}_flag`, {
            width: 3,
            height: 2,
            depth: 0.05
        }, this.scene);
        flag.position = position.clone();
        flag.position.x += 1.6;
        flag.position.y = 7;
        flag.material = this.materials.get("flagWhite")!;
        flag.parent = parent;
        meshes.push(flag);
        
        // Flag waving animation
        const animation = new Animation(
            "flagWave", "rotation.y", 30,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );
        animation.setKeys([
            { frame: 0, value: -0.15 },
            { frame: 15, value: 0.15 },
            { frame: 30, value: -0.15 }
        ]);
        flag.animations.push(animation);
        this.scene.beginAnimation(flag, 0, 30, true);
        
        // Beacon light on top of pole (replaced sphere with box)
        const beacon = MeshBuilder.CreateBox(`${id}_beacon`, { width: 0.8, height: 0.8, depth: 0.8 }, this.scene);
        beacon.position = position.clone();
        beacon.position.y = 8.5;
        const beaconMat = new StandardMaterial(`${id}_beaconMat`, this.scene);
        beaconMat.emissiveColor = new Color3(1, 1, 1);
        beaconMat.diffuseColor = new Color3(0.8, 0.8, 0.8);
        beacon.material = beaconMat;
        beacon.parent = parent;
        meshes.push(beacon);
        
        // Pulsing beacon animation
        const beaconAnim = new Animation(
            "beaconPulse", "material.emissiveColor", 30,
            Animation.ANIMATIONTYPE_COLOR3,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );
        beaconAnim.setKeys([
            { frame: 0, value: new Color3(0.3, 0.3, 0.3) },
            { frame: 15, value: new Color3(1, 1, 1) },
            { frame: 30, value: new Color3(0.3, 0.3, 0.3) }
        ]);
        beacon.animations.push(beaconAnim);
        this.scene.beginAnimation(beacon, 0, 30, true);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "capturePoint", poiId: id };
        }
        
        return {
            id,
            type: "capturePoint",
            position: position.clone(),
            worldPosition: worldPos,
            meshes,
            radius: 15,
            capturable: true,
            ownerId: null,
            captureProgress: 0,
            capturingBy: null,
            contested: false,
            active: true,
            destroyed: false,
            lastBonusTime: 0,
            cooldownUntil: 0,
            metadata: {
                captureTime: this.CAPTURE_POINT_TIME,
                xpPerSecond: this.XP_PER_SECOND,
                creditsPerSecond: this.CREDITS_PER_SECOND,
                respawnPoint: true
            }
        };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // AMMO DEPOT
    // ═══════════════════════════════════════════════════════════════════════
    
    private createAmmoDepot(position: Vector3, id: string, parent: TransformNode, worldPos: Vector3): POI {
        const meshes: Mesh[] = [];
        
        // Main warehouse building
        const building = MeshBuilder.CreateBox(`${id}_building`, {
            width: 10,
            height: 5,
            depth: 8
        }, this.scene);
        building.position = position.clone();
        building.position.y = 2.5;
        building.material = this.materials.get("ammo")!;
        building.parent = parent;
        meshes.push(building);
        new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Capture platform (replaced cylinder with box)
        const platform = MeshBuilder.CreateBox(`${id}_platform`, {
            width: 8,
            height: 0.2,
            depth: 8
        }, this.scene);
        platform.position = position.clone();
        platform.position.y = 0.1;
        platform.position.z += 6;
        platform.material = this.materials.get("captureNeutral")!;
        platform.parent = parent;
        meshes.push(platform);
        
        // Ammo crates (visual stock indicator)
        for (let i = 0; i < 5; i++) {
            const crate = MeshBuilder.CreateBox(`${id}_crate_${i}`, {
                width: 1.2,
                height: 0.8,
                depth: 1.2
            }, this.scene);
            crate.position = position.clone();
            crate.position.x += (i - 2) * 1.5;
            crate.position.y = 0.4;
            crate.position.z += 5;
            crate.material = this.materials.get("ammo")!;
            crate.parent = parent;
            meshes.push(crate);
        }
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "ammoDepot", poiId: id };
        }
        
        return {
            id,
            type: "ammoDepot",
            position: position.clone(),
            worldPosition: worldPos,
            meshes,
            radius: 10,
            capturable: true,
            ownerId: null,
            captureProgress: 0,
            capturingBy: null,
            contested: false,
            active: true,
            destroyed: false,
            lastBonusTime: 0,
            cooldownUntil: 0,
            metadata: {
                captureTime: this.AMMO_DEPOT_CAPTURE_TIME,
                ammoStock: 100,
                maxAmmoStock: 100,
                lastAmmoRefill: Date.now(),
                specialAmmoChance: 0.1 // 10% chance for special ammo
            }
        };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // REPAIR STATION
    // ═══════════════════════════════════════════════════════════════════════
    
    private createRepairStation(position: Vector3, id: string, parent: TransformNode, worldPos: Vector3): POI {
        const meshes: Mesh[] = [];
        
        // Garage structure
        const garage = MeshBuilder.CreateBox(`${id}_garage`, {
            width: 12,
            height: 6,
            depth: 14
        }, this.scene);
        garage.position = position.clone();
        garage.position.y = 3;
        garage.material = this.materials.get("repair")!;
        garage.parent = parent;
        meshes.push(garage);
        new PhysicsAggregate(garage, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Repair bay indicator (glowing floor)
        const repairBay = MeshBuilder.CreateBox(`${id}_bay`, {
            width: 8,
            height: 0.1,
            depth: 10
        }, this.scene);
        repairBay.position = position.clone();
        repairBay.position.y = 0.05;
        const bayMat = new StandardMaterial(`${id}_bayMat`, this.scene);
        bayMat.diffuseColor = new Color3(0.1, 0.4, 0.6);
        bayMat.emissiveColor = new Color3(0.05, 0.2, 0.3);
        bayMat.alpha = 0.7;
        repairBay.material = bayMat;
        repairBay.parent = parent;
        meshes.push(repairBay);
        
        // Capture platform outside (replaced cylinder with box)
        const platform = MeshBuilder.CreateBox(`${id}_platform`, {
            width: 6,
            height: 0.2,
            depth: 6
        }, this.scene);
        platform.position = position.clone();
        platform.position.y = 0.1;
        platform.position.z += 10;
        platform.material = this.materials.get("captureNeutral")!;
        platform.parent = parent;
        meshes.push(platform);
        
        // Tool racks (visual)
        const toolRack = MeshBuilder.CreateBox(`${id}_tools`, {
            width: 0.5,
            height: 3,
            depth: 4
        }, this.scene);
        toolRack.position = position.clone();
        toolRack.position.x += 5;
        toolRack.position.y = 1.5;
        toolRack.material = this.materials.get("repair")!;
        toolRack.parent = parent;
        meshes.push(toolRack);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "repairStation", poiId: id };
        }
        
        return {
            id,
            type: "repairStation",
            position: position.clone(),
            worldPosition: worldPos,
            meshes,
            radius: 12,
            capturable: true,
            ownerId: null,
            captureProgress: 0,
            capturingBy: null,
            contested: false,
            active: true,
            destroyed: false,
            lastBonusTime: 0,
            cooldownUntil: 0,
            metadata: {
                captureTime: this.REPAIR_CAPTURE_TIME,
                repairRate: this.REPAIR_RATE,
                lastRepairTime: 0
            }
        };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // FUEL DEPOT
    // ═══════════════════════════════════════════════════════════════════════
    
    private createFuelDepot(position: Vector3, id: string, parent: TransformNode, worldPos: Vector3): POI {
        const meshes: Mesh[] = [];
        const fuelTanks: Mesh[] = [];
        
        // Main office building
        const office = MeshBuilder.CreateBox(`${id}_office`, {
            width: 6,
            height: 4,
            depth: 5
        }, this.scene);
        office.position = position.clone();
        office.position.y = 2;
        office.position.x -= 8;
        office.material = this.materials.get("fuel")!;
        office.parent = parent;
        meshes.push(office);
        new PhysicsAggregate(office, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Fuel tanks (explosive!) - replaced cylinders with boxes
        for (let i = 0; i < 3; i++) {
            const tank = MeshBuilder.CreateBox(`${id}_tank_${i}`, {
                width: 3,
                height: 5,
                depth: 3
            }, this.scene);
            tank.position = position.clone();
            tank.position.x += (i - 1) * 4;
            tank.position.y = 2.5;
            tank.material = this.materials.get("fuel")!;
            tank.parent = parent;
            tank.metadata = { 
                type: "poi", 
                poiType: "fuelDepot", 
                poiId: id,
                isFuelTank: true,
                explosive: true
            };
            meshes.push(tank);
            fuelTanks.push(tank);
            new PhysicsAggregate(tank, PhysicsShapeType.CYLINDER, { mass: 0 }, this.scene);
        }
        
        // Fuel pumps
        for (let i = 0; i < 2; i++) {
            const pump = MeshBuilder.CreateBox(`${id}_pump_${i}`, {
                width: 1,
                height: 2,
                depth: 0.6
            }, this.scene);
            pump.position = position.clone();
            pump.position.x += (i - 0.5) * 3;
            pump.position.y = 1;
            pump.position.z += 5;
            pump.material = this.materials.get("fuel")!;
            pump.parent = parent;
            meshes.push(pump);
        }
        
        // Warning sign
        const sign = MeshBuilder.CreateBox(`${id}_sign`, {
            width: 2,
            height: 1.5,
            depth: 0.1
        }, this.scene);
        sign.position = position.clone();
        sign.position.z += 8;
        sign.position.y = 2;
        const signMat = new StandardMaterial(`${id}_signMat`, this.scene);
        signMat.diffuseColor = new Color3(0.8, 0.2, 0.1);
        signMat.emissiveColor = new Color3(0.2, 0.05, 0.02);
        sign.material = signMat;
        sign.parent = parent;
        meshes.push(sign);
        
        // Capture platform (replaced cylinder with box)
        const platform = MeshBuilder.CreateBox(`${id}_platform`, {
            width: 6,
            height: 0.2,
            depth: 6
        }, this.scene);
        platform.position = position.clone();
        platform.position.y = 0.1;
        platform.position.z += 6;
        platform.material = this.materials.get("captureNeutral")!;
        platform.parent = parent;
        meshes.push(platform);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            if (!mesh.metadata) {
                mesh.metadata = { type: "poi", poiType: "fuelDepot", poiId: id };
            }
        }
        
        // Create smoke particle system for fuel depot
        this.createFuelSmokeParticles(id, worldPos);
        
        return {
            id,
            type: "fuelDepot",
            position: position.clone(),
            worldPosition: worldPos,
            meshes,
            radius: 12,
            capturable: true,
            ownerId: null,
            captureProgress: 0,
            capturingBy: null,
            contested: false,
            active: true,
            destroyed: false,
            lastBonusTime: 0,
            cooldownUntil: 0,
            metadata: {
                captureTime: this.FUEL_CAPTURE_TIME,
                fuelStock: 500,
                maxFuelStock: 500,
                explosive: true,
                explosionRadius: 15,
                explosionDamage: 100,
                fuelTanks: fuelTanks
            }
        };
    }
    
    // Smoke particles for fuel depots
    private createFuelSmokeParticles(poiId: string, position: Vector3): void {
        const smoke = new ParticleSystem(`smoke_${poiId}`, 30, this.scene);
        smoke.particleTexture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", this.scene);
        smoke.emitter = position.add(new Vector3(0, 6, 0));
        smoke.minEmitBox = new Vector3(-1, 0, -1);
        smoke.maxEmitBox = new Vector3(1, 0, 1);
        
        smoke.color1 = new Color4(0.4, 0.4, 0.4, 0.3);
        smoke.color2 = new Color4(0.3, 0.3, 0.3, 0.2);
        smoke.colorDead = new Color4(0.2, 0.2, 0.2, 0);
        
        smoke.minSize = 1;
        smoke.maxSize = 3;
        smoke.minLifeTime = 2;
        smoke.maxLifeTime = 4;
        
        smoke.emitRate = 5;
        smoke.direction1 = new Vector3(-0.5, 2, -0.5);
        smoke.direction2 = new Vector3(0.5, 4, 0.5);
        smoke.gravity = new Vector3(0, 0.5, 0);
        
        smoke.start();
        this.particleSystems.set(`smoke_${poiId}`, smoke);
    }
    
    // Electric spark particles for radar stations
    private createRadarSparkParticles(poiId: string, position: Vector3): void {
        const sparks = new ParticleSystem(`sparks_${poiId}`, 20, this.scene);
        sparks.particleTexture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIA7N/mDQAAAABJRU5ErkJggg==", this.scene);
        sparks.emitter = position.add(new Vector3(0, 16, 0)); // At radar dish
        sparks.minEmitBox = new Vector3(-2, 0, -2);
        sparks.maxEmitBox = new Vector3(2, 0, 2);
        
        // Electric blue color
        sparks.color1 = new Color4(0.3, 0.7, 1, 1);
        sparks.color2 = new Color4(0.5, 0.8, 1, 1);
        sparks.colorDead = new Color4(0.1, 0.3, 0.5, 0);
        
        sparks.minSize = 0.1;
        sparks.maxSize = 0.3;
        sparks.minLifeTime = 0.1;
        sparks.maxLifeTime = 0.3;
        
        sparks.emitRate = 10;
        sparks.direction1 = new Vector3(-2, -1, -2);
        sparks.direction2 = new Vector3(2, 2, 2);
        sparks.gravity = new Vector3(0, -5, 0);
        
        sparks.start();
        this.particleSystems.set(`sparks_${poiId}`, sparks);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // RADAR STATION
    // ═══════════════════════════════════════════════════════════════════════
    
    private createRadarStation(position: Vector3, id: string, parent: TransformNode, worldPos: Vector3): POI {
        const meshes: Mesh[] = [];
        
        // Base building
        const base = MeshBuilder.CreateBox(`${id}_base`, {
            width: 8,
            height: 4,
            depth: 8
        }, this.scene);
        base.position = position.clone();
        base.position.y = 2;
        base.material = this.materials.get("radar")!;
        base.parent = parent;
        meshes.push(base);
        new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Radar tower (replaced cylinder with box)
        const tower = MeshBuilder.CreateBox(`${id}_tower`, {
            width: 1.5,
            height: 12,
            depth: 1.5
        }, this.scene);
        tower.position = position.clone();
        tower.position.y = 10;
        tower.material = this.materials.get("radar")!;
        tower.parent = parent;
        meshes.push(tower);
        
        // Radar dish (replaced cylinder with box)
        const dish = MeshBuilder.CreateBox(`${id}_dish`, {
            width: 6,
            height: 0.5,
            depth: 6
        }, this.scene);
        dish.position = position.clone();
        dish.position.y = 16;
        dish.rotation.x = Math.PI / 5;
        dish.material = this.materials.get("radar")!;
        dish.parent = parent;
        meshes.push(dish);
        
        // Rotating animation for dish
        const rotAnim = new Animation(
            "radarRotate", "rotation.y", 30,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );
        rotAnim.setKeys([
            { frame: 0, value: 0 },
            { frame: 180, value: Math.PI * 2 }
        ]);
        dish.animations.push(rotAnim);
        this.scene.beginAnimation(dish, 0, 180, true);
        
        // Capture platform
        const platform = MeshBuilder.CreateBox(`${id}_platform`, {
            width: 10,
            height: 0.3,
            depth: 10
        }, this.scene);
        platform.position = position.clone();
        platform.position.y = 0.15;
        platform.material = this.materials.get("captureNeutral")!;
        platform.parent = parent;
        meshes.push(platform);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "radarStation", poiId: id };
        }
        
        // Create electric spark particles for radar
        this.createRadarSparkParticles(id, worldPos);
        
        return {
            id,
            type: "radarStation",
            position: position.clone(),
            worldPosition: worldPos,
            meshes,
            radius: 12,
            capturable: true,
            ownerId: null,
            captureProgress: 0,
            capturingBy: null,
            contested: false,
            active: true,
            destroyed: false,
            lastBonusTime: 0,
            cooldownUntil: 0,
            metadata: {
                captureTime: this.RADAR_CAPTURE_TIME,
                detectionRadius: this.RADAR_DETECTION_RADIUS,
                lastPingTime: 0,
                detectedEnemies: []
            }
        };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // UPDATE SYSTEM
    // ═══════════════════════════════════════════════════════════════════════
    
    update(
        playerPosition: Vector3,
        enemyPositions: Vector3[],
        deltaTime: number
    ): void {
        const now = Date.now();
        
        for (const poi of this.pois.values()) {
            if (!poi.active || poi.destroyed) continue;
            
            // Check proximity
            const playerDist = Vector3.Distance(playerPosition, poi.worldPosition);
            const playerInRange = playerDist < poi.radius;
            
            let enemiesInRange = 0;
            for (const enemyPos of enemyPositions) {
                if (Vector3.Distance(enemyPos, poi.worldPosition) < poi.radius) {
                    enemiesInRange++;
                }
            }
            
            // Update capture
            if (poi.capturable) {
                this.updateCapture(poi, playerInRange, enemiesInRange, deltaTime, now);
            }
            
            // Apply effects based on ownership and proximity
            if (poi.ownerId === "player") {
                this.applyPOIEffects(poi, playerDist, deltaTime, now);
                this.giveBonuses(poi, now);
            }
            
            // Radar ping
            if (poi.type === "radarStation" && poi.ownerId === "player") {
                this.updateRadar(poi, playerPosition, enemyPositions, now);
            }
        }
    }
    
    private updateCapture(
        poi: POI,
        playerInRange: boolean,
        enemiesInRange: number,
        deltaTime: number,
        now: number
    ): void {
        const captureTime = poi.metadata.captureTime || this.CAPTURE_POINT_TIME;
        const captureRatePerSec = 100 / captureTime;
        const captureAmount = captureRatePerSec * deltaTime;
        
        // Check for contest
        const wasContested = poi.contested;
        poi.contested = playerInRange && enemiesInRange > 0;
        
        if (poi.contested && !wasContested) {
            this.callbacks.onContestStart?.(poi);
        } else if (!poi.contested && wasContested) {
            this.callbacks.onContestEnd?.(poi);
        }
        
        // If contested, no progress
        if (poi.contested) {
            this.updatePOIMaterials(poi);
            return;
        }
        
        // Determine who is capturing
        if (playerInRange && enemiesInRange === 0) {
            poi.capturingBy = "player";
        } else if (!playerInRange && enemiesInRange > 0) {
            poi.capturingBy = "enemy";
        } else {
            poi.capturingBy = null;
        }
        
        // Update progress
        if (poi.capturingBy) {
            if (poi.ownerId === null) {
                // Neutral - capture directly
                poi.captureProgress += captureAmount;
                if (poi.captureProgress >= 100) {
                    poi.captureProgress = 100;
                    poi.ownerId = poi.capturingBy;
                    poi.lastBonusTime = now;
                    this.callbacks.onCapture?.(poi, poi.ownerId);
                }
            } else if (poi.ownerId !== poi.capturingBy) {
                // Owned by someone else - neutralize first
                poi.captureProgress -= captureAmount;
                if (poi.captureProgress <= 0) {
                    poi.captureProgress = 0;
                    poi.ownerId = null;
                }
            }
        }
        
        this.updatePOIMaterials(poi);
    }
    
    private updatePOIMaterials(poi: POI): void {
        let matName = "captureNeutral";
        let flagMat = "flagWhite";
        
        if (poi.contested) {
            matName = "captureContested";
            flagMat = "flagWhite";
        } else if (poi.ownerId === "player") {
            matName = "capturePlayer";
            flagMat = "flagGreen";
        } else if (poi.ownerId === "enemy") {
            matName = "captureEnemy";
            flagMat = "flagRed";
        }
        
        const platformMat = this.materials.get(matName);
        const flagMaterial = this.materials.get(flagMat);
        
        for (const mesh of poi.meshes) {
            if (mesh.name.includes("platform") || mesh.name.includes("ring")) {
                if (platformMat) mesh.material = platformMat;
            }
            if (mesh.name.includes("flag")) {
                if (flagMaterial) mesh.material = flagMaterial;
            }
        }
    }
    
    private applyPOIEffects(
        poi: POI,
        playerDist: number,
        deltaTime: number,
        now: number
    ): void {
        if (playerDist > poi.radius) return;
        if (now < poi.cooldownUntil) return;
        
        switch (poi.type) {
            case "ammoDepot":
                this.applyAmmoEffect(poi, deltaTime);
                break;
            case "repairStation":
                this.applyRepairEffect(poi, deltaTime, now);
                break;
            case "fuelDepot":
                this.applyFuelEffect(poi, deltaTime);
                break;
        }
    }
    
    private applyAmmoEffect(poi: POI, deltaTime: number): void {
        if (!poi.metadata.ammoStock || poi.metadata.ammoStock <= 0) return;
        
        const ammoToGive = Math.min(this.AMMO_REFILL_RATE * deltaTime, poi.metadata.ammoStock);
        poi.metadata.ammoStock -= ammoToGive;
        
        // Check for special ammo
        const isSpecial = Math.random() < (poi.metadata.specialAmmoChance || 0.1);
        
        this.callbacks.onAmmoPickup?.(poi, ammoToGive, isSpecial);
        
        // Respawn stock periodically
        const now = Date.now();
        if (now - (poi.metadata.lastAmmoRefill || 0) > 60000) {
            poi.metadata.ammoStock = poi.metadata.maxAmmoStock || 100;
            poi.metadata.lastAmmoRefill = now;
        }
    }
    
    private applyRepairEffect(poi: POI, deltaTime: number, now: number): void {
        const repairAmount = (poi.metadata.repairRate || this.REPAIR_RATE) * deltaTime;
        poi.metadata.lastRepairTime = now;
        
        this.callbacks.onRepair?.(poi, repairAmount);
        
        // Start repair particles
        this.startRepairParticles(poi);
    }
    
    private applyFuelEffect(poi: POI, deltaTime: number): void {
        if (!poi.metadata.fuelStock || poi.metadata.fuelStock <= 0) return;
        
        const fuelToGive = Math.min(this.FUEL_REFILL_RATE * deltaTime, poi.metadata.fuelStock);
        poi.metadata.fuelStock -= fuelToGive;
        
        this.callbacks.onFuelRefill?.(poi, fuelToGive);
    }
    
    private giveBonuses(poi: POI, now: number): void {
        if (poi.type !== "capturePoint") return;
        if (now - poi.lastBonusTime < this.BONUS_INTERVAL) return;
        
        poi.lastBonusTime = now;
        
        const xp = poi.metadata.xpPerSecond || this.XP_PER_SECOND;
        const credits = poi.metadata.creditsPerSecond || this.CREDITS_PER_SECOND;
        
        this.callbacks.onBonusXP?.(xp);
        this.callbacks.onBonusCredits?.(credits);
    }
    
    private updateRadar(poi: POI, playerPos: Vector3, enemyPositions: Vector3[], now: number): void {
        if (now - (poi.metadata.lastPingTime || 0) < this.RADAR_PING_INTERVAL) return;
        
        // Check if player is within 100m of radar
        if (Vector3.Distance(playerPos, poi.worldPosition) > 100) return;
        
        poi.metadata.lastPingTime = now;
        
        const detectionRadius = poi.metadata.detectionRadius || this.RADAR_DETECTION_RADIUS;
        const detected: Vector3[] = [];
        
        for (const enemyPos of enemyPositions) {
            if (Vector3.Distance(poi.worldPosition, enemyPos) < detectionRadius) {
                detected.push(enemyPos.clone());
            }
        }
        
        poi.metadata.detectedEnemies = detected;
        
        if (detected.length > 0) {
            this.callbacks.onRadarPing?.(poi, detected);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // FUEL DEPOT EXPLOSION
    // ═══════════════════════════════════════════════════════════════════════
    
    handleBulletHit(mesh: Mesh): boolean {
        const meta = mesh.metadata;
        if (!meta || !meta.isFuelTank || !meta.explosive) return false;
        
        const poiId = meta.poiId;
        const poi = this.pois.get(poiId);
        if (!poi || poi.destroyed) return false;
        
        this.explodeFuelDepot(poi);
        return true;
    }
    
    private explodeFuelDepot(poi: POI): void {
        poi.destroyed = true;
        poi.active = false;
        
        const explosionPos = poi.worldPosition.clone();
        const radius = poi.metadata.explosionRadius || 15;
        const damage = poi.metadata.explosionDamage || 100;
        
        // Create explosion effect
        this.createExplosionEffect(explosionPos);
        
        // Callback for damage
        this.callbacks.onExplosion?.(poi, explosionPos, radius, damage);
        
        // Replace with ruins
        this.createRuins(poi);
        
        // Schedule respawn
        setTimeout(() => {
            this.respawnFuelDepot(poi);
        }, 180000); // 3 minutes
    }
    
    private createExplosionEffect(position: Vector3): void {
        // Fire particle system
        const fireSystem = new ParticleSystem("explosion", 500, this.scene);
        fireSystem.particleTexture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", this.scene);
        fireSystem.emitter = position;
        fireSystem.minEmitBox = new Vector3(-2, 0, -2);
        fireSystem.maxEmitBox = new Vector3(2, 0, 2);
        
        fireSystem.color1 = new Color4(1, 0.5, 0.1, 1);
        fireSystem.color2 = new Color4(1, 0.2, 0, 1);
        fireSystem.colorDead = new Color4(0.2, 0.1, 0.05, 0);
        
        fireSystem.minSize = 0.5;
        fireSystem.maxSize = 3;
        fireSystem.minLifeTime = 0.5;
        fireSystem.maxLifeTime = 1.5;
        
        fireSystem.emitRate = 300;
        fireSystem.direction1 = new Vector3(-3, 8, -3);
        fireSystem.direction2 = new Vector3(3, 12, 3);
        fireSystem.gravity = new Vector3(0, -5, 0);
        
        fireSystem.start();
        
        setTimeout(() => {
            fireSystem.stop();
            setTimeout(() => fireSystem.dispose(), 2000);
        }, 1000);
    }
    
    private createRuins(poi: POI): void {
        // Hide original meshes
        for (const mesh of poi.meshes) {
            mesh.isVisible = false;
        }
        
        // Create ruins at position
        const parent = poi.meshes[0]?.parent as TransformNode;
        if (!parent) return;
        
        // Rubble
        for (let i = 0; i < 5; i++) {
            const rubble = MeshBuilder.CreateBox(`${poi.id}_rubble_${i}`, {
                width: 1 + Math.random() * 2,
                height: 0.5 + Math.random(),
                depth: 1 + Math.random() * 2
            }, this.scene);
            rubble.position = poi.position.clone();
            rubble.position.x += (Math.random() - 0.5) * 8;
            rubble.position.y = 0.3 + Math.random() * 0.5;
            rubble.position.z += (Math.random() - 0.5) * 8;
            rubble.rotation.y = Math.random() * Math.PI;
            rubble.material = this.materials.get("ruins")!;
            rubble.parent = parent;
        }
        
        // Crater (replaced cylinder with box)
        const crater = MeshBuilder.CreateBox(`${poi.id}_crater`, {
            width: 8,
            height: 0.5,
            depth: 8
        }, this.scene);
        crater.position = poi.position.clone();
        crater.position.y = -0.2;
        crater.material = this.materials.get("ruins")!;
        crater.parent = parent;
    }
    
    private respawnFuelDepot(poi: POI): void {
        // Show original meshes
        for (const mesh of poi.meshes) {
            mesh.isVisible = true;
        }
        
        // Reset POI state
        poi.destroyed = false;
        poi.active = true;
        poi.ownerId = null;
        poi.captureProgress = 0;
        poi.metadata.fuelStock = poi.metadata.maxFuelStock;
        
        // Remove ruins (they will be orphaned and GC'd)
    }
    
    private startRepairParticles(poi: POI): void {
        const key = `repair_${poi.id}`;
        if (this.particleSystems.has(key)) return;
        
        const sparks = new ParticleSystem("repairSparks", 50, this.scene);
        sparks.particleTexture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", this.scene);
        sparks.emitter = poi.worldPosition;
        sparks.minEmitBox = new Vector3(-3, 0, -3);
        sparks.maxEmitBox = new Vector3(3, 0, 3);
        
        sparks.color1 = new Color4(1, 0.8, 0.3, 1);
        sparks.color2 = new Color4(1, 0.5, 0.1, 1);
        sparks.colorDead = new Color4(0.5, 0.3, 0.1, 0);
        
        sparks.minSize = 0.05;
        sparks.maxSize = 0.2;
        sparks.minLifeTime = 0.1;
        sparks.maxLifeTime = 0.3;
        
        sparks.emitRate = 30;
        sparks.direction1 = new Vector3(-1, 3, -1);
        sparks.direction2 = new Vector3(1, 5, 1);
        sparks.gravity = new Vector3(0, -10, 0);
        
        sparks.start();
        this.particleSystems.set(key, sparks);
        
        // Stop after 2 seconds
        setTimeout(() => {
            sparks.stop();
            setTimeout(() => {
                sparks.dispose();
                this.particleSystems.delete(key);
            }, 500);
        }, 2000);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // GENERATION
    // ═══════════════════════════════════════════════════════════════════════
    
    generatePOIsForChunk(
        chunkX: number,
        chunkZ: number,
        chunkSize: number,
        biome: string,
        parent: TransformNode
    ): POI[] {
        const key = `${chunkX}_${chunkZ}`;
        
        if (this.chunkPOIs.has(key)) {
            const poiIds = this.chunkPOIs.get(key)!;
            return poiIds.map(id => this.pois.get(id)!).filter(p => p);
        }
        
        // СПЕЦИАЛЬНАЯ ОБРАБОТКА ДЛЯ ТАРТУ
        // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
        // ТОЛЬКО для Тартарии используем специальную систему POI
        if (this.config.mapType === "tartaria") {
            return this.generateTartuPOIsForChunk(chunkX, chunkZ, chunkSize, biome, parent);
        }
        
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const random = new SeededRandom(seed);
        const createdPOIs: POI[] = [];
        const poiIds: string[] = [];
        
        const worldX = chunkX * chunkSize;
        const worldZ = chunkZ * chunkSize;
        
        // POI probability and count based on biome
        let poiChance = 0;
        let maxPOIs = 1;
        switch (biome) {
            case "military": 
                poiChance = 0.95; // Увеличено с 0.85 для много POI
                maxPOIs = 3;
                break;
            case "industrial": 
                poiChance = 0.9; // Увеличено с 0.7 для много POI
                maxPOIs = 2;
                break;
            case "city": 
                poiChance = 0.85; // Увеличено с 0.5 для много POI
                maxPOIs = 2;
                break;
            case "wasteland": 
                poiChance = 0.8; // Увеличено с 0.6 для много POI
                maxPOIs = 2;
                break;
            case "residential":
                poiChance = 0.7; // Увеличено с 0.4 для много POI
                maxPOIs = 1;
                break;
            case "park":
                poiChance = 0.6; // Увеличено с 0.3 для много POI
                maxPOIs = 1;
                break;
            default: 
                poiChance = 0.65; // Увеличено с 0.35 для много POI
                maxPOIs = 1;
        }
        
        // Reduce near center (player spawn area)
        const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
        if (distFromCenter < 80) {
            poiChance *= 0.1; // Меньше POI у спавна
        } else if (distFromCenter < 150) {
            poiChance *= 0.5; // Постепенное увеличение
        }
        
        // Применяем множитель плотности (0.5–2.0 из WorldGenerationMenu)
        poiChance = Math.min(1, poiChance * this.poiDensityMultiplier);
        
        // Собираем POI из соседних чанков для глобального ограничения плотности
        const nearbyPOIs: POI[] = [];
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dz === 0) continue;
                const neighborKey = `${chunkX + dx}_${chunkZ + dz}`;
                const neighborIds = this.chunkPOIs.get(neighborKey);
                if (!neighborIds) continue;
                for (const id of neighborIds) {
                    const p = this.pois.get(id);
                    if (p) nearbyPOIs.push(p);
                }
            }
        }
        
        // Generate POIs
        const numPOIs = random.chance(poiChance) ? random.int(1, maxPOIs) : 0;
        
        for (let i = 0; i < numPOIs; i++) {
            // Случайная позиция в чанке с отступами от краёв
            const margin = 20;
            const x = worldX + random.range(margin, chunkSize - margin);
            const z = worldZ + random.range(margin, chunkSize - margin);
            
            // КРИТИЧЕСКИ ВАЖНО: Проверяем, не находится ли POI в области гаража
            if (this.isPositionInGarageArea && this.isPositionInGarageArea(x, z, 10)) {
                continue; // Пропускаем этот POI
            }
            
            // Проверяем расстояние до других POI (в этом и соседних чанках)
            const candidatePos = new Vector3(x, 0, z);
            const minSpacing = this.config.poiSpacing;
            let tooClose = false;
            for (const existingPoi of createdPOIs) {
                const dist = Vector3.Distance(candidatePos, existingPoi.worldPosition);
                if (dist < minSpacing) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                for (const existingPoi of nearbyPOIs) {
                    const dist = Vector3.Distance(candidatePos, existingPoi.worldPosition);
                    if (dist < minSpacing) {
                        tooClose = true;
                        break;
                    }
                }
            }
            if (tooClose) {
                continue;
            }
            
            const localPos = new Vector3(x - worldX, 0, z - worldZ);
            const worldPos = new Vector3(x, 0, z);
            const id = `poi_${chunkX}_${chunkZ}_${i}_${random.int(0, 9999)}`;
            
            let poi: POI;
            
            if (biome === "military") {
                // Военные базы - все типы POI
                const type = random.int(0, 4);
                if (type === 0) poi = this.createCapturePoint(localPos, id, parent, worldPos);
                else if (type === 1) poi = this.createAmmoDepot(localPos, id, parent, worldPos);
                else if (type === 2) poi = this.createRadarStation(localPos, id, parent, worldPos);
                else if (type === 3) poi = this.createFuelDepot(localPos, id, parent, worldPos);
                else poi = this.createRepairStation(localPos, id, parent, worldPos);
            } else if (biome === "industrial") {
                // Индустриальные зоны - топливо, ремонт, боеприпасы
                const type = random.int(0, 3);
                if (type === 0) poi = this.createFuelDepot(localPos, id, parent, worldPos);
                else if (type === 1) poi = this.createRepairStation(localPos, id, parent, worldPos);
                else if (type === 2) poi = this.createAmmoDepot(localPos, id, parent, worldPos);
                else poi = this.createCapturePoint(localPos, id, parent, worldPos);
            } else if (biome === "city") {
                // Город - точки захвата, ремонт, склады
                const type = random.int(0, 3);
                if (type === 0) poi = this.createCapturePoint(localPos, id, parent, worldPos);
                else if (type === 1) poi = this.createRepairStation(localPos, id, parent, worldPos);
                else if (type === 2) poi = this.createAmmoDepot(localPos, id, parent, worldPos);
                else poi = this.createFuelDepot(localPos, id, parent, worldPos);
            } else if (biome === "wasteland") {
                // Пустоши - точки захвата, радары
                const type = random.int(0, 3);
                if (type === 0) poi = this.createCapturePoint(localPos, id, parent, worldPos);
                else if (type === 1) poi = this.createRadarStation(localPos, id, parent, worldPos);
                else if (type === 2) poi = this.createAmmoDepot(localPos, id, parent, worldPos);
                else poi = this.createRepairStation(localPos, id, parent, worldPos);
            } else if (biome === "residential") {
                // Жилые районы - ремонт, топливо
                const type = random.int(0, 2);
                if (type === 0) poi = this.createRepairStation(localPos, id, parent, worldPos);
                else if (type === 1) poi = this.createFuelDepot(localPos, id, parent, worldPos);
                else poi = this.createCapturePoint(localPos, id, parent, worldPos);
            } else {
                // Парки и другие биомы - в основном точки захвата, иногда радары/топливо
                const type = random.int(0, 3);
                if (type === 0) poi = this.createCapturePoint(localPos, id, parent, worldPos);
                else if (type === 1) poi = this.createRepairStation(localPos, id, parent, worldPos);
                else if (type === 2) poi = this.createAmmoDepot(localPos, id, parent, worldPos);
                else poi = this.createRadarStation(localPos, id, parent, worldPos);
            }
            
            this.pois.set(id, poi);
            poiIds.push(id);
            createdPOIs.push(poi);
            
            console.log(`[POI] Generated ${poi.type} at (${Math.round(x)}, ${Math.round(z)}) in ${biome}`);
        }
        
        this.chunkPOIs.set(key, poiIds);
        return createdPOIs;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // TARTU POI GENERATION
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * Генерирует POI для карты Тарту
     */
    private generateTartuPOIsForChunk(
        chunkX: number,
        chunkZ: number,
        chunkSize: number,
        biome: string,
        parent: TransformNode
    ): POI[] {
        const key = `${chunkX}_${chunkZ}`;
        const createdPOIs: POI[] = [];
        const poiIds: string[] = [];
        
        const worldX = chunkX * chunkSize;
        const worldZ = chunkZ * chunkSize;
        
        // 1. Получаем достопримечательности в этом чанке
        const landmarks = getTartuLandmarksInChunk(chunkX, chunkZ, chunkSize);
        
        for (const landmark of landmarks) {
            const worldPos = new Vector3(landmark.position.x, 0, landmark.position.z);
            const localPos = worldPos.subtract(new Vector3(
                worldX + chunkSize / 2,
                0,
                worldZ + chunkSize / 2
            ));
            
            const id = `tartu_landmark_${landmark.id}`;
            
            // Создаем POI на основе типа достопримечательности
            let poi: POI;
            if (landmark.poiType === "capturePoint") {
                poi = this.createCapturePoint(localPos, id, parent, worldPos);
            } else if (landmark.poiType === "repairStation") {
                poi = this.createRepairStation(localPos, id, parent, worldPos);
            } else if (landmark.poiType === "ammoDepot") {
                poi = this.createAmmoDepot(localPos, id, parent, worldPos);
            } else if (landmark.poiType === "fuelDepot") {
                poi = this.createFuelDepot(localPos, id, parent, worldPos);
            } else if (landmark.poiType === "radarStation") {
                poi = this.createRadarStation(localPos, id, parent, worldPos);
            } else {
                // По умолчанию - точка захвата
                poi = this.createCapturePoint(localPos, id, parent, worldPos);
            }
            
            // Создаем визуальное представление здания
            this.createTartuBuilding(landmark, parent);
            
            createdPOIs.push(poi);
            poiIds.push(id);
            this.pois.set(id, poi);
        }
        
        // 2. Генерируем здания вдоль дорог
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const buildings = generateBuildingsAlongRoads(chunkX, chunkZ, chunkSize, seed);
        
        for (const building of buildings) {
            // Создаем визуальное представление здания
            const buildingMesh = MeshBuilder.CreateBox(
                `tartu_building_${chunkX}_${chunkZ}_${buildings.indexOf(building)}`,
                {
                    width: building.width,
                    height: building.height,
                    depth: building.depth
                },
                this.scene
            );
            
            const localBuildingPos = building.position.subtract(new Vector3(
                worldX + chunkSize / 2,
                0,
                worldZ + chunkSize / 2
            ));
            
            buildingMesh.position = localBuildingPos;
            buildingMesh.position.y = building.height / 2;
            buildingMesh.rotation.y = building.rotation;
            
            // Материал зависит от типа здания
            const material = new StandardMaterial(`building_${chunkX}_${chunkZ}_${buildings.indexOf(building)}`, this.scene);
            if (building.type === "commercial" || building.type === "office") {
                material.diffuseColor = new Color3(0.6, 0.6, 0.65); // Светло-серый
            } else if (building.type === "industrial") {
                material.diffuseColor = new Color3(0.5, 0.5, 0.55); // Серый
            } else {
                material.diffuseColor = new Color3(0.55, 0.55, 0.6); // Светло-серый для жилых
            }
            
            buildingMesh.material = material;
            buildingMesh.parent = parent;
            
            // Добавляем физику
            new PhysicsAggregate(buildingMesh, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // 3. Генерируем обычные POI для биома (меньше, чем на обычных картах)
        const random = new SeededRandom(seed);
        
        // Меньше случайных POI, так как есть достопримечательности
        const poiChance = 0.3; // Снижено с 0.7
        const maxPOIs = 1;
        
        if (random.chance(poiChance)) {
            const margin = 20;
            const x = worldX + random.range(margin, chunkSize - margin);
            const z = worldZ + random.range(margin, chunkSize - margin);
            
            // Проверяем, не находится ли POI в области гаража
            if (this.isPositionInGarageArea && this.isPositionInGarageArea(x, z, 10)) {
                // Пропускаем
            } else {
                const localPos = new Vector3(x - worldX, 0, z - worldZ);
                const worldPos = new Vector3(x, 0, z);
                const id = `poi_${chunkX}_${chunkZ}_${random.int(0, 9999)}`;
                
                let poi: POI;
                if (biome === "city" || biome === "industrial") {
                    const type = random.int(0, 2);
                    if (type === 0) poi = this.createCapturePoint(localPos, id, parent, worldPos);
                    else if (type === 1) poi = this.createRepairStation(localPos, id, parent, worldPos);
                    else poi = this.createAmmoDepot(localPos, id, parent, worldPos);
                } else if (biome === "park" || biome === "university") {
                    poi = this.createCapturePoint(localPos, id, parent, worldPos);
                } else {
                    const type = random.int(0, 2);
                    if (type === 0) poi = this.createRepairStation(localPos, id, parent, worldPos);
                    else if (type === 1) poi = this.createFuelDepot(localPos, id, parent, worldPos);
                    else poi = this.createCapturePoint(localPos, id, parent, worldPos);
                }
                
                this.pois.set(id, poi);
                poiIds.push(id);
                createdPOIs.push(poi);
            }
        }
        
        this.chunkPOIs.set(key, poiIds);
        return createdPOIs;
    }
    
    /**
     * Создает визуальное представление здания достопримечательности
     */
    private createTartuBuilding(landmark: TartuLandmark, parent: TransformNode): void {
        // Создаем low-poly здание на основе данных достопримечательности
        const building = MeshBuilder.CreateBox(
            `tartu_building_${landmark.id}`,
            {
                width: landmark.size.width,
                height: landmark.size.height || 8,
                depth: landmark.size.depth
            },
            this.scene
        );
        
        building.position = new Vector3(
            landmark.position.x,
            (landmark.size.height || 8) / 2,
            landmark.position.z
        );
        
        if (landmark.rotation !== undefined) {
            building.rotation.y = landmark.rotation;
        }
        
        // Материал зависит от типа
        const material = new StandardMaterial(`building_${landmark.id}`, this.scene);
        if (landmark.type === "university" || landmark.type === "government") {
            material.diffuseColor = new Color3(0.6, 0.6, 0.65); // Светло-серый
        } else if (landmark.type === "church") {
            material.diffuseColor = new Color3(0.7, 0.7, 0.75); // Бежевый
        } else if (landmark.type === "bridge") {
            material.diffuseColor = new Color3(0.5, 0.5, 0.55); // Серый
        } else {
            material.diffuseColor = new Color3(0.5, 0.5, 0.55); // Серый
        }
        
        building.material = material;
        building.parent = parent;
        
        // Добавляем физику
        new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // GETTERS
    // ═══════════════════════════════════════════════════════════════════════
    
    getAllPOIs(): POI[] {
        return Array.from(this.pois.values());
    }
    
    getPOI(id: string): POI | undefined {
        return this.pois.get(id);
    }
    
    getOwnedPOIs(owner: POIOwner): POI[] {
        return Array.from(this.pois.values()).filter(p => p.ownerId === owner);
    }
    
    getCapturePoints(): POI[] {
        return Array.from(this.pois.values()).filter(p => p.type === "capturePoint");
    }
    
    getPlayerRespawnPoints(): Vector3[] {
        return this.getOwnedPOIs("player")
            .filter(p => p.metadata.respawnPoint)
            .map(p => p.worldPosition.clone());
    }
    
    getNearbyPOI(position: Vector3, maxDistance: number): POI | null {
        for (const poi of this.pois.values()) {
            if (Vector3.Distance(position, poi.worldPosition) < maxDistance) {
                return poi;
            }
        }
        return null;
    }
    
    clearChunk(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        const poiIds = this.chunkPOIs.get(key);
        if (poiIds) {
            for (const id of poiIds) {
                const poi = this.pois.get(id);
                if (poi) {
                    for (const mesh of poi.meshes) {
                        mesh.dispose();
                    }
                }
                this.pois.delete(id);
            }
            this.chunkPOIs.delete(key);
        }
    }
}







