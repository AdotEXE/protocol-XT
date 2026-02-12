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
    custom: "МЕТКА",
    // Game mode specific labels
    safe_zone: "ЗОНА",
    danger_zone: "ОПАСНО",
    next_zone: "СЛЕД",
    control_point: "ТОЧКА",
    team_base: "БАЗА",
    escort_payload: "КОНВОЙ",
    escort_start: "СТАРТ",
    escort_end: "ФИНИШ",
    wave_indicator: "ВОЛНА",
    boss_location: "БОСС",
    boss_area: "ЗОНА",
    flag_base: "ФЛАГ",
    flag_carried: "ФЛАГ"
};

/**
 * Возвращает короткую подпись типа POI для отображения в панели захвата.
 */
export function getPOICaptureTypeLabel(poiType: string): string {
    return LABELS[poiType] ?? "ТОЧКА";
}
