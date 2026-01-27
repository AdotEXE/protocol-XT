/**
 * @module workshop/ParameterEditor
 * @description Редактор параметров танка для Workshop
 * 
 * HTML/CSS UI с табами для редактирования всех параметров танка
 */

import { PartialTankConfiguration, CustomTankConfiguration } from './types';
import { getChassisById, getCannonById } from '../tankTypes';

export class ParameterEditor {
    private container: HTMLDivElement;
    private config: Partial<CustomTankConfiguration> = {};
    private inputs: Map<string, HTMLInputElement> = new Map();
    private valueDisplays: Map<string, HTMLSpanElement> = new Map();
    private activeTab: string = 'movement';
    private tabs: Map<string, HTMLButtonElement> = new Map();
    
    constructor(container: HTMLDivElement) {
        this.container = container;
        this.createUI();
        this.setupTabs();
    }
    
    private createUI(): void {
        const html = `
            <div class="parameter-editor">
                <div class="editor-tabs" style="display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 2px solid rgba(0, 255, 0, 0.3); padding-bottom: 5px;">
                    <button class="tab active" data-tab="movement" style="padding: 8px 16px; background: rgba(0, 60, 0, 0.8); border: 1px solid #0f0; color: #0f0; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 12px;">Движение</button>
                    <button class="tab" data-tab="combat" style="padding: 8px 16px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 12px;">Бой</button>
                    <button class="tab" data-tab="physics" style="padding: 8px 16px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 12px;">Физика</button>
                    <button class="tab" data-tab="turret" style="padding: 8px 16px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 12px;">Башня</button>
                    <button class="tab" data-tab="special" style="padding: 8px 16px; background: rgba(0, 20, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #7f7; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 12px;">Особое</button>
                </div>
                
                <div class="tab-content" id="movement-tab">
                    ${this.createMovementTab()}
                </div>
                <div class="tab-content hidden" id="combat-tab" style="display: none;">
                    ${this.createCombatTab()}
                </div>
                <div class="tab-content hidden" id="physics-tab" style="display: none;">
                    ${this.createPhysicsTab()}
                </div>
                <div class="tab-content hidden" id="turret-tab" style="display: none;">
                    ${this.createTurretTab()}
                </div>
                <div class="tab-content hidden" id="special-tab" style="display: none;">
                    ${this.createSpecialTab()}
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        this.setupInputs();
    }
    
    private setupTabs(): void {
        const tabButtons = this.container.querySelectorAll('.tab');
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
        
        // Update tab buttons
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
        
        // Update content
        this.container.querySelectorAll('.tab-content').forEach(content => {
            const contentTab = (content as HTMLElement).id.replace('-tab', '');
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
            <div class="param-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 8px; background: rgba(0, 10, 0, 0.3); border-radius: 3px;">
                <label style="min-width: 200px; color: #aaa; font-size: 12px;">${label}</label>
                <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="flex: 1; min-width: 200px;" />
                <input type="number" id="${id}-num" min="${min}" max="${max}" step="${step}" value="${value}" style="width: 100px; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px;" />
                <span class="value-display" id="${id}-value" style="min-width: 80px; color: #0f0; font-weight: bold; font-size: 12px; text-align: right;">${value.toFixed(2)} ${unit}</span>
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
            <div class="param-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                <div class="section-title" style="color: #ff0; font-weight: bold; margin-bottom: 12px; font-size: 14px; text-transform: uppercase;">Параметры движения</div>
                ${this.createSlider('movement.maxForwardSpeed', 'Макс. скорость вперёд', movement.maxForwardSpeed, 5, 50, 0.5, 'м/с')}
                ${this.createSlider('movement.maxBackwardSpeed', 'Макс. скорость назад', movement.maxBackwardSpeed, 2, 25, 0.5, 'м/с')}
                ${this.createSlider('movement.acceleration', 'Ускорение', movement.acceleration, 5, 50, 1, 'м/с²')}
                ${this.createSlider('movement.deceleration', 'Замедление', movement.deceleration, 10, 60, 1, 'м/с²')}
                ${this.createSlider('movement.turnSpeed', 'Скорость поворота', movement.turnSpeed, 10, 100, 1, 'град/с')}
                ${this.createSlider('movement.pivotTurnMultiplier', 'Множитель поворота на месте', movement.pivotTurnMultiplier, 0.5, 3.0, 0.1)}
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
            <div class="param-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                <div class="section-title" style="color: #ff0; font-weight: bold; margin-bottom: 12px; font-size: 14px; text-transform: uppercase;">Параметры боя</div>
                ${this.createSlider('combat.damage', 'Урон', combat.damage, 1, 200, 1, 'HP')}
                ${this.createSlider('combat.cooldown', 'Перезарядка', combat.cooldown, 100, 10000, 100, 'мс')}
                ${this.createSlider('combat.projectileSpeed', 'Скорость снаряда', combat.projectileSpeed, 10, 200, 5, 'м/с')}
                ${this.createSlider('combat.projectileSize', 'Размер снаряда', combat.projectileSize, 0.1, 1.0, 0.05, 'м')}
                ${this.createSlider('combat.maxRange', 'Дальность', combat.maxRange, 50, 1000, 10, 'м')}
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
            <div class="param-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                <div class="section-title" style="color: #ff0; font-weight: bold; margin-bottom: 12px; font-size: 14px; text-transform: uppercase;">Физические параметры</div>
                ${this.createSlider('physics.mass', 'Масса', physics.mass, 1000, 200000, 1000, 'кг')}
                ${this.createSlider('physics.hoverHeight', 'Высота парения', physics.hoverHeight, 0.5, 3.0, 0.1, 'м')}
                ${this.createSlider('physics.hoverStiffness', 'Жёсткость подвески', physics.hoverStiffness, 1000, 50000, 500, 'Н/м')}
                ${this.createSlider('physics.hoverDamping', 'Демпфирование', physics.hoverDamping || 18000, 1000, 50000, 500, 'Н·с/м')}
                ${this.createSlider('physics.linearDamping', 'Линейное демпфирование', physics.linearDamping || 0.8, 0, 5, 0.1)}
                ${this.createSlider('physics.angularDamping', 'Угловое демпфирование', physics.angularDamping || 4.0, 0, 10, 0.1)}
                ${this.createSlider('physics.uprightForce', 'Сила выравнивания', physics.uprightForce || 18000, 5000, 50000, 1000, 'Н')}
                ${this.createSlider('physics.stabilityForce', 'Сила стабильности', physics.stabilityForce || 3000, 1000, 20000, 500, 'Н')}
            </div>
        `;
    }
    
