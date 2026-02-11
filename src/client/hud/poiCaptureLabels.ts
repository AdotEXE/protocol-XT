/**
 * Короткие подписи типов POI для панели прогресса захвата.
 * Используется в hud.ts showPOICaptureProgress().
 */

const LABELS: Record<string, string> = {
    capturePoint: "ТОЧКА",
    ammoDepot: "СКЛАД",
    repairStation: "РЕМОНТ",
    fuelDepot: "ТОПЛИВО",
    fuelStation: "ТОПЛИВО",
    radarStation: "РАДАР",
    garage: "ГАРАЖ",
    checkpoint: "ТОЧКА",
    objective: "ЦЕЛЬ",
    spawn: "СПАВН",
    danger: "ОПАСНОСТЬ",
    quest: "ЗАДАНИЕ",
    custom: "МЕТКА"
};

/**
 * Возвращает короткую подпись типа POI для отображения в панели захвата.
 */
export function getPOICaptureTypeLabel(poiType: string): string {
    return LABELS[poiType] ?? "ТОЧКА";
}
