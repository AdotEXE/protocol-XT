/**
 * @module workshop/TransformEditor
 * @description Редактор трансформации объектов танка
 * 
 * Позволяет выделять и трансформировать части танка:
 * - Выделение объектов кликом
 * - Перемещение (Move)
 * - Вращение (Rotate)
 * - Масштабирование (Scale)
 */

import {
    Scene,
    Mesh,
    Vector3,
    Color3,
    PointerEventTypes,
    PointerInfo,
    StandardMaterial,
    GizmoManager,
    UtilityLayerRenderer,
    HighlightLayer
} from '@babylonjs/core';
import { PreviewTank } from '../garage/preview';

export type TransformMode = 'move' | 'rotate' | 'scale' | 'none';

export interface TransformState {
    position: Vector3;
    rotation: Vector3;
    scaling: Vector3;
}

export class TransformEditor {
    private container: HTMLDivElement;
    private scene: Scene | null = null;
    private previewTank: PreviewTank | null = null;

    private gizmoManager: GizmoManager | null = null;
    private highlightLayer: HighlightLayer | null = null;
    private selectedMesh: Mesh | null = null;
    private transformMode: TransformMode = 'none';

    private onTransformChange: ((mesh: Mesh, state: TransformState) => void) | null = null;

    // UI elements
    private modeButtons: Map<TransformMode, HTMLButtonElement> = new Map();
    private propsPanel: HTMLDivElement | null = null;

    constructor(container: HTMLDivElement) {
        this.container = container;
        this.createUI();
    }

    /**
     * Инициализация с preview scene
     */
    initialize(scene: Scene, previewTank: PreviewTank | null): void {
        this.scene = scene;
        this.previewTank = previewTank;

        // Создаем highlight layer для выделения
        this.highlightLayer = new HighlightLayer("workshop-highlight", scene, {
            blurHorizontalSize: 0.5,
            blurVerticalSize: 0.5
        });

        // Создаем gizmo manager
        this.gizmoManager = new GizmoManager(scene);
        this.gizmoManager.usePointerToAttachGizmos = false; // Мы сами управляем

        // Устанавливаем цвета gizmo
        if (this.gizmoManager.gizmos.positionGizmo) {
            this.gizmoManager.gizmos.positionGizmo.xGizmo.coloredMaterial.diffuseColor = new Color3(1, 0.2, 0.2);
            this.gizmoManager.gizmos.positionGizmo.yGizmo.coloredMaterial.diffuseColor = new Color3(0.2, 1, 0.2);
            this.gizmoManager.gizmos.positionGizmo.zGizmo.coloredMaterial.diffuseColor = new Color3(0.2, 0.2, 1);
        }

        // Настраиваем обработчик кликов
        this.setupPointerEvents();
    }

    /**
     * Обновление preview танка
     */
    setPreviewTank(tank: PreviewTank): void {
        this.previewTank = tank;
        this.clearSelection();
    }

