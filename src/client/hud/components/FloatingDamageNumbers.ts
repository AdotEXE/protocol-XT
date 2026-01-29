/**
 * FloatingDamageNumbers - Плавающие числа урона
 * Показывает урон в точке попадания с анимацией
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";
import { Vector3, Scene, Camera, Viewport } from "@babylonjs/core";

export interface DamageNumberConfig {
    maxNumbers: number;        // Максимум одновременных чисел
    fontSize: number;          // Базовый размер шрифта
    criticalMultiplier: number; // Множитель размера для критов
    displayTime: number;       // Время показа (мс)
    floatSpeed: number;        // Скорость подъёма (пикселей в секунду)
    fadeTime: number;          // Время затухания (мс)
    dealtColor: string;        // Цвет нанесённого урона
    receivedColor: string;     // Цвет полученного урона
    criticalColor: string;     // Цвет критического урона
    healColor: string;         // Цвет лечения
}

export const DEFAULT_DAMAGE_NUMBER_CONFIG: DamageNumberConfig = {
    maxNumbers: 15,
    fontSize: 20,
    criticalMultiplier: 1.4,
    displayTime: 1200,
    floatSpeed: 60,
    fadeTime: 400,
    dealtColor: "#ffff00",      // Жёлтый - нанесённый урон
    receivedColor: "#ff4444",   // Красный - полученный урон
    criticalColor: "#ff8800",   // Оранжевый - критический урон
    healColor: "#44ff44"        // Зелёный - лечение
};

interface DamageNumber {
    container: Rectangle;
    text: TextBlock;
    startTime: number;
    worldPosition: Vector3;
    type: 'dealt' | 'received' | 'heal';
    isCritical: boolean;
    initialY: number;
    randomOffsetX: number;
}

interface PoolElement {
    container: Rectangle;
    text: TextBlock;
    inUse: boolean;
}

export class FloatingDamageNumbers {
    private guiTexture: AdvancedDynamicTexture;
    private scene: Scene;
    private config: DamageNumberConfig;
    private numbers: DamageNumber[] = [];
    private pool: PoolElement[] = [];
    private lastCleanupTime: number = 0; // Время последней очистки старых чисел

    constructor(
        guiTexture: AdvancedDynamicTexture,
        scene: Scene,
        config: Partial<DamageNumberConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scene = scene;
        this.config = { ...DEFAULT_DAMAGE_NUMBER_CONFIG, ...config };
        this.initPool();
    }

    private initPool(): void {
        for (let i = 0; i < this.config.maxNumbers; i++) {
            const container = new Rectangle(`floatingDamage_${i}`);
            container.width = "120px";
            container.height = "50px";
            container.thickness = 0;
            container.isVisible = false;
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            container.isPointerBlocker = false;
            this.guiTexture.addControl(container);

            const text = new TextBlock(`floatingDamageText_${i}`);
            text.color = "#fff";
            text.fontSize = this.config.fontSize;
            text.fontWeight = "bold";
            text.fontFamily = "'Press Start 2P', monospace";
            text.outlineWidth = 3;
            text.outlineColor = "#000";
            text.shadowColor = "#000";
            text.shadowBlur = 4;
            text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            container.addControl(text);

            this.pool.push({ container, text, inUse: false });
        }
    }

    /**
     * Показать число урона
     * @param worldPosition - позиция в 3D мире
     * @param amount - величина урона
     * @param type - тип: 'dealt' (нанесённый), 'received' (полученный), 'heal' (лечение)
     * @param isCritical - критический урон (увеличенный размер)
     */
    showDamage(
        worldPosition: Vector3,
        amount: number,
        type: 'dealt' | 'received' | 'heal' = 'dealt',
        isCritical: boolean = false
    ): void {
        // Находим свободный элемент из пула
        const element = this.pool.find(p => !p.inUse);
        if (!element) {
            // Все элементы заняты, удаляем самый старый
            if (this.numbers.length > 0) {
                const oldest = this.numbers.shift()!;
                const oldElement = this.pool.find(p => p.container === oldest.container);
                if (oldElement) {
                    oldElement.inUse = false;
                    oldElement.container.isVisible = false;
                }
            }
            // Пробуем снова
            const retryElement = this.pool.find(p => !p.inUse);
            if (!retryElement) return;
            this.setupDamageNumber(retryElement, worldPosition, amount, type, isCritical);
        } else {
            this.setupDamageNumber(element, worldPosition, amount, type, isCritical);
        }
    }

    private setupDamageNumber(
        element: PoolElement,
        worldPosition: Vector3,
        amount: number,
        type: 'dealt' | 'received' | 'heal',
        isCritical: boolean
    ): void {
        element.inUse = true;

        // Настраиваем текст
        const prefix = type === 'heal' ? '+' : (type === 'dealt' ? '' : '-');
        element.text.text = `${prefix}${Math.round(amount)}`;

        // Цвет и размер
        if (type === 'heal') {
            element.text.color = this.config.healColor;
            element.text.fontSize = this.config.fontSize;
        } else if (isCritical) {
            element.text.color = this.config.criticalColor;
            element.text.fontSize = Math.round(this.config.fontSize * this.config.criticalMultiplier);
            element.text.text = `💥${prefix}${Math.round(amount)}`;
        } else {
            element.text.color = type === 'dealt'
                ? this.config.dealtColor
                : this.config.receivedColor;
            element.text.fontSize = this.config.fontSize;
        }

        // Показываем с полной прозрачностью
        element.container.isVisible = true;
        element.container.alpha = 1;

        // Случайное смещение по X для избежания наложения
        const randomOffsetX = (Math.random() - 0.5) * 60;

        // Добавляем в активные
        this.numbers.push({
            container: element.container,
            text: element.text,
            startTime: Date.now(),
            worldPosition: worldPosition.clone(),
            type,
            isCritical,
            initialY: 0,
            randomOffsetX
        });
    }

    /**
     * Обновление позиций и анимаций (вызывать каждый кадр)
     * @param camera - активная камера для проекции
     */
    update(camera: Camera): void {
        if (!camera) return;

        const now = Date.now();
        
        // КРИТИЧНО: Периодическая очистка старых чисел (каждые 2 секунды)
        // Это защита на случай если update() вызывается нерегулярно или Date.now() работает неправильно
        if (now - this.lastCleanupTime > 2000) {
            this.cleanupOldNumbers(3000); // Удаляем числа старше 3 секунд
            this.lastCleanupTime = now;
        }
        
        const engine = this.scene.getEngine();
        const width = engine.getRenderWidth();
        const height = engine.getRenderHeight();

        // Матрицы для проекции
        const viewMatrix = camera.getViewMatrix();
        const projectionMatrix = camera.getProjectionMatrix();
        const worldMatrix = this.scene.getTransformMatrix();

        if (!viewMatrix || !projectionMatrix || !worldMatrix) return;

        const transformMatrix = viewMatrix.multiply(projectionMatrix);

        // Обновляем все активные числа
        for (let i = this.numbers.length - 1; i >= 0; i--) {
            const num = this.numbers[i];
            if (!num || !num.container) {
                // Удаляем повреждённые записи
                this.numbers.splice(i, 1);
                continue;
            }
            
            const elapsed = now - num.startTime;

            // Проверяем, истекло ли время показа (с запасом для безопасности)
            const totalTime = this.config.displayTime + this.config.fadeTime;
            const MAX_LIFETIME = totalTime + 1000; // Максимальное время жизни + 1 секунда запас
            
            // КРИТИЧНО: Удаляем если время истекло ИЛИ если elapsed отрицательный (проблема с Date.now())
            if (elapsed > MAX_LIFETIME || elapsed < 0) {
                // Возвращаем элемент в пул
                const poolElement = this.pool.find(p => p.container === num.container);
                if (poolElement) {
                    poolElement.inUse = false;
                    poolElement.container.isVisible = false;
                    poolElement.container.alpha = 0;
                }
                this.numbers.splice(i, 1);
                continue;
            }
            
            // Дополнительная проверка: если alpha = 0 и прошло время fade, удаляем
            if (elapsed > totalTime && num.container.alpha <= 0) {
                const poolElement = this.pool.find(p => p.container === num.container);
                if (poolElement) {
                    poolElement.inUse = false;
                    poolElement.container.isVisible = false;
                }
                this.numbers.splice(i, 1);
                continue;
            }

            // Анимация подъёма (в пикселях экрана, не в 3D)
            const floatOffset = (elapsed / 1000) * this.config.floatSpeed;

            // Проецируем 3D позицию на экран
            const worldPos = num.worldPosition.clone();

            const screenPos = Vector3.Project(
                worldPos,
                worldMatrix,
                transformMatrix,
                new Viewport(0, 0, width, height)
            );

            // Проверяем, что точка перед камерой (z от 0 до 1 в NDC)
            if (screenPos.z > 0 && screenPos.z < 1) {
                // Применяем смещение по экранным координатам
                const screenX = screenPos.x + num.randomOffsetX;
                const screenY = screenPos.y - floatOffset; // Минус потому что Y растёт вниз

                // Устанавливаем позицию (центрируем контейнер)
                num.container.left = `${screenX - 60}px`;
                num.container.top = `${screenY - 25}px`;
                num.container.isVisible = true;
            } else {
                // Точка за камерой - скрываем
                num.container.isVisible = false;
            }

            // Затухание в конце
            if (elapsed > this.config.displayTime) {
                const fadeElapsed = elapsed - this.config.displayTime;
                const fadeProgress = fadeElapsed / this.config.fadeTime;
                num.container.alpha = Math.max(0, 1 - fadeProgress);
                
                // КРИТИЧНО: Если alpha = 0, скрываем контейнер
                if (num.container.alpha <= 0) {
                    num.container.isVisible = false;
                }
            } else {
                // Плавное появление в начале
                if (elapsed < 100) {
                    num.container.alpha = elapsed / 100;
                } else {
                    num.container.alpha = 1;
                }
            }
        }
    }

    /**
     * Очистить все числа
     */
    clear(): void {
        for (const num of this.numbers) {
            const poolElement = this.pool.find(p => p.container === num.container);
            if (poolElement) {
                poolElement.inUse = false;
                poolElement.container.isVisible = false;
                poolElement.container.alpha = 0;
            }
        }
        this.numbers = [];
    }
    
    /**
     * Принудительная очистка старых чисел (на случай если update() не вызывается)
     */
    cleanupOldNumbers(maxAge: number = 5000): void {
        const now = Date.now();
        for (let i = this.numbers.length - 1; i >= 0; i--) {
            const num = this.numbers[i];
            if (!num) {
                this.numbers.splice(i, 1);
                continue;
            }
            
            const age = now - num.startTime;
            if (age > maxAge) {
                const poolElement = this.pool.find(p => p.container === num.container);
                if (poolElement) {
                    poolElement.inUse = false;
                    poolElement.container.isVisible = false;
                    poolElement.container.alpha = 0;
                }
                this.numbers.splice(i, 1);
            }
        }
    }

    /**
     * Получить количество активных чисел
     */
    getActiveCount(): number {
        return this.numbers.length;
    }

    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.clear();
        for (const element of this.pool) {
            element.container.dispose();
        }
        this.pool = [];
    }
}

export default FloatingDamageNumbers;


