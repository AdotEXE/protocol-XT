import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';

// Import services
import { createVoxelMaterials, type ThemeId } from './services/materials';
import {
    VoxelMaterial,
    type VoxelChunk,
    type TerrainColumnsOptions,
    VOXEL_VISUAL_ONLY,
    deserializeVoxelChunk,
    generateTerrainColumnsChunk,
    getVoxel,
    serializeVoxelChunk,
} from './services/voxelGrid';

export interface VoxelEditorOptions {
    container: HTMLElement;
    theme?: ThemeId;
    location?: string;
    mapSize?: string;
    onClose?: () => void;
}

export class VoxelEditor {
    private engine: Engine;
    private scene: Scene;
    private camera: ArcRotateCamera;
    private highlight: any;

    private chunk: VoxelChunk | null = null;
    private voxelMats: Record<number, StandardMaterial>;

    // State
    private preset: 'hills' | 'flat' | 'ridges' = 'hills';
    private maxHeight: number = 24;
    private lod: 1 | 2 | 4 = 1;
    private showVoxels: boolean = true;
    private showBounds: boolean = true;
    private showStats: boolean = false;

    private uiContainer: HTMLElement;

    constructor(options: VoxelEditorOptions) {
        const { container, theme = 'default', onClose } = options;

        // Create Canvas
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.outline = 'none';
        container.appendChild(canvas);

        // Initialize Babylon
        this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = new Scene(this.engine);

        // Scene Setup
        this.scene.clearColor = new Color4(0.03, 0.03, 0.05, 1.0);
        this.scene.fogMode = Scene.FOGMODE_EXP2;
        this.scene.fogColor = new Color3(0.02, 0.02, 0.05);
        this.scene.fogDensity = 0.003;
        this.scene.collisionsEnabled = true;

        // Camera
        this.camera = new ArcRotateCamera(
            'voxelCamera',
            Math.PI / 4,
            Math.PI / 3,
            80,
            new Vector3(0, 20, 0),
            this.scene
        );
        this.camera.attachControl(canvas, true);
        this.camera.checkCollisions = true;
        this.camera.collisionRadius = new Vector3(1.5, 1.5, 1.5);
        // Adjust wheel precision for smoother zoom
        this.camera.wheelPrecision = 20;

        // Light
        new HemisphericLight('voxelLight', new Vector3(0, 1, 0), this.scene);

        // Materials
        this.voxelMats = createVoxelMaterials(this.scene, theme);

        // Initial Generation
        this.generateChunk();

        // Highlight Box
        this.highlight = MeshBuilder.CreateBox('voxelHighlight', { size: 1 }, this.scene);
        const highlightMat = new StandardMaterial('voxelHighlightMat', this.scene);
        highlightMat.emissiveColor = new Color3(0.9, 0.9, 0.1);
        highlightMat.wireframe = true;
        this.highlight.material = highlightMat;
        this.highlight.isPickable = false;
        this.highlight.checkCollisions = false;
        this.highlight.visibility = 0;

        // Input Handling
        this.setupInput();

        // UI Overlay
        this.uiContainer = document.createElement('div');
        container.appendChild(this.uiContainer);
        this.renderUI(onClose);

        // Render Loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // Resize
        window.addEventListener('resize', this.onResize);
    }

    private onResize = () => {
        this.engine.resize();
    };

    private heightAt = (x: number, z: number): number => {
        const baseSizeX = 32;
        const baseSizeZ = 32;
        const sx = (x - baseSizeX / 2) * 0.25;
        const sz = (z - baseSizeZ / 2) * 0.25;

        if (this.preset === 'flat') {
            return this.maxHeight * 0.25;
        }
        if (this.preset === 'ridges') {
            return this.maxHeight * 0.2 + (this.maxHeight * 0.6 * Math.abs(Math.sin(sx) * Math.sin(sz)));
        }
        // hills
        return this.maxHeight * 0.25 + (this.maxHeight * 0.25 * Math.sin(sx) * Math.cos(sz));
    };

