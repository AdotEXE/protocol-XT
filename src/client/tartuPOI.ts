/**
 * Tartu POI - Достопримечательности города Тарту
 * 
 * Координаты реальных достопримечательностей для размещения в игре
 */

export interface TartuLandmark {
    id: string;
    name: string;
    type: "university" | "church" | "museum" | "government" | "park" | "bridge";
    position: { x: number; z: number };
    size: { width: number; depth: number; height?: number };
    rotation?: number; // В радианах
    poiType?: "capturePoint" | "repairStation" | "ammoDepot" | "fuelDepot" | "radarStation";
}

/**
 * Реальные достопримечательности Тарту
 */
export const TARTU_LANDMARKS: TartuLandmark[] = [
    // Университет Тарту (главное здание)
    {
        id: "university_main",
        name: "Tartu Ülikool",
        type: "university",
        position: { x: -150, z: -50 },
        size: { width: 40, depth: 30, height: 15 },
        poiType: "capturePoint"
    },
    // Ратуша (Raekoja plats)
    {
        id: "town_hall",
        name: "Tartu Raekoda",
        type: "government",
        position: { x: 0, z: 0 },
        size: { width: 20, depth: 20, height: 12 },
        poiType: "capturePoint"
    },
    // Домский собор (руины на Toomemägi)
    {
        id: "cathedral_ruins",
        name: "Toomkirik",
        type: "church",
        position: { x: -200, z: -100 },
        size: { width: 25, depth: 35, height: 8 },
        poiType: "capturePoint"
    },
    // Мост через Эмайыги (Kaarsild)
    {
        id: "kaarsild",
        name: "Kaarsild",
        type: "bridge",
        position: { x: 0, z: 0 },
        size: { width: 15, depth: 60, height: 5 },
        rotation: 0
    },
    // Церковь Святого Иоанна
    {
        id: "st_johns_church",
        name: "Jaani kirik",
        type: "church",
        position: { x: 50, z: -80 },
        size: { width: 18, depth: 25, height: 20 },
        poiType: "capturePoint"
    },
    // Музей Тартуского университета
    {
        id: "university_museum",
        name: "Tartu Ülikooli muuseum",
        type: "museum",
        position: { x: -120, z: -30 },
        size: { width: 15, depth: 20, height: 8 },
        poiType: "repairStation"
    },
    // Главное здание университета (другое)
    {
        id: "university_old",
        name: "Tartu Ülikool (vana hoone)",
        type: "university",
        position: { x: -180, z: -60 },
        size: { width: 30, depth: 25, height: 12 },
        poiType: "ammoDepot"
    }
];

/**
 * Получить достопримечательности, которые пересекаются с указанным чанком
 * 
 * @param chunkX Координата X чанка
 * @param chunkZ Координата Z чанка
 * @param chunkSize Размер чанка
 * @returns Массив достопримечательностей в чанке
 */
export function getTartuLandmarksInChunk(
    chunkX: number,
    chunkZ: number,
    chunkSize: number
): TartuLandmark[] {
    const worldX = chunkX * chunkSize;
    const worldZ = chunkZ * chunkSize;
    const chunkMinX = worldX;
    const chunkMaxX = worldX + chunkSize;
    const chunkMinZ = worldZ;
    const chunkMaxZ = worldZ + chunkSize;
    
    return TARTU_LANDMARKS.filter(landmark => {
        const { x, z } = landmark.position;
        const { width, depth } = landmark.size;
        
        // Проверяем пересечение с чанком
        // Учитываем размер здания
        const landmarkMinX = x - width / 2;
        const landmarkMaxX = x + width / 2;
        const landmarkMinZ = z - depth / 2;
        const landmarkMaxZ = z + depth / 2;
        
        return !(landmarkMaxX < chunkMinX || landmarkMinX > chunkMaxX ||
                 landmarkMaxZ < chunkMinZ || landmarkMinZ > chunkMaxZ);
    });
}

/**
 * Получить все достопримечательности
 */
export function getTartuLandmarks(): TartuLandmark[] {
    return TARTU_LANDMARKS;
}

