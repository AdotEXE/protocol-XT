/**
 * Обновление прогресса достижения "explorer" (посещённые карты) в localStorage и в системе достижений.
 */

const STORAGE_KEY = "visitedMaps";
const MAX_VISITED_MAPS = 50;

export interface AchievementsSystemLike {
    setProgress(id: string, value: number): void;
}

/**
 * Добавляет текущую карту в список посещённых (если ещё не добавлена), сохраняет в localStorage
 * и обновляет прогресс достижения "explorer".
 */
export function updateExplorerProgress(
    currentMapType: string,
    achievementsSystem: AchievementsSystemLike
): void {
    try {
        const visitedMaps = JSON.parse(
            localStorage.getItem(STORAGE_KEY) ?? "[]"
        ) as string[];

        if (!visitedMaps.includes(currentMapType)) {
            visitedMaps.push(currentMapType);
            if (visitedMaps.length > MAX_VISITED_MAPS) {
                visitedMaps.shift();
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(visitedMaps));
        }

        achievementsSystem.setProgress("explorer", visitedMaps.length);
    } catch {
        // localStorage or JSON error — ignore
    }
}
