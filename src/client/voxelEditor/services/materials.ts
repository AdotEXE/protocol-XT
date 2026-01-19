import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { VoxelMaterial } from './voxelGrid';

export type ThemeId = 'default' | 'neon' | 'night';

export interface GroundAndOriginMaterials {
    ground: StandardMaterial;
    origin: StandardMaterial;
}

export interface BuildingMaterialsSet {
    variants: StandardMaterial[];
}

export interface RoadMaterialsSet {
    high: StandardMaterial;
    medium: StandardMaterial;
    low: StandardMaterial;
}

export type VoxelMaterialMap = Record<VoxelMaterial, StandardMaterial>;

export interface LanduseMaterialsSet {
    urban: StandardMaterial;
    park: StandardMaterial;
    field: StandardMaterial;
    water: StandardMaterial;
    other: StandardMaterial;
}

export function createGroundAndOriginMaterials(
    scene: Scene,
    theme: ThemeId
): GroundAndOriginMaterials {
    const ground = new StandardMaterial('groundMat', scene);
    const origin = new StandardMaterial('originMat', scene);

    ground.disableDepthWrite = false;
    ground.separateCullingPass = false;

    ground.alpha = 1.0;
    ground.backFaceCulling = false;
    ground.sideOrientation = 2; // DoubleSide

    switch (theme) {
        case 'neon':
            ground.diffuseColor = new Color3(0.15, 0.25, 0.35);
            ground.emissiveColor = new Color3(0.02, 0.03, 0.04);
            origin.diffuseColor = new Color3(0.2, 0.9, 0.8);
            origin.emissiveColor = new Color3(0.3, 1, 0.9);
            break;
        case 'night':
            ground.diffuseColor = new Color3(0.12, 0.18, 0.25);
            ground.emissiveColor = new Color3(0.01, 0.02, 0.03);
            origin.diffuseColor = new Color3(0.9, 0.7, 0.2);
            origin.emissiveColor = new Color3(1, 0.8, 0.3);
            break;
        case 'default':
        default:
            ground.diffuseColor = new Color3(0.5, 0.65, 0.5);
            ground.emissiveColor = new Color3(0.05, 0.08, 0.05);
            origin.diffuseColor = new Color3(0.1, 0.9, 0.4);
            origin.emissiveColor = new Color3(0.1, 0.9, 0.4);
            break;
    }

    (ground as any).baseDiffuse = ground.diffuseColor.clone();
    (origin as any).baseDiffuse = origin.diffuseColor.clone();

    return { ground, origin };
}

export function createBuildingMaterials(scene: Scene, theme: ThemeId): BuildingMaterialsSet {
    const a = new StandardMaterial('buildingMatA', scene);
    const b = new StandardMaterial('buildingMatB', scene);
    const c = new StandardMaterial('buildingMatC', scene);

    a.backFaceCulling = false;
    b.backFaceCulling = false;
    c.backFaceCulling = false;

    a.alpha = 1.0;
    b.alpha = 1.0;
    c.alpha = 1.0;

    a.disableDepthWrite = false;
    b.disableDepthWrite = false;
    c.disableDepthWrite = false;

    a.zOffset = 0.1;
    b.zOffset = 0.1;
    c.zOffset = 0.1;

    a.emissiveColor = new Color3(0.05, 0.05, 0.05);
    b.emissiveColor = new Color3(0.05, 0.05, 0.05);
    c.emissiveColor = new Color3(0.05, 0.05, 0.05);

    switch (theme) {
        case 'neon':
            a.diffuseColor = new Color3(0.5, 0.8, 1.0);
            b.diffuseColor = new Color3(0.9, 0.4, 0.8);
            c.diffuseColor = new Color3(0.6, 0.9, 0.5);
            break;
        case 'night':
            a.diffuseColor = new Color3(0.2, 0.2, 0.28);
            b.diffuseColor = new Color3(0.25, 0.25, 0.3);
            c.diffuseColor = new Color3(0.3, 0.3, 0.35);
            break;
        case 'default':
        default:
            a.diffuseColor = new Color3(0.78, 0.78, 0.85);
            b.diffuseColor = new Color3(0.82, 0.76, 0.68);
            c.diffuseColor = new Color3(0.55, 0.55, 0.6);
            break;
    }

    (a as any).baseDiffuse = a.diffuseColor.clone();
    (b as any).baseDiffuse = b.diffuseColor.clone();
    (c as any).baseDiffuse = c.diffuseColor.clone();

    return { variants: [a, b, c] };
}

export function createRoadMaterials(scene: Scene, theme: ThemeId): RoadMaterialsSet {
    const high = new StandardMaterial('roadHigh', scene);
    const medium = new StandardMaterial('roadMedium', scene);
    const low = new StandardMaterial('roadLow', scene);

    switch (theme) {
        case 'neon':
            high.diffuseColor = new Color3(0.0, 1.0, 0.8);
            medium.diffuseColor = new Color3(0.5, 0.8, 1.0);
            low.diffuseColor = new Color3(0.2, 0.4, 0.7);
            break;
        case 'night':
            high.diffuseColor = new Color3(0.9, 0.9, 0.0);
            medium.diffuseColor = new Color3(0.6, 0.6, 0.6);
            low.diffuseColor = new Color3(0.3, 0.3, 0.3);
            break;
        case 'default':
        default:
            high.diffuseColor = new Color3(0.1, 0.1, 0.1);
            medium.diffuseColor = new Color3(0.16, 0.16, 0.16);
            low.diffuseColor = new Color3(0.22, 0.22, 0.22);
            break;
    }

    (high as any).baseDiffuse = high.diffuseColor.clone();
    (medium as any).baseDiffuse = medium.diffuseColor.clone();
    (low as any).baseDiffuse = low.diffuseColor.clone();

    return { high, medium, low };
}

