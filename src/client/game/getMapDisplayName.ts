/**
 * Отображаемые названия карт для UI (старт игры, уведомления).
 */

const MAP_DISPLAY_NAMES: Record<string, string> = {
    normal: "Эта самая карта",
    sandbox: "Песочница",
    polygon: "Полигон",
    frontline: "Передовая",
    ruins: "Руины",
    canyon: "Ущелье",
    industrial: "Промзона",
    urban_warfare: "Городские бои",
    underground: "Подземелье",
    coastal: "Побережье",
    tartaria: "Тартария"
};

/**
 * Возвращает локализованное название карты или сам mapType, если названия нет.
 */
export function getMapDisplayName(mapType: string): string {
    return MAP_DISPLAY_NAMES[mapType] ?? mapType;
}
