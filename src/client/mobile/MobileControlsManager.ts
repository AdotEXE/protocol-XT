/**
 * @module mobile/MobileControlsManager
 * @description Главный менеджер мобильного управления
 * 
 * Объединяет все компоненты:
 * - Плавающие джойстики
 * - Кнопка AIM/ZOOM с авто-выстрелом
 * - Дополнительные кнопки (пауза, расходники и т.д.)
 * - Мобильный HUD
 * - Вибрация
 * - Обработка ориентации
 */

import {
    AdvancedDynamicTexture,
    Ellipse,
    TextBlock,
    Control
} from "@babylonjs/gui";
import { Scene } from "@babylonjs/core";
import { isMobileDevice, getMobileScale } from "./MobileDetection";
import { HapticFeedback, getHapticFeedback } from "./HapticFeedback";
import { FloatingJoystick } from "./FloatingJoystick";
import { AimZoomButton } from "./AimZoomButton";
import { MobileHUD } from "./MobileHUD";
import { MobilePerformance } from "./MobilePerformance";

/**
 * Состояние ввода для мобильного управления
 */
export interface MobileInputState {
    // Движение (левый джойстик)
    throttle: number;      // -1 до 1
    steer: number;        // -1 до 1

    // Башня (правый джойстик)
    turretRotation: number; // -1 до 1
    aimPitch: number;       // -1 до 1

    // Прицеливание
    aim: boolean;

    // Выстрел
    fire: boolean;

    // Зум
    zoomIn: boolean;
    zoomOut: boolean;

    // Дополнительные действия
    pause: boolean;
    centerTurret: boolean;
    cameraUp: boolean;
    cameraDown: boolean;
    consumable1: boolean;
    consumable2: boolean;
    consumable3: boolean;
    consumable4: boolean;
    consumable5: boolean;
    consumable6: boolean;
    consumable7: boolean;
    consumable8: boolean;
    consumable9: boolean;

    // New Actions
    ult: boolean;        // 0
    garage: boolean;     // B
    drop: boolean;       // G
    map: boolean;        // M
    chat: boolean;       // T
    send: boolean;       // Enter
}

/**
 * Менеджер мобильного управления
 */
export class MobileControlsManager {
    private guiTexture: AdvancedDynamicTexture;
    private scene: Scene;
    private scale: number;

    // Компоненты
    // private orientationHandler: OrientationHandler | null = null;
    private haptic: HapticFeedback;
    private leftJoystick: FloatingJoystick | null = null;
    private rightJoystick: FloatingJoystick | null = null;
    private aimZoomButton: AimZoomButton | null = null;
    private mobileHUD: MobileHUD | null = null;
    private performance: MobilePerformance | null = null;

    // Дополнительные кнопки
    private buttons: Map<string, Ellipse> = new Map();

    // Состояние ввода
    private inputState: MobileInputState = {
        throttle: 0,
        steer: 0,
        turretRotation: 0,
        aimPitch: 0,
        aim: false,
        fire: false,
        zoomIn: false,
        zoomOut: false,
        pause: false,
        centerTurret: false,
        cameraUp: false,
        cameraDown: false,
        consumable1: false,
        consumable2: false,
        consumable3: false,
        consumable4: false,
        consumable5: false,
        consumable6: false,
        consumable7: false,
        consumable8: false,
        consumable9: false,
        ult: false,
        garage: false,
        drop: false,
        map: false,
        chat: false,
        send: false
    };

    // Callback
    private onInputChange: ((state: MobileInputState) => void) | null = null;

    constructor(guiTexture: AdvancedDynamicTexture, scene: Scene) {
        this.guiTexture = guiTexture;
        this.scene = scene;
        this.scale = getMobileScale();
        this.haptic = getHapticFeedback();

        if (isMobileDevice()) {
            this.initialize();
        }
    }

