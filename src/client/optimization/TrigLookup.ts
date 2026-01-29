/**
 * @module optimization/TrigLookup
 * @description Lookup tables для быстрых тригонометрических вычислений
 * 
 * ПРОБЛЕМА: 50+ вызовов Math.sin/cos/atan2 в enemyTank.ts каждый кадр
 * РЕШЕНИЕ: Предвычисленные таблицы для часто используемых углов
 * 
 * ОЖИДАЕМЫЙ ЭФФЕКТ: +2-3 FPS за счёт замены trig функций на lookup
 * 
 * ТОЧНОСТЬ: 1 градус (достаточно для AI и визуальных эффектов)
 * Для физики используйте стандартные Math функции!
 */

// Размер таблицы - 3600 записей для точности 0.1 градуса
const TABLE_SIZE = 3600;
const DEG_TO_INDEX = TABLE_SIZE / 360;
const RAD_TO_DEG = 180 / Math.PI;

// Предвычисленные таблицы
const SIN_TABLE = new Float32Array(TABLE_SIZE);
const COS_TABLE = new Float32Array(TABLE_SIZE);

// Инициализация таблиц
for (let i = 0; i < TABLE_SIZE; i++) {
    const rad = (i / DEG_TO_INDEX) * Math.PI / 180;
    SIN_TABLE[i] = Math.sin(rad);
    COS_TABLE[i] = Math.cos(rad);
}

/**
 * Нормализует угол к диапазону [0, 360)
 */
function normalizeAngle(degrees: number): number {
    return ((degrees % 360) + 360) % 360;
}

/**
 * Быстрый синус (угол в градусах)
 * Точность: ±0.1 градуса
 * 
 * @example
 * fastSinDeg(90) // 1
 * fastSinDeg(45) // ~0.707
 */
export function fastSinDeg(degrees: number): number {
    const index = (normalizeAngle(degrees) * DEG_TO_INDEX) | 0;
    return SIN_TABLE[index] ?? 0;
}

/**
 * Быстрый косинус (угол в градусах)
 * Точность: ±0.1 градуса
 */
export function fastCosDeg(degrees: number): number {
    const index = (normalizeAngle(degrees) * DEG_TO_INDEX) | 0;
    return COS_TABLE[index] ?? 1;
}

/**
 * Быстрый синус (угол в радианах)
 * Точность: ±0.002 радиана
 */
export function fastSin(radians: number): number {
    return fastSinDeg(radians * RAD_TO_DEG);
}

/**
 * Быстрый косинус (угол в радианах)
 * Точность: ±0.002 радиана
 */
export function fastCos(radians: number): number {
    return fastCosDeg(radians * RAD_TO_DEG);
}

/**
 * Быстрый atan2 с использованием аппроксимации
 * Точность: ±0.01 радиана (достаточно для AI)
 * 
 * Использует полиномиальную аппроксимацию вместо Math.atan2
 */
export function fastAtan2(y: number, x: number): number {
    // Обработка особых случаев
    if (x === 0) {
        if (y > 0) return Math.PI / 2;
        if (y < 0) return -Math.PI / 2;
        return 0;
    }
    
    // Используем быструю аппроксимацию atan для |y/x| <= 1
    const abs_y = Math.abs(y);
    const abs_x = Math.abs(x);
    
    let angle: number;
    if (abs_x >= abs_y) {
        // |y/x| <= 1
        const r = y / x;
        // Полиномиальная аппроксимация atan(r) для |r| <= 1
        // atan(r) ≈ r - r³/3 + r⁵/5 (урезанный ряд Тейлора)
        // Упрощённая версия: atan(r) ≈ r * (0.97239 - 0.19195 * r²)
        const r2 = r * r;
        angle = r * (0.97239 - 0.19195 * r2);
    } else {
        // |x/y| < 1
        const r = x / y;
        const r2 = r * r;
        angle = (y > 0 ? Math.PI / 2 : -Math.PI / 2) - r * (0.97239 - 0.19195 * r2);
    }
    
    // Коррекция квадранта
    if (x < 0) {
        return y >= 0 ? angle + Math.PI : angle - Math.PI;
    }
    
    return angle;
}

/**
 * Быстрое вычисление расстояния (без sqrt для сравнений)
 * Используйте для сравнения расстояний вместо Vector3.Distance()
 */
export function fastDistanceSquared(x1: number, z1: number, x2: number, z2: number): number {
    const dx = x2 - x1;
    const dz = z2 - z1;
    return dx * dx + dz * dz;
}

/**
 * Быстрая нормализация угла к [-π, π]
 */
export function normalizeAngleRad(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

/**
 * Интерполяция углов (учитывает переход через 0/360)
 */
export function lerpAngleDeg(from: number, to: number, t: number): number {
    let diff = normalizeAngle(to - from);
    if (diff > 180) diff -= 360;
    return normalizeAngle(from + diff * t);
}

