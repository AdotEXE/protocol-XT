/**
 * @module tank/TankInput
 * @description Система ввода танка - обработка клавиатуры, мыши и геймпада
 * 
 * Этот модуль содержит:
 * - Маппинг клавиш
 * - Обработка ввода
 * - Состояние управления
 */

// ============================================
// ТИПЫ ВВОДА
// ============================================

export type InputAction = 
    | "forward"
    | "backward"
    | "left"
    | "right"
    | "turret_left"
    | "turret_right"
    | "fire"
    | "alt_fire"
    | "reload"
    | "ability"
    | "module_1"
    | "module_2"
    | "module_3"
    | "jump"
    | "crouch"
    | "sprint"
    | "aim"
    | "zoom_in"
    | "zoom_out"
    | "center_turret"
    | "toggle_map"
    | "menu"
    | "chat"
    | "scoreboard";

export type InputDevice = "keyboard" | "mouse" | "gamepad";

/**
 * Состояние ввода
 */
export interface InputState {
    // Движение
    moveForward: boolean;
    moveBackward: boolean;
    moveLeft: boolean;
    moveRight: boolean;
    
    // Башня
    turretLeft: boolean;
    turretRight: boolean;
    
    // Стрельба
    fire: boolean;
    altFire: boolean;
    reload: boolean;
    
    // Способности
    ability: boolean;
    module1: boolean;
    module2: boolean;
    module3: boolean;
    
    // Действия
    jump: boolean;
    crouch: boolean;
    sprint: boolean;
    aim: boolean;
    
    // Мышь
    mouseX: number;
    mouseY: number;
    mouseDeltaX: number;
    mouseDeltaY: number;
    mouseWheelDelta: number;
    
    // Геймпад
    leftStickX: number;
    leftStickY: number;
    rightStickX: number;
    rightStickY: number;
    leftTrigger: number;
    rightTrigger: number;
}

// ============================================
// МАППИНГ КЛАВИШ
// ============================================

export interface KeyBinding {
    action: InputAction;
    primary: string;           // Основная клавиша (KeyCode)
    secondary?: string;        // Альтернативная клавиша
    mouseButton?: number;      // Кнопка мыши (0=левая, 1=средняя, 2=правая)
    gamepadButton?: number;    // Кнопка геймпада
}

export const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
    { action: "forward", primary: "KeyW", secondary: "ArrowUp" },
    { action: "backward", primary: "KeyS", secondary: "ArrowDown" },
    { action: "left", primary: "KeyA", secondary: "ArrowLeft" },
    { action: "right", primary: "KeyD", secondary: "ArrowRight" },
    { action: "turret_left", primary: "KeyQ" },
    { action: "turret_right", primary: "KeyE" },
    { action: "fire", primary: "Space", mouseButton: 0 },
    { action: "alt_fire", primary: "KeyF", mouseButton: 2 },
    { action: "reload", primary: "KeyR" },
    { action: "ability", primary: "KeyV" },
    { action: "module_1", primary: "Digit1" },
    { action: "module_2", primary: "Digit2" },
    { action: "module_3", primary: "Digit3" },
    { action: "jump", primary: "Space" },
    { action: "crouch", primary: "ControlLeft" },
    { action: "sprint", primary: "ShiftLeft" },
    { action: "aim", primary: "ShiftRight", mouseButton: 2 },
    { action: "zoom_in", primary: "Equal" },
    { action: "zoom_out", primary: "Minus" },
    { action: "center_turret", primary: "KeyC" },
    { action: "toggle_map", primary: "KeyM" },
    { action: "menu", primary: "Escape" },
    { action: "chat", primary: "KeyT" },
    { action: "scoreboard", primary: "Tab" }
];

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

export interface InputConfig {
    mouseSensitivity: number;
    mouseInvertY: boolean;
    mouseSmoothing: number;
    deadzone: number;              // Для геймпада
    aimAssist: boolean;
    holdToAim: boolean;
    autoReload: boolean;
}

export const DEFAULT_INPUT_CONFIG: InputConfig = {
    mouseSensitivity: 1.0,
    mouseInvertY: false,
    mouseSmoothing: 0.0,
    deadzone: 0.1,
    aimAssist: false,
    holdToAim: false,
    autoReload: true
};

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Создать начальное состояние ввода
 */
export function createInitialInputState(): InputState {
    return {
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false,
        turretLeft: false,
        turretRight: false,
        fire: false,
        altFire: false,
        reload: false,
        ability: false,
        module1: false,
        module2: false,
        module3: false,
        jump: false,
        crouch: false,
        sprint: false,
        aim: false,
        mouseX: 0,
        mouseY: 0,
        mouseDeltaX: 0,
        mouseDeltaY: 0,
        mouseWheelDelta: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
        leftTrigger: 0,
        rightTrigger: 0
    };
}

/**
 * Получить биндинг для действия
 */