    /**
     * Инициализация компонентов
     */
    private initialize(): void {
        // Обработка ориентации
        // Обработка ориентации
        // this.orientationHandler = new OrientationHandler(this.guiTexture);

        // Оптимизация производительности
        this.performance = new MobilePerformance(this.scene);

        // Плавающие джойстики
        this.leftJoystick = new FloatingJoystick(this.guiTexture, 'left');
        this.leftJoystick.setOnValueChange((x, y) => {
            this.inputState.steer = x;
            this.inputState.throttle = y;
            this.notifyInputChange();
        });

        this.rightJoystick = new FloatingJoystick(this.guiTexture, 'right');
        this.rightJoystick.setOnValueChange((x, y) => {
            this.inputState.turretRotation = x;
            this.inputState.aimPitch = y;
            this.notifyInputChange();
        });

        // Кнопка AIM/ZOOM
        this.aimZoomButton = new AimZoomButton(this.guiTexture);
        this.aimZoomButton.setOnAimStart(() => {
            this.inputState.aim = true;
            this.emulateKeyPress('ControlLeft', true);
            this.notifyInputChange();
        });
        this.aimZoomButton.setOnAimEnd(() => {
            this.inputState.aim = false;
            this.emulateKeyPress('ControlLeft', false);
            this.notifyInputChange();
        });
        // Tap-to-shoot отключен по просьбе пользователя (Issue #12)
        // Стрельба только отдельной кнопкой

        this.aimZoomButton.setOnZoomIn(() => {
            this.inputState.zoomIn = true;
            this.emulateKeyPress('Equal', true);
            setTimeout(() => {
                this.inputState.zoomIn = false;
                this.emulateKeyPress('Equal', false);
                this.notifyInputChange();
            }, 50);
        });
        this.aimZoomButton.setOnZoomOut(() => {
            this.inputState.zoomOut = true;
            this.emulateKeyPress('Minus', true);
            setTimeout(() => {
                this.inputState.zoomOut = false;
                this.emulateKeyPress('Minus', false);
                this.notifyInputChange();
            }, 50);
        });

        // Дополнительные кнопки
        this.createAdditionalButtons();

        // Мобильный HUD
        this.mobileHUD = new MobileHUD(this.guiTexture);
    }