    private createUI(): void {
        const html = `
            <div class="transform-editor" style="padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px; margin-top: 15px;">
                <h3 style="color: #0f0; margin-bottom: 15px;">Трансформация объектов</h3>
                
                <!-- Toolbar с режимами -->
                <div class="transform-toolbar" style="display: flex; gap: 8px; margin-bottom: 15px;">
                    <button class="transform-mode-btn" data-mode="none" style="padding: 8px 16px; background: rgba(0, 255, 0, 0.3); border: 2px solid #0f0; color: #0f0; cursor: pointer; border-radius: 4px; font-weight: bold;">
                        🔍 Выбор
                    </button>
                    <button class="transform-mode-btn" data-mode="move" style="padding: 8px 16px; background: rgba(0, 40, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px;">
                        ↔️ Двигать
                    </button>
                    <button class="transform-mode-btn" data-mode="rotate" style="padding: 8px 16px; background: rgba(0, 40, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px;">
                        🔄 Вращать
                    </button>
                    <button class="transform-mode-btn" data-mode="scale" style="padding: 8px 16px; background: rgba(0, 40, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px;">
                        📐 Масштаб
                    </button>
                </div>
                
                <!-- Properties panel -->
                <div id="transform-props-panel" style="display: none; padding: 12px; background: rgba(0, 10, 0, 0.4); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                    <div class="selected-info" style="color: #ff0; margin-bottom: 12px; font-weight: bold;">
                        Выбрано: <span id="selected-mesh-name">—</span>
                    </div>
                    
                    <!-- Position -->
                    <div class="prop-section" style="margin-bottom: 10px;">
                        <div style="color: #aaa; font-size: 11px; margin-bottom: 5px;">Позиция</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #f55; font-size: 11px;">X:</span>
                                <input type="number" id="prop-pos-x" step="0.1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(255, 0, 0, 0.3); color: #f55; border-radius: 2px; font-size: 11px;" />
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #5f5; font-size: 11px;">Y:</span>
                                <input type="number" id="prop-pos-y" step="0.1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #5f5; border-radius: 2px; font-size: 11px;" />
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #55f; font-size: 11px;">Z:</span>
                                <input type="number" id="prop-pos-z" step="0.1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 100, 255, 0.3); color: #55f; border-radius: 2px; font-size: 11px;" />
                            </div>
                        </div>
                    </div>
                    
                    <!-- Rotation -->
                    <div class="prop-section" style="margin-bottom: 10px;">
                        <div style="color: #aaa; font-size: 11px; margin-bottom: 5px;">Вращение (градусы)</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #f55; font-size: 11px;">X:</span>
                                <input type="number" id="prop-rot-x" step="1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(255, 0, 0, 0.3); color: #f55; border-radius: 2px; font-size: 11px;" />
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #5f5; font-size: 11px;">Y:</span>
                                <input type="number" id="prop-rot-y" step="1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #5f5; border-radius: 2px; font-size: 11px;" />
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #55f; font-size: 11px;">Z:</span>
                                <input type="number" id="prop-rot-z" step="1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 100, 255, 0.3); color: #55f; border-radius: 2px; font-size: 11px;" />
                            </div>
                        </div>
                    </div>
                    
                    <!-- Scale -->
                    <div class="prop-section">
                        <div style="color: #aaa; font-size: 11px; margin-bottom: 5px;">Масштаб</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #f55; font-size: 11px;">X:</span>
                                <input type="number" id="prop-scale-x" step="0.1" min="0.1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(255, 0, 0, 0.3); color: #f55; border-radius: 2px; font-size: 11px;" />
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #5f5; font-size: 11px;">Y:</span>
                                <input type="number" id="prop-scale-y" step="0.1" min="0.1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #5f5; border-radius: 2px; font-size: 11px;" />
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="color: #55f; font-size: 11px;">Z:</span>
                                <input type="number" id="prop-scale-z" step="0.1" min="0.1" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 100, 255, 0.3); color: #55f; border-radius: 2px; font-size: 11px;" />
                            </div>
                        </div>
                    </div>
                    
                    <!-- Reset button -->
                    <button id="reset-transform-btn" style="margin-top: 12px; width: 100%; padding: 8px; background: rgba(255, 100, 0, 0.2); border: 1px solid rgba(255, 100, 0, 0.5); color: #fa0; cursor: pointer; border-radius: 3px; font-size: 11px;">
                        🔄 Сбросить трансформацию
                    </button>
                </div>
                
                <p class="hint" style="margin-top: 12px; font-size: 10px; color: #7f7; opacity: 0.8;">
                    💡 Кликните на часть танка в 3D Preview для выделения. Используйте гизмо для трансформации.
                </p>
            </div>
        `;
        this.container.innerHTML = html;

        // Настраиваем обработчики кнопок режима
        this.container.querySelectorAll('.transform-mode-btn').forEach(btn => {
            const button = btn as HTMLButtonElement;
            const mode = button.dataset.mode as TransformMode;
            this.modeButtons.set(mode, button);

            button.addEventListener('click', () => this.setMode(mode));
        });

        // Properties panel
        this.propsPanel = document.getElementById('transform-props-panel') as HTMLDivElement;

        // Property inputs
        this.setupPropertyInputs();

        // Reset button
        document.getElementById('reset-transform-btn')?.addEventListener('click', () => this.resetTransform());
    }

