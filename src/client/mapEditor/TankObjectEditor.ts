/**
 * @module mapEditor/TankObjectEditor
 * @description Редактор танка как объекта в MapEditor
 * 
 * Объединяет все компоненты Workshop: GizmoSystem, DirectManipulation, 
 * WorkshopPropertiesPanel, AttachmentMarkers, ContextMenu
 */

import {
    Scene,
    Mesh,
    Vector3
} from "@babylonjs/core";
import { PlacedObject } from "../mapEditor";
import { inGameAlert, inGameConfirm } from "../utils/inGameDialogs";
import GizmoSystem, { GizmoMode, GizmoTransform } from "./GizmoSystem";
import DirectManipulation, { DirectManipulationOptions } from "./DirectManipulation";
import WorkshopPropertiesPanel, { WorkshopConfig } from "./WorkshopPropertiesPanel";
import AttachmentMarkers, { AttachmentPoints } from "./AttachmentMarkers";
import ContextMenu, { ContextMenuOption } from "./ContextMenu";
import { logger } from "../utils/logger";

export class TankObjectEditor {
    private scene: Scene;
    private targetObject: PlacedObject | null = null;
    private targetMesh: Mesh | null = null;
    
    // Components
    private gizmoSystem: GizmoSystem;
    private directManipulation: DirectManipulation;
    private propertiesPanel: WorkshopPropertiesPanel;
    private attachmentMarkers: AttachmentMarkers;
    private contextMenu: ContextMenu;
    
    // State
    private currentGizmoMode: GizmoMode = "none";
    private isActive: boolean = false;
    private propertiesPanelContainer: HTMLDivElement | null = null;
    
    // Callbacks
    private onObjectChange: ((obj: PlacedObject) => void) | null = null;
    private onClose: (() => void) | null = null;
    
    constructor(scene: Scene, propertiesPanelContainer: HTMLDivElement) {
        this.scene = scene;
        this.propertiesPanelContainer = propertiesPanelContainer;
        
        // Инициализируем компоненты
        this.gizmoSystem = new GizmoSystem(scene);
        this.directManipulation = new DirectManipulation(scene);
        this.propertiesPanel = new WorkshopPropertiesPanel(propertiesPanelContainer);
        this.attachmentMarkers = new AttachmentMarkers(scene);
        this.contextMenu = new ContextMenu();
        
        // Настраиваем связи между компонентами
        this.setupConnections();
    }
    
