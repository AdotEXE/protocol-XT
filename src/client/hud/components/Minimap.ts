/**
 * @module hud/components/Minimap
 * @description Компонент радара/миникарты
 */

import { AdvancedDynamicTexture, Rectangle, Ellipse, TextBlock, Control, Line } from "@babylonjs/gui";
import { HUD_COLORS, HUD_SIZES } from "../HUDConstants";

/**
 * Конфигурация миникарты
 */
export interface MinimapConfig {
    /** Размер в пикселях */
    size: number;
    /** Масштаб (метров на пиксель) */
    scale: number;
    /** Показывать ли сетку */
    showGrid: boolean;
    /** Показывать ли направление */
    showDirection: boolean;
    /** Показывать ли сканирующую линию */
    showScanLine: boolean;
    /** Цвет фона */
    backgroundColor: string;
    /** Цвет игрока */
    playerColor: string;
    /** Цвет врагов */
    enemyColor: string;
    /** Цвет союзников */
    allyColor: string;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_MINIMAP_CONFIG: MinimapConfig = {
    size: HUD_SIZES.MINIMAP_SIZE,
    scale: 2,
    showGrid: true,
    showDirection: true,
    showScanLine: true,
    backgroundColor: HUD_COLORS.MINIMAP_BG,
    playerColor: HUD_COLORS.MINIMAP_PLAYER,
    enemyColor: HUD_COLORS.MINIMAP_ENEMY,
    allyColor: HUD_COLORS.MINIMAP_ALLY
};

/**
 * Маркер на миникарте
 */
export interface MinimapMarker {
    id: string;
    x: number;
    z: number;
    type: "player" | "enemy" | "ally" | "poi" | "objective";
    icon?: string;
    element?: Ellipse;
}

/**
 * Компонент миникарты
 */
export class Minimap {
    private container: Rectangle;
    private background: Ellipse;
    private playerMarker: Ellipse;
    private directionIndicator: Rectangle | null = null;
    private scanLine: Rectangle | null = null;
    private gridLines: Line[] = [];
    private markers: Map<string, MinimapMarker> = new Map();
    private markerElements: Map<string, Ellipse> = new Map();
    private config: MinimapConfig;
    
    private playerX: number = 0;
    private playerZ: number = 0;
    private playerRotation: number = 0;
    private scanAngle: number = 0;
    
    constructor(parent: AdvancedDynamicTexture, config: Partial<MinimapConfig> = {}) {
        this.config = { ...DEFAULT_MINIMAP_CONFIG, ...config };
        
        const size = this.config.size;
        
        // Контейнер
        this.container = new Rectangle("minimapContainer");
        this.container.width = `${size + 20}px`;
        this.container.height = `${size + 20}px`;
        this.container.thickness = 0;
        this.container.background = "transparent";
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = "10px";
        this.container.left = "-10px";
        parent.addControl(this.container);
        
        // Фон радара (круглый)
        this.background = new Ellipse("minimapBg");
        this.background.width = `${size}px`;
        this.background.height = `${size}px`;
        this.background.background = this.config.backgroundColor;
        this.background.thickness = 2;
        this.background.color = HUD_COLORS.PRIMARY;
        this.container.addControl(this.background);
        
        // Сетка
        if (this.config.showGrid) {
            this.createGrid(size);
        }
        
        // Сканирующая линия
        if (this.config.showScanLine) {
            this.createScanLine(size);
        }
        
        // Маркер игрока (в центре)
        this.playerMarker = new Ellipse("playerMarker");
        this.playerMarker.width = "8px";
        this.playerMarker.height = "8px";
        this.playerMarker.background = this.config.playerColor;
        this.playerMarker.thickness = 0;
        this.playerMarker.shadowColor = this.config.playerColor;
        this.playerMarker.shadowBlur = 10;
        this.background.addControl(this.playerMarker);
        
        // Индикатор направления
        if (this.config.showDirection) {
            this.createDirectionIndicator();
        }
    }
    
    /**
     * Создать сетку
     */
    private createGrid(size: number): void {
        const center = size / 2;
        const gridSpacing = size / 4;
        
        // Концентрические круги
        for (let i = 1; i <= 3; i++) {
            const circle = new Ellipse(`gridCircle${i}`);
            const circleSize = gridSpacing * i * 2;
            circle.width = `${circleSize}px`;
            circle.height = `${circleSize}px`;
            circle.thickness = 1;
            circle.color = "rgba(0, 255, 0, 0.2)";
            circle.background = "transparent";
            this.background.addControl(circle);
        }
        
        // Крестовина
        const crossV = new Rectangle("gridCrossV");
        crossV.width = "1px";
        crossV.height = `${size - 10}px`;
        crossV.background = "rgba(0, 255, 0, 0.2)";
        crossV.thickness = 0;
        this.background.addControl(crossV);
        
        const crossH = new Rectangle("gridCrossH");
        crossH.width = `${size - 10}px`;
        crossH.height = "1px";
        crossH.background = "rgba(0, 255, 0, 0.2)";
        crossH.thickness = 0;
        this.background.addControl(crossH);
    }
    
