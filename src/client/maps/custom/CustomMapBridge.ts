/**
 * @module maps/custom/CustomMapBridge
 * @description Мост для коммуникации между PolyGenStudio и TX игрой
 * 
 * Обрабатывает postMessage события для загрузки карт из редактора
 */

import { getCustomMapGenerator, TXMapData } from './CustomMapGenerator';
import { exportGameMap } from '../GameMapExporter';
import { initializeGeneratorsForEditor } from '../EditorMapGeneratorInitializer';
import { Engine } from "@babylonjs/core/Engines/engine";

export interface MapLoadMessage {
    type: 'LOAD_CUSTOM_MAP';
    mapData: TXMapData;
    autoPlay?: boolean;
}

export interface MapListMessage {
    type: 'GET_CUSTOM_MAPS';
}

export interface GetGameMapMessage {
    type: 'GET_GAME_MAP';
    mapId: string;
}

export interface MapLoadedResponse {
    type: 'MAP_LOADED';
    success: boolean;
    mapName: string;
    error?: string;
}

export interface MapListResponse {
    type: 'CUSTOM_MAPS_LIST';
    maps: string[];
}

type MapMessage = MapLoadMessage | MapListMessage | GetGameMapMessage;

let bridgeInitialized = false;
let onMapLoadCallback: ((mapData: TXMapData, autoPlay?: boolean) => void) | null = null;

/**
 * Инициализировать мост для приёма карт из PolyGenStudio
 */
export function initCustomMapBridge(onMapLoad?: (mapData: TXMapData, autoPlay?: boolean) => void): void {
    if (bridgeInitialized) {
        console.log("[CustomMapBridge] Already initialized");
        return;
    }

    onMapLoadCallback = onMapLoad || null;

    window.addEventListener('message', handleMapMessage);
    bridgeInitialized = true;
    console.log("[CustomMapBridge] Initialized and listening for map data");
}

/**
 * Отключить мост
 */
export function destroyCustomMapBridge(): void {
    window.removeEventListener('message', handleMapMessage);
    bridgeInitialized = false;
    onMapLoadCallback = null;
    console.log("[CustomMapBridge] Destroyed");
}

/**
 * Обработчик входящих сообщений
 */
function handleMapMessage(event: MessageEvent): void {
    const data = event.data as MapMessage;

    if (!data || !data.type) return;

    switch (data.type) {
        case 'LOAD_CUSTOM_MAP':
            handleLoadMap(data as MapLoadMessage, event.source as Window);
            break;
        case 'GET_CUSTOM_MAPS':
            handleGetMaps(event.source as Window);
            break;
        case 'GET_GAME_MAP':
            handleGetGameMap(data as GetGameMapMessage, event.source as Window);
            break;
    }
}

/**
 * Загрузить карту из сообщения
 */
function handleLoadMap(message: MapLoadMessage, source: Window | null): void {
    console.log("[CustomMapBridge] Received map:", message.mapData.name);

    const generator = getCustomMapGenerator();

    try {
        generator.loadMapData(message.mapData);

        // Save to localStorage for persistence
        saveMapToLocal(message.mapData);

        // Call callback if set
        if (onMapLoadCallback) {
            onMapLoadCallback(message.mapData, message.autoPlay);
        }

        // Send success response
        sendResponse(source, {
            type: 'MAP_LOADED',
            success: true,
            mapName: message.mapData.name
        });

        console.log(`[CustomMapBridge] Map '${message.mapData.name}' loaded successfully`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        sendResponse(source, {
            type: 'MAP_LOADED',
            success: false,
            mapName: message.mapData.name,
            error: errorMessage
        });

        console.error("[CustomMapBridge] Failed to load map:", errorMessage);
    }
}

/**
 * Отправить список карт
 */
function handleGetMaps(source: Window | null): void {
    const mapsJson = localStorage.getItem('tx_custom_maps');
    let maps: string[] = [];

    if (mapsJson) {
        try {
            const mapsData = JSON.parse(mapsJson) as Record<string, TXMapData>;
            maps = Object.keys(mapsData);
        } catch {
            maps = [];
        }
    }

    sendResponse(source, {
        type: 'CUSTOM_MAPS_LIST',
        maps
    });
}

/**
 * Сохранить карту в localStorage
 */
function saveMapToLocal(mapData: TXMapData): void {
    const mapsJson = localStorage.getItem('tx_custom_maps');
    let maps: Record<string, TXMapData> = {};

    if (mapsJson) {
        try {
            maps = JSON.parse(mapsJson);
        } catch {
            maps = {};
        }
    }

    maps[mapData.name] = mapData;
    localStorage.setItem('tx_custom_maps', JSON.stringify(maps));

    // Update maps list
    const mapsList = Object.keys(maps);
    localStorage.setItem('tx_custom_maps_list', JSON.stringify(mapsList));

    console.log(`[CustomMapBridge] Saved map '${mapData.name}' to localStorage`);
}

/**
 * Отправить ответ в iframe/parent
 */
function sendResponse(target: Window | null, response: MapLoadedResponse | MapListResponse): void {
    if (target && target !== window) {
        target.postMessage(response, '*');
    }
}

/**
 * Загрузить список сохранённых карт
 */
export function getCustomMapsList(): string[] {
    const listJson = localStorage.getItem('tx_custom_maps_list');
    if (!listJson) return [];

    try {
        return JSON.parse(listJson) as string[];
    } catch {
        return [];
    }
}

/**
 * Получить данные конкретной карты
 */
export function getCustomMapData(mapName: string): TXMapData | null {
    const mapsJson = localStorage.getItem('tx_custom_maps');
    if (!mapsJson) return null;

    try {
        const maps = JSON.parse(mapsJson) as Record<string, TXMapData>;
        return maps[mapName] || null;
    } catch {
        return null;
    }
}

/**
 * Удалить карту
 */
export function deleteCustomMap(mapName: string): boolean {
    const mapsJson = localStorage.getItem('tx_custom_maps');
    if (!mapsJson) return false;

    try {
        const maps = JSON.parse(mapsJson) as Record<string, TXMapData>;
        if (maps[mapName]) {
            delete maps[mapName];
            localStorage.setItem('tx_custom_maps', JSON.stringify(maps));
            localStorage.setItem('tx_custom_maps_list', JSON.stringify(Object.keys(maps)));
            console.log(`[CustomMapBridge] Deleted map '${mapName}'`);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Обработать запрос на импорт карты игры
 */
async function handleGetGameMap(message: GetGameMapMessage, source: Window | null): Promise<void> {
    console.log(`[CustomMapBridge] Export request for map: ${message.mapId}`);

    // Получаем текущую сцену (или последнюю созданную)
    const scene = Engine.LastCreatedScene;
    if (!scene) {
        console.error("[CustomMapBridge] No scene available for map export");
        return;
    }

    try {
        // Ensure generators are initialized (important if game wasn't started yet)
        initializeGeneratorsForEditor(scene);

        const mapData = await exportGameMap(message.mapId, scene);
        if (mapData) {
            console.log(`[CustomMapBridge] Sending map data to editor (${mapData.placedObjects.length} objects)`);
            if (source) {
                source.postMessage({
                    type: 'IMPORT_GAME_MAP',
                    mapData: mapData
                }, '*');
            }
        }
    } catch (e) {
        console.error("[CustomMapBridge] Failed to export game map:", e);
    }
}