    private setupConnections(): void {
        // Gizmo изменения → обновление объекта
        this.gizmoSystem.setOnTransformChange((transform) => {
            if (this.targetObject && this.targetMesh) {
                this.targetObject.position = {
                    x: transform.position.x,
                    y: transform.position.y,
                    z: transform.position.z
                };
                this.targetObject.rotation = {
                    x: transform.rotation.x,
                    y: transform.rotation.y,
                    z: transform.rotation.z
                };
                if (!this.targetObject.scale) {
                    this.targetObject.scale = { x: 1, y: 1, z: 1 };
                }
                this.targetObject.scale = {
                    x: transform.scale.x,
                    y: transform.scale.y,
                    z: transform.scale.z
                };
                
                // Обновляем панель свойств
                this.updatePropertiesPanelFromObject();
                
                if (this.onObjectChange) {
                    this.onObjectChange(this.targetObject);
                }
            }
        });
        
        // Direct manipulation изменения → обновление объекта
        this.directManipulation.setOnTransformChange((position) => {
            if (this.targetObject && this.targetMesh) {
                this.targetObject.position = {
                    x: position.x,
                    y: position.y,
                    z: position.z
                };
                
                if (this.onObjectChange) {
                    this.onObjectChange(this.targetObject);
                }
            }
        });
        
        // Properties panel изменения → обновление объекта
        this.propertiesPanel.setOnChange((config) => {
            if (this.targetObject) {
                if (!this.targetObject.properties) {
                    this.targetObject.properties = {};
                }
                if (!this.targetObject.properties.workshopConfig) {
                    this.targetObject.properties.workshopConfig = {};
                }
                
                // Сохраняем конфигурацию в объект
                (this.targetObject.properties as any).workshopConfig = config;
                
                if (this.onObjectChange) {
                    this.onObjectChange(this.targetObject);
                }
            }
        });
        
        // Attachment markers изменения → обновление объекта
        this.attachmentMarkers.setOnChange((points) => {
            if (this.targetObject) {
                if (!this.targetObject.properties) {
                    this.targetObject.properties = {};
                }
                if (!this.targetObject.properties.workshopConfig) {
                    this.targetObject.properties.workshopConfig = {};
                }
                
                const config = (this.targetObject.properties as any).workshopConfig as WorkshopConfig;
                if (!config.attachments) {
                    config.attachments = {};
                }
                
                config.attachments.turretPivot = {
                    x: points.turretPivot.x,
                    y: points.turretPivot.y,
                    z: points.turretPivot.z
                };
                config.attachments.barrelMount = {
                    x: points.barrelMount.x,
                    y: points.barrelMount.y,
                    z: points.barrelMount.z
                };
                
                if (this.onObjectChange) {
                    this.onObjectChange(this.targetObject);
                }
            }
        });
        
        // Кнопка тестирования на полигоне
        this.propertiesPanel.setOnTest(() => {
            this.testOnPolygon();
        });
    }
    
    /**
     * Установить целевой объект для редактирования
     */
    setTarget(object: PlacedObject, mesh: Mesh): void {
        this.targetObject = object;
        this.targetMesh = mesh;
        
        // Устанавливаем целевые объекты для компонентов
        this.gizmoSystem.setTarget(mesh);
        this.directManipulation.setTarget(mesh);
        this.attachmentMarkers.setParentMesh(mesh);
        
        // Загружаем конфигурацию из объекта
        this.loadConfigurationFromObject();
        
        // Показываем компоненты
        this.setVisible(true);
    }
    
    /**
     * Загрузить конфигурацию из объекта
     */
    private loadConfigurationFromObject(): void {
        if (!this.targetObject) return;
        
        const config = (this.targetObject.properties as any)?.workshopConfig as WorkshopConfig | undefined;
        
        if (config) {
            this.propertiesPanel.setConfig(config);
            
            // Загружаем attachment points
            if (config.attachments) {
                this.attachmentMarkers.setAttachmentPoints({
                    turretPivot: config.attachments.turretPivot 
                        ? new Vector3(config.attachments.turretPivot.x, config.attachments.turretPivot.y, config.attachments.turretPivot.z)
                        : Vector3.Zero(),
                    barrelMount: config.attachments.barrelMount
                        ? new Vector3(config.attachments.barrelMount.x, config.attachments.barrelMount.y, config.attachments.barrelMount.z)
                        : Vector3.Zero()
                });
            }
        } else {
            // Используем значения по умолчанию
            const defaultConfig: WorkshopConfig = {
                movement: {
                    maxForwardSpeed: 24,
                    maxBackwardSpeed: 12,
                    acceleration: 20,
                    deceleration: 30,
                    turnSpeed: 60,
                    pivotTurnMultiplier: 1.5
                },
                combat: {
                    damage: 25,
                    cooldown: 1000,
                    projectileSpeed: 50,
                    projectileSize: 0.2,
                    maxRange: 200
                },
                physics: {
                    mass: 50000,
                    hoverHeight: 1.0,
                    hoverStiffness: 7000
                },
                turret: {
                    turretSpeed: 0.08,
                    barrelPitchSpeed: 0.05
                },
                visual: {
                    chassisColor: '#00ff00',
                    turretColor: '#00ff00',
                    barrelColor: '#888888'
                },
                attachments: {
                    turretPivot: { x: 0, y: 0, z: 0 },
                    barrelMount: { x: 0, y: 0, z: 0 }
                }
            };
            
            this.propertiesPanel.setConfig(defaultConfig);
            this.attachmentMarkers.setAttachmentPoints({
                turretPivot: Vector3.Zero(),
                barrelMount: Vector3.Zero()
            });
        }
    }
    