export function getBindingForAction(
    action: InputAction, 
    bindings: KeyBinding[] = DEFAULT_KEY_BINDINGS
): KeyBinding | undefined {
    return bindings.find(b => b.action === action);
}

/**
 * Получить действие для клавиши
 */
export function getActionForKey(
    keyCode: string, 
    bindings: KeyBinding[] = DEFAULT_KEY_BINDINGS
): InputAction | undefined {
    const binding = bindings.find(b => b.primary === keyCode || b.secondary === keyCode);
    return binding?.action;
}

/**
 * Получить действие для кнопки мыши
 */
export function getActionForMouseButton(
    button: number, 
    bindings: KeyBinding[] = DEFAULT_KEY_BINDINGS
): InputAction | undefined {
    const binding = bindings.find(b => b.mouseButton === button);
    return binding?.action;
}

/**
 * Применить мёртвую зону к значению стика
 */
export function applyDeadzone(value: number, deadzone: number): number {
    if (Math.abs(value) < deadzone) return 0;
    const sign = Math.sign(value);
    return sign * (Math.abs(value) - deadzone) / (1 - deadzone);
}

/**
 * Сгладить значение мыши
 */
export function smoothMouseInput(
    current: number,
    target: number,
    smoothing: number
): number {
    if (smoothing <= 0) return target;
    return current + (target - current) * (1 - smoothing);
}

/**
 * Вычислить направление движения
 */
export function calculateMoveDirection(state: InputState): { x: number; z: number } {
    let x = 0;
    let z = 0;
    
    if (state.moveForward) z -= 1;
    if (state.moveBackward) z += 1;
    if (state.moveLeft) x -= 1;
    if (state.moveRight) x += 1;
    
    // Нормализовать при диагональном движении
    const length = Math.sqrt(x * x + z * z);
    if (length > 1) {
        x /= length;
        z /= length;
    }
    
    return { x, z };
}

/**
 * Вычислить направление поворота башни
 */
export function calculateTurretDirection(state: InputState): number {
    if (state.turretLeft) return -1;
    if (state.turretRight) return 1;
    return 0;
}

/**
 * Проверить, нажата ли любая клавиша движения
 */
export function isMoving(state: InputState): boolean {
    return state.moveForward || state.moveBackward || state.moveLeft || state.moveRight;
}

/**
 * Получить множитель скорости
 */
export function getSpeedMultiplier(state: InputState): number {
    if (state.sprint) return 1.5;
    if (state.crouch) return 0.5;
    if (state.aim) return 0.7;
    return 1.0;
}

/**
 * Форматировать клавишу для отображения
 */
export function formatKeyName(keyCode: string): string {
    const keyNames: Record<string, string> = {
        "Space": "Пробел",
        "ShiftLeft": "L Shift",
        "ShiftRight": "R Shift",
        "ControlLeft": "L Ctrl",
        "ControlRight": "R Ctrl",
        "AltLeft": "L Alt",
        "AltRight": "R Alt",
        "ArrowUp": "↑",
        "ArrowDown": "↓",
        "ArrowLeft": "←",
        "ArrowRight": "→",
        "Escape": "Esc",
        "Enter": "Enter",
        "Tab": "Tab",
        "Backspace": "Backspace"
    };
    
    if (keyNames[keyCode]) return keyNames[keyCode];
    
    // KeyX -> X
    if (keyCode.startsWith("Key")) return keyCode.slice(3);
    
    // DigitX -> X
    if (keyCode.startsWith("Digit")) return keyCode.slice(5);
    
    return keyCode;
}

/**
 * Форматировать кнопку мыши
 */
export function formatMouseButton(button: number): string {
    switch (button) {
        case 0: return "ЛКМ";
        case 1: return "СКМ";
        case 2: return "ПКМ";
        default: return `Мышь ${button}`;
    }
}

// ============================================
// КЛАСС МЕНЕДЖЕРА ВВОДА
// ============================================

/**
 * Менеджер ввода
 */
export class TankInputManager {
    private state: InputState;
    private config: InputConfig;
    private bindings: KeyBinding[];
    
    private pressedKeys: Set<string> = new Set();
    private pressedMouseButtons: Set<number> = new Set();
    
    private onActionCallbacks: Map<InputAction, (() => void)[]> = new Map();
    
    constructor(config: Partial<InputConfig> = {}, bindings: KeyBinding[] = DEFAULT_KEY_BINDINGS) {
        this.state = createInitialInputState();
        this.config = { ...DEFAULT_INPUT_CONFIG, ...config };
        this.bindings = [...bindings];
    }
    
    /**
     * Обработать нажатие клавиши
     */
    handleKeyDown(event: KeyboardEvent): void {
        const keyCode = event.code;
        
        if (this.pressedKeys.has(keyCode)) return;
        this.pressedKeys.add(keyCode);
        
        const action = getActionForKey(keyCode, this.bindings);
        if (action) {
            this.setActionState(action, true);
            this.triggerAction(action);
        }
    }
    
