/**
 * @module workshop/VisualEditor
 * @description Редактор визуальных параметров (цвета)
 * 
 * Простые color pickers для изменения цветов корпуса, башни и ствола
 */

import { StandardMaterial, Color3 } from '@babylonjs/core';
import { PreviewTank } from '../garage/preview';

export class VisualEditor {
    private container: HTMLDivElement;
    private previewTank: PreviewTank | null = null;
    
    constructor(container: HTMLDivElement, previewTank: PreviewTank | null = null) {
        this.container = container;
        this.previewTank = previewTank;
        this.createUI();
    }
    
    setPreviewTank(previewTank: PreviewTank): void {
        this.previewTank = previewTank;
        // Применяем текущие цвета если они уже установлены
        this.applyCurrentColors();
    }
    
    private createUI(): void {
        const html = `
            <div class="visual-editor" style="padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                <h3 style="color: #0f0; margin-bottom: 15px;">Визуальная настройка</h3>
                
                <div class="color-picker" style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #aaa; font-size: 12px;">
                        <span style="min-width: 120px;">Цвет корпуса:</span>
                        <input type="color" id="chassis-color" value="#00ff00" style="width: 60px; height: 30px; cursor: pointer; border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 3px;" />
                        <span id="chassis-color-hex" style="color: #0f0; font-family: monospace; font-size: 11px;">#00ff00</span>
                    </label>
                </div>
                
                <div class="color-picker" style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #aaa; font-size: 12px;">
                        <span style="min-width: 120px;">Цвет башни:</span>
                        <input type="color" id="turret-color" value="#00ff00" style="width: 60px; height: 30px; cursor: pointer; border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 3px;" />
                        <span id="turret-color-hex" style="color: #0f0; font-family: monospace; font-size: 11px;">#00ff00</span>
                    </label>
                </div>
                
                <div class="color-picker" style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #aaa; font-size: 12px;">
                        <span style="min-width: 120px;">Цвет ствола:</span>
                        <input type="color" id="barrel-color" value="#888888" style="width: 60px; height: 30px; cursor: pointer; border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 3px;" />
                        <span id="barrel-color-hex" style="color: #0f0; font-family: monospace; font-size: 11px;">#888888</span>
                    </label>
                </div>
                
                <p class="hint" style="margin-top: 15px; font-size: 11px; color: #7f7; opacity: 0.8;">
                    💡 Изменения применяются сразу к preview
                </p>
            </div>
        `;
        this.container.innerHTML = html;
        
        // Применяем цвета сразу к preview
        ['chassis', 'turret', 'barrel'].forEach(part => {
            const input = document.getElementById(`${part}-color`) as HTMLInputElement;
            const hexDisplay = document.getElementById(`${part}-color-hex`) as HTMLSpanElement;
            
            if (input) {
                input.addEventListener('input', () => {
                    const color = input.value;
                    if (hexDisplay) {
                        hexDisplay.textContent = color.toUpperCase();
                    }
                    this.applyColor(part, color);
                });
            }
        });
    }
    
    private applyColor(part: string, color: string): void {
        if (!this.previewTank) return;
        
        const mesh = part === 'chassis' ? this.previewTank.chassis :
                    part === 'turret' ? this.previewTank.turret :
                    this.previewTank.barrel;
        
        if (mesh && mesh.material) {
            const mat = mesh.material as StandardMaterial;
            mat.diffuseColor = Color3.FromHexString(color);
        }
    }
    
    private applyCurrentColors(): void {
        if (!this.previewTank) return;
        
        const chassisColor = (document.getElementById('chassis-color') as HTMLInputElement)?.value || '#00ff00';
        const turretColor = (document.getElementById('turret-color') as HTMLInputElement)?.value || '#00ff00';
        const barrelColor = (document.getElementById('barrel-color') as HTMLInputElement)?.value || '#888888';
        
        this.applyColor('chassis', chassisColor);
        this.applyColor('turret', turretColor);
        this.applyColor('barrel', barrelColor);
    }
    
    getColors(): { chassisColor: string; turretColor: string; barrelColor: string } {
        return {
            chassisColor: (document.getElementById('chassis-color') as HTMLInputElement)?.value || '#00ff00',
            turretColor: (document.getElementById('turret-color') as HTMLInputElement)?.value || '#00ff00',
            barrelColor: (document.getElementById('barrel-color') as HTMLInputElement)?.value || '#888888'
        };
    }
    
    setColors(colors: { chassisColor: string; turretColor: string; barrelColor: string }): void {
        const chassisInput = document.getElementById('chassis-color') as HTMLInputElement;
        const turretInput = document.getElementById('turret-color') as HTMLInputElement;
        const barrelInput = document.getElementById('barrel-color') as HTMLInputElement;
        
        if (chassisInput) {
            chassisInput.value = colors.chassisColor;
            (document.getElementById('chassis-color-hex') as HTMLSpanElement).textContent = colors.chassisColor.toUpperCase();
        }
        if (turretInput) {
            turretInput.value = colors.turretColor;
            (document.getElementById('turret-color-hex') as HTMLSpanElement).textContent = colors.turretColor.toUpperCase();
        }
        if (barrelInput) {
            barrelInput.value = colors.barrelColor;
            (document.getElementById('barrel-color-hex') as HTMLSpanElement).textContent = colors.barrelColor.toUpperCase();
        }
        
        this.applyCurrentColors();
    }
}

export default VisualEditor;