    /**
     * Обновить панель свойств из объекта
     */
    private updatePropertiesPanelFromObject(): void {
        // Панель обновляется автоматически через callbacks
        // Этот метод можно использовать для принудительного обновления если нужно
    }
    
    /**
     * Установить режим gizmo
     */
    setGizmoMode(mode: GizmoMode): void {
        this.currentGizmoMode = mode;
        this.gizmoSystem.setMode(mode);
        
        // При переключении режима gizmo отключаем direct manipulation
        if (mode !== "none") {
            this.directManipulation.setOptions({ lockAxis: null });
        }
    }
    
    /**
     * Обработка событий мыши
     */
    handlePointerDown(x: number, y: number, button: number): boolean {
        // Правый клик → контекстное меню
        if (button === 2) {
            return this.handleRightClick(x, y);
        }
        
        // Левый клик
        if (button === 0) {
            // Проверяем gizmo
            const gizmoAxis = this.gizmoSystem.handlePointerDown(x, y);
            if (gizmoAxis !== "none") {
                return true;
            }
            
            // Проверяем attachment markers
            if (this.attachmentMarkers.handlePointerDown(x, y)) {
                return true;
            }
            
            // Проверяем direct manipulation
            if (this.directManipulation.startDrag(x, y)) {
                return true;
            }
        }
        
        return false;
    }
    
    handlePointerMove(x: number, y: number): void {
        // Обновляем gizmo
        this.gizmoSystem.handlePointerMove(x, y);
        
        // Обновляем direct manipulation
        this.directManipulation.updateDrag(x, y);
        
        // Обновляем attachment markers
        this.attachmentMarkers.handlePointerMove(x, y);
    }
    
    handlePointerUp(): void {
        this.gizmoSystem.handlePointerUp();
        this.directManipulation.endDrag();
        this.attachmentMarkers.handlePointerUp();
    }
    
    /**
     * Обработка правого клика для контекстного меню
     */
    private handleRightClick(x: number, y: number): boolean {
        if (!this.targetObject) return false;
        
        const options: ContextMenuOption[] = [
            {
                id: "edit-workshop",
                label: "Редактировать в Workshop",
                icon: "⚙️",
                action: () => {
                    // Уже в режиме редактирования
                }
            },
            {
                id: "gizmo-translate",
                label: "Режим перемещения",
                icon: "↔️",
                action: () => {
                    this.setGizmoMode("translate");
                }
            },
            {
                id: "gizmo-rotate",
                label: "Режим поворота",
                icon: "🔄",
                action: () => {
                    this.setGizmoMode("rotate");
                }
            },
            {
                id: "gizmo-scale",
                label: "Режим масштабирования",
                icon: "📏",
                action: () => {
                    this.setGizmoMode("scale");
                }
            },
            {
                id: "gizmo-none",
                label: "Прямое перетаскивание",
                icon: "🖱️",
                action: () => {
                    this.setGizmoMode("none");
                }
            },
            {
                id: "toggle-attachments",
                label: "Показать точки крепления",
                icon: "📍",
                action: () => {
                    const visible = this.attachmentMarkers.getVisible();
                    this.attachmentMarkers.setVisible(!visible);
                }
            },
            {
                id: "close",
                label: "Закрыть редактор",
                icon: "✕",
                action: () => {
                    this.close();
                }
            }
        ];
        
        this.contextMenu.show(x, y, options);
        return true;
    }
    
    /**
     * Установить callback для изменений объекта
     */
    setOnObjectChange(callback: (obj: PlacedObject) => void): void {
        this.onObjectChange = callback;
    }
    
