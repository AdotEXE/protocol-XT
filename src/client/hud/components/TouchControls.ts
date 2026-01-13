/**
 * @module hud/components/TouchControls
 * @description Экранное управление с двумя джойстиками для сенсорных устройств
 * 
 * ЛЕВЫЙ ДЖОЙСТИК: Движение танка (газ/тормоз + поворот)
 * ПРАВЫЙ ДЖОЙСТИК: Управление башней (поворот + наклон)
 * КНОПКА ОГНЯ: Большая кнопка справа
 * ДОПОЛНИТЕЛЬНЫЕ КНОПКИ: Прицеливание, зум, пауза, расходники
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Ellipse,
    Control
} from "@babylonjs/gui";

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

export interface TouchControlsConfig {
    // Джойстики
    joystickSize: number;          // Размер зоны джойстика
    joystickKnobSize: number;      // Размер внутреннего "стика"
    joystickMargin: number;        // Отступ от края экрана
    
    // Кнопка огня
    fireButtonSize: number;        // Размер кнопки стрельбы
    
    // Цвета
    leftJoystickColor: string;     // Цвет левого джойстика
    rightJoystickColor: string;    // Цвет правого джойстика
    fireColor: string;             // Цвет кнопки огня
    knobColor: string;             // Цвет "стиков"
    backgroundColor: string;       // Цвет фона
    
    // Прозрачность
    baseAlpha: number;             // Прозрачность в покое
    activeAlpha: number;           // Прозрачность при активации
}

export const DEFAULT_TOUCH_CONTROLS_CONFIG: TouchControlsConfig = {
    // Джойстики - компактные чтобы не перекрывать HUD
    joystickSize: 140,
    joystickKnobSize: 55,
    joystickMargin: 15, // Небольшой отступ от края экрана
    
    // Кнопка огня
    fireButtonSize: 80,
    
    // Яркие видимые цвета
    leftJoystickColor: "#00ff44",      // Зелёный для движения
    rightJoystickColor: "#00aaff",     // Голубой для башни
    fireColor: "#ff3333",              // Красный для огня
    knobColor: "#ffffff",              // Белые "стики"
    backgroundColor: "rgba(0,0,0,0.4)", // Полупрозрачный фон
    
    // Высокая видимость
    baseAlpha: 0.7,
    activeAlpha: 1.0
};

// ============================================
// СОСТОЯНИЕ ВВОДА
// ============================================

export interface TouchInputState {
    // Левый джойстик - движение
    throttle: number;      // -1 (назад) до 1 (вперёд)
    steer: number;         // -1 (влево) до 1 (вправо)
    
    // Правый джойстик - башня
    turretLeft: boolean;
    turretRight: boolean;
    turretRotation: number; // -1 до 1 для плавного поворота
    aimPitch: number;       // -1 до 1 для наклона пушки
    
    // Действия
    fire: boolean;
    aim: boolean;
    
    // Прицеливание и зум
    zoomIn: boolean;
    zoomOut: boolean;
    
    // Управление башней и камерой
    centerTurret: boolean;
    cameraUp: boolean;
    cameraDown: boolean;
    
    // Пауза
    pause: boolean;
    
    // Расходники 1-9
    consumable1: boolean;
    consumable2: boolean;
    consumable3: boolean;
    consumable4: boolean;
    consumable5: boolean;
    consumable6: boolean;
    consumable7: boolean;
    consumable8: boolean;
    consumable9: boolean;
}

// ============================================
// КЛАСС ДЖОЙСТИКА
// ============================================

interface JoystickData {
    container: Rectangle;
    base: Ellipse;
    knob: Ellipse;
    pointerId: number | null;
    startX: number;
    startY: number;
    valueX: number;
    valueY: number;
}

// ============================================
// КОМПОНЕНТ TOUCH CONTROLS
// ============================================

export class TouchControls {
    private guiTexture: AdvancedDynamicTexture;
    private config: TouchControlsConfig;
    
    // Главный контейнер
    private mainContainer: Rectangle | null = null;
    
    // Джойстики
    private leftJoystick: JoystickData | null = null;
    private rightJoystick: JoystickData | null = null;
    
    // Кнопка огня
    private fireButton: Ellipse | null = null;
    private firePointerId: number | null = null;
    
    // Хранилище кнопок для управления
    private buttons: Map<string, Ellipse> = new Map();
    
    // Состояние ввода
    private inputState: TouchInputState = {
        throttle: 0,
        steer: 0,
        turretLeft: false,
        turretRight: false,
        turretRotation: 0,
        aimPitch: 0,
        fire: false,
        aim: false,
        zoomIn: false,
        zoomOut: false,
        centerTurret: false,
        cameraUp: false,
        cameraDown: false,
        pause: false,
        consumable1: false,
        consumable2: false,
        consumable3: false,
        consumable4: false,
        consumable5: false,
        consumable6: false,
        consumable7: false,
        consumable8: false,
        consumable9: false
    };
    
    // Callback для изменения состояния
    private onInputChange: ((state: TouchInputState) => void) | null = null;
    
    // Отслеживание активных касаний для мультитач
    private activeTouches: Map<number, { element: string; startX: number; startY: number }> = new Map();
    
    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<TouchControlsConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_TOUCH_CONTROLS_CONFIG, ...config };
        this.create();
        this.setupGlobalTouchHandlers();
    }
    
    // ============================================
    // СОЗДАНИЕ UI
    // ============================================
    
    private create(): void {
        this.createMainContainer();
        this.createLeftJoystick();
        this.createRightJoystick();
        this.createFireButton();
        this.createAimingButtons();
        this.createControlButtons();
        this.createConsumableButtons();
    }
    
    private createMainContainer(): void {
        this.mainContainer = new Rectangle("touchControlsMain");
        this.mainContainer.width = "100%";
        this.mainContainer.height = "100%";
        this.mainContainer.thickness = 0;
        this.mainContainer.isHitTestVisible = false;
        this.mainContainer.zIndex = 100;
        this.mainContainer.isVisible = true;
        this.guiTexture.addControl(this.mainContainer);
    }
    
    // ============================================
    // ЛЕВЫЙ ДЖОЙСТИК (ДВИЖЕНИЕ)
    // ============================================
    
    private createLeftJoystick(): void {
        const cfg = this.config;
        const size = cfg.joystickSize;
        const knobSize = cfg.joystickKnobSize;
        const margin = cfg.joystickMargin;
        
        const container = new Rectangle("leftJoystickContainer");
        container.width = `${size + 40}px`;
        container.height = `${size + 40}px`;
        container.thickness = 0;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = `${margin}px`;
        container.top = `-${margin}px`;
        container.isPointerBlocker = true;
        container.zIndex = 101;
        this.mainContainer!.addControl(container);
        
        const base = new Ellipse("leftJoystickBase");
        base.width = `${size}px`;
        base.height = `${size}px`;
        base.thickness = 4;
        base.color = cfg.leftJoystickColor;
        base.background = cfg.backgroundColor;
        base.alpha = cfg.baseAlpha;
        base.shadowColor = cfg.leftJoystickColor;
        base.shadowBlur = 10;
        container.addControl(base);
        
        this.addJoystickGuides(base, cfg.leftJoystickColor);
        
        const knob = new Ellipse("leftJoystickKnob");
        knob.width = `${knobSize}px`;
        knob.height = `${knobSize}px`;
        knob.thickness = 3;
        knob.color = cfg.knobColor;
        knob.background = cfg.leftJoystickColor;
        knob.alpha = cfg.activeAlpha;
        knob.shadowColor = cfg.knobColor;
        knob.shadowBlur = 8;
        knob.isPointerBlocker = false;
        container.addControl(knob);
        
        const label = new TextBlock("leftJoystickLabel");
        label.text = "MOVE";
        label.color = cfg.leftJoystickColor;
        label.fontSize = 12;
        label.fontWeight = "bold";
        label.fontFamily = "'Press Start 2P', Consolas, monospace";
        label.top = `${size / 2 + 15}px`;
        label.alpha = 0.8;
        container.addControl(label);
        
        this.leftJoystick = {
            container,
            base,
            knob,
            pointerId: null,
            startX: 0,
            startY: 0,
            valueX: 0,
            valueY: 0
        };
        
        this.setupJoystickEvents(this.leftJoystick, "left");
    }
    
    // ============================================
    // ПРАВЫЙ ДЖОЙСТИК (БАШНЯ)
    // ============================================
    
    private createRightJoystick(): void {
        const cfg = this.config;
        const size = cfg.joystickSize;
        const knobSize = cfg.joystickKnobSize;
        const margin = cfg.joystickMargin;
        
        const container = new Rectangle("rightJoystickContainer");
        container.width = `${size + 40}px`;
        container.height = `${size + 40}px`;
        container.thickness = 0;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = `-${margin}px`;
        container.top = `-${margin}px`;
        container.isPointerBlocker = true;
        container.zIndex = 101;
        this.mainContainer!.addControl(container);
        
        const base = new Ellipse("rightJoystickBase");
        base.width = `${size}px`;
        base.height = `${size}px`;
        base.thickness = 4;
        base.color = cfg.rightJoystickColor;
        base.background = cfg.backgroundColor;
        base.alpha = cfg.baseAlpha;
        base.shadowColor = cfg.rightJoystickColor;
        base.shadowBlur = 10;
        container.addControl(base);
        
        this.addJoystickGuides(base, cfg.rightJoystickColor);
        
        const knob = new Ellipse("rightJoystickKnob");
        knob.width = `${knobSize}px`;
        knob.height = `${knobSize}px`;
        knob.thickness = 3;
        knob.color = cfg.knobColor;
        knob.background = cfg.rightJoystickColor;
        knob.alpha = cfg.activeAlpha;
        knob.shadowColor = cfg.knobColor;
        knob.shadowBlur = 8;
        knob.isPointerBlocker = false;
        container.addControl(knob);
        
        const label = new TextBlock("rightJoystickLabel");
        label.text = "TURRET";
        label.color = cfg.rightJoystickColor;
        label.fontSize = 12;
        label.fontWeight = "bold";
        label.fontFamily = "'Press Start 2P', Consolas, monospace";
        label.top = `${size / 2 + 15}px`;
        label.alpha = 0.8;
        container.addControl(label);
        
        this.rightJoystick = {
            container,
            base,
            knob,
            pointerId: null,
            startX: 0,
            startY: 0,
            valueX: 0,
            valueY: 0
        };
        
        this.setupJoystickEvents(this.rightJoystick, "right");
    }
    
    // ============================================
    // КНОПКА ОГНЯ
    // ============================================
    
    private createFireButton(): void {
        const cfg = this.config;
        const size = cfg.fireButtonSize;
        const margin = cfg.joystickMargin;
        const joystickHeight = cfg.joystickSize + 40;
        
        this.fireButton = new Ellipse("fireButton");
        this.fireButton.width = `${size}px`;
        this.fireButton.height = `${size}px`;
        this.fireButton.thickness = 5;
        this.fireButton.color = cfg.fireColor;
        this.fireButton.background = cfg.backgroundColor;
        this.fireButton.alpha = cfg.baseAlpha;
        this.fireButton.shadowColor = cfg.fireColor;
        this.fireButton.shadowBlur = 15;
        this.fireButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.fireButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.fireButton.left = `-${margin + (joystickHeight - size) / 2}px`;
        this.fireButton.top = `-${margin + joystickHeight + 15}px`;
        this.fireButton.isPointerBlocker = true;
        this.fireButton.zIndex = 102;
        this.mainContainer!.addControl(this.fireButton);
        
        const fireText = new TextBlock("fireText");
        fireText.text = "🔥";
        fireText.fontSize = 32;
        this.fireButton.addControl(fireText);
        
        this.fireButton.onPointerDownObservable.add((eventData) => {
            this.firePointerId = (eventData as any).pointerId ?? 0;
            this.inputState.fire = true;
            this.fireButton!.alpha = cfg.activeAlpha;
            this.fireButton!.background = cfg.fireColor;
            this.fireButton!.thickness = 8;
            this.notifyInputChange();
        });
        
        this.fireButton.onPointerUpObservable.add(() => {
            this.firePointerId = null;
            this.inputState.fire = false;
            this.fireButton!.alpha = cfg.baseAlpha;
            this.fireButton!.background = cfg.backgroundColor;
            this.fireButton!.thickness = 5;
            this.notifyInputChange();
        });
        
        this.fireButton.onPointerOutObservable.add(() => {
            if (this.firePointerId !== null) {
                this.firePointerId = null;
                this.inputState.fire = false;
                this.fireButton!.alpha = cfg.baseAlpha;
                this.fireButton!.background = cfg.backgroundColor;
                this.fireButton!.thickness = 5;
                this.notifyInputChange();
            }
        });
    }
    
    // ============================================
    // КНОПКИ ПРИЦЕЛИВАНИЯ И ЗУМА
    // ============================================
    
    private createAimingButtons(): void {
        const cfg = this.config;
        const margin = cfg.joystickMargin;
        const joystickHeight = cfg.joystickSize + 40;
        const fireButtonSize = cfg.fireButtonSize;
        
        // Кнопка прицеливания - слева от кнопки огня
        const aimButtonSize = 65;
        const aimButton = this.createActionButton(
            "aim",
            aimButtonSize,
            Control.HORIZONTAL_ALIGNMENT_RIGHT,
            Control.VERTICAL_ALIGNMENT_BOTTOM,
            `-${margin + (joystickHeight - aimButtonSize) / 2 + fireButtonSize + 10}px`,
            `-${margin + joystickHeight + 15}px`,
            "#ffaa00",
            "🎯"
        );
        this.setupHoldButton(aimButton, "aim", "ControlLeft");
        
        // Кнопки зума - над кнопкой прицеливания
        const zoomButtonSize = 45;
        const zoomInButton = this.createActionButton(
            "zoomIn",
            zoomButtonSize,
            Control.HORIZONTAL_ALIGNMENT_RIGHT,
            Control.VERTICAL_ALIGNMENT_BOTTOM,
            `-${margin + (joystickHeight - zoomButtonSize) / 2 + fireButtonSize + 10}px`,
            `-${margin + joystickHeight + aimButtonSize + 25}px`,
            "#00ffaa",
            "+"
        );
        this.setupClickButton(zoomInButton, "zoomIn", "Equal");
        
        const zoomOutButton = this.createActionButton(
            "zoomOut",
            zoomButtonSize,
            Control.HORIZONTAL_ALIGNMENT_RIGHT,
            Control.VERTICAL_ALIGNMENT_BOTTOM,
            `-${margin + (joystickHeight - zoomButtonSize) / 2 + fireButtonSize + zoomButtonSize + 15}px`,
            `-${margin + joystickHeight + aimButtonSize + 25}px`,
            "#00ffaa",
            "-"
        );
        this.setupClickButton(zoomOutButton, "zoomOut", "Minus");
    }
    
    // ============================================
    // КНОПКИ УПРАВЛЕНИЯ (Центрирование, Камера, Пауза)
    // ============================================
    
    private createControlButtons(): void {
        const cfg = this.config;
        const margin = cfg.joystickMargin;
        
        // Кнопка паузы - левый верхний угол
        const pauseButton = this.createActionButton(
            "pause",
            50,
            Control.HORIZONTAL_ALIGNMENT_LEFT,
            Control.VERTICAL_ALIGNMENT_TOP,
            `${margin}px`,
            `${margin + 50}px`,
            "#ff3333",
            "⏸"
        );
        this.setupClickButton(pauseButton, "pause", "Escape");
        
        // Кнопка центрирования башни
        const centerButton = this.createActionButton(
            "centerTurret",
            50,
            Control.HORIZONTAL_ALIGNMENT_LEFT,
            Control.VERTICAL_ALIGNMENT_TOP,
            `${margin + 60}px`,
            `${margin + 50}px`,
            "#00aaff",
            "C"
        );
        this.setupClickButton(centerButton, "centerTurret", "KeyC");
        
        // Кнопки управления камерой
        const cameraUpButton = this.createActionButton(
            "cameraUp",
            45,
            Control.HORIZONTAL_ALIGNMENT_LEFT,
            Control.VERTICAL_ALIGNMENT_TOP,
            `${margin + 120}px`,
            `${margin + 50}px`,
            "#ffaa00",
            "Q"
        );
        this.setupHoldButton(cameraUpButton, "cameraUp", "KeyQ");
        
        const cameraDownButton = this.createActionButton(
            "cameraDown",
            45,
            Control.HORIZONTAL_ALIGNMENT_LEFT,
            Control.VERTICAL_ALIGNMENT_TOP,
            `${margin + 170}px`,
            `${margin + 50}px`,
            "#ffaa00",
            "E"
        );
        this.setupHoldButton(cameraDownButton, "cameraDown", "KeyE");
    }
    
    // ============================================
    // КНОПКИ РАСХОДНИКОВ
    // ============================================
    
    private createConsumableButtons(): void {
        const buttonSize = 40;
        const buttonGap = 5;
        const totalWidth = 5 * buttonSize + 4 * buttonGap;
        const startX = -totalWidth / 2;
        
        // Расходники 1-5 (первый ряд)
        for (let i = 1; i <= 5; i++) {
            const button = this.createActionButton(
                `consumable${i}`,
                buttonSize,
                Control.HORIZONTAL_ALIGNMENT_CENTER,
                Control.VERTICAL_ALIGNMENT_BOTTOM,
                `${startX + (i - 1) * (buttonSize + buttonGap)}px`,
                "-200px",
                "#00ff44",
                `${i}`
            );
            this.setupClickButton(button, `consumable${i}` as keyof TouchInputState, `Digit${i}`);
        }
        
        // Расходники 6-9 (второй ряд)
        const row2StartX = -(4 * buttonSize + 3 * buttonGap) / 2;
        for (let i = 6; i <= 9; i++) {
            const button = this.createActionButton(
                `consumable${i}`,
                buttonSize,
                Control.HORIZONTAL_ALIGNMENT_CENTER,
                Control.VERTICAL_ALIGNMENT_BOTTOM,
                `${row2StartX + (i - 6) * (buttonSize + buttonGap)}px`,
                "-250px",
                "#00aaff",
                `${i}`
            );
            this.setupClickButton(button, `consumable${i}` as keyof TouchInputState, `Digit${i}`);
        }
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ДЛЯ КНОПОК
    // ============================================
    
    private createActionButton(
        id: string,
        size: number,
        horizontalAlignment: number,
        verticalAlignment: number,
        left: string,
        top: string,
        color: string,
        text: string
    ): Ellipse {
        const cfg = this.config;
        const button = new Ellipse(`button_${id}`);
        button.width = `${size}px`;
        button.height = `${size}px`;
        button.thickness = 3;
        button.color = color;
        button.background = cfg.backgroundColor;
        button.alpha = cfg.baseAlpha;
        button.shadowColor = color;
        button.shadowBlur = 8;
        button.horizontalAlignment = horizontalAlignment;
        button.verticalAlignment = verticalAlignment;
        button.left = left;
        button.top = top;
        button.isPointerBlocker = true;
        button.zIndex = 102;
        this.mainContainer!.addControl(button);
        
        const buttonText = new TextBlock(`text_${id}`);
        buttonText.text = text;
        buttonText.fontSize = size * 0.45;
        buttonText.fontWeight = "bold";
        buttonText.fontFamily = "'Press Start 2P', Consolas, monospace";
        buttonText.color = "#fff";
        button.addControl(buttonText);
        
        this.buttons.set(id, button);
        return button;
    }
    
    private setupClickButton(button: Ellipse, stateKey: keyof TouchInputState, keyCode: string): void {
        const cfg = this.config;
        
        button.onPointerDownObservable.add(() => {
            (this.inputState as any)[stateKey] = true;
            button.alpha = cfg.activeAlpha;
            button.background = button.color;
            button.thickness = 6;
            this.emulateKeyPress(keyCode, true);
            this.notifyInputChange();
        });
        
        button.onPointerUpObservable.add(() => {
            (this.inputState as any)[stateKey] = false;
            button.alpha = cfg.baseAlpha;
            button.background = cfg.backgroundColor;
            button.thickness = 3;
            this.emulateKeyPress(keyCode, false);
            this.notifyInputChange();
        });
        
        button.onPointerOutObservable.add(() => {
            (this.inputState as any)[stateKey] = false;
            button.alpha = cfg.baseAlpha;
            button.background = cfg.backgroundColor;
            button.thickness = 3;
            this.emulateKeyPress(keyCode, false);
            this.notifyInputChange();
        });
    }
    
    private setupHoldButton(button: Ellipse, stateKey: keyof TouchInputState, keyCode: string): void {
        const cfg = this.config;
        
        button.onPointerDownObservable.add(() => {
            (this.inputState as any)[stateKey] = true;
            button.alpha = cfg.activeAlpha;
            button.background = button.color;
            button.thickness = 6;
            this.emulateKeyPress(keyCode, true);
            this.notifyInputChange();
        });
        
        button.onPointerUpObservable.add(() => {
            (this.inputState as any)[stateKey] = false;
            button.alpha = cfg.baseAlpha;
            button.background = cfg.backgroundColor;
            button.thickness = 3;
            this.emulateKeyPress(keyCode, false);
            this.notifyInputChange();
        });
        
        button.onPointerOutObservable.add(() => {
            (this.inputState as any)[stateKey] = false;
            button.alpha = cfg.baseAlpha;
            button.background = cfg.backgroundColor;
            button.thickness = 3;
            this.emulateKeyPress(keyCode, false);
            this.notifyInputChange();
        });
    }
    
    private emulateKeyPress(keyCode: string, isDown: boolean): void {
        const eventType = isDown ? 'keydown' : 'keyup';
        const event = new KeyboardEvent(eventType, {
            code: keyCode,
            key: this.getKeyFromCode(keyCode),
            bubbles: true,
            cancelable: true
        });
        window.dispatchEvent(event);
    }
    
    private getKeyFromCode(code: string): string {
        const keyMap: { [key: string]: string } = {
            'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
            'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
            'Equal': '=', 'Minus': '-',
            'KeyC': 'c', 'KeyQ': 'q', 'KeyE': 'e',
            'Escape': 'Escape',
            'ControlLeft': 'Control', 'ControlRight': 'Control'
        };
        return keyMap[code] || code;
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ДЛЯ ДЖОЙСТИКОВ
    // ============================================
    
    private addJoystickGuides(base: Ellipse, color: string): void {
        const vLine = new Rectangle("vGuide");
        vLine.width = "2px";
        vLine.height = "60%";
        vLine.thickness = 0;
        vLine.background = color;
        vLine.alpha = 0.3;
        base.addControl(vLine);
        
        const hLine = new Rectangle("hGuide");
        hLine.width = "60%";
        hLine.height = "2px";
        hLine.thickness = 0;
        hLine.background = color;
        hLine.alpha = 0.3;
        base.addControl(hLine);
    }
    
    private setupJoystickEvents(joystick: JoystickData, side: "left" | "right"): void {
        const cfg = this.config;
        const maxRadius = (cfg.joystickSize - cfg.joystickKnobSize) / 2;
        
        joystick.container.onPointerDownObservable.add((eventData) => {
            const pointerId = (eventData as any).pointerId ?? Date.now();
            joystick.pointerId = pointerId;
            joystick.base.alpha = cfg.activeAlpha;
            joystick.startX = eventData.x;
            joystick.startY = eventData.y;
            
            this.activeTouches.set(pointerId, {
                element: side,
                startX: eventData.x,
                startY: eventData.y
            });
        });
        
        joystick.container.onPointerMoveObservable.add((eventData) => {
            if (joystick.pointerId !== null) {
                this.updateJoystickFromPointer(joystick, eventData.x, eventData.y, maxRadius, side);
            }
        });
        
        joystick.container.onPointerUpObservable.add((eventData) => {
            const pointerId = (eventData as any).pointerId ?? 0;
            if (joystick.pointerId === pointerId || joystick.pointerId !== null) {
                this.resetJoystick(joystick, side);
                this.activeTouches.delete(pointerId);
            }
        });
    }
    
    private updateJoystickFromPointer(
        joystick: JoystickData,
        pointerX: number,
        pointerY: number,
        maxRadius: number,
        side: "left" | "right"
    ): void {
        let deltaX = pointerX - joystick.startX;
        let deltaY = pointerY - joystick.startY;
        
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > maxRadius) {
            const scale = maxRadius / distance;
            deltaX *= scale;
            deltaY *= scale;
        }
        
        joystick.knob.left = `${deltaX}px`;
        joystick.knob.top = `${deltaY}px`;
        
        joystick.valueX = deltaX / maxRadius;
        joystick.valueY = -deltaY / maxRadius;
        
        if (side === "left") {
            this.inputState.steer = joystick.valueX;
            this.inputState.throttle = joystick.valueY;
        } else {
            this.inputState.turretRotation = joystick.valueX;
            this.inputState.aimPitch = joystick.valueY;
            this.inputState.turretLeft = joystick.valueX < -0.3;
            this.inputState.turretRight = joystick.valueX > 0.3;
        }
        
        this.notifyInputChange();
    }
    
    private resetJoystick(joystick: JoystickData, side: "left" | "right"): void {
        const cfg = this.config;
        
        joystick.pointerId = null;
        joystick.valueX = 0;
        joystick.valueY = 0;
        joystick.knob.left = "0px";
        joystick.knob.top = "0px";
        joystick.base.alpha = cfg.baseAlpha;
        
        if (side === "left") {
            this.inputState.steer = 0;
            this.inputState.throttle = 0;
        } else {
            this.inputState.turretRotation = 0;
            this.inputState.aimPitch = 0;
            this.inputState.turretLeft = false;
            this.inputState.turretRight = false;
        }
        
        this.notifyInputChange();
    }
    
    // ============================================
    // ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ДЛЯ МУЛЬТИТАЧ
    // ============================================
    
    private setupGlobalTouchHandlers(): void {
        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;
        
        const cfg = this.config;
        const maxRadius = (cfg.joystickSize - cfg.joystickKnobSize) / 2;
        
        canvas.addEventListener('touchmove', (e) => {
            if (this.activeTouches.size > 0) {
                e.preventDefault();
            }
            
            for (const touch of Array.from(e.changedTouches)) {
                const touchInfo = this.activeTouches.get(touch.identifier);
                if (!touchInfo) continue;
                
                const rect = canvas.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                
                if (touchInfo.element === "left" && this.leftJoystick?.pointerId === touch.identifier) {
                    this.updateJoystickFromPointer(this.leftJoystick, x, y, maxRadius, "left");
                } else if (touchInfo.element === "right" && this.rightJoystick?.pointerId === touch.identifier) {
                    this.updateJoystickFromPointer(this.rightJoystick, x, y, maxRadius, "right");
                }
            }
        }, { passive: false });
        
        canvas.addEventListener('touchend', (e) => {
            for (const touch of Array.from(e.changedTouches)) {
                const touchInfo = this.activeTouches.get(touch.identifier);
                if (!touchInfo) continue;
                
                if (touchInfo.element === "left" && this.leftJoystick?.pointerId === touch.identifier) {
                    this.resetJoystick(this.leftJoystick, "left");
                } else if (touchInfo.element === "right" && this.rightJoystick?.pointerId === touch.identifier) {
                    this.resetJoystick(this.rightJoystick, "right");
                }
                
                this.activeTouches.delete(touch.identifier);
            }
        }, { passive: true });
        
        canvas.addEventListener('touchcancel', (e) => {
            for (const touch of Array.from(e.changedTouches)) {
                const touchInfo = this.activeTouches.get(touch.identifier);
                if (!touchInfo) continue;
                
                if (touchInfo.element === "left" && this.leftJoystick) {
                    this.resetJoystick(this.leftJoystick, "left");
                } else if (touchInfo.element === "right" && this.rightJoystick) {
                    this.resetJoystick(this.rightJoystick, "right");
                }
                
                this.activeTouches.delete(touch.identifier);
            }
        }, { passive: true });
    }
    
    // ============================================
    // ПУБЛИЧНЫЕ МЕТОДЫ
    // ============================================
    
    setOnInputChange(callback: (state: TouchInputState) => void): void {
        this.onInputChange = callback;
    }
    
    getInputState(): TouchInputState {
        return { ...this.inputState };
    }
    
    setVisible(visible: boolean): void {
        if (this.mainContainer) {
            this.mainContainer.isVisible = visible;
        }
    }
    
    isVisible(): boolean {
        return this.mainContainer?.isVisible ?? false;
    }
    
    updateConfig(config: Partial<TouchControlsConfig>): void {
        this.config = { ...this.config, ...config };
        this.dispose();
        this.create();
    }
    
    dispose(): void {
        if (this.mainContainer) {
            this.guiTexture.removeControl(this.mainContainer);
            this.mainContainer.dispose();
            this.mainContainer = null;
        }
        
        this.leftJoystick = null;
        this.rightJoystick = null;
        this.fireButton = null;
        this.buttons.clear();
        this.activeTouches.clear();
    }
    
    private notifyInputChange(): void {
        if (this.onInputChange) {
            this.onInputChange(this.getInputState());
        }
    }
}

export default TouchControls;