    private createTurretTab(): string {
        const turret = this.config.turret || {
            turretSpeed: 0.08,
            barrelPitchSpeed: 0.05
        };
        
        return `
            <div class="param-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                <div class="section-title" style="color: #ff0; font-weight: bold; margin-bottom: 12px; font-size: 14px; text-transform: uppercase;">Параметры башни</div>
                ${this.createSlider('turret.turretSpeed', 'Скорость поворота башни', turret.turretSpeed, 0.01, 0.2, 0.01, 'рад/кадр')}
                ${this.createSlider('turret.baseTurretSpeed', 'Базовая скорость', turret.baseTurretSpeed || 0.08, 0.01, 0.2, 0.01, 'рад/кадр')}
                ${this.createSlider('turret.turretLerpSpeed', 'Скорость интерполяции', turret.turretLerpSpeed || 0.25, 0.05, 0.5, 0.05)}
                ${this.createSlider('turret.barrelPitchSpeed', 'Скорость наклона ствола', turret.barrelPitchSpeed, 0.01, 0.1, 0.005, 'рад/кадр')}
            </div>
        `;
    }
    
    private createSpecialTab(): string {
        const special = this.config.special || {
            modules: []
        };
        
        // Получаем список доступных способностей из chassis
        const abilityOptions = ['stealth', 'hover', 'siege', 'racer', 'amphibious', 'shield', 'drone', 'artillery', 'destroyer', 'command'];
        
        return `
            <div class="param-section" style="margin-bottom: 20px; padding: 15px; background: rgba(0, 20, 0, 0.2); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                <div class="section-title" style="color: #ff0; font-weight: bold; margin-bottom: 12px; font-size: 14px; text-transform: uppercase;">Особые возможности</div>
                
                <div class="param-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 8px; background: rgba(0, 10, 0, 0.3); border-radius: 3px;">
                    <label style="min-width: 200px; color: #aaa; font-size: 12px;">Способность</label>
                    <select id="special.ability" style="flex: 1; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px;">
                        <option value="">Нет</option>
                        ${abilityOptions.map(ability => `
                            <option value="${ability}" ${special.ability === ability ? 'selected' : ''}>${ability}</option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="param-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 8px; background: rgba(0, 10, 0, 0.3); border-radius: 3px;">
                    <label style="min-width: 200px; color: #aaa; font-size: 12px;">Кулдаун способности</label>
                    <input type="range" id="special.abilityCooldown" min="1000" max="60000" step="1000" value="${special.abilityCooldown || 20000}" style="flex: 1; min-width: 200px;" />
                    <input type="number" id="special.abilityCooldown-num" min="1000" max="60000" step="1000" value="${special.abilityCooldown || 20000}" style="width: 100px; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px;" />
                    <span class="value-display" id="special.abilityCooldown-value" style="min-width: 80px; color: #0f0; font-weight: bold; font-size: 12px; text-align: right;">${((special.abilityCooldown || 20000) / 1000).toFixed(0)} сек</span>
                </div>
                
                <div class="param-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 8px; background: rgba(0, 10, 0, 0.3); border-radius: 3px;">
                    <label style="min-width: 200px; color: #aaa; font-size: 12px;">Длительность способности</label>
                    <input type="range" id="special.abilityDuration" min="1000" max="30000" step="1000" value="${special.abilityDuration || 5000}" style="flex: 1; min-width: 200px;" />
                    <input type="number" id="special.abilityDuration-num" min="1000" max="30000" step="1000" value="${special.abilityDuration || 5000}" style="width: 100px; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px;" />
                    <span class="value-display" id="special.abilityDuration-value" style="min-width: 80px; color: #0f0; font-weight: bold; font-size: 12px; text-align: right;">${((special.abilityDuration || 5000) / 1000).toFixed(0)} сек</span>
                </div>
                
                <div class="param-row" style="padding: 8px; background: rgba(0, 10, 0, 0.3); border-radius: 3px;">
                    <label style="color: #aaa; font-size: 12px; margin-bottom: 8px; display: block;">Модули (через запятую, ID модулей 1-9)</label>
                    <input type="text" id="special.modules" value="${special.modules.join(', ')}" placeholder="1, 2, 3" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px;" />
                </div>
            </div>
        `;
    }
    
    private setupInputs(): void {
        // Находим все слайдеры и связываем их с number inputs
        this.container.querySelectorAll('input[type="range"]').forEach(slider => {
            const sliderEl = slider as HTMLInputElement;
            const id = sliderEl.id;
            const numInput = document.getElementById(`${id}-num`) as HTMLInputElement;
            const valueDisplay = document.getElementById(`${id}-value`) as HTMLSpanElement;
            
            if (sliderEl && numInput) {
                this.inputs.set(id, sliderEl);
                
                // Синхронизация слайдера и number input
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
        
        // Обработка select для способностей
        const abilitySelect = document.getElementById('special.ability') as HTMLSelectElement;
        if (abilitySelect) {
            abilitySelect.addEventListener('change', () => {
                this.updateConfig('special.ability', abilitySelect.value);
            });
        }
        
        // Обработка модулей
        const modulesInput = document.getElementById('special.modules') as HTMLInputElement;
        if (modulesInput) {
            modulesInput.addEventListener('input', () => {
                const modules = modulesInput.value.split(',').map(m => m.trim()).filter(m => m);
                this.updateConfig('special.modules', modules);
            });
        }
    }
    
    private updateConfig(path: string, value: any): void {
        const parts = path.split('.');
        let current: any = this.config;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
        
        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
    }
    
    getConfiguration(): Partial<CustomTankConfiguration> {
        // Собираем все значения из input полей
        const config: Partial<CustomTankConfiguration> = {
            movement: {
                maxForwardSpeed: parseFloat((document.getElementById('movement.maxForwardSpeed') as HTMLInputElement)?.value || '24'),
                maxBackwardSpeed: parseFloat((document.getElementById('movement.maxBackwardSpeed') as HTMLInputElement)?.value || '12'),
                acceleration: parseFloat((document.getElementById('movement.acceleration') as HTMLInputElement)?.value || '20'),
                deceleration: parseFloat((document.getElementById('movement.deceleration') as HTMLInputElement)?.value || '30'),
                turnSpeed: parseFloat((document.getElementById('movement.turnSpeed') as HTMLInputElement)?.value || '60'),
                pivotTurnMultiplier: parseFloat((document.getElementById('movement.pivotTurnMultiplier') as HTMLInputElement)?.value || '1.5')
            },
            combat: {
                damage: parseFloat((document.getElementById('combat.damage') as HTMLInputElement)?.value || '25'),
                cooldown: parseFloat((document.getElementById('combat.cooldown') as HTMLInputElement)?.value || '1000'),
                projectileSpeed: parseFloat((document.getElementById('combat.projectileSpeed') as HTMLInputElement)?.value || '50'),
                projectileSize: parseFloat((document.getElementById('combat.projectileSize') as HTMLInputElement)?.value || '0.2'),
                maxRange: parseFloat((document.getElementById('combat.maxRange') as HTMLInputElement)?.value || '200')
            },
            physics: {
                mass: parseFloat((document.getElementById('physics.mass') as HTMLInputElement)?.value || '50000'),
                hoverHeight: parseFloat((document.getElementById('physics.hoverHeight') as HTMLInputElement)?.value || '1.0'),
                hoverStiffness: parseFloat((document.getElementById('physics.hoverStiffness') as HTMLInputElement)?.value || '7000'),
                hoverDamping: parseFloat((document.getElementById('physics.hoverDamping') as HTMLInputElement)?.value || '18000'),
                linearDamping: parseFloat((document.getElementById('physics.linearDamping') as HTMLInputElement)?.value || '0.8'),
                angularDamping: parseFloat((document.getElementById('physics.angularDamping') as HTMLInputElement)?.value || '4.0'),
                uprightForce: parseFloat((document.getElementById('physics.uprightForce') as HTMLInputElement)?.value || '18000'),
                stabilityForce: parseFloat((document.getElementById('physics.stabilityForce') as HTMLInputElement)?.value || '3000')
            },
            turret: {
                turretSpeed: parseFloat((document.getElementById('turret.turretSpeed') as HTMLInputElement)?.value || '0.08'),
                baseTurretSpeed: parseFloat((document.getElementById('turret.baseTurretSpeed') as HTMLInputElement)?.value || '0.08'),
                turretLerpSpeed: parseFloat((document.getElementById('turret.turretLerpSpeed') as HTMLInputElement)?.value || '0.25'),
                barrelPitchSpeed: parseFloat((document.getElementById('turret.barrelPitchSpeed') as HTMLInputElement)?.value || '0.05')
            },
            special: {
                ability: (document.getElementById('special.ability') as HTMLSelectElement)?.value || undefined,
                abilityCooldown: parseFloat((document.getElementById('special.abilityCooldown') as HTMLInputElement)?.value || '20000'),
                abilityDuration: parseFloat((document.getElementById('special.abilityDuration') as HTMLInputElement)?.value || '5000'),
                modules: ((document.getElementById('special.modules') as HTMLInputElement)?.value || '').split(',').map(m => m.trim()).filter(m => m)
            }
        };
        
        return config;
    }
    
    setConfiguration(config: Partial<CustomTankConfiguration>): void {
        this.config = config;
        this.updateInputs();
    }
    
    private updateInputs(): void {
        // Обновляем все input поля из конфигурации
        if (this.config.movement) {
            this.setInputValue('movement.maxForwardSpeed', this.config.movement.maxForwardSpeed);
            this.setInputValue('movement.maxBackwardSpeed', this.config.movement.maxBackwardSpeed);
            this.setInputValue('movement.acceleration', this.config.movement.acceleration);
            this.setInputValue('movement.deceleration', this.config.movement.deceleration);
            this.setInputValue('movement.turnSpeed', this.config.movement.turnSpeed);
            this.setInputValue('movement.pivotTurnMultiplier', this.config.movement.pivotTurnMultiplier);
        }
        
        if (this.config.combat) {
            this.setInputValue('combat.damage', this.config.combat.damage);
            this.setInputValue('combat.cooldown', this.config.combat.cooldown);
            this.setInputValue('combat.projectileSpeed', this.config.combat.projectileSpeed);
            this.setInputValue('combat.projectileSize', this.config.combat.projectileSize);
            this.setInputValue('combat.maxRange', this.config.combat.maxRange);
        }
        
        if (this.config.physics) {
            this.setInputValue('physics.mass', this.config.physics.mass);
            this.setInputValue('physics.hoverHeight', this.config.physics.hoverHeight);
            this.setInputValue('physics.hoverStiffness', this.config.physics.hoverStiffness);
            if (this.config.physics.hoverDamping) this.setInputValue('physics.hoverDamping', this.config.physics.hoverDamping);
            if (this.config.physics.linearDamping) this.setInputValue('physics.linearDamping', this.config.physics.linearDamping);
            if (this.config.physics.angularDamping) this.setInputValue('physics.angularDamping', this.config.physics.angularDamping);
            if (this.config.physics.uprightForce) this.setInputValue('physics.uprightForce', this.config.physics.uprightForce);
            if (this.config.physics.stabilityForce) this.setInputValue('physics.stabilityForce', this.config.physics.stabilityForce);
        }
        
        if (this.config.turret) {
            this.setInputValue('turret.turretSpeed', this.config.turret.turretSpeed);
            if (this.config.turret.baseTurretSpeed) this.setInputValue('turret.baseTurretSpeed', this.config.turret.baseTurretSpeed);
            if (this.config.turret.turretLerpSpeed) this.setInputValue('turret.turretLerpSpeed', this.config.turret.turretLerpSpeed);
            this.setInputValue('turret.barrelPitchSpeed', this.config.turret.barrelPitchSpeed);
        }
        
        if (this.config.special) {
            const abilitySelect = document.getElementById('special.ability') as HTMLSelectElement;
            if (abilitySelect && this.config.special.ability) {
                abilitySelect.value = this.config.special.ability;
            }
            if (this.config.special.abilityCooldown) this.setInputValue('special.abilityCooldown', this.config.special.abilityCooldown);
            if (this.config.special.abilityDuration) this.setInputValue('special.abilityDuration', this.config.special.abilityDuration);
            const modulesInput = document.getElementById('special.modules') as HTMLInputElement;
            if (modulesInput && this.config.special.modules) {
                modulesInput.value = this.config.special.modules.join(', ');
            }
        }
    }
    
    private setInputValue(id: string, value: number): void {
        const slider = document.getElementById(id) as HTMLInputElement;
        const numInput = document.getElementById(`${id}-num`) as HTMLInputElement;
        const valueDisplay = document.getElementById(`${id}-value`) as HTMLSpanElement;
        
        if (slider) {
            slider.value = value.toString();
            // Триггерим событие для обновления связанных элементов
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
}

export default ParameterEditor;