    /**
     * Установить callback для закрытия
     */
    setOnClose(callback: () => void): void {
        this.onClose = callback;
    }
    
    /**
     * Показать/скрыть редактор
     */
    setVisible(visible: boolean): void {
        this.isActive = visible;
        
        this.gizmoSystem.setVisible(visible);
        this.propertiesPanel.setVisible(visible);
        this.attachmentMarkers.setVisible(visible);
        
        if (!visible) {
            this.contextMenu.hide();
        }
    }
    
    /**
     * Обновить редактор (вызывать каждый кадр)
     */
    update(): void {
        if (!this.isActive) return;
        
        this.gizmoSystem.update();
        this.attachmentMarkers.update();
    }
    
    /**
     * Закрыть редактор
     */
    close(): void {
        this.setVisible(false);
        this.targetObject = null;
        this.targetMesh = null;
        
        if (this.onClose) {
            this.onClose();
        }
    }
    
    /**
     * Получить текущую конфигурацию
     */
    getConfiguration(): WorkshopConfig {
        return this.propertiesPanel.getConfig();
    }
    
    /**
     * Получить точки крепления
     */
    getAttachmentPoints(): AttachmentPoints {
        return this.attachmentMarkers.getAttachmentPoints();
    }
    
    /**
     * Проверить, активен ли редактор
     */
    isEditorActive(): boolean {
        return this.isActive;
    }
    
    /**
     * Тестирование на полигоне
     */
    private testOnPolygon(): void {
        if (!this.targetObject) {
            inGameAlert('Выберите танк для тестирования!', 'Редактор').catch(() => {});
            return;
        }
        
        // Получаем текущую конфигурацию
        const config = (this.targetObject.properties as any)?.workshopConfig as WorkshopConfig | undefined;
        
        if (!config) {
            inGameAlert('Нет конфигурации для тестирования! Настройте параметры танка.', 'Редактор').catch(() => {});
            return;
        }
        
        // Сохраняем конфигурацию для теста
        const testConfig = {
            ...config,
            testMode: true,
            testMap: 'polygon', // Используем полигон для тестирования
            objectId: this.targetObject.id,
            objectType: this.targetObject.type
        };
        
        // Сохраняем в localStorage для загрузки в игре
        localStorage.setItem('workshopTestConfig', JSON.stringify(testConfig));
        localStorage.setItem('workshopTestMap', 'polygon');
        localStorage.setItem('workshopTestRequested', 'true');
        localStorage.setItem('workshopTestObjectId', this.targetObject.id);
        
        // Показываем инструкцию
        inGameConfirm(
            'Конфигурация сохранена для теста на полигоне!\n\nЗакройте редактор карт и запустите игру на карте "Полигон" для тестирования.\n\nХотите открыть меню игры сейчас?',
            'Тест на полигоне'
        ).then((confirmed) => {
            if (!confirmed) return;
            const gameWindow = window as any;
            if (gameWindow.game && gameWindow.game.mainMenu) {
                if (this.onClose) this.onClose();
                if (gameWindow.game.mainMenu.show) gameWindow.game.mainMenu.show();
            } else {
                inGameAlert('Меню игры не найдено. Закройте редактор карт вручную и запустите игру.', 'Редактор').catch(() => {});
            }
        }).catch(() => {});
        
        logger.log('[Workshop] Test config saved:', testConfig);
    }
    
    /**
     * Очистить ресурсы
     */
    dispose(): void {
        this.gizmoSystem.dispose();
        this.directManipulation.endDrag();
        this.propertiesPanel.dispose();
        this.attachmentMarkers.dispose();
        this.contextMenu.dispose();
        
        this.targetObject = null;
        this.targetMesh = null;
        this.onObjectChange = null;
        this.onClose = null;
    }
}

export default TankObjectEditor;

