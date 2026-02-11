import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, LinesMesh } from "@babylonjs/core";

/**
 * Система визуализации рассинхронизации для отладки
 * Рисует линию между текущей позицией клиента и полученной позицией сервера
 */
export class SyncDebugVisualizer {
    private scene: Scene;
    private isEnabled: boolean = false;

    // Визуальные элементы
    private serverGhostMesh: Mesh | null = null;
    private syncLine: LinesMesh | null = null;

    // Материалы
    private ghostMaterial: StandardMaterial;

    constructor(scene: Scene) {
        this.scene = scene;

        // Создаем материал для призрака (полупрозрачный красный)
        this.ghostMaterial = new StandardMaterial("serverGhostMat", scene);
        this.ghostMaterial.diffuseColor = new Color3(1, 0, 0);
        this.ghostMaterial.alpha = 0.3;
        this.ghostMaterial.wireframe = true;
    }

    /**
     * Включить/выключить визуализацию
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;

        if (!enabled) {
            this.cleanup();
        }
    }

    /**
     * Проверить, включена ли визуализация
     */
    getEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Обновить визуализацию
     * @param clientPos Текущая позиция клиента
     * @param serverPos Последняя известная позиция сервера (из snapshot)
     */
    update(clientPos: Vector3, serverPos: Vector3): void {
        if (!this.isEnabled) return;

        // 1. Создаем или обновляем призрака сервера (просто куб для начала)
        if (!this.serverGhostMesh) {
            this.serverGhostMesh = MeshBuilder.CreateBox("serverGhost", { size: 2 }, this.scene);
            this.serverGhostMesh.material = this.ghostMaterial;
            this.serverGhostMesh.isPickable = false;
        }

        this.serverGhostMesh.position.copyFrom(serverPos);

        // 2. Рисуем линию синхронизации
        const distance = Vector3.Distance(clientPos, serverPos);

        // Цвет линии зависит от расстояния (расхождения)
        let color: Color3;
        if (distance < 0.5) {
            color = new Color3(0, 1, 0); // Зеленый - ОК
        } else if (distance < 2.0) {
            color = new Color3(1, 1, 0); // Желтый - Внимание
        } else {
            color = new Color3(1, 0, 0); // Красный - ЛАГ / Рассинхрон
        }

        const points = [clientPos, serverPos];

        if (this.syncLine) {
            this.syncLine = MeshBuilder.CreateLines("syncLine", {
                points: points,
                instance: this.syncLine,
                colors: [color.toColor4(), color.toColor4()]
            });
        } else {
            this.syncLine = MeshBuilder.CreateLines("syncLine", {
                points: points,
                colors: [color.toColor4(), color.toColor4()],
                updatable: true
            }, this.scene);
        }
    }

    /**
     * Очистка ресурсов
     */
    cleanup(): void {
        if (this.serverGhostMesh) {
            this.serverGhostMesh.dispose();
            this.serverGhostMesh = null;
        }

        if (this.syncLine) {
            this.syncLine.dispose();
            this.syncLine = null;
        }
    }

    dispose(): void {
        this.cleanup();
        this.ghostMaterial.dispose();
    }
}
