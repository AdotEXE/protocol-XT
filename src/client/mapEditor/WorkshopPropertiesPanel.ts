/**
 * @module mapEditor/WorkshopPropertiesPanel
 * @description Панель свойств Workshop для MapEditor с live-обновлением
 * 
 * Табы: Визуальные, Движение, Бой, Физика, Башня, Особое
 */

import { inGameAlert } from "../utils/inGameDialogs";
import { logger } from "../utils/logger";

export interface WorkshopConfig {
    movement?: {
        maxForwardSpeed?: number;
        maxBackwardSpeed?: number;
        acceleration?: number;
        deceleration?: number;
        turnSpeed?: number;
        pivotTurnMultiplier?: number;
    };
    combat?: {
        damage?: number;
        cooldown?: number;
        projectileSpeed?: number;
        projectileSize?: number;
        maxRange?: number;
    };
    physics?: {
        mass?: number;
        hoverHeight?: number;
        hoverStiffness?: number;
        hoverDamping?: number;
        linearDamping?: number;
        angularDamping?: number;
        uprightForce?: number;
        stabilityForce?: number;
    };
    turret?: {
        turretSpeed?: number;
        baseTurretSpeed?: number;
        turretLerpSpeed?: number;
        barrelPitchSpeed?: number;
    };
    visual?: {
        chassisColor?: string;
        turretColor?: string;
        barrelColor?: string;
    };
    special?: {
        ability?: string;
        abilityCooldown?: number;
        abilityDuration?: number;
        modules?: string[];
    };
    attachments?: {
        turretPivot?: { x: number; y: number; z: number };
        barrelMount?: { x: number; y: number; z: number };
    };
}

export class WorkshopPropertiesPanel {
    private container: HTMLDivElement;
    private config: WorkshopConfig = {};
    private activeTab: string = 'visual';
    private tabs: Map<string, HTMLButtonElement> = new Map();
    private onChangeCallback: ((config: WorkshopConfig) => void) | null = null;
    private updateTimer: number | null = null;
    
    private onTestCallback: (() => void) | null = null;
    
    constructor(container: HTMLDivElement) {
        this.container = container;
        this.createUI();
        this.setupTabs();
        this.setupTestButton();
    }
    
    private setupTestButton(): void {
        const testButton = document.getElementById('workshop-test-on-polygon');
        if (testButton) {
            testButton.addEventListener('click', () => {
                if (this.onTestCallback) {
                    this.onTestCallback();
                } else {
                    this.testOnPolygon();
                }
            });
        }
    }
    
    /**
     * Установить callback для кнопки тестирования
     */
    setOnTest(callback: () => void): void {
        this.onTestCallback = callback;
    }
    
    /**
     * Тестирование на полигоне (fallback если callback не установлен)
     */
    private testOnPolygon(): void {
        // Сохраняем текущую конфигурацию для теста
        const testConfig = {
            ...this.config,
            testMode: true,
            testMap: 'polygon' // Используем полигон для тестирования
        };
        
        // Сохраняем в localStorage для загрузки в игре
        localStorage.setItem('workshopTestConfig', JSON.stringify(testConfig));
        localStorage.setItem('workshopTestMap', 'polygon');
        localStorage.setItem('workshopTestRequested', 'true');
        
        inGameAlert('Конфигурация сохранена для теста на полигоне!\n\nЗакройте редактор карт и запустите игру на карте "Полигон" для тестирования.', 'Полигон').catch(() => {});
        logger.log('[Workshop] Test config saved:', testConfig);
    }
    