    /**
     * Создать сканирующую линию
     */
    private createScanLine(size: number): void {
        this.scanLine = new Rectangle("scanLine");
        this.scanLine.width = "2px";
        this.scanLine.height = `${size / 2}px`;
        this.scanLine.background = `linear-gradient(${HUD_COLORS.PRIMARY}, transparent)`;
        this.scanLine.thickness = 0;
        this.scanLine.transformCenterY = 1;
        this.scanLine.top = `${-size / 4}px`;
        this.background.addControl(this.scanLine);
    }
    
    /**
     * Создать индикатор направления
     */
    private createDirectionIndicator(): void {
        this.directionIndicator = new Rectangle("directionIndicator");
        this.directionIndicator.width = "6px";
        this.directionIndicator.height = "20px";
        this.directionIndicator.background = this.config.playerColor;
        this.directionIndicator.thickness = 0;
        this.directionIndicator.top = "-15px";
        this.playerMarker.addControl(this.directionIndicator);
    }
    
    /**
     * Обновить позицию игрока
     */
    setPlayerPosition(x: number, z: number, rotation: number): void {
        this.playerX = x;
        this.playerZ = z;
        this.playerRotation = rotation;
        
        // Обновить направление
        if (this.directionIndicator) {
            this.directionIndicator.rotation = rotation;
        }
        
        // Обновить позиции маркеров относительно игрока
        this.updateMarkerPositions();
    }
    
    /**
     * Добавить маркер
     */
    addMarker(marker: MinimapMarker): void {
        this.markers.set(marker.id, marker);
        
        const element = new Ellipse(`marker_${marker.id}`);
        element.width = "6px";
        element.height = "6px";
        element.thickness = 0;
        
        switch (marker.type) {
            case "enemy":
                element.background = this.config.enemyColor;
                break;
            case "ally":
                element.background = this.config.allyColor;
                break;
            case "poi":
                element.background = HUD_COLORS.MINIMAP_POI;
                break;
            default:
                element.background = "#ffffff";
        }
        
        this.background.addControl(element);
        this.markerElements.set(marker.id, element);
        
        this.updateMarkerPosition(marker.id);
    }
    
    /**
     * Удалить маркер
     */
    removeMarker(id: string): void {
        const element = this.markerElements.get(id);
        if (element) {
            element.dispose();
            this.markerElements.delete(id);
        }
        this.markers.delete(id);
    }
    
    /**
     * Обновить позицию маркера
     */
    updateMarker(id: string, x: number, z: number): void {
        const marker = this.markers.get(id);
        if (marker) {
            marker.x = x;
            marker.z = z;
            this.updateMarkerPosition(id);
        }
    }
    
    /**
     * Обновить позицию конкретного маркера
     */
    private updateMarkerPosition(id: string): void {
        const marker = this.markers.get(id);
        const element = this.markerElements.get(id);
        
        if (!marker || !element) return;
        
        // Вычислить позицию относительно игрока
        const dx = marker.x - this.playerX;
        const dz = marker.z - this.playerZ;
        
        // Применить масштаб
        const screenX = dx / this.config.scale;
        const screenZ = dz / this.config.scale;
        
        // Ограничить радиусом миникарты
        const maxRadius = this.config.size / 2 - 10;
        const dist = Math.sqrt(screenX * screenX + screenZ * screenZ);
        
        if (dist > maxRadius) {
            const scale = maxRadius / dist;
            element.left = `${screenX * scale}px`;
            element.top = `${-screenZ * scale}px`;
            element.alpha = 0.5; // Затемнить дальние маркеры
        } else {
            element.left = `${screenX}px`;
            element.top = `${-screenZ}px`;
            element.alpha = 1;
        }
    }
    
    /**
     * Обновить все позиции маркеров
     */
    private updateMarkerPositions(): void {
        for (const id of this.markers.keys()) {
            this.updateMarkerPosition(id);
        }
    }
    
    /**
     * Обновить компонент
     */
    update(deltaTime: number): void {
        // Анимация сканирующей линии
        if (this.scanLine) {
            this.scanAngle += deltaTime * Math.PI; // 1 оборот в секунду
            if (this.scanAngle > Math.PI * 2) {
                this.scanAngle -= Math.PI * 2;
            }
            this.scanLine.rotation = this.scanAngle;
        }
    }
    
    /**
     * Очистить все маркеры
     */
    clearMarkers(): void {
        for (const [id, element] of this.markerElements) {
            element.dispose();
        }
        this.markerElements.clear();
        this.markers.clear();
    }
    
    /**
     * Показать/скрыть
     */
    setVisible(visible: boolean): void {
        this.container.isVisible = visible;
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.clearMarkers();
        this.container.dispose();
    }
}

export default Minimap;

