/**
 * Обёртки над loadingScreen для использования в Game.
 * Централизует вызовы showLoading, setLoadingProgress, setLoadingStatus, hideLoading.
 */

import { showLoading, setLoadingProgress as setProgress, setLoadingStatus, hideLoading } from "../loadingScreen";

export function createLoadingScreen(): void {
    showLoading();
}

export function updateLoadingProgress(progress: number, stage: string): void {
    const targetProgress = Math.min(100, Math.max(0, progress));
    setProgress(targetProgress);
    setLoadingStatus(stage);
}

export function hideLoadingScreen(): void {
    hideLoading(true);
}