    /**
     * Обработать отпускание клавиши
     */
    handleKeyUp(event: KeyboardEvent): void {
        const keyCode = event.code;
        this.pressedKeys.delete(keyCode);
        
        const action = getActionForKey(keyCode, this.bindings);
        if (action) {
            this.setActionState(action, false);
        }
    }
    
    /**
     * Обработать нажатие кнопки мыши
     */
    handleMouseDown(event: MouseEvent): void {
        const button = event.button;
        
        if (this.pressedMouseButtons.has(button)) return;
        this.pressedMouseButtons.add(button);
        
        const action = getActionForMouseButton(button, this.bindings);
        if (action) {
            this.setActionState(action, true);
            this.triggerAction(action);
        }
    }
    
    /**
     * Обработать отпускание кнопки мыши
     */
    handleMouseUp(event: MouseEvent): void {
        const button = event.button;
        this.pressedMouseButtons.delete(button);
        
        const action = getActionForMouseButton(button, this.bindings);
        if (action) {
            this.setActionState(action, false);
        }
    }
    
    /**
     * Обработать движение мыши
     */
    handleMouseMove(event: MouseEvent): void {
        this.state.mouseDeltaX = event.movementX * this.config.mouseSensitivity;
        this.state.mouseDeltaY = event.movementY * this.config.mouseSensitivity;
        
        if (this.config.mouseInvertY) {
            this.state.mouseDeltaY *= -1;
        }
        
        this.state.mouseX = event.clientX;
        this.state.mouseY = event.clientY;
    }
    
    /**
     * Обработать колесо мыши
     */
    handleMouseWheel(event: WheelEvent): void {
        this.state.mouseWheelDelta = Math.sign(event.deltaY);
    }
    
    /**
     * Установить состояние действия
     */
    private setActionState(action: InputAction, pressed: boolean): void {
        switch (action) {
            case "forward": this.state.moveForward = pressed; break;
            case "backward": this.state.moveBackward = pressed; break;
            case "left": this.state.moveLeft = pressed; break;
            case "right": this.state.moveRight = pressed; break;
            case "turret_left": this.state.turretLeft = pressed; break;
            case "turret_right": this.state.turretRight = pressed; break;
            case "fire": this.state.fire = pressed; break;
            case "alt_fire": this.state.altFire = pressed; break;
            case "reload": this.state.reload = pressed; break;
            case "ability": this.state.ability = pressed; break;
            case "module_1": this.state.module1 = pressed; break;
            case "module_2": this.state.module2 = pressed; break;
            case "module_3": this.state.module3 = pressed; break;
            case "jump": this.state.jump = pressed; break;
            case "crouch": this.state.crouch = pressed; break;
            case "sprint": this.state.sprint = pressed; break;
            case "aim": this.state.aim = pressed; break;
        }
    }
    
    /**
     * Вызвать callbacks для действия
     */
    private triggerAction(action: InputAction): void {
        const callbacks = this.onActionCallbacks.get(action);
        if (callbacks) {
            for (const callback of callbacks) {
                callback();
            }
        }
    }
    
    /**
     * Подписаться на действие
     */
    onAction(action: InputAction, callback: () => void): void {
        if (!this.onActionCallbacks.has(action)) {
            this.onActionCallbacks.set(action, []);
        }
        this.onActionCallbacks.get(action)!.push(callback);
    }
    
    /**
     * Отписаться от действия
     */
    offAction(action: InputAction, callback: () => void): void {
        const callbacks = this.onActionCallbacks.get(action);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    /**
     * Получить текущее состояние
     */
    getState(): InputState {
        return { ...this.state };
    }
    
    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<InputConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * Обновить биндинг
     */
    updateBinding(action: InputAction, primary?: string, secondary?: string): void {
        const binding = this.bindings.find(b => b.action === action);
        if (binding) {
            if (primary !== undefined) binding.primary = primary;
            if (secondary !== undefined) binding.secondary = secondary;
        }
    }
    
    /**
     * Сбросить биндинги к дефолтным
     */
    resetBindings(): void {
        this.bindings = [...DEFAULT_KEY_BINDINGS];
    }
    
    /**
     * Сбросить дельты мыши (вызывать после обработки)
     */
    resetMouseDeltas(): void {
        this.state.mouseDeltaX = 0;
        this.state.mouseDeltaY = 0;
        this.state.mouseWheelDelta = 0;
    }
    
    /**
     * Очистить все нажатия
     */
    clearAll(): void {
        this.pressedKeys.clear();
        this.pressedMouseButtons.clear();
        this.state = createInitialInputState();
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.clearAll();
        this.onActionCallbacks.clear();
    }
}

export default {
    DEFAULT_KEY_BINDINGS,
    DEFAULT_INPUT_CONFIG
};