export function createWaterMaterial(scene: Scene, theme: ThemeId): StandardMaterial {
    const water = new StandardMaterial('waterMat', scene);

    water.backFaceCulling = false;

    switch (theme) {
        case 'neon':
            water.diffuseColor = new Color3(0.0, 0.9, 1.0);
            break;
        case 'night':
            water.diffuseColor = new Color3(0.0, 0.3, 0.6);
            break;
        case 'default':
        default:
            water.diffuseColor = new Color3(0.1, 0.4, 0.8);
            break;
    }

    water.alpha = 0.7;
    (water as any).baseDiffuse = water.diffuseColor.clone();
    return water;
}

export function createLanduseMaterials(
    scene: Scene,
    theme: ThemeId
): LanduseMaterialsSet {
    const urban = new StandardMaterial('landuseUrban', scene);
    const park = new StandardMaterial('landusePark', scene);
    const field = new StandardMaterial('landuseField', scene);
    const water = new StandardMaterial('landuseWaterOverlay', scene);
    const other = new StandardMaterial('landuseOther', scene);

    switch (theme) {
        case 'neon':
            urban.diffuseColor = new Color3(0.9, 0.5, 1.0);
            park.diffuseColor = new Color3(0.1, 1.0, 0.6);
            field.diffuseColor = new Color3(1.0, 0.9, 0.4);
            water.diffuseColor = new Color3(0.1, 0.8, 1.0);
            other.diffuseColor = new Color3(0.5, 0.5, 0.7);
            break;
        case 'night':
            urban.diffuseColor = new Color3(0.3, 0.3, 0.36);
            park.diffuseColor = new Color3(0.12, 0.3, 0.16);
            field.diffuseColor = new Color3(0.35, 0.3, 0.16);
            water.diffuseColor = new Color3(0.1, 0.26, 0.5);
            other.diffuseColor = new Color3(0.22, 0.22, 0.28);
            break;
        case 'default':
        default:
            urban.diffuseColor = new Color3(0.55, 0.52, 0.5);
            park.diffuseColor = new Color3(0.25, 0.6, 0.35);
            field.diffuseColor = new Color3(0.8, 0.75, 0.45);
            water.diffuseColor = new Color3(0.2, 0.55, 0.9);
            other.diffuseColor = new Color3(0.4, 0.45, 0.4);
            break;
    }

    const all = [urban, park, field, water, other];
    all.forEach((m) => {
        m.alpha = 0.85;
        m.backFaceCulling = false;
        (m as any).baseDiffuse = m.diffuseColor.clone();
    });

    return { urban, park, field, water, other };
}

export function createVoxelMaterials(scene: Scene, theme: ThemeId): VoxelMaterialMap {
    const materials: Partial<VoxelMaterialMap> = {};

    const make = (name: string, color: Color3): StandardMaterial => {
        const m = new StandardMaterial(name, scene);
        m.diffuseColor = color;
        return m;
    };

    switch (theme) {
        case 'neon':
            materials[VoxelMaterial.Empty] = make('voxelEmpty', new Color3(0, 0, 0));
            materials[VoxelMaterial.Ground] = make('voxelGround', new Color3(0.0, 0.8, 0.5));
            materials[VoxelMaterial.Building] = make('voxelBuilding', new Color3(0.8, 0.8, 1.0));
            materials[VoxelMaterial.Road] = make('voxelRoad', new Color3(0.0, 1.0, 0.8));
            materials[VoxelMaterial.Water] = make('voxelWater', new Color3(0.0, 0.9, 1.0));
            break;
        case 'night':
            materials[VoxelMaterial.Empty] = make('voxelEmpty', new Color3(0, 0, 0));
            materials[VoxelMaterial.Ground] = make('voxelGround', new Color3(0.1, 0.25, 0.12));
            materials[VoxelMaterial.Building] = make('voxelBuilding', new Color3(0.4, 0.4, 0.55));
            materials[VoxelMaterial.Road] = make('voxelRoad', new Color3(0.3, 0.3, 0.3));
            materials[VoxelMaterial.Water] = make('voxelWater', new Color3(0.0, 0.3, 0.6));
            break;
        case 'default':
        default:
            materials[VoxelMaterial.Empty] = make('voxelEmpty', new Color3(0, 0, 0));
            materials[VoxelMaterial.Ground] = make('voxelGround', new Color3(0.35, 0.45, 0.35));
            materials[VoxelMaterial.Building] = make('voxelBuilding', new Color3(0.78, 0.78, 0.85));
            materials[VoxelMaterial.Road] = make('voxelRoad', new Color3(0.16, 0.16, 0.16));
            materials[VoxelMaterial.Water] = make('voxelWater', new Color3(0.1, 0.4, 0.8));
            break;
    }

    return materials as VoxelMaterialMap;
}
