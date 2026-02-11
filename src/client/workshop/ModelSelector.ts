/**
 * @module workshop/ModelSelector
 * @description Селектор моделей танков для Workshop
 * 
 * Показывает список всех моделей из игры: корпуса, пушки, гусеницы
 */

import { CHASSIS_TYPES, CANNON_TYPES, TRACK_TYPES } from '../tankTypes';

type ModelTab = 'chassis' | 'cannon' | 'track';

export class ModelSelector {
    private container: HTMLDivElement;
    private onSelect: ((chassisId: string, cannonId: string, trackId: string) => void) | null = null;
    private currentTab: ModelTab = 'chassis';
    private selectedChassis: string = 'standard';
    private selectedCannon: string = 'standard';
    private selectedTrack: string = 'standard';
    
    constructor(container: HTMLDivElement) {
        this.container = container;
        this.render();
    }
    
    private render(): void {
        const html = `
            <div class="model-selector">
                <h3 style="color: #0f0; margin-bottom: 15px; font-size: 14px;">Выберите модель</h3>
                
                <!-- Вкладки -->
                <div class="model-tabs" style="display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid rgba(0, 255, 0, 0.3);">
                    <button class="model-tab ${this.currentTab === 'chassis' ? 'active' : ''}" data-tab="chassis" style="
                        flex: 1;
                        padding: 8px;
                        background: ${this.currentTab === 'chassis' ? 'rgba(0, 255, 0, 0.2)' : 'transparent'};
                        border: 1px solid ${this.currentTab === 'chassis' ? '#0f0' : 'rgba(0, 255, 0, 0.3)'};
                        border-bottom: none;
                        color: #0f0;
                        cursor: pointer;
                        font-size: 11px;
                        font-weight: ${this.currentTab === 'chassis' ? 'bold' : 'normal'};
                    ">🚗 Корпуса</button>
                    <button class="model-tab ${this.currentTab === 'cannon' ? 'active' : ''}" data-tab="cannon" style="
                        flex: 1;
                        padding: 8px;
                        background: ${this.currentTab === 'cannon' ? 'rgba(0, 255, 0, 0.2)' : 'transparent'};
                        border: 1px solid ${this.currentTab === 'cannon' ? '#0f0' : 'rgba(0, 255, 0, 0.3)'};
                        border-bottom: none;
                        color: #0f0;
                        cursor: pointer;
                        font-size: 11px;
                        font-weight: ${this.currentTab === 'cannon' ? 'bold' : 'normal'};
                    ">🔫 Пушки</button>
                    <button class="model-tab ${this.currentTab === 'track' ? 'active' : ''}" data-tab="track" style="
                        flex: 1;
                        padding: 8px;
                        background: ${this.currentTab === 'track' ? 'rgba(0, 255, 0, 0.2)' : 'transparent'};
                        border: 1px solid ${this.currentTab === 'track' ? '#0f0' : 'rgba(0, 255, 0, 0.3)'};
                        border-bottom: none;
                        color: #0f0;
                        cursor: pointer;
                        font-size: 11px;
                        font-weight: ${this.currentTab === 'track' ? 'bold' : 'normal'};
                    ">⚙️ Гусеницы</button>
                </div>
                
                <!-- Список моделей -->
                <div class="model-list" style="max-height: 400px; overflow-y: auto;">
                    ${this.renderModelList()}
                </div>
                
                <!-- Выбранные модели -->
                <div class="selected-models" style="margin-top: 15px; padding: 10px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 4px;">
                    <div style="font-size: 10px; color: #7f7; margin-bottom: 5px;">Выбрано:</div>
                    <div style="font-size: 11px; color: #0f0;">
                        <div>Корпус: <span id="selected-chassis-name">${this.getChassisName(this.selectedChassis)}</span></div>
                        <div>Пушка: <span id="selected-cannon-name">${this.getCannonName(this.selectedCannon)}</span></div>
                        <div>Гусеницы: <span id="selected-track-name">${this.getTrackName(this.selectedTrack)}</span></div>
                    </div>
                    <button id="apply-model-btn" style="
                        margin-top: 10px;
                        width: 100%;
                        padding: 8px;
                        background: rgba(0, 255, 0, 0.2);
                        border: 1px solid #0f0;
                        color: #0f0;
                        cursor: pointer;
                        border-radius: 4px;
                        font-weight: bold;
                        font-size: 11px;
                    ">Применить</button>
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        
        // Обработчики вкладок
        this.container.querySelectorAll('.model-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = (tab as HTMLElement).dataset.tab as ModelTab;
                this.switchTab(tabName);
            });
        });
        
        // Обработчики для карточек
        this.setupModelItemHandlers();
        
        // Обработчик кнопки "Применить"
        const applyBtn = this.container.querySelector('#apply-model-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applySelection();
            });
        }
    }
    
    private renderModelList(): string {
        let items: any[] = [];
        
        switch (this.currentTab) {
            case 'chassis':
                items = CHASSIS_TYPES.map(c => ({
                    id: c.id,
                    name: c.name,
                    icon: '🚗',
                    stats: `HP: ${c.maxHealth} | Speed: ${c.moveSpeed} | Turn: ${c.turnSpeed.toFixed(1)}`,
                    isSelected: c.id === this.selectedChassis
                }));
                break;
            case 'cannon':
                items = CANNON_TYPES.map(c => ({
                    id: c.id,
                    name: c.name,
                    icon: '🔫',
                    stats: `Урон: ${c.damage} | Перезарядка: ${(c.cooldown / 1000).toFixed(1)}с | Скорость: ${c.projectileSpeed}`,
                    isSelected: c.id === this.selectedCannon
                }));
                break;
            case 'track':
                items = TRACK_TYPES.map(t => ({
                    id: t.id,
                    name: t.name,
                    icon: '⚙️',
                    stats: `Размер: ${t.width.toFixed(1)}x${t.height.toFixed(1)}x${t.depth.toFixed(1)}`,
                    isSelected: t.id === this.selectedTrack
                }));
                break;
        }
        
        return items.map(item => `
            <div class="model-item" style="
                padding: 10px;
                margin-bottom: 8px;
                background: ${item.isSelected ? 'rgba(0, 60, 0, 0.7)' : 'rgba(0, 40, 0, 0.5)'};
                border: 1px solid ${item.isSelected ? '#0f0' : 'rgba(0, 255, 0, 0.3)'};
                border-width: ${item.isSelected ? '2px' : '1px'};
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            " data-id="${item.id}" data-tab="${this.currentTab}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="font-size: 20px;">${item.icon}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: bold; color: #0f0; margin-bottom: 4px; font-size: 12px;">${item.name}</div>
                        <div style="font-size: 10px; color: #7f7; opacity: 0.8;">${item.stats}</div>
                    </div>
                    ${item.isSelected ? '<div style="color: #0f0; font-weight: bold;">✓</div>' : ''}
                </div>
            </div>
        `).join('');
    }
    
    private setupModelItemHandlers(): void {
        this.container.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = (item as HTMLElement).dataset.id!;
                const tab = (item as HTMLElement).dataset.tab as ModelTab;
                
                switch (tab) {
                    case 'chassis':
                        this.selectedChassis = id;
                        break;
                    case 'cannon':
                        this.selectedCannon = id;
                        break;
                    case 'track':
                        this.selectedTrack = id;
                        break;
                }
                
                // Перерисовываем список для обновления выделения
                const listContainer = this.container.querySelector('.model-list');
                if (listContainer) {
                    listContainer.innerHTML = this.renderModelList();
                    this.setupModelItemHandlers();
                }
                
                // Обновляем отображение выбранных моделей
                this.updateSelectedDisplay();
            });
            
            item.addEventListener('mouseenter', () => {
                if (!(item as HTMLElement).dataset.id || 
                    (this.currentTab === 'chassis' && (item as HTMLElement).dataset.id !== this.selectedChassis) ||
                    (this.currentTab === 'cannon' && (item as HTMLElement).dataset.id !== this.selectedCannon) ||
                    (this.currentTab === 'track' && (item as HTMLElement).dataset.id !== this.selectedTrack)) {
                    (item as HTMLElement).style.background = 'rgba(0, 60, 0, 0.7)';
                    (item as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.6)';
                }
            });
            
            item.addEventListener('mouseleave', () => {
                const id = (item as HTMLElement).dataset.id;
                const isSelected = 
                    (this.currentTab === 'chassis' && id === this.selectedChassis) ||
                    (this.currentTab === 'cannon' && id === this.selectedCannon) ||
                    (this.currentTab === 'track' && id === this.selectedTrack);
                
                if (!isSelected) {
                    (item as HTMLElement).style.background = 'rgba(0, 40, 0, 0.5)';
                    (item as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.3)';
                }
            });
        });
    }
    
    private switchTab(tab: ModelTab): void {
        this.currentTab = tab;
        this.render();
    }
    
    private updateSelectedDisplay(): void {
        const chassisNameEl = this.container.querySelector('#selected-chassis-name');
        const cannonNameEl = this.container.querySelector('#selected-cannon-name');
        const trackNameEl = this.container.querySelector('#selected-track-name');
        
        if (chassisNameEl) chassisNameEl.textContent = this.getChassisName(this.selectedChassis);
        if (cannonNameEl) cannonNameEl.textContent = this.getCannonName(this.selectedCannon);
        if (trackNameEl) trackNameEl.textContent = this.getTrackName(this.selectedTrack);
    }
    
    private applySelection(): void {
        if (this.onSelect) {
            this.onSelect(this.selectedChassis, this.selectedCannon, this.selectedTrack);
        }
    }
    
    private getChassisName(id: string): string {
        return CHASSIS_TYPES.find(c => c.id === id)?.name || id;
    }
    
    private getCannonName(id: string): string {
        return CANNON_TYPES.find(c => c.id === id)?.name || id;
    }
    
    private getTrackName(id: string): string {
        return TRACK_TYPES.find(t => t.id === id)?.name || id;
    }
    
    private selectModel(chassisId: string): void {
        // Используем стандартные значения по умолчанию
        const cannonId = 'standard';
        const trackId = 'standard';
        
        if (this.onSelect) {
            this.onSelect(chassisId, cannonId, trackId);
        }
    }
    
    setOnSelect(callback: (chassisId: string, cannonId: string, trackId: string) => void): void {
        this.onSelect = callback;
    }
    
    /**
     * Выделить выбранную модель
     */
    highlightModel(chassisId: string): void {
        this.selectedChassis = chassisId;
        this.render();
    }
}

export default ModelSelector;

