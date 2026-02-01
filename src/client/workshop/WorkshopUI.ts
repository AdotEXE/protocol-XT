/**
 * @module workshop/WorkshopUI
 * @description Главный UI для Workshop Editor
 * 
 * Объединяет все редакторы в единый интерфейс:
 * - ModelSelector: Выбор базовой модели танка
 * - ParameterEditor: Редактирование параметров (движение, бой, физика)
 * - AttachmentPointEditor: Точки крепления башни и ствола
 * - VisualEditor: Цвета частей танка
 * - TransformEditor: Перемещение, вращение, масштабирование частей танка
 */

import { Scene } from '@babylonjs/core';
import { CommonStyles } from '../commonStyles';
import { initPreviewScene, cleanupPreviewScene, updatePreviewTank, type PreviewScene, type PreviewTank } from '../garage/preview';
import { getChassisById, getCannonById } from '../tankTypes';
import { ConfigurationManager } from './ConfigurationManager';
import { CustomTankConfiguration } from './types';
import ModelSelector from './ModelSelector';
import ParameterEditor from './ParameterEditor';
import AttachmentPointEditor from './AttachmentPointEditor';
import VisualEditor from './VisualEditor';
import TransformEditor from './TransformEditor';

export class WorkshopUI {
    private overlay: HTMLDivElement | null = null;
    private previewScene: PreviewScene | null = null;
    private previewTank: PreviewTank | null = null;

    private modelSelector: ModelSelector | null = null;
    private parameterEditor: ParameterEditor | null = null;
    private attachmentEditor: AttachmentPointEditor | null = null;
    private visualEditor: VisualEditor | null = null;
    private transformEditor: TransformEditor | null = null;

    private currentConfig: Partial<CustomTankConfiguration> = {};
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(private scene: Scene) {
        this.createUI();
    }

