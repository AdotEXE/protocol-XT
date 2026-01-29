/**
 * @module workshop/AttachmentPointEditor
 * @description Редактор точек крепления (turret pivot, barrel mount)
 * 
 * Простые input поля для координат с визуальным маркером в preview
 */

import { Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { PreviewScene, PreviewTank } from '../garage/preview';
import { coordsToVector3, vector3ToCoords } from './types';

export class AttachmentPointEditor {
    private container: HTMLDivElement;
    private previewScene: PreviewScene | null = null;
    private pivotMarker: Mesh | null = null;
    private barrelMarker: Mesh | null = null;
    private currentTank: PreviewTank | null = null;
    private config: {
        turretPivot: Vector3;
        barrelMount: Vector3;
    } = {
            turretPivot: Vector3.Zero(),
            barrelMount: Vector3.Zero()
        };

    constructor(container: HTMLDivElement, previewScene: PreviewScene) {
        this.container = container;
        this.previewScene = previewScene;
        this.createUI();
        this.createMarkers();
    }

    private createUI(): void {
        const html = `
            <div class="attachment-editor" style="padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                <h3 style="color: #0f0; margin-bottom: 15px;">Точки крепления</h3>
                
                <div class="attachment-section" style="margin-bottom: 20px;">
                    <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 13px;">Точка крепления башни (Turret Pivot)</div>
                    <div class="coord-inputs" style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <label style="flex: 1; color: #aaa; font-size: 12px;">
                            X: <input type="number" id="pivot-x" step="0.1" value="0" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; margin-top: 4px;" />
                        </label>
                        <label style="flex: 1; color: #aaa; font-size: 12px;">
                            Y: <input type="number" id="pivot-y" step="0.1" value="0" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; margin-top: 4px;" />
                        </label>
                        <label style="flex: 1; color: #aaa; font-size: 12px;">
                            Z: <input type="number" id="pivot-z" step="0.1" value="0" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; margin-top: 4px;" />
                        </label>
                    </div>
                    <button id="reset-pivot" style="padding: 6px 12px; background: rgba(0, 255, 0, 0.2); border: 1px solid #0f0; color: #0f0; cursor: pointer; border-radius: 3px; font-size: 11px;">Сброс к умолчанию</button>
                </div>
                
                <div class="attachment-section">
                    <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 13px;">Точка крепления ствола (Barrel Mount)</div>
                    <div class="coord-inputs" style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <label style="flex: 1; color: #aaa; font-size: 12px;">
                            X: <input type="number" id="barrel-x" step="0.1" value="0" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; margin-top: 4px;" />
                        </label>
                        <label style="flex: 1; color: #aaa; font-size: 12px;">
                            Y: <input type="number" id="barrel-y" step="0.1" value="0" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; margin-top: 4px;" />
                        </label>
                        <label style="flex: 1; color: #aaa; font-size: 12px;">
                            Z: <input type="number" id="barrel-z" step="0.1" value="0" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; margin-top: 4px;" />
                        </label>
                    </div>
                    <button id="reset-barrel" style="padding: 6px 12px; background: rgba(0, 255, 0, 0.2); border: 1px solid #0f0; color: #0f0; cursor: pointer; border-radius: 3px; font-size: 11px;">Сброс к умолчанию</button>
                </div>
                
                <p class="hint" style="margin-top: 15px; font-size: 11px; color: #7f7; opacity: 0.8;">
                    💡 Измените координаты и посмотрите на маркеры в 3D preview. Красная сфера = башня, Синяя = ствол.
                </p>
            </div>
        `;
        this.container.innerHTML = html;

        // Обработчики для pivot
        ['x', 'y', 'z'].forEach(axis => {
            const input = document.getElementById(`pivot-${axis}`) as HTMLInputElement;
            if (input) {
                input.addEventListener('input', () => this.updatePivot());
            }
        });

        // Обработчики для barrel
        ['x', 'y', 'z'].forEach(axis => {
            const input = document.getElementById(`barrel-${axis}`) as HTMLInputElement;
            if (input) {
                input.addEventListener('input', () => this.updateBarrel());
            }
        });

        // Кнопки сброса
        document.getElementById('reset-pivot')?.addEventListener('click', () => {
            this.config.turretPivot = Vector3.Zero();
            this.updatePivotInputs();
            this.updatePivotMarker();
        });

        document.getElementById('reset-barrel')?.addEventListener('click', () => {
            this.config.barrelMount = Vector3.Zero();
            this.updateBarrelInputs();
            this.updateBarrelMarker();
        });
    }

    private createMarkers(): void {
        if (!this.previewScene) return;

        // Красная сфера для turret pivot
        this.pivotMarker = MeshBuilder.CreateSphere('pivotMarker', {
            diameter: 0.3
        }, this.previewScene.scene);

        const pivotMat = new StandardMaterial('pivotMat', this.previewScene.scene);
        pivotMat.diffuseColor = new Color3(1, 0, 0); // Красный
        pivotMat.emissiveColor = new Color3(0.5, 0, 0);
        pivotMat.disableLighting = true;
        this.pivotMarker.material = pivotMat;
        this.pivotMarker.renderingGroupId = 1; // Поверх всего

        // Синяя сфера для barrel mount
        this.barrelMarker = MeshBuilder.CreateSphere('barrelMarker', {
            diameter: 0.25
        }, this.previewScene.scene);

        const barrelMat = new StandardMaterial('barrelMat', this.previewScene.scene);
        barrelMat.diffuseColor = new Color3(0, 0.5, 1); // Синий
        barrelMat.emissiveColor = new Color3(0, 0.2, 0.5);
        barrelMat.disableLighting = true;
        this.barrelMarker.material = barrelMat;
        this.barrelMarker.renderingGroupId = 1;

        this.updateMarkers();
    }

    private updatePivot(): void {
        const x = parseFloat((document.getElementById('pivot-x') as HTMLInputElement)?.value || '0');
        const y = parseFloat((document.getElementById('pivot-y') as HTMLInputElement)?.value || '0');
        const z = parseFloat((document.getElementById('pivot-z') as HTMLInputElement)?.value || '0');

        this.config.turretPivot = new Vector3(x, y, z);
        this.updatePivotMarker();
    }

    private updateBarrel(): void {
        const x = parseFloat((document.getElementById('barrel-x') as HTMLInputElement)?.value || '0');
        const y = parseFloat((document.getElementById('barrel-y') as HTMLInputElement)?.value || '0');
        const z = parseFloat((document.getElementById('barrel-z') as HTMLInputElement)?.value || '0');

        this.config.barrelMount = new Vector3(x, y, z);
        this.updateBarrelMarker();
    }

    private updatePivotMarker(): void {
        if (!this.pivotMarker || !this.currentTank?.chassis) return;

        // Позиция относительно корпуса
        const chassisPos = this.currentTank.chassis.getAbsolutePosition();
        const worldPos = chassisPos.add(this.config.turretPivot);
        this.pivotMarker.position = worldPos;
    }

    private updateBarrelMarker(): void {
        if (!this.barrelMarker || !this.currentTank?.turret) return;

        // Позиция относительно башни
        const turretPos = this.currentTank.turret.getAbsolutePosition();
        const worldPos = turretPos.add(this.config.barrelMount);
        this.barrelMarker.position = worldPos;
    }

    private updateMarkers(): void {
        this.updatePivotMarker();
        this.updateBarrelMarker();
    }

    private updatePivotInputs(): void {
        (document.getElementById('pivot-x') as HTMLInputElement).value = this.config.turretPivot.x.toString();
        (document.getElementById('pivot-y') as HTMLInputElement).value = this.config.turretPivot.y.toString();
        (document.getElementById('pivot-z') as HTMLInputElement).value = this.config.turretPivot.z.toString();
    }

    private updateBarrelInputs(): void {
        (document.getElementById('barrel-x') as HTMLInputElement).value = this.config.barrelMount.x.toString();
        (document.getElementById('barrel-y') as HTMLInputElement).value = this.config.barrelMount.y.toString();
        (document.getElementById('barrel-z') as HTMLInputElement).value = this.config.barrelMount.z.toString();
    }

    /**
     * Обновить маркеры при изменении preview танка
     */
    updatePreviewTank(tank: PreviewTank | null): void {
        this.currentTank = tank;
        this.updateMarkers();
    }

    /**
     * Установить значения из конфигурации
     */
    setAttachmentPoints(turretPivot: { x: number; y: number; z: number }, barrelMount: { x: number; y: number; z: number }): void {
        this.config.turretPivot = coordsToVector3(turretPivot);
        this.config.barrelMount = coordsToVector3(barrelMount);
        this.updatePivotInputs();
        this.updateBarrelInputs();
        this.updateMarkers();
    }

    getTurretPivot(): Vector3 {
        return this.config.turretPivot.clone();
    }

    getBarrelMount(): Vector3 {
        return this.config.barrelMount.clone();
    }

    getAttachmentPoints(): {
        turretPivot: { x: number; y: number; z: number };
        barrelMount: { x: number; y: number; z: number };
    } {
        return {
            turretPivot: vector3ToCoords(this.config.turretPivot),
            barrelMount: vector3ToCoords(this.config.barrelMount)
        };
    }

    dispose(): void {
        if (this.pivotMarker) {
            this.pivotMarker.dispose();
            this.pivotMarker = null;
        }
        if (this.barrelMarker) {
            this.barrelMarker.dispose();
            this.barrelMarker = null;
        }
    }
}

export default AttachmentPointEditor;

