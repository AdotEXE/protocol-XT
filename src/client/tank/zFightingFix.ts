/**
 * Утилита для предотвращения z-fighting (когда блоки соприкасаются на одной плоскости)
 * Добавляет небольшие смещения к позициям мешей, чтобы избежать артефактов рендеринга
 * 
 * ВАЖНО: ВСЕГДА используйте addZFightingOffset() при установке позиций деталей,
 * которые могут соприкасаться с основным мешем или другими деталями!
 * 
 * Пример:
 *   // ❌ НЕПРАВИЛЬНО (может вызвать z-fighting):
 *   detail.position = new Vector3(x, y, z);
 *   
 *   // ✅ ПРАВИЛЬНО:
 *   detail.position = addZFightingOffset(new Vector3(x, y, z), "forward");
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Минимальное смещение для предотвращения z-fighting (в единицах мира)
 * Увеличено до 0.01 для более надежного предотвращения артефактов
 * 
 * ВАЖНО: Не уменьшайте это значение! Даже 0.001 может быть недостаточно
 * для предотвращения артефактов рендеринга в некоторых случаях.
 */
const Z_FIGHTING_OFFSET = 0.01;

/**
 * Добавляет небольшое смещение к позиции, чтобы избежать z-fighting
 * @param position Исходная позиция
 * @param offsetDirection Направление смещения (0.001 по нужной оси)
 * @returns Новая позиция с небольшим смещением
 */
export function addZFightingOffset(
    position: Vector3,
    offsetDirection: "x" | "y" | "z" | "forward" | "backward" | "up" | "down" = "forward"
): Vector3 {
    const offset = new Vector3(0, 0, 0);
    
    switch (offsetDirection) {
        case "x":
            offset.x = Z_FIGHTING_OFFSET;
            break;
        case "y":
            offset.y = Z_FIGHTING_OFFSET;
            break;
        case "z":
        case "forward":
            offset.z = Z_FIGHTING_OFFSET;
            break;
        case "backward":
            offset.z = -Z_FIGHTING_OFFSET;
            break;
        case "up":
            offset.y = Z_FIGHTING_OFFSET;
            break;
        case "down":
            offset.y = -Z_FIGHTING_OFFSET;
            break;
    }
    
    return position.add(offset);
}

/**
 * Создает позицию с автоматическим смещением для предотвращения z-fighting
 * @param x Координата X
 * @param y Координата Y
 * @param z Координата Z
 * @param offsetDirection Направление смещения
 * @returns Vector3 с небольшим смещением
 */
export function createOffsetPosition(
    x: number,
    y: number,
    z: number,
    offsetDirection: "x" | "y" | "z" | "forward" | "backward" | "up" | "down" = "forward"
): Vector3 {
    return addZFightingOffset(new Vector3(x, y, z), offsetDirection);
}

/**
 * Применяет смещение к существующей позиции меша
 * Используется для деталей, которые могут соприкасаться с основным мешем
 * @param position Исходная позиция
 * @param parentPosition Позиция родительского меша (для определения направления смещения)
 * @returns Новая позиция со смещением
 */
export function applyZFightingFix(
    position: Vector3,
    parentPosition?: Vector3
): Vector3 {
    if (!parentPosition) {
        // Если нет родителя, просто добавляем небольшое смещение вперед
        return addZFightingOffset(position, "forward");
    }
    
    // Определяем направление от родителя к детали
    const direction = position.subtract(parentPosition).normalize();
    
    // Добавляем смещение в направлении от родителя
    if (Math.abs(direction.z) > Math.abs(direction.x) && Math.abs(direction.z) > Math.abs(direction.y)) {
        return addZFightingOffset(position, direction.z > 0 ? "forward" : "backward");
    } else if (Math.abs(direction.y) > Math.abs(direction.x)) {
        return addZFightingOffset(position, direction.y > 0 ? "up" : "down");
    } else {
        return addZFightingOffset(position, "x");
    }
}

/**
 * Умная функция для создания позиции детали с автоматическим смещением
 * Автоматически определяет направление смещения на основе координат
 * @param x Координата X
 * @param y Координата Y
 * @param z Координата Z
 * @param parentSize Размеры родительского меша {width, height, depth}
 * @returns Vector3 с автоматическим смещением для предотвращения z-fighting
 */
export function createDetailPosition(
    x: number,
    y: number,
    z: number,
    parentSize?: { width: number; height: number; depth: number }
): Vector3 {
    const basePos = new Vector3(x, y, z);
    
    if (!parentSize) {
        // Если нет информации о родителе, добавляем смещение вперед
        return addZFightingOffset(basePos, "forward");
    }
    
    // Определяем, на какой поверхности находится деталь
    const threshold = 0.1; // Порог для определения "на поверхности"
    
    // Проверяем, находится ли деталь на лобовой поверхности (z близко к depth/2)
    if (Math.abs(z - parentSize.depth / 2) < threshold) {
        return addZFightingOffset(basePos, "forward");
    }
    // Проверяем, находится ли деталь на задней поверхности (z близко к -depth/2)
    if (Math.abs(z + parentSize.depth / 2) < threshold) {
        return addZFightingOffset(basePos, "backward");
    }
    // Проверяем, находится ли деталь на верхней поверхности (y близко к height/2)
    if (Math.abs(y - parentSize.height / 2) < threshold) {
        return addZFightingOffset(basePos, "up");
    }
    // Проверяем, находится ли деталь на боковой поверхности (x близко к width/2 или -width/2)
    if (Math.abs(Math.abs(x) - parentSize.width / 2) < threshold) {
        return addZFightingOffset(basePos, x > 0 ? "x" : "x");
    }
    
    // По умолчанию - смещение вперед
    return addZFightingOffset(basePos, "forward");
}