    /**
     * Создать дополнительные кнопки
     */
    private createAdditionalButtons(): void {
        const buttonSize = 50 * this.scale;
        const margin = 15 * this.scale;

        // === DEDICATED FIRE BUTTON (Right Side) ===
        // Large button near right joystick/aim button
        this.createButton('fire', buttonSize * 1.5, Control.HORIZONTAL_ALIGNMENT_RIGHT, Control.VERTICAL_ALIGNMENT_BOTTOM,
            "-120px", "-160px", "#ff0000", "FIRE", 'Space');


        // === TOP LEFT GROUP (System) ===
        // Pause (Esc)
        this.createButton('pause', buttonSize, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_TOP,
            `${margin}px`, `${margin}px`, "#ff3333", "⏸", 'Escape');

        // Chat (T) - Below Pause
        this.createButton('chat', buttonSize, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_TOP,
            `${margin}px`, `${margin + buttonSize + 10}px`, "#dddddd", "T", 'KeyT');

        // Send (Enter) - Next to Chat
        this.createButton('send', buttonSize, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_TOP,
            `${margin + buttonSize + 10}px`, `${margin + buttonSize + 10}px`, "#00ff00", "⏎", 'Enter');

        // Quest/Log (J) - Next to Pause
        this.createButton('quest', buttonSize, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_TOP,
            `${margin + buttonSize + 10}px`, `${margin}px`, "#ffff00", "J", 'KeyJ');


        // === TOP RIGHT GROUP (Gameplay) ===
        // Map (M)
        this.createButton('map', buttonSize, Control.HORIZONTAL_ALIGNMENT_RIGHT, Control.VERTICAL_ALIGNMENT_TOP,
            `-${margin}px`, `${margin}px`, "#aaaaaa", "MAP", 'KeyM');

        // Garage (B) - Below Map
        this.createButton('garage', buttonSize, Control.HORIZONTAL_ALIGNMENT_RIGHT, Control.VERTICAL_ALIGNMENT_TOP,
            `-${margin}px`, `${margin + buttonSize + 10}px`, "#ffaa00", "GAR", 'KeyB');

        // Drop (G) - Left of Garage
        this.createButton('drop', buttonSize, Control.HORIZONTAL_ALIGNMENT_RIGHT, Control.VERTICAL_ALIGNMENT_TOP,
            `-${margin + buttonSize + 10}px`, `${margin + buttonSize + 10}px`, "#ff5555", "drp", 'KeyG');


        // === LEFT SIDE (Zoom & Camera) ===
        // Zoom In (+) - Near Left Joystick (Above)
        this.createButton('zoomIn', buttonSize, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_BOTTOM,
            `${margin + 20}px`, `-${margin + 220 * this.scale}px`, "#00ffaa", "+", 'Equal', true);

        // Zoom Out (-) - Below Zoom In
        this.createButton('zoomOut', buttonSize, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_BOTTOM,
            `${margin + 20}px`, `-${margin + 160 * this.scale}px`, "#00ffaa", "-", 'Minus', true);


        // === BOTTOM LEFT GROUP (Camera & Movement Helpers) ===
        // Center Turret (C)
        this.createButton('centerTurret', buttonSize, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_BOTTOM,
            `${margin}px`, `-${margin + 100 * this.scale}px`, "#00aaff", "C", 'KeyC');

        // Camera Up (Q) - Next to C
        this.createButton('cameraUp', buttonSize * 0.9, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_BOTTOM,
            `${margin + buttonSize + 10}px`, `-${margin + 100 * this.scale}px`, "#ffaa00", "Q", 'KeyQ', true);

        // Camera Down (E) - Next to Q
        this.createButton('cameraDown', buttonSize * 0.9, Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_BOTTOM,
            `${margin + (buttonSize + 10) + (buttonSize * 0.9 + 10)}px`, `-${margin + 100 * this.scale}px`, "#ffaa00", "E", 'KeyE', true);


        // === CENTER BOTTOM (Consumables & Ult) ===
        const consumableSize = 40 * this.scale;
        const consumableGap = 5 * this.scale;

        // Ult (0) - Big button above consumables
        this.createButton('ult', buttonSize * 1.2, Control.HORIZONTAL_ALIGNMENT_CENTER, Control.VERTICAL_ALIGNMENT_BOTTOM,
            "0px", "-260px", "#ff00ff", "ULT", 'Digit0');

        // Расходники 1-5 (нижний ряд)
        const totalWidth = 5 * consumableSize + 4 * consumableGap;
        const startX = -totalWidth / 2;

        for (let i = 1; i <= 5; i++) {
            this.createButton(`consumable${i}`, consumableSize, Control.HORIZONTAL_ALIGNMENT_CENTER,
                Control.VERTICAL_ALIGNMENT_BOTTOM,
                `${startX + (i - 1) * (consumableSize + consumableGap)}px`, "-10px", // moved down
                "#00ff44", `${i}`, `Digit${i}`);
        }

        // Расходники 6-9 (второй ряд)
        const row2StartX = -(4 * consumableSize + 3 * consumableGap) / 2;
        for (let i = 6; i <= 9; i++) {
            this.createButton(`consumable${i}`, consumableSize, Control.HORIZONTAL_ALIGNMENT_CENTER,
                Control.VERTICAL_ALIGNMENT_BOTTOM,
                `${row2StartX + (i - 6) * (consumableSize + consumableGap)}px`, "-60px", // moved down
                "#00aaff", `${i}`, `Digit${i}`);
        }
    }

