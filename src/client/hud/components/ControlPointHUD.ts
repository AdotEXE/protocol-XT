/**
 * @module hud/components/ControlPointHUD
 * @description HUD компонент для режима Control Point
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface ControlPointData {
    id: string;
    position: { x: number; y: number; z: number };
    team: number | null; // 0, 1, or null (neutral)
    captureProgress: number; // 0-100
    isContested: boolean;
}

export interface ControlPointHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    team0Color: string;
    team1Color: string;
    neutralColor: string;
    fontSize: number;
    top: number;
    right: number;
}

export const DEFAULT_CONFIG: ControlPointHUDConfig = {
    containerWidth: 280,
    containerHeight: 200,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    team0Color: "#4444ff",
    team1Color: "#ff4444",
    neutralColor: "#888888",
    fontSize: 11,
    top: 20,
    right: 20
};

export class ControlPointHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: ControlPointHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private team0ScoreText: TextBlock | null = null;
    private team1ScoreText: TextBlock | null = null;
    private points: Map<string, {
        container: Rectangle;
        nameText: TextBlock;
        progressBar: Rectangle;
        progressFill: Rectangle;
        statusText: TextBlock;
    }> = new Map();
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<ControlPointHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("cpHUDContainer");
        this.container.width = `${this.config.containerWidth}px`;
        this.container.height = `${this.config.containerHeight}px`;
        this.container.background = this.config.backgroundColor;
        this.container.thickness = 2;
        this.container.color = "#0f0";
        this.container.cornerRadius = 4;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = `${this.config.top}px`;
        this.container.left = `-${this.config.right}px`;
        this.container.isVisible = false;
        this.container.zIndex = 200;
        this.guiTexture.addControl(this.container);

        // Заголовок
        this.titleText = new TextBlock("cpHUDTitle");
        this.titleText.text = "📍 КОНТРОЛЬНЫЕ ТОЧКИ";
        this.titleText.color = "#0f0";
        this.titleText.fontSize = this.config.fontSize + 1;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.titleText.left = "10px";
        this.container.addControl(this.titleText);

        // Счет команд
        this.team0ScoreText = new TextBlock("cpTeam0Score");
        this.team0ScoreText.text = "Синие: 0";
        this.team0ScoreText.color = this.config.team0Color;
        this.team0ScoreText.fontSize = this.config.fontSize;
        this.team0ScoreText.fontFamily = "'Press Start 2P', monospace";
        this.team0ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team0ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team0ScoreText.top = "35px";
        this.team0ScoreText.left = "10px";
        this.container.addControl(this.team0ScoreText);

        this.team1ScoreText = new TextBlock("cpTeam1Score");
        this.team1ScoreText.text = "Красные: 0";
        this.team1ScoreText.color = this.config.team1Color;
        this.team1ScoreText.fontSize = this.config.fontSize;
        this.team1ScoreText.fontFamily = "'Press Start 2P', monospace";
        this.team1ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team1ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team1ScoreText.top = "55px";
        this.team1ScoreText.left = "10px";
        this.container.addControl(this.team1ScoreText);
    }

    update(data: {
        points: ControlPointData[];
        team0Score: number;
        team1Score: number;
        maxScore: number;
    }): void {
        if (!this.container || !this.isVisible) return;

        // Обновляем счет команд
        if (this.team0ScoreText) {
            this.team0ScoreText.text = `Синие: ${data.team0Score}/${data.maxScore}`;
        }
        if (this.team1ScoreText) {
            this.team1ScoreText.text = `Красные: ${data.team1Score}/${data.maxScore}`;
        }

        // Обновляем точки
        let yOffset = 80;
        for (const point of data.points) {
            let pointUI = this.points.get(point.id);
            if (!pointUI) {
                pointUI = this.createPointUI(point.id, yOffset);
                this.points.set(point.id, pointUI);
            }

            // Название точки
            pointUI.nameText.text = `Точка ${point.id.toUpperCase()}`;
            
            // Цвет в зависимости от команды
            const color = point.team === 0 ? this.config.team0Color : 
                         point.team === 1 ? this.config.team1Color : 
                         this.config.neutralColor;
            pointUI.nameText.color = color;

            // Прогресс захвата
            pointUI.progressFill.width = `${point.captureProgress}%`;
            pointUI.progressFill.background = color;

            // Статус
            if (point.isContested) {
                pointUI.statusText.text = "⚔ ОСПАРИВАЕТСЯ";
                pointUI.statusText.color = "#ffff00";
            } else if (point.team === null) {
                pointUI.statusText.text = "⚪ НЕЙТРАЛЬНА";
                pointUI.statusText.color = this.config.neutralColor;
            } else {
                pointUI.statusText.text = point.team === 0 ? "🔵 ЗАХВАЧЕНА" : "🔴 ЗАХВАЧЕНА";
                pointUI.statusText.color = color;
            }

            yOffset += 35;
        }
    }

    private createPointUI(pointId: string, yOffset: number): {
        container: Rectangle;
        nameText: TextBlock;
        progressBar: Rectangle;
        progressFill: Rectangle;
        statusText: TextBlock;
    } {
        const container = new Rectangle(`cpPoint_${pointId}`);
        container.width = "260px";
        container.height = "30px";
        container.background = "transparent";
        container.thickness = 0;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.top = `${yOffset}px`;
        container.left = "10px";
        this.container!.addControl(container);

        const nameText = new TextBlock(`cpPointName_${pointId}`);
        nameText.text = `Точка ${pointId.toUpperCase()}`;
        nameText.color = "#fff";
        nameText.fontSize = this.config.fontSize - 2;
        nameText.fontFamily = "'Press Start 2P', monospace";
        nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        nameText.top = "0px";
        nameText.left = "0px";
        container.addControl(nameText);

        const progressBar = new Rectangle(`cpProgressBar_${pointId}`);
        progressBar.width = "260px";
        progressBar.height = "4px";
        progressBar.background = "rgba(255, 255, 255, 0.2)";
        progressBar.thickness = 0;
        progressBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        progressBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        progressBar.top = "12px";
        progressBar.left = "0px";
        container.addControl(progressBar);

        const progressFill = new Rectangle(`cpProgressFill_${pointId}`);
        progressFill.width = "0%";
        progressFill.height = "4px";
        progressFill.background = "#0f0";
        progressFill.thickness = 0;
        progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        progressFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        progressFill.top = "0px";
        progressFill.left = "0px";
        progressBar.addControl(progressFill);

        const statusText = new TextBlock(`cpStatus_${pointId}`);
        statusText.text = "⚪ НЕЙТРАЛЬНА";
        statusText.color = "#888";
        statusText.fontSize = this.config.fontSize - 3;
        statusText.fontFamily = "'Press Start 2P', monospace";
        statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        statusText.top = "18px";
        statusText.left = "0px";
        container.addControl(statusText);

        return { container, nameText, progressBar, progressFill, statusText };
    }

    show(): void {
        if (this.container) {
            this.container.isVisible = true;
            this.isVisible = true;
        }
    }

    hide(): void {
        if (this.container) {
            this.container.isVisible = false;
            this.isVisible = false;
        }
    }

    dispose(): void {
        this.points.forEach(point => {
            point.container.dispose();
        });
        this.points.clear();
        if (this.container) {
            this.container.dispose();
            this.container = null;
        }
        this.titleText = null;
        this.team0ScoreText = null;
        this.team1ScoreText = null;
    }
}