    private createUI(): void {
        const html = `
            <div class="workshop-properties-panel" style="
                background: rgba(0, 10, 0, 0.95);
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 4px;
                padding: 15px;
                max-height: 600px;
                overflow-y: auto;
            ">
                <div style="color: #0f0; font-weight: bold; margin-bottom: 15px; font-size: 14px;">WORKSHOP PROPERTIES</div>
                
                <!-- Кнопка тестирования на полигоне -->
                <div style="margin-bottom: 15px; padding: 10px; background: rgba(0, 60, 0, 0.3); border: 1px solid rgba(0, 255, 0, 0.5); border-radius: 4px;">
                    <button id="workshop-test-on-polygon" style="
                        width: 100%;
                        padding: 10px;
                        background: linear-gradient(135deg, rgba(0, 150, 0, 0.4) 0%, rgba(0, 100, 0, 0.6) 100%);
                        border: 2px solid rgba(0, 255, 0, 0.7);
                        color: #0f0;
                        font-weight: bold;
                        cursor: pointer;
                        border-radius: 4px;
                        font-size: 12px;
                        transition: all 0.2s;
                        text-transform: uppercase;
                    " onmouseover="this.style.background='linear-gradient(135deg, rgba(0, 200, 0, 0.6) 0%, rgba(0, 150, 0, 0.8) 100%)'; this.style.transform='scale(1.02)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, rgba(0, 150, 0, 0.4) 0%, rgba(0, 100, 0, 0.6) 100%)'; this.style.transform='scale(1)'">
                        🎯 ТЕСТ НА ПОЛИГОНЕ
                    </button>
                    <div style="margin-top: 8px; font-size: 10px; color: #7f7; text-align: center;">
                        Запустит игру на тестовом полигоне с текущей конфигурацией
                    </div>
                </div>
                
                <div class="workshop-tabs" style="display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 2px solid rgba(0, 255, 0, 0.3); padding-bottom: 5px; flex-wrap: wrap;">
                    <button class="workshop-tab active" data-tab="visual" style="padding: 6px 12px; background: rgba(0, 60, 0, 0.8); border: 1px solid #0f0; color: #0f0; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 11px;">Визуальные</button>
                    <button class="workshop-tab" data-tab="movement" style="padding: 6px 12px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 11px;">Движение</button>
                    <button class="workshop-tab" data-tab="combat" style="padding: 6px 12px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 11px;">Бой</button>
                    <button class="workshop-tab" data-tab="physics" style="padding: 6px 12px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 11px;">Физика</button>
                    <button class="workshop-tab" data-tab="turret" style="padding: 6px 12px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 11px;">Башня</button>
                    <button class="workshop-tab" data-tab="special" style="padding: 6px 12px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 11px;">Особое</button>
                </div>
                
                <div class="workshop-tab-content" id="workshop-visual-tab">
                    ${this.createVisualTab()}
                </div>
                <div class="workshop-tab-content" id="workshop-movement-tab" style="display: none;">
                    ${this.createMovementTab()}
                </div>
                <div class="workshop-tab-content" id="workshop-combat-tab" style="display: none;">
                    ${this.createCombatTab()}
                </div>
                <div class="workshop-tab-content" id="workshop-physics-tab" style="display: none;">
                    ${this.createPhysicsTab()}
                </div>
                <div class="workshop-tab-content" id="workshop-turret-tab" style="display: none;">
                    ${this.createTurretTab()}
                </div>
                <div class="workshop-tab-content" id="workshop-special-tab" style="display: none;">
                    ${this.createSpecialTab()}
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        this.setupInputs();
    }
    
    private setupTabs(): void {
        const tabButtons = this.container.querySelectorAll('.workshop-tab');
        tabButtons.forEach(btn => {
            const button = btn as HTMLButtonElement;
            const tabName = button.dataset.tab || '';
            this.tabs.set(tabName, button);
            
            button.addEventListener('click', () => {
                this.switchTab(tabName);
            });
        });
        
        this.switchTab(this.activeTab);
    }
    
    private switchTab(tabName: string): void {
        this.activeTab = tabName;
        
        this.tabs.forEach((btn, name) => {
            if (name === tabName) {
                btn.classList.add('active');
                btn.style.background = 'rgba(0, 60, 0, 0.8)';
                btn.style.borderColor = '#0f0';
                btn.style.color = '#0f0';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'rgba(0, 20, 0, 0.5)';
                btn.style.borderColor = 'rgba(0, 255, 0, 0.3)';
                btn.style.color = '#7f7';
            }
        });
        
        this.container.querySelectorAll('.workshop-tab-content').forEach(content => {
            const contentTab = (content as HTMLElement).id.replace('workshop-', '').replace('-tab', '');
            if (contentTab === tabName) {
                (content as HTMLElement).style.display = 'block';
            } else {
                (content as HTMLElement).style.display = 'none';
            }
        });
    }
    
    private createSlider(
        id: string,
        label: string,
        value: number,
        min: number,
        max: number,
        step: number,
        unit: string = ''
    ): string {
        return `
            <div class="workshop-param-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; background: rgba(0, 10, 0, 0.3); border-radius: 3px;">
                <label style="min-width: 150px; color: #aaa; font-size: 11px; flex-shrink: 0;">${label}</label>
                <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="flex: 1; min-width: 100px;" />
                <input type="number" id="${id}-num" min="${min}" max="${max}" step="${step}" value="${value}" style="width: 80px; padding: 3px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; font-size: 11px;" />
                <span class="workshop-value-display" id="${id}-value" style="min-width: 60px; color: #0f0; font-weight: bold; font-size: 11px; text-align: right;">${value.toFixed(2)} ${unit}</span>
            </div>
        `;
    }
    
    private createVisualTab(): string {
        const visual = this.config.visual || {
            chassisColor: '#00ff00',
            turretColor: '#00ff00',
            barrelColor: '#888888'
        };
        
        return `
            <div class="workshop-section">
                <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 12px;">Визуальные параметры</div>
                
                <div class="workshop-param-row" style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #aaa; font-size: 11px;">
                        <span style="min-width: 120px;">Цвет корпуса:</span>
                        <input type="color" id="workshop-chassis-color" value="${visual.chassisColor || '#00ff00'}" style="width: 50px; height: 25px; cursor: pointer; border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 3px;" />
                    </label>
                </div>
                
                <div class="workshop-param-row" style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #aaa; font-size: 11px;">
                        <span style="min-width: 120px;">Цвет башни:</span>
                        <input type="color" id="workshop-turret-color" value="${visual.turretColor || '#00ff00'}" style="width: 50px; height: 25px; cursor: pointer; border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 3px;" />
                    </label>
                </div>
                
                <div class="workshop-param-row" style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #aaa; font-size: 11px;">
                        <span style="min-width: 120px;">Цвет ствола:</span>
                        <input type="color" id="workshop-barrel-color" value="${visual.barrelColor || '#888888'}" style="width: 50px; height: 25px; cursor: pointer; border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 3px;" />
                    </label>
                </div>
            </div>
        `;
    }
    
    private createMovementTab(): string {
        const movement = this.config.movement || {
            maxForwardSpeed: 24,
            maxBackwardSpeed: 12,
            acceleration: 20,
            deceleration: 30,
            turnSpeed: 60,
            pivotTurnMultiplier: 1.5
        };
        
        return `
            <div class="workshop-section">
                <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 12px;">Параметры движения</div>
                ${this.createSlider('workshop-movement-maxForwardSpeed', 'Макс. скорость вперёд', movement.maxForwardSpeed || 24, 5, 50, 0.5, 'м/с')}
                ${this.createSlider('workshop-movement-maxBackwardSpeed', 'Макс. скорость назад', movement.maxBackwardSpeed || 12, 2, 25, 0.5, 'м/с')}
                ${this.createSlider('workshop-movement-acceleration', 'Ускорение', movement.acceleration || 20, 5, 50, 1, 'м/с²')}
                ${this.createSlider('workshop-movement-deceleration', 'Замедление', movement.deceleration || 30, 10, 60, 1, 'м/с²')}
                ${this.createSlider('workshop-movement-turnSpeed', 'Скорость поворота', movement.turnSpeed || 60, 10, 100, 1, 'град/с')}
                ${this.createSlider('workshop-movement-pivotTurnMultiplier', 'Множитель поворота', movement.pivotTurnMultiplier || 1.5, 0.5, 3.0, 0.1)}
            </div>
        `;
    }
    
    private createCombatTab(): string {
        const combat = this.config.combat || {
            damage: 25,
            cooldown: 1000,
            projectileSpeed: 50,
            projectileSize: 0.2,
            maxRange: 200
        };
        
        return `
            <div class="workshop-section">
                <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 12px;">Параметры боя</div>
                ${this.createSlider('workshop-combat-damage', 'Урон', combat.damage || 25, 1, 200, 1, 'HP')}
                ${this.createSlider('workshop-combat-cooldown', 'Перезарядка', combat.cooldown || 1000, 100, 10000, 100, 'мс')}
                ${this.createSlider('workshop-combat-projectileSpeed', 'Скорость снаряда', combat.projectileSpeed || 50, 10, 200, 5, 'м/с')}
                ${this.createSlider('workshop-combat-projectileSize', 'Размер снаряда', combat.projectileSize || 0.2, 0.1, 1.0, 0.05, 'м')}
                ${this.createSlider('workshop-combat-maxRange', 'Дальность', combat.maxRange || 200, 50, 1000, 10, 'м')}
            </div>
        `;
    }
    
    private createPhysicsTab(): string {
        const physics = this.config.physics || {
            mass: 50000,
            hoverHeight: 1.0,
            hoverStiffness: 7000
        };
        
        return `
            <div class="workshop-section">
                <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 12px;">Физические параметры</div>
                ${this.createSlider('workshop-physics-mass', 'Масса', physics.mass || 50000, 1000, 200000, 1000, 'кг')}
                ${this.createSlider('workshop-physics-hoverHeight', 'Высота парения', physics.hoverHeight || 1.0, 0.5, 3.0, 0.1, 'м')}
                ${this.createSlider('workshop-physics-hoverStiffness', 'Жёсткость подвески', physics.hoverStiffness || 7000, 1000, 50000, 500, 'Н/м')}
                ${this.createSlider('workshop-physics-hoverDamping', 'Демпфирование', physics.hoverDamping || 18000, 1000, 50000, 500, 'Н·с/м')}
                ${this.createSlider('workshop-physics-linearDamping', 'Линейное демпфирование', physics.linearDamping || 0.8, 0, 5, 0.1)}
                ${this.createSlider('workshop-physics-angularDamping', 'Угловое демпфирование', physics.angularDamping || 4.0, 0, 10, 0.1)}
                ${this.createSlider('workshop-physics-uprightForce', 'Сила выравнивания', physics.uprightForce || 18000, 5000, 50000, 1000, 'Н')}
                ${this.createSlider('workshop-physics-stabilityForce', 'Сила стабильности', physics.stabilityForce || 3000, 1000, 20000, 500, 'Н')}
            </div>
        `;
    }
    
    private createTurretTab(): string {
        const turret = this.config.turret || {
            turretSpeed: 0.08,
            barrelPitchSpeed: 0.05
        };
        
        return `
            <div class="workshop-section">
                <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 12px;">Параметры башни</div>
                ${this.createSlider('workshop-turret-turretSpeed', 'Скорость поворота башни', turret.turretSpeed || 0.08, 0.01, 0.2, 0.01, 'рад/кадр')}
                ${this.createSlider('workshop-turret-baseTurretSpeed', 'Базовая скорость', turret.baseTurretSpeed || 0.08, 0.01, 0.2, 0.01, 'рад/кадр')}
                ${this.createSlider('workshop-turret-turretLerpSpeed', 'Скорость интерполяции', turret.turretLerpSpeed || 0.25, 0.05, 0.5, 0.05)}
                ${this.createSlider('workshop-turret-barrelPitchSpeed', 'Скорость наклона ствола', turret.barrelPitchSpeed || 0.05, 0.01, 0.1, 0.005, 'рад/кадр')}
            </div>
        `;
    }
    
    private createSpecialTab(): string {
        const special = this.config.special || {
            modules: []
        };
        
        const abilityOptions = ['stealth', 'hover', 'siege', 'racer', 'amphibious', 'shield', 'drone', 'artillery', 'destroyer', 'command'];
        
        return `
            <div class="workshop-section">
                <div style="color: #ff0; font-weight: bold; margin-bottom: 10px; font-size: 12px;">Особые возможности</div>
                
                <div class="workshop-param-row" style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #aaa; font-size: 11px;">
                        <span style="min-width: 150px;">Способность:</span>
                        <select id="workshop-special-ability" style="flex: 1; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; font-size: 11px;">
                            <option value="">Нет</option>
                            ${abilityOptions.map(ability => `
                                <option value="${ability}" ${special.ability === ability ? 'selected' : ''}>${ability}</option>
                            `).join('')}
                        </select>
                    </label>
                </div>
                
                ${this.createSlider('workshop-special-abilityCooldown', 'Кулдаун способности', (special.abilityCooldown || 20000) / 1000, 1, 60, 1, 'сек')}
                ${this.createSlider('workshop-special-abilityDuration', 'Длительность способности', (special.abilityDuration || 5000) / 1000, 1, 30, 1, 'сек')}
                
                <div class="workshop-param-row" style="margin-bottom: 10px;">
                    <label style="color: #aaa; font-size: 11px; margin-bottom: 5px; display: block;">Модули (через запятую):</label>
                    <input type="text" id="workshop-special-modules" value="${(special.modules || []).join(', ')}" placeholder="1, 2, 3" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; font-size: 11px;" />
                </div>
            </div>
        `;
    }
    
    private setupInputs(): void {
        // Находим все слайдеры и связываем их
        this.container.querySelectorAll('input[type="range"]').forEach(slider => {
            const sliderEl = slider as HTMLInputElement;
            const id = sliderEl.id;
            const numInput = document.getElementById(`${id}-num`) as HTMLInputElement;
            const valueDisplay = document.getElementById(`${id}-value`) as HTMLSpanElement;
            
            if (sliderEl && numInput) {
                const updateValue = (value: number) => {
                    sliderEl.value = value.toString();
                    numInput.value = value.toString();
                    if (valueDisplay) {
                        const unit = valueDisplay.textContent?.split(' ').slice(1).join(' ') || '';
                        valueDisplay.textContent = `${parseFloat(value.toFixed(2))} ${unit}`;
                    }
                    this.updateConfig(id, value);
                };
                
                sliderEl.addEventListener('input', () => {
                    updateValue(parseFloat(sliderEl.value));
                });
                
                numInput.addEventListener('input', () => {
                    const value = parseFloat(numInput.value) || 0;
                    const min = parseFloat(sliderEl.min);
                    const max = parseFloat(sliderEl.max);
                    const clamped = Math.max(min, Math.min(max, value));
                    updateValue(clamped);
                });
            }
        });
        
        // Color pickers
        ['chassis', 'turret', 'barrel'].forEach(part => {
            const input = document.getElementById(`workshop-${part}-color`) as HTMLInputElement;
            if (input) {
                input.addEventListener('input', () => {
                    this.updateConfig(`workshop-visual-${part}Color`, input.value);
                });
            }
        });
        
        // Ability select
        const abilitySelect = document.getElementById('workshop-special-ability') as HTMLSelectElement;
        if (abilitySelect) {
            abilitySelect.addEventListener('change', () => {
                this.updateConfig('workshop-special-ability', abilitySelect.value);
            });
        }
        
        // Modules input
        const modulesInput = document.getElementById('workshop-special-modules') as HTMLInputElement;
        if (modulesInput) {
            modulesInput.addEventListener('input', () => {
                const modules = modulesInput.value.split(',').map(m => m.trim()).filter(m => m);
                this.updateConfig('workshop-special-modules', modules);
            });
        }
    }
    
    private updateConfig(path: string, value: any): void {
        const parts = path.replace('workshop-', '').split('-').filter(p => p);
        if (parts.length === 0) return;
        
        let current: any = this.config;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!part) continue;
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
        
        const lastPart = parts[parts.length - 1];
        if (!lastPart) return;
        
        // Специальная обработка для abilityCooldown и abilityDuration (конвертируем секунды в мс)
        if (lastPart === 'abilityCooldown' || lastPart === 'abilityDuration') {
            current[lastPart] = (value as number) * 1000;
        } else {
            current[lastPart] = value;
        }
        
        // Debounce для частых обновлений
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        this.updateTimer = window.setTimeout(() => {
            if (this.onChangeCallback) {
                this.onChangeCallback({ ...this.config });
            }
            this.updateTimer = null;
        }, 100);
    }
    
    /**
     * Установить конфигурацию
     */
    setConfig(config: WorkshopConfig): void {
        this.config = { ...config };
        this.updateInputs();
    }
    
    /**
     * Получить конфигурацию
     */
    getConfig(): WorkshopConfig {
        return { ...this.config };
    }
    
    private updateInputs(): void {
        // Обновляем все input поля из конфигурации
        if (this.config.visual) {
            const chassisColor = document.getElementById('workshop-chassis-color') as HTMLInputElement;
            const turretColor = document.getElementById('workshop-turret-color') as HTMLInputElement;
            const barrelColor = document.getElementById('workshop-barrel-color') as HTMLInputElement;
            
            if (chassisColor) chassisColor.value = this.config.visual.chassisColor || '#00ff00';
            if (turretColor) turretColor.value = this.config.visual.turretColor || '#00ff00';
            if (barrelColor) barrelColor.value = this.config.visual.barrelColor || '#888888';
        }
        
        if (this.config.movement) {
            this.setInputValue('workshop-movement-maxForwardSpeed', this.config.movement.maxForwardSpeed);
            this.setInputValue('workshop-movement-maxBackwardSpeed', this.config.movement.maxBackwardSpeed);
            this.setInputValue('workshop-movement-acceleration', this.config.movement.acceleration);
            this.setInputValue('workshop-movement-deceleration', this.config.movement.deceleration);
            this.setInputValue('workshop-movement-turnSpeed', this.config.movement.turnSpeed);
            this.setInputValue('workshop-movement-pivotTurnMultiplier', this.config.movement.pivotTurnMultiplier);
        }
        
        if (this.config.combat) {
            this.setInputValue('workshop-combat-damage', this.config.combat.damage);
            this.setInputValue('workshop-combat-cooldown', this.config.combat.cooldown);
            this.setInputValue('workshop-combat-projectileSpeed', this.config.combat.projectileSpeed);
            this.setInputValue('workshop-combat-projectileSize', this.config.combat.projectileSize);
            this.setInputValue('workshop-combat-maxRange', this.config.combat.maxRange);
        }
        
        if (this.config.physics) {
            this.setInputValue('workshop-physics-mass', this.config.physics.mass);
            this.setInputValue('workshop-physics-hoverHeight', this.config.physics.hoverHeight);
            this.setInputValue('workshop-physics-hoverStiffness', this.config.physics.hoverStiffness);
            if (this.config.physics.hoverDamping) this.setInputValue('workshop-physics-hoverDamping', this.config.physics.hoverDamping);
            if (this.config.physics.linearDamping) this.setInputValue('workshop-physics-linearDamping', this.config.physics.linearDamping);
            if (this.config.physics.angularDamping) this.setInputValue('workshop-physics-angularDamping', this.config.physics.angularDamping);
            if (this.config.physics.uprightForce) this.setInputValue('workshop-physics-uprightForce', this.config.physics.uprightForce);
            if (this.config.physics.stabilityForce) this.setInputValue('workshop-physics-stabilityForce', this.config.physics.stabilityForce);
        }
        
        if (this.config.turret) {
            this.setInputValue('workshop-turret-turretSpeed', this.config.turret.turretSpeed);
            if (this.config.turret.baseTurretSpeed) this.setInputValue('workshop-turret-baseTurretSpeed', this.config.turret.baseTurretSpeed);
            if (this.config.turret.turretLerpSpeed) this.setInputValue('workshop-turret-turretLerpSpeed', this.config.turret.turretLerpSpeed);
            this.setInputValue('workshop-turret-barrelPitchSpeed', this.config.turret.barrelPitchSpeed);
        }
        
        if (this.config.special) {
            const abilitySelect = document.getElementById('workshop-special-ability') as HTMLSelectElement;
            if (abilitySelect && this.config.special.ability) {
                abilitySelect.value = this.config.special.ability;
            }
            if (this.config.special.abilityCooldown) {
                this.setInputValue('workshop-special-abilityCooldown', this.config.special.abilityCooldown / 1000);
            }
            if (this.config.special.abilityDuration) {
                this.setInputValue('workshop-special-abilityDuration', this.config.special.abilityDuration / 1000);
            }
            const modulesInput = document.getElementById('workshop-special-modules') as HTMLInputElement;
            if (modulesInput && this.config.special.modules) {
                modulesInput.value = this.config.special.modules.join(', ');
            }
        }
    }
    
    private setInputValue(id: string, value: number | undefined): void {
        if (value === undefined) return;
        
        const slider = document.getElementById(id) as HTMLInputElement;
        const numInput = document.getElementById(`${id}-num`) as HTMLInputElement;
        const valueDisplay = document.getElementById(`${id}-value`) as HTMLSpanElement;
        
        if (slider) {
            slider.value = value.toString();
            slider.dispatchEvent(new Event('input'));
        }
        if (numInput) {
            numInput.value = value.toString();
        }
        if (valueDisplay) {
            const unit = valueDisplay.textContent?.split(' ').slice(1).join(' ') || '';
            valueDisplay.textContent = `${parseFloat(value.toFixed(2))} ${unit}`;
        }
    }
    
    /**
     * Установить callback для изменений
     */
    setOnChange(callback: (config: WorkshopConfig) => void): void {
        this.onChangeCallback = callback;
    }
    
    /**
     * Показать/скрыть панель
     */
    setVisible(visible: boolean): void {
        if (this.container) {
            this.container.style.display = visible ? 'block' : 'none';
        }
    }
    
    dispose(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        this.onChangeCallback = null;
    }
}

export default WorkshopPropertiesPanel;

