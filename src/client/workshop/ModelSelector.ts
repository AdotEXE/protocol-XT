/**
 * @module workshop/ModelSelector
 * @description Простой селектор моделей танков для Workshop
 * 
 * Показывает список доступных танков из CHASSIS_TYPES с кнопкой "Редактировать"
 */

import { CHASSIS_TYPES } from '../tankTypes';

export class ModelSelector {
    private container: HTMLDivElement;
    private onSelect: ((chassisId: string, cannonId: string, trackId: string) => void) | null = null;
    
    constructor(container: HTMLDivElement) {
        this.container = container;
        this.render();
    }
    
    private render(): void {
        // Простой список как в Garage
        const html = `
            <div class="model-selector">
                <h3 style="color: #0f0; margin-bottom: 15px;">Выберите базовую модель</h3>
                <div class="model-list" style="max-height: 300px; overflow-y: auto;">
                    ${CHASSIS_TYPES.map(chassis => `
                        <div class="model-item" style="
                            padding: 10px;
                            margin-bottom: 8px;
                            background: rgba(0, 40, 0, 0.5);
                            border: 1px solid rgba(0, 255, 0, 0.3);
                            border-radius: 4px;
                            cursor: pointer;
                            transition: all 0.2s;
                        " data-chassis="${chassis.id}">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: bold; color: #0f0; margin-bottom: 4px;">${chassis.name}</div>
                                    <div style="font-size: 11px; color: #7f7; opacity: 0.8;">${chassis.description.substring(0, 60)}...</div>
                                    <div style="font-size: 10px; color: #aaa; margin-top: 4px;">
                                        HP: ${chassis.maxHealth} | Speed: ${chassis.moveSpeed} | Turn: ${chassis.turnSpeed.toFixed(1)}
                                    </div>
                                </div>
                                <button class="edit-btn" data-chassis="${chassis.id}" style="
                                    padding: 8px 16px;
                                    background: rgba(0, 255, 0, 0.2);
                                    border: 1px solid #0f0;
                                    color: #0f0;
                                    cursor: pointer;
                                    border-radius: 4px;
                                    font-weight: bold;
                                ">Редактировать</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        
        // Обработчики для карточек и кнопок
        this.container.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Если клик не на кнопку, тоже выбираем
                if ((e.target as HTMLElement).classList.contains('edit-btn')) {
                    return; // Кнопка обработает сама
                }
                const chassisId = (item as HTMLElement).dataset.chassis!;
                this.selectModel(chassisId);
            });
            
            item.addEventListener('mouseenter', () => {
                (item as HTMLElement).style.background = 'rgba(0, 60, 0, 0.7)';
                (item as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.6)';
            });
            
            item.addEventListener('mouseleave', () => {
                (item as HTMLElement).style.background = 'rgba(0, 40, 0, 0.5)';
                (item as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.3)';
            });
        });
        
        // Обработчики для кнопок
        this.container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Не триггерить клик на карточке
                const chassisId = (btn as HTMLElement).dataset.chassis!;
                this.selectModel(chassisId);
            });
            
            btn.addEventListener('mouseenter', () => {
                (btn as HTMLElement).style.background = 'rgba(0, 255, 0, 0.4)';
            });
            
            btn.addEventListener('mouseleave', () => {
                (btn as HTMLElement).style.background = 'rgba(0, 255, 0, 0.2)';
            });
        });
    }
    
    private selectModel(chassisId: string): void {
        // Используем стандартные значения по умолчанию
        const cannonId = 'standard';
        const trackId = 'standard';
        
        if (this.onSelect) {
            this.onSelect(chassisId, cannonId, trackId);
        }
        
        // Визуальная обратная связь
        this.container.querySelectorAll('.model-item').forEach(item => {
            const itemChassisId = (item as HTMLElement).dataset.chassis;
            if (itemChassisId === chassisId) {
                (item as HTMLElement).style.borderColor = '#0f0';
                (item as HTMLElement).style.borderWidth = '2px';
            } else {
                (item as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.3)';
                (item as HTMLElement).style.borderWidth = '1px';
            }
        });
    }
    
    setOnSelect(callback: (chassisId: string, cannonId: string, trackId: string) => void): void {
        this.onSelect = callback;
    }
    
    /**
     * Выделить выбранную модель
     */
    highlightModel(chassisId: string): void {
        this.selectModel(chassisId);
    }
}

export default ModelSelector;

