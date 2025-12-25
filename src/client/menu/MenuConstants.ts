/**
 * Константы для системы меню
 */

import { MapType, MapInfo } from './MenuTypes';

/**
 * Строки локализации
 */
export const MENU_LANG = {
    ru: {
        play: "ИГРАТЬ",
        quickStart: "БЫСТРЫЙ СТАРТ",
        selectMap: "ВЫБОР КАРТЫ",
        garage: "ГАРАЖ",
        stats: "СТАТИСТИКА",
        skills: "НАВЫКИ",
        options: "НАСТРОЙКИ",
        controls: "УПРАВЛЕНИЕ",
        version: "Версия",
        tankCombat: "ТАНКОВЫЙ СИМУЛЯТОР",
        mapSelection: "ВЫБОР КАРТЫ",
        back: "НАЗАД",
        start: "НАЧАТЬ",
        // Карты
        normalMap: "Эта самая карта",
        normalMapDesc: "Полностью случайная генерация с разнообразными биомами, дорогами и природой",
        sandboxMap: "Песочница",
        sandboxMapDesc: "Чистая плоская поверхность для тестирования",
        polygonMap: "Полигон",
        polygonMapDesc: "Военный полигон с ангарами, техникой, складами, кранами и вышками",
        frontlineMap: "Передовая",
        frontlineMapDesc: "Разрушенная линия фронта с кратерами, окопами и укреплениями",
        ruinsMap: "Руины",
        ruinsMapDesc: "Полуразрушенный город военного времени с обрушенными зданиями",
        canyonMap: "Ущелье",
        canyonMapDesc: "Горная местность с проходами, реками, озёрами, лесами и деревнями",
        industrialMap: "Промзона",
        industrialMapDesc: "Крупная промышленная зона с заводами, портом и ж/д терминалом",
        urbanWarfareMap: "Городские бои",
        urbanWarfareMapDesc: "Плотная городская застройка с баррикадами и укреплениями",
        undergroundMap: "Подземелье",
        undergroundMapDesc: "Система пещер, шахт и туннелей под землёй",
        coastalMap: "Побережье",
        coastalMapDesc: "Береговая линия с портом, маяками, пляжами и утёсами",
        tartariaMap: "Тартария",
        tartariaMapDesc: "Город Тарту на основе реальных данных высот (27-82м)"
    },
    en: {
        play: "PLAY",
        quickStart: "QUICK START",
        selectMap: "SELECT MAP",
        garage: "GARAGE",
        stats: "STATS",
        skills: "SKILLS",
        options: "SETTINGS",
        controls: "CONTROLS",
        version: "Version",
        tankCombat: "TANK COMBAT",
        mapSelection: "MAP SELECTION",
        back: "BACK",
        start: "START",
        // Maps
        normalMap: "This Map",
        normalMapDesc: "Fully random generation with diverse biomes, roads and nature",
        sandboxMap: "Sandbox",
        sandboxMapDesc: "Clean flat surface for testing",
        polygonMap: "Polygon",
        polygonMapDesc: "Military polygon with hangars, vehicles, warehouses, cranes and towers",
        frontlineMap: "Frontline",
        frontlineMapDesc: "Destroyed front line with craters, trenches and fortifications",
        ruinsMap: "Ruins",
        ruinsMapDesc: "Half-destroyed wartime city with collapsed buildings",
        canyonMap: "Canyon",
        canyonMapDesc: "Mountain terrain with passages, rivers, lakes, forests and villages",
        industrialMap: "Industrial Zone",
        industrialMapDesc: "Large industrial zone with factories, port and railway terminal",
        urbanWarfareMap: "Urban Warfare",
        urbanWarfareMapDesc: "Dense urban development with barricades and fortifications",
        undergroundMap: "Underground",
        undergroundMapDesc: "System of caves, mines and tunnels underground",
        coastalMap: "Coastal",
        coastalMapDesc: "Coastline with port, lighthouses, beaches and cliffs",
        tartariaMap: "Tartaria",
        tartariaMapDesc: "Tartu city based on real elevation data (27-82m)"
    }
};

/**
 * Информация о доступных картах
 */
export const MAP_LIST: MapInfo[] = [
    { id: "normal", nameKey: "normalMap", descKey: "normalMapDesc" },
    { id: "sandbox", nameKey: "sandboxMap", descKey: "sandboxMapDesc" },
    { id: "polygon", nameKey: "polygonMap", descKey: "polygonMapDesc" },
    { id: "frontline", nameKey: "frontlineMap", descKey: "frontlineMapDesc" },
    { id: "ruins", nameKey: "ruinsMap", descKey: "ruinsMapDesc" },
    { id: "canyon", nameKey: "canyonMap", descKey: "canyonMapDesc" },
    { id: "industrial", nameKey: "industrialMap", descKey: "industrialMapDesc" },
    { id: "urban_warfare", nameKey: "urbanWarfareMap", descKey: "urbanWarfareMapDesc" },
    { id: "underground", nameKey: "undergroundMap", descKey: "undergroundMapDesc" },
    { id: "coastal", nameKey: "coastalMap", descKey: "coastalMapDesc" },
    { id: "tartaria", nameKey: "tartariaMap", descKey: "tartariaMapDesc", isNew: true }
];

/**
 * Цвета меню
 */
export const MENU_COLORS = {
    PRIMARY: "#0f0",
    SECONDARY: "#00ff00",
    ACCENT: "#00ffff",
    WARNING: "#ffff00",
    DANGER: "#ff0000",
    BG_DARK: "#000000",
    BG_PANEL: "#0a0a0a",
    TEXT: "#00ff00",
    TEXT_DIM: "#006600",
    BORDER: "#0f0",
    HOVER: "#00ff0033"
};

/**
 * Размеры элементов меню
 */
export const MENU_SIZES = {
    BUTTON_WIDTH: 300,
    BUTTON_HEIGHT: 50,
    BUTTON_MARGIN: 10,
    TITLE_SIZE: 48,
    SUBTITLE_SIZE: 24,
    TEXT_SIZE: 16,
    PADDING: 20
};