    public generateChunk() {
        const baseSizeX = 32;
        const baseSizeZ = 32;

        this.chunk = generateTerrainColumnsChunk({
            chunkX: 0,
            chunkZ: 0,
            sizeX: baseSizeX,
            sizeZ: baseSizeZ,
            maxHeight: this.maxHeight,
            voxelSize: 1,
            heightAt: this.heightAt // Use current preset function
        });

        this.rebuildMeshes();
    }

    public rebuildMeshes() {
        if (!this.chunk) return;

        // Dispose old meshes
        this.scene.meshes.forEach(m => {
            if (m.name.startsWith('vox_') || m.name === 'voxelBounds') {
                m.dispose();
            }
        });

        const { sizeX, sizeZ, voxelSize } = this.chunk;
        const step = this.lod;

        if (this.showVoxels) {
            for (let z = 0; z < sizeZ; z += step) {
                for (let x = 0; x < sizeX; x += step) {
                    let currentMat: VoxelMaterial = VoxelMaterial.Empty;
                    let startY = 0;

                    // Re-implement the greedy meshing optimized loop from VoxelView
                    for (let y = 0; y <= this.maxHeight; y++) {
                        const mat = y < this.maxHeight ? getVoxel(this.chunk, x, y, z) : VoxelMaterial.Empty;

                        if (mat === currentMat) continue;

                        if (currentMat !== VoxelMaterial.Empty) {
                            const h = y - startY;
                            if (h > 0) {
                                const width = voxelSize * step;
                                const depth = voxelSize * step;
                                const worldX = (x - sizeX / 2) * voxelSize + (width / 2 - voxelSize / 2);
                                const worldZ = (z - sizeZ / 2) * voxelSize + (depth / 2 - voxelSize / 2);
                                const heightWorld = h * voxelSize;
                                const centerY = (startY + h / 2) * voxelSize;

                                const box = MeshBuilder.CreateBox(
                                    `vox_${x}_${startY}_${z}`,
                                    { width, height: heightWorld, depth },
                                    this.scene
                                );
                                box.position = new Vector3(worldX, centerY, worldZ);
                                box.material = this.voxelMats[currentMat] as StandardMaterial;
                                box.checkCollisions = true;
                            }
                        }
                        currentMat = mat;
                        startY = y;
                    }
                }
            }
        }

        if (this.showBounds) {
            const bounds = MeshBuilder.CreateBox(
                'voxelBounds',
                {
                    width: sizeX * voxelSize,
                    height: this.maxHeight * voxelSize,
                    depth: sizeZ * voxelSize,
                },
                this.scene
            );
            bounds.position = new Vector3(0, (this.maxHeight * voxelSize) / 2, 0);
            const boundsMat = new StandardMaterial('voxelBoundsMat', this.scene);
            boundsMat.emissiveColor = new Color3(0.0, 0.9, 0.7);
            boundsMat.wireframe = true;
            bounds.material = boundsMat;
            bounds.isPickable = false;
            bounds.checkCollisions = true;
        }
    }

    private setupInput() {
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type !== PointerEventTypes.POINTERMOVE) return;
            const pick = this.scene.pick(
                this.scene.pointerX,
                this.scene.pointerY,
                (mesh) => !!mesh && typeof mesh.name === 'string' && mesh.name.startsWith('vox_')
            );