    private setupPropertyInputs(): void {
        const updateFromInputs = () => {
            if (!this.selectedMesh) return;

            const posX = parseFloat((document.getElementById('prop-pos-x') as HTMLInputElement)?.value || '0');
            const posY = parseFloat((document.getElementById('prop-pos-y') as HTMLInputElement)?.value || '0');
            const posZ = parseFloat((document.getElementById('prop-pos-z') as HTMLInputElement)?.value || '0');

            const rotX = parseFloat((document.getElementById('prop-rot-x') as HTMLInputElement)?.value || '0') * Math.PI / 180;
            const rotY = parseFloat((document.getElementById('prop-rot-y') as HTMLInputElement)?.value || '0') * Math.PI / 180;
            const rotZ = parseFloat((document.getElementById('prop-rot-z') as HTMLInputElement)?.value || '0') * Math.PI / 180;

            const scaleX = parseFloat((document.getElementById('prop-scale-x') as HTMLInputElement)?.value || '1');
            const scaleY = parseFloat((document.getElementById('prop-scale-y') as HTMLInputElement)?.value || '1');
            const scaleZ = parseFloat((document.getElementById('prop-scale-z') as HTMLInputElement)?.value || '1');

            this.selectedMesh.position.set(posX, posY, posZ);
            this.selectedMesh.rotation.set(rotX, rotY, rotZ);
            this.selectedMesh.scaling.set(scaleX, scaleY, scaleZ);

            this.emitTransformChange();
        };

        ['prop-pos-x', 'prop-pos-y', 'prop-pos-z',
            'prop-rot-x', 'prop-rot-y', 'prop-rot-z',
            'prop-scale-x', 'prop-scale-y', 'prop-scale-z'].forEach(id => {
                const input = document.getElementById(id) as HTMLInputElement;
                if (input) {
                    input.addEventListener('input', updateFromInputs);
                }
            });
    }