    /**
     * Создать кнопку
     */
    private createButton(
        id: string,
        size: number,
        horizontalAlignment: number,
        verticalAlignment: number,
        left: string,
        top: string,
        color: string,
        text: string,
        keyCode: string,
        isHold: boolean = false
    ): void {
        const button = new Ellipse(`mobileButton_${id}`);
        button.width = `${size}px`;
        button.height = `${size}px`;
        button.thickness = 3;
        button.color = color;
        button.background = "rgba(0, 0, 0, 0.4)";
        button.alpha = 0.7;
        button.shadowColor = color;
        button.shadowBlur = 8;
        button.horizontalAlignment = horizontalAlignment;
        button.verticalAlignment = verticalAlignment;
        button.left = left;
        button.top = top;
        button.isPointerBlocker = true;
        button.zIndex = 1002;
        this.guiTexture.addControl(button);

        const buttonText = new TextBlock(`mobileButtonText_${id}`);
        buttonText.text = text;
        buttonText.fontSize = size * 0.45;
        buttonText.fontWeight = "bold";
        buttonText.fontFamily = "'Press Start 2P', Consolas, monospace";
        buttonText.color = "#ffffff";
        button.addControl(buttonText);

        // Обработчики
        if (isHold) {
            button.onPointerDownObservable.add(() => {
                (this.inputState as any)[id] = true;
                button.alpha = 1.0;
                button.background = color;
                this.emulateKeyPress(keyCode, true);
                this.haptic.button();
                this.notifyInputChange();
            });

            button.onPointerUpObservable.add(() => {
                (this.inputState as any)[id] = false;
                button.alpha = 0.7;
                button.background = "rgba(0, 0, 0, 0.4)";
                this.emulateKeyPress(keyCode, false);
                this.notifyInputChange();
            });
        } else {
            button.onPointerDownObservable.add(() => {
                (this.inputState as any)[id] = true;
                button.alpha = 1.0;
                button.background = color;
                this.emulateKeyPress(keyCode, true);
                this.haptic.button();
                this.notifyInputChange();

                setTimeout(() => {
                    (this.inputState as any)[id] = false;
                    button.alpha = 0.7;
                    button.background = "rgba(0, 0, 0, 0.4)";
                    this.emulateKeyPress(keyCode, false);
                    this.notifyInputChange();
                }, 50);
            });
        }

        this.buttons.set(id, button);
    }

    /**
     * Эмулировать нажатие клавиши
     */
    private emulateKeyPress(keyCode: string, isDown: boolean): void {
        const eventType = isDown ? 'keydown' : 'keyup';
        const keyMap: { [key: string]: string } = {
            'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
            'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0',
            'Equal': '=', 'Minus': '-',
            'KeyC': 'c', 'KeyQ': 'q', 'KeyE': 'e', 'KeyB': 'b', 'KeyG': 'g', 'KeyM': 'm', 'KeyT': 't',
            'Escape': 'Escape', 'Enter': 'Enter',
            'ControlLeft': 'Control', 'Space': ' '
        };

        const event = new KeyboardEvent(eventType, {
            code: keyCode,
            key: keyMap[keyCode] || keyCode,
            bubbles: true,
            cancelable: true
        });
        window.dispatchEvent(event);
    }

    /**
     * Установить callback изменения ввода
     */
    setOnInputChange(callback: (state: MobileInputState) => void): void {
        this.onInputChange = callback;
    }

    /**
     * Получить текущее состояние ввода
     */
    getInputState(): MobileInputState {
        return { ...this.inputState };
    }

    /**
     * Обновить HUD
     */
    updateHUD(health: number, maxHealth: number, ammo: number, maxAmmo: number, kills: number): void {
        if (this.mobileHUD) {
            this.mobileHUD.updateHealth(health, maxHealth);
            this.mobileHUD.updateAmmo(ammo, maxAmmo);
            this.mobileHUD.updateKills(kills);
        }
    }

    /**
     * Показать/скрыть элементы управления
     */
    setVisible(visible: boolean): void {
        if (this.leftJoystick) {
            this.leftJoystick.setVisible(visible);
        }
        if (this.rightJoystick) {
            this.rightJoystick.setVisible(visible);
        }
        if (this.aimZoomButton) {
            this.aimZoomButton.setVisible(visible);
        }
        this.buttons.forEach(button => {
            button.isVisible = visible;
        });
        if (this.mobileHUD) {
            this.mobileHUD.setVisible(visible);
        }
    }

    /**
     * Уведомить об изменении ввода
     */
    private notifyInputChange(): void {
        if (this.onInputChange) {
            this.onInputChange(this.getInputState());
        }
    }

    /**
     * Уничтожить менеджер
     */
    dispose(): void {
        // if (this.orientationHandler) {
        // this.orientationHandler.dispose();
        // }
        if (this.leftJoystick) {
            this.leftJoystick.dispose();
        }
        if (this.rightJoystick) {
            this.rightJoystick.dispose();
        }
        if (this.aimZoomButton) {
            this.aimZoomButton.dispose();
        }
        if (this.mobileHUD) {
            this.mobileHUD.dispose();
        }
        this.buttons.forEach(button => {
            this.guiTexture.removeControl(button);
            button.dispose();
        });
        this.buttons.clear();
    }
}

export default MobileControlsManager;