    private createUI(): void {
        // Используем тот же стиль что и Garage
        CommonStyles.initialize();

        this.overlay = document.createElement('div');
        this.overlay.className = 'panel-overlay';
        this.overlay.id = 'workshop-overlay';

        const html = `
            <div class="panel" style="max-width: 1400px; width: 95%; max-height: 90vh; display: flex; flex-direction: column; margin: auto; position: relative;">
                <div class="panel-header">
                    <div class="panel-title">WORKSHOP - Редактор Танков</div>
                    <button class="panel-close" id="workshop-close">✕</button>
                </div>
                <div class="panel-content" style="flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: 350px 1fr; gap: 20px;">
                    <!-- Левая колонка: Выбор модели и параметры -->
                    <div class="workshop-left" style="display: flex; flex-direction: column; gap: 20px;">
                        <div id="model-selector-container"></div>
                        <div id="parameter-editor-container" style="flex: 1; overflow-y: auto;"></div>
                    </div>
                    
                    <!-- Правая колонка: 3D Preview и редакторы -->
                    <div class="workshop-right" style="display: flex; flex-direction: column; gap: 20px;">
                        <div id="preview-container" style="width: 100%; height: 400px; background: #1a1a1a; border: 1px solid #0f0; border-radius: 4px; position: relative; overflow: hidden;"></div>
                        <div id="attachment-editor-container"></div>
                        <div id="visual-editor-container"></div>
                        <div id="transform-editor-container"></div>
                        
                        <!-- Кнопки сохранения -->
                        <div class="workshop-actions" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 15px; background: rgba(0, 20, 0, 0.3); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px;">
                            <input type="text" id="tank-name" placeholder="Имя танка" style="flex: 1; min-width: 200px; padding: 8px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 0, 0.3); color: #0f0; border-radius: 3px; font-size: 12px;" />
                            <button class="panel-btn primary" id="save-tank" style="padding: 8px 16px; background: rgba(0, 255, 0, 0.2); border: 1px solid #0f0; color: #0f0; cursor: pointer; border-radius: 3px; font-weight: bold;">Сохранить</button>
                            <button class="panel-btn secondary" id="load-tank" style="padding: 8px 16px; background: rgba(0, 100, 0, 0.3); border: 1px solid rgba(0, 255, 0, 0.5); color: #7f7; cursor: pointer; border-radius: 3px;">Загрузить</button>
                            <button class="panel-btn secondary" id="test-tank" style="padding: 8px 16px; background: rgba(0, 100, 0, 0.3); border: 1px solid rgba(0, 255, 0, 0.5); color: #7f7; cursor: pointer; border-radius: 3px;">Тест в игре</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.overlay.innerHTML = html;
        document.body.appendChild(this.overlay);

        // Инициализируем preview сцену
        this.initPreview();

        // Инициализируем компоненты
        this.initComponents();

        // Обработчики
        this.setupHandlers();
    }

    private initPreview(): void {
        const container = document.getElementById('preview-container');
        if (!container) return;

        // Очищаем контейнер
        container.innerHTML = '';

        // Инициализируем preview сцену (используем garage/preview.ts)
        this.previewScene = initPreviewScene(container);

        if (!this.previewScene) {
            console.error('[Workshop] Failed to initialize preview scene');
            return;
        }
    }

    private initComponents(): void {
        const modelContainer = document.getElementById('model-selector-container');
        const paramContainer = document.getElementById('parameter-editor-container');
        const attachContainer = document.getElementById('attachment-editor-container');
        const visualContainer = document.getElementById('visual-editor-container');

        if (modelContainer) {
            this.modelSelector = new ModelSelector(modelContainer as HTMLDivElement);
            this.modelSelector.setOnSelect((chassisId, cannonId, trackId) => {
                this.loadModel(chassisId, cannonId, trackId);
            });
        }

        if (paramContainer) {
            this.parameterEditor = new ParameterEditor(paramContainer as HTMLDivElement);
        }

        if (attachContainer && this.previewScene) {
            this.attachmentEditor = new AttachmentPointEditor(attachContainer as HTMLDivElement, this.previewScene);
        }

        if (visualContainer) {
            this.visualEditor = new VisualEditor(visualContainer as HTMLDivElement, this.previewTank);
        }

        // TransformEditor для перемещения/вращения/масштабирования частей танка
        const transformContainer = document.getElementById('transform-editor-container');
        if (transformContainer) {
            this.transformEditor = new TransformEditor(transformContainer as HTMLDivElement);
            // Инициализируем с preview сценой когда модель будет загружена
        }
    }

    private loadModel(chassisId: string, cannonId: string, trackId: string): void {
        if (!this.previewScene) return;

        // Обновляем preview (используем garage/preview.ts)
        this.previewTank = updatePreviewTank(
            this.previewTank,
            chassisId,
            cannonId,
            trackId,
            this.previewScene.scene
        );

        if (this.attachmentEditor) {
            this.attachmentEditor.updatePreviewTank(this.previewTank);
        }

        // Обновляем visual editor
        if (this.visualEditor && this.previewTank) {
            this.visualEditor.setPreviewTank(this.previewTank);
        }

        // Обновляем transform editor
        if (this.transformEditor && this.previewScene && this.previewTank) {
            this.transformEditor.initialize(this.previewScene.scene, this.previewTank);
            this.transformEditor.setPreviewTank(this.previewTank);
        }

        // Загружаем параметры по умолчанию из типов
        const chassis = getChassisById(chassisId);
        const cannon = getCannonById(cannonId);

        // Используем значения по умолчанию из типов
        this.currentConfig = {
            baseModel: { chassisId, cannonId, trackId },
            turretPivot: { x: 0, y: 0, z: 0 },
            barrelMount: { x: 0, y: 0, z: 0 },
            movement: {
                maxForwardSpeed: chassis?.moveSpeed || 24,
                maxBackwardSpeed: (chassis?.moveSpeed || 24) * 0.5,
                acceleration: 20,
                deceleration: 30,
                turnSpeed: (chassis?.turnSpeed || 5.0) * (180 / Math.PI), // Конвертируем в градусы
                pivotTurnMultiplier: 1.5
            },
            combat: {
                damage: cannon?.damage || 25,
                cooldown: cannon?.cooldown || 1000,
                projectileSpeed: cannon?.projectileSpeed || 50,
                projectileSize: 0.2,
                maxRange: 200
            },
            physics: {
                mass: chassis?.mass || 50000,
                hoverHeight: 1.0,
                hoverStiffness: 7000
            },
            turret: {
                turretSpeed: 0.08,
                barrelPitchSpeed: 0.05
            },
            special: {
                modules: []
            },
            visual: {
                chassisColor: '#00ff00',
                turretColor: '#00ff00',
                barrelColor: '#888888'
            }
        };

        if (this.parameterEditor) {
            this.parameterEditor.setConfiguration(this.currentConfig);
        }

        if (this.visualEditor) {
            this.visualEditor.setColors(this.currentConfig.visual || {
                chassisColor: '#00ff00',
                turretColor: '#00ff00',
                barrelColor: '#888888'
            });
        }
    }

    private setupHandlers(): void {
        // Close button
        const closeBtn = document.getElementById('workshop-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            });
        }

        // Save button
        document.getElementById('save-tank')?.addEventListener('click', () => this.saveTank());

        // Load button
        document.getElementById('load-tank')?.addEventListener('click', () => this.loadTank());

        // Test button
        document.getElementById('test-tank')?.addEventListener('click', () => this.testTank());

        // Закрытие по клику на overlay (но не на панель)
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.hide();
                }
            });
        }

        // Закрытие по ESC - используем capture: true для приоритета
        this.escHandler = (e: KeyboardEvent) => {
            // Проверяем, что WORKSHOP виден и ESC не заблокирован другими элементами
            if (e.code === 'Escape' && this.isVisible()) {
                // Проверяем, что фокус не в поле ввода
                const activeElement = document.activeElement;
                const isInputFocused = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    (activeElement as HTMLElement).isContentEditable
                );
                
                // Если фокус в поле ввода, не закрываем (пользователь может редактировать текст)
                if (isInputFocused) {
                    return;
                }
                
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.hide();
            }
        };
        window.addEventListener('keydown', this.escHandler, { capture: true });
    }

    private saveTank(): void {
        const nameInput = document.getElementById('tank-name') as HTMLInputElement;
        const name = nameInput?.value || 'Custom Tank';

        if (!name.trim()) {
            alert('Введите имя танка!');
            return;
        }

        // Собираем все данные из редакторов
        const paramConfig = this.parameterEditor?.getConfiguration() || {};
        const attachmentPoints = this.attachmentEditor?.getAttachmentPoints() || {
            turretPivot: { x: 0, y: 0, z: 0 },
            barrelMount: { x: 0, y: 0, z: 0 }
        };
        const colors = this.visualEditor?.getColors() || {
            chassisColor: '#00ff00',
            turretColor: '#00ff00',
            barrelColor: '#888888'
        };

        const id = `custom_${Date.now()}`;

        const config: CustomTankConfiguration = {
            id,
            name,
            baseModel: this.currentConfig.baseModel || {
                chassisId: 'standard',
                cannonId: 'standard',
                trackId: 'standard'
            },
            turretPivot: attachmentPoints.turretPivot,
            barrelMount: attachmentPoints.barrelMount,
            movement: paramConfig.movement || this.currentConfig.movement || {
                maxForwardSpeed: 24,
                maxBackwardSpeed: 12,
                acceleration: 20,
                deceleration: 30,
                turnSpeed: 60,
                pivotTurnMultiplier: 1.5
            },
            combat: paramConfig.combat || this.currentConfig.combat || {
                damage: 25,
                cooldown: 1000,
                projectileSpeed: 50,
                projectileSize: 0.2,
                maxRange: 200
            },
            physics: paramConfig.physics || this.currentConfig.physics || {
                mass: 50000,
                hoverHeight: 1.0,
                hoverStiffness: 7000
            },
            turret: paramConfig.turret || this.currentConfig.turret || {
                turretSpeed: 0.08,
                barrelPitchSpeed: 0.05
            },
            special: paramConfig.special || this.currentConfig.special || {
                modules: []
            },
            visual: colors,
            createdAt: Date.now(),
            modifiedAt: Date.now()
        };

        try {
            ConfigurationManager.save(config);
            alert(`Танк "${name}" сохранён!`);
            console.log('[Workshop] Saved configuration:', config);
        } catch (e) {
            console.error('[Workshop] Failed to save:', e);
            alert('Ошибка при сохранении!');
        }
    }

    private loadTank(): void {
        const all = ConfigurationManager.loadAll();
        if (all.length === 0) {
            alert('Нет сохранённых танков');
            return;
        }

        // Простой список для выбора
        const list = all.map((t, i) => `${i + 1}. ${t.name} (${t.id})`).join('\n');
        const selected = prompt(`Выберите танк (введите номер 1-${all.length}):\n${list}`);
        if (!selected) return;

        const index = parseInt(selected) - 1;
        if (isNaN(index) || index < 0 || index >= all.length) {
            alert('Неверный номер!');
            return;
        }

        const config = all[index];
        if (config) {
            this.loadConfiguration(config);
        }
    }

    private loadConfiguration(config: CustomTankConfiguration): void {
        this.currentConfig = config;

        // Загружаем модель
        this.loadModel(
            config.baseModel.chassisId,
            config.baseModel.cannonId,
            config.baseModel.trackId
        );

        // Применяем параметры
        if (this.parameterEditor) {
            this.parameterEditor.setConfiguration(config);
        }

        // Применяем attachment points
        if (this.attachmentEditor) {
            this.attachmentEditor.setAttachmentPoints(
                config.turretPivot,
                config.barrelMount
            );
        }

        // Применяем цвета
        if (this.visualEditor && config.visual) {
            this.visualEditor.setColors(config.visual);
        }

        // Устанавливаем имя
        const nameInput = document.getElementById('tank-name') as HTMLInputElement;
        if (nameInput) {
            nameInput.value = config.name;
        }
    }

    private testTank(): void {
        // Собираем текущую конфигурацию
        const paramConfig = this.parameterEditor?.getConfiguration() || {};
        const attachmentPoints = this.attachmentEditor?.getAttachmentPoints() || {
            turretPivot: { x: 0, y: 0, z: 0 },
            barrelMount: { x: 0, y: 0, z: 0 }
        };
        const colors = this.visualEditor?.getColors() || {
            chassisColor: '#00ff00',
            turretColor: '#00ff00',
            barrelColor: '#888888'
        };

        const nameInput = document.getElementById('tank-name') as HTMLInputElement;
        const name = nameInput?.value || 'Test Tank';

        const config: CustomTankConfiguration = {
            id: `test_${Date.now()}`,
            name,
            baseModel: this.currentConfig.baseModel || {
                chassisId: 'standard',
                cannonId: 'standard',
                trackId: 'standard'
            },
            turretPivot: attachmentPoints.turretPivot,
            barrelMount: attachmentPoints.barrelMount,
            movement: paramConfig.movement || this.currentConfig.movement || {
                maxForwardSpeed: 24,
                maxBackwardSpeed: 12,
                acceleration: 20,
                deceleration: 30,
                turnSpeed: 60,
                pivotTurnMultiplier: 1.5
            },
            combat: paramConfig.combat || this.currentConfig.combat || {
                damage: 25,
                cooldown: 1000,
                projectileSpeed: 50,
                projectileSize: 0.2,
                maxRange: 200
            },
            physics: paramConfig.physics || this.currentConfig.physics || {
                mass: 50000,
                hoverHeight: 1.0,
                hoverStiffness: 7000
            },
            turret: paramConfig.turret || this.currentConfig.turret || {
                turretSpeed: 0.08,
                barrelPitchSpeed: 0.05
            },
            special: paramConfig.special || this.currentConfig.special || {
                modules: []
            },
            visual: colors,
            createdAt: Date.now(),
            modifiedAt: Date.now()
        };

        // Сохраняем во временное хранилище для теста
        localStorage.setItem('testCustomTank', JSON.stringify(config));
        alert('Танк сохранён для теста. Перезапустите игру (респавн) чтобы применить изменения.');
        console.log('[Workshop] Test tank saved:', config);
    }

    show(): void {
        if (this.overlay) {
            this.overlay.classList.remove('hidden');
            this.overlay.classList.add('visible');
            // Блокируем взаимодействие с игрой когда Workshop открыт
            if (this.overlay.style) {
                this.overlay.style.pointerEvents = 'auto';
            }
        }
    }

    hide(): void {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
            this.overlay.classList.remove('visible');
            // Восстанавливаем взаимодействие с игрой
            if (this.overlay.style) {
                this.overlay.style.pointerEvents = 'none';
            }
        }
    }

    isVisible(): boolean {
        return this.overlay !== null && !this.overlay.classList.contains('hidden');
    }

    dispose(): void {
        // Удаляем обработчик ESC
        if (this.escHandler) {
            window.removeEventListener('keydown', this.escHandler, { capture: true });
            this.escHandler = null;
        }

        if (this.transformEditor) {
            this.transformEditor.dispose();
        }

        if (this.attachmentEditor) {
            this.attachmentEditor.dispose();
        }

        if (this.previewScene) {
            cleanupPreviewScene(this.previewScene);
            this.previewScene = null;
        }

        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}

export default WorkshopUI;