    private setupPointerEvents(): void {
        if (!this.scene) return;

        this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                const pickResult = this.scene!.pick(
                    pointerInfo.event.offsetX,
                    pointerInfo.event.offsetY
                );

                if (pickResult?.hit && pickResult.pickedMesh) {
                    const mesh = pickResult.pickedMesh as Mesh;

                    // Проверяем что это часть танка
                    if (this.isTankPart(mesh)) {
                        this.selectMesh(mesh);
                    }
                } else {
                    // Клик в пустое место - снимаем выделение
                    if (this.transformMode === 'none') {
                        this.clearSelection();
                    }
                }
            }
        });
    }

    private isTankPart(mesh: Mesh): boolean {
        if (!this.previewTank) return false;

        // Проверяем является ли меш частью танка
        const tankMeshes = [
            this.previewTank.chassis,
            this.previewTank.turret,
            this.previewTank.barrel,
            ...[this.previewTank.leftTrack, this.previewTank.rightTrack].filter(Boolean) // [Opus 4.6] PreviewTank uses leftTrack/rightTrack, not wheels
        ].filter(Boolean);

        // Проверяем сам меш и его родителей
        let current: Mesh | null = mesh;
        while (current) {
            if (tankMeshes.includes(current)) {
                return true;
            }
            current = current.parent as Mesh | null;
        }

        return false;
    }

    selectMesh(mesh: Mesh): void {
        // Снимаем предыдущее выделение
        if (this.selectedMesh && this.highlightLayer) {
            this.highlightLayer.removeMesh(this.selectedMesh);
        }

        this.selectedMesh = mesh;

        // Подсвечиваем
        if (this.highlightLayer) {
            this.highlightLayer.addMesh(mesh, new Color3(0, 1, 0));
        }

        // Привязываем gizmo
        this.attachGizmo();

        // Показываем панель свойств
        this.showPropsPanel();
        this.updatePropsPanel();

        console.log('[TransformEditor] Selected:', mesh.name);
    }

    clearSelection(): void {
        if (this.selectedMesh && this.highlightLayer) {
            this.highlightLayer.removeMesh(this.selectedMesh);
        }

        this.selectedMesh = null;
        this.detachGizmo();
        this.hidePropsPanel();
    }

    private attachGizmo(): void {
        if (!this.gizmoManager || !this.selectedMesh) return;

        // Отключаем все gizmo
        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.scaleGizmoEnabled = false;

        // Включаем нужный gizmo
        switch (this.transformMode) {
            case 'move':
                this.gizmoManager.positionGizmoEnabled = true;
                break;
            case 'rotate':
                this.gizmoManager.rotationGizmoEnabled = true;
                break;
            case 'scale':
                this.gizmoManager.scaleGizmoEnabled = true;
                break;
        }

        // Привязываем к мешу
        this.gizmoManager.attachToMesh(this.selectedMesh);

        // Слушаем изменения
        if (this.gizmoManager.gizmos.positionGizmo) {
            this.gizmoManager.gizmos.positionGizmo.onDragEndObservable.add(() => {
                this.updatePropsPanel();
                this.emitTransformChange();
            });
        }
        if (this.gizmoManager.gizmos.rotationGizmo) {
            this.gizmoManager.gizmos.rotationGizmo.onDragEndObservable.add(() => {
                this.updatePropsPanel();
                this.emitTransformChange();
            });
        }
        if (this.gizmoManager.gizmos.scaleGizmo) {
            this.gizmoManager.gizmos.scaleGizmo.onDragEndObservable.add(() => {
                this.updatePropsPanel();
                this.emitTransformChange();
            });
        }
    }

    private detachGizmo(): void {
        if (!this.gizmoManager) return;

        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.scaleGizmoEnabled = false;
        this.gizmoManager.attachToMesh(null);
    }

    setMode(mode: TransformMode): void {
        this.transformMode = mode;

        // Обновляем UI кнопок
        this.modeButtons.forEach((btn, m) => {
            if (m === mode) {
                btn.style.background = 'rgba(0, 255, 0, 0.3)';
                btn.style.border = '2px solid #0f0';
                btn.style.color = '#0f0';
            } else {
                btn.style.background = 'rgba(0, 40, 0, 0.5)';
                btn.style.border = '1px solid rgba(0, 255, 0, 0.3)';
                btn.style.color = '#7f7';
            }
        });

        // Переключаем gizmo
        if (this.selectedMesh) {
            this.attachGizmo();
        }
    }

    private showPropsPanel(): void {
        if (this.propsPanel) {
            this.propsPanel.style.display = 'block';
        }
    }

    private hidePropsPanel(): void {
        if (this.propsPanel) {
            this.propsPanel.style.display = 'none';
        }
    }

    private updatePropsPanel(): void {
        if (!this.selectedMesh) return;

        // Имя
        const nameSpan = document.getElementById('selected-mesh-name');
        if (nameSpan) {
            nameSpan.textContent = this.selectedMesh.name || 'Unnamed';
        }

        // Position
        (document.getElementById('prop-pos-x') as HTMLInputElement).value = this.selectedMesh.position.x.toFixed(2);
        (document.getElementById('prop-pos-y') as HTMLInputElement).value = this.selectedMesh.position.y.toFixed(2);
        (document.getElementById('prop-pos-z') as HTMLInputElement).value = this.selectedMesh.position.z.toFixed(2);

        // Rotation (в градусах)
        (document.getElementById('prop-rot-x') as HTMLInputElement).value = (this.selectedMesh.rotation.x * 180 / Math.PI).toFixed(1);
        (document.getElementById('prop-rot-y') as HTMLInputElement).value = (this.selectedMesh.rotation.y * 180 / Math.PI).toFixed(1);
        (document.getElementById('prop-rot-z') as HTMLInputElement).value = (this.selectedMesh.rotation.z * 180 / Math.PI).toFixed(1);

        // Scale
        (document.getElementById('prop-scale-x') as HTMLInputElement).value = this.selectedMesh.scaling.x.toFixed(2);
        (document.getElementById('prop-scale-y') as HTMLInputElement).value = this.selectedMesh.scaling.y.toFixed(2);
        (document.getElementById('prop-scale-z') as HTMLInputElement).value = this.selectedMesh.scaling.z.toFixed(2);
    }

    private resetTransform(): void {
        if (!this.selectedMesh) return;

        this.selectedMesh.position.set(0, 0, 0);
        this.selectedMesh.rotation.set(0, 0, 0);
        this.selectedMesh.scaling.set(1, 1, 1);

        this.updatePropsPanel();
        this.emitTransformChange();
    }

    private emitTransformChange(): void {
        if (this.selectedMesh && this.onTransformChange) {
            this.onTransformChange(this.selectedMesh, {
                position: this.selectedMesh.position.clone(),
                rotation: this.selectedMesh.rotation.clone(),
                scaling: this.selectedMesh.scaling.clone()
            });
        }
    }

    /**
     * Получить текущие трансформации всех частей танка
     */
    getTransforms(): Map<string, TransformState> {
        const transforms = new Map<string, TransformState>();

        if (!this.previewTank) return transforms;

        const parts = [
            { name: 'chassis', mesh: this.previewTank.chassis },
            { name: 'turret', mesh: this.previewTank.turret },
            { name: 'barrel', mesh: this.previewTank.barrel },
        ];

        parts.forEach(({ name, mesh }) => {
            if (mesh) {
                transforms.set(name, {
                    position: mesh.position.clone(),
                    rotation: mesh.rotation.clone(),
                    scaling: mesh.scaling.clone()
                });
            }
        });

        return transforms;
    }

    /**
     * Callback при изменении трансформации
     */
    setOnTransformChange(callback: (mesh: Mesh, state: TransformState) => void): void {
        this.onTransformChange = callback;
    }

    dispose(): void {
        if (this.gizmoManager) {
            this.gizmoManager.dispose();
            this.gizmoManager = null;
        }

        if (this.highlightLayer) {
            this.highlightLayer.dispose();
            this.highlightLayer = null;
        }

        this.selectedMesh = null;
        this.scene = null;
        this.previewTank = null;
    }
}

export default TransformEditor;