            if (pick && pick.hit && pick.pickedMesh) {
                this.highlight.position.copyFrom(pick.pickedMesh.position);
                this.highlight.scaling.copyFrom(pick.pickedMesh.scaling);
                this.highlight.visibility = 1;
            } else {
                this.highlight.visibility = 0;
            }
        });
    }

    // --- UI Handling ---

    private renderUI(onClose?: () => void) {
        this.uiContainer.style.position = 'absolute';
        this.uiContainer.style.top = '10px';
        this.uiContainer.style.left = '10px';
        this.uiContainer.style.right = '10px';
        this.uiContainer.style.display = 'flex';
        this.uiContainer.style.justifyContent = 'space-between';
        this.uiContainer.style.pointerEvents = 'none'; // Let clicks pass through to canvas where empty

        // We use a clean HTML string for the HUD logic
        // Using inline styles for simplicity in this vanilla integration
        const styleBtn = `pointer-events: auto; background: rgba(0,0,0,0.7); color: white; border: 1px solid #22c55e; padding: 4px 8px; cursor: pointer; font-family: monospace; font-size: 12px; margin-right: 5px;`;
        const styleSelect = `pointer-events: auto; background: rgba(0,0,0,0.7); color: white; border: 1px solid #22c55e; padding: 4px; font-family: monospace; font-size: 12px; margin-right: 5px;`;

        this.uiContainer.innerHTML = `
      <div style="display: flex; align-items: center; background: rgba(0,0,0,0.5); padding: 5px; border-radius: 5px;">
        <span style="color: #22c55e; font-family: monospace; font-weight: bold; margin-right: 10px;">VOXEL EDITOR</span>
        
        <select id="ve-preset" style="${styleSelect}">
            <option value="hills">Hills</option>
            <option value="flat">Flat</option>
            <option value="ridges">Ridges</option>
        </select>

        <select id="ve-maxh" style="${styleSelect}">
            <option value="16">H=16</option>
            <option value="24" selected>H=24</option>
            <option value="32">H=32</option>
        </select>

        <select id="ve-lod" style="${styleSelect}">
            <option value="1">LOD 1x</option>
            <option value="2">LOD 2x</option>
            <option value="4">LOD 4x</option>
        </select>

        <button id="ve-toggle-vox" style="${styleBtn}">Voxels: ON</button>
        <button id="ve-toggle-grid" style="${styleBtn}">Grid: ON</button>
        <button id="ve-save" style="${styleBtn}">Save</button>
      </div>
      <div>
        <button id="ve-close" style="${styleBtn.replace('#22c55e', '#ef4444')}">CLOSE (ESC)</button>
      </div>
    `;

        // Bind Events
        const $ = (id: string) => this.uiContainer.querySelector(id) as HTMLElement;

        $('select#ve-preset').addEventListener('change', (e) => {
            this.preset = (e.target as HTMLSelectElement).value as any;
            this.generateChunk();
        });

        $('select#ve-maxh').addEventListener('change', (e) => {
            this.maxHeight = parseInt((e.target as HTMLSelectElement).value);
            this.generateChunk();
        });

        $('select#ve-lod').addEventListener('change', (e) => {
            this.lod = parseInt((e.target as HTMLSelectElement).value) as any;
            this.rebuildMeshes();
        });

        $('button#ve-toggle-vox').addEventListener('click', (e) => {
            this.showVoxels = !this.showVoxels;
            (e.target as HTMLElement).innerText = `Voxels: ${this.showVoxels ? 'ON' : 'OFF'}`;
            this.rebuildMeshes();
        });

        $('button#ve-toggle-grid').addEventListener('click', (e) => {
            this.showBounds = !this.showBounds;
            (e.target as HTMLElement).innerText = `Grid: ${this.showBounds ? 'ON' : 'OFF'}`;
            this.rebuildMeshes();
        });

        $('button#ve-save').addEventListener('click', () => {
            this.saveChunk();
        });

        $('button#ve-close').addEventListener('click', () => {
            this.dispose();
            if (onClose) onClose();
        });
    }

    public saveChunk() {
        if (!this.chunk) return;
        const json = serializeVoxelChunk(this.chunk);
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voxel-chunk-${json.id || '0'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    public dispose() {
        window.removeEventListener('resize', this.onResize);
        this.engine.stopRenderLoop();
        this.scene.dispose();
        this.engine.dispose();
        this.uiContainer.remove();
    }
}
