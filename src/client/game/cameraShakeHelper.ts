// ═══════════════════════════════════════════════════════════════════════════
// CAMERA SHAKE HELPER - логика тряски камеры (скорость, затухание, смещение)
// ═══════════════════════════════════════════════════════════════════════════

import type { Vector3 } from "@babylonjs/core";

/** Состояние тряски камеры (мутируется на месте для минимизации аллокаций). */
export interface CameraShakeState {
    intensity: number;
    decay: number;
    offset: Vector3;
    time: number;
}

/** Скорость затухания тряски по умолчанию. */
export const DEFAULT_CAMERA_SHAKE_DECAY = 0.95;

/** Порог скорости танка (80%+ от maxSpeed) для включения тряски. */
const SPEED_THRESHOLD = 0.8;

/** Множитель интенсивности тряски. */
const INTENSITY_FACTOR = 0.5;

/** Объект танка для расчёта speed factor (getSpeed, moveSpeed). */
export interface TankForCameraShake {
    getSpeed?: () => number;
    moveSpeed?: number;
}

/**
 * Обновляет состояние тряски камеры на один кадр.
 * Тряска включается только при 80%+ скорости танка; иначе интенсивность затухает.
 * Мутирует state.intensity и state.offset.
 */
export function updateCameraShakeState(
    state: CameraShakeState,
    tank: TankForCameraShake | null
): void {
    if (state.intensity > 0.01) {
        let speedFactor = 0;
        if (tank && typeof tank.getSpeed === "function") {
            const speed = Math.abs(tank.getSpeed());
            const maxSpeed = tank.moveSpeed ?? 24;
            const speedRatio = speed / maxSpeed;
            if (speedRatio >= SPEED_THRESHOLD) {
                const normalizedSpeed = (speedRatio - SPEED_THRESHOLD) / (1 - SPEED_THRESHOLD);
                speedFactor = normalizedSpeed * normalizedSpeed;
            }
        }

        if (speedFactor <= 0) {
            state.intensity *= state.decay;
            state.offset.set(0, 0, 0);
            return;
        }

        state.time += 0.1;
        const effectiveIntensity = state.intensity * speedFactor * INTENSITY_FACTOR;
        state.offset.set(
            (Math.random() - 0.5) * effectiveIntensity,
            (Math.random() - 0.5) * effectiveIntensity,
            (Math.random() - 0.5) * effectiveIntensity
        );
        state.intensity *= state.decay;
    } else {
        state.intensity = 0;
        state.offset.set(0, 0, 0);
    }
}

/**
 * Добавляет импульс тряски (например, от попадания).
 * Берётся максимум из текущей и новой интенсивности.
 */
export function addCameraShakeIntensity(state: CameraShakeState, intensity: number): void {
    state.intensity = Math.max(state.intensity, intensity);
}
