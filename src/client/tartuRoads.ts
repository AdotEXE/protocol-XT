/**
 * Tartu Roads - Реальные дороги города Тарту
 * 
 * Основные улицы и дороги города Тарту на основе реальной карты
 * Координаты нормализованы для игрового пространства
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Интерфейс для сегмента дороги
 */
export interface TartuRoadSegment {
    start: { x: number; z: number };
    end: { x: number; z: number };
    width: number;
    type: "highway" | "street" | "path";
    name?: string; // Название улицы
}

/**
 * Центр карты Тарту в игровых координатах
 * Карта размером ~2000x2000 единиц, центр в (0, 0) - где стартует игрок
 */
const MAP_CENTER_X = 0;
const MAP_CENTER_Z = 0;
const MAP_SCALE = 0.5; // Масштаб для перевода реальных координат в игровые

/**
 * Реальные дороги Тарту
 * Основные улицы города с их координатами
 */
export const TARTU_ROADS: TartuRoadSegment[] = [
    // Riia tänav (главная улица, идёт с севера на юг через центр)
    {
        start: { x: MAP_CENTER_X, z: MAP_CENTER_Z - 400 },
        end: { x: MAP_CENTER_X, z: MAP_CENTER_Z + 400 },
        width: 14,
        type: "highway",
        name: "Riia tänav"
    },
    
    // Ülikooli tänav (улица университета, идёт с востока на запад)
    {
        start: { x: MAP_CENTER_X - 300, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X + 300, z: MAP_CENTER_Z },
        width: 12,
        type: "highway",
        name: "Ülikooli tänav"
    },
    
    // Narva maantee (шоссе на восток)
    {
        start: { x: MAP_CENTER_X, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X + 500, z: MAP_CENTER_Z - 100 },
        width: 14,
        type: "highway",
        name: "Narva maantee"
    },
    
    // Võru tänav (улица на юг)
    {
        start: { x: MAP_CENTER_X - 200, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X - 200, z: MAP_CENTER_Z + 400 },
        width: 10,
        type: "street",
        name: "Võru tänav"
    },
    
    // Turu tänav (рыночная улица)
    {
        start: { x: MAP_CENTER_X - 150, z: MAP_CENTER_Z - 200 },
        end: { x: MAP_CENTER_X + 150, z: MAP_CENTER_Z - 200 },
        width: 10,
        type: "street",
        name: "Turu tänav"
    },
    
    // Kompanii tänav (улица компаний)
    {
        start: { x: MAP_CENTER_X + 200, z: MAP_CENTER_Z - 300 },
        end: { x: MAP_CENTER_X + 200, z: MAP_CENTER_Z + 200 },
        width: 10,
        type: "street",
        name: "Kompanii tänav"
    },
    
    // Jakobi tänav (улица Якоба)
    {
        start: { x: MAP_CENTER_X - 300, z: MAP_CENTER_Z - 150 },
        end: { x: MAP_CENTER_X - 100, z: MAP_CENTER_Z - 150 },
        width: 8,
        type: "street",
        name: "Jakobi tänav"
    },
    
    // Lossi tänav (замковая улица)
    {
        start: { x: MAP_CENTER_X - 250, z: MAP_CENTER_Z + 100 },
        end: { x: MAP_CENTER_X + 100, z: MAP_CENTER_Z + 100 },
        width: 10,
        type: "street",
        name: "Lossi tänav"
    },
    
    // Vallikraavi tänav (улица у крепостного рва)
    {
        start: { x: MAP_CENTER_X - 400, z: MAP_CENTER_Z - 100 },
        end: { x: MAP_CENTER_X - 400, z: MAP_CENTER_Z + 300 },
        width: 8,
        type: "street",
        name: "Vallikraavi tänav"
    },
    
    // Pepleri tänav (улица Пеплери)
    {
        start: { x: MAP_CENTER_X + 100, z: MAP_CENTER_Z - 400 },
        end: { x: MAP_CENTER_X + 100, z: MAP_CENTER_Z + 100 },
        width: 8,
        type: "street",
        name: "Pepleri tänav"
    },
    
    // Vanemuise tänav (улица Ванемуйзе)
    {
        start: { x: MAP_CENTER_X - 200, z: MAP_CENTER_Z - 300 },
        end: { x: MAP_CENTER_X + 200, z: MAP_CENTER_Z - 300 },
        width: 10,
        type: "street",
        name: "Vanemuise tänav"
    },
    
    // Küütri tänav (улица Кюйтри)
    {
        start: { x: MAP_CENTER_X - 350, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X - 350, z: MAP_CENTER_Z + 250 },
        width: 8,
        type: "street",
        name: "Küütri tänav"
    },
    
    // Rüütli tänav (рыцарская улица)
    {
        start: { x: MAP_CENTER_X - 150, z: MAP_CENTER_Z + 200 },
        end: { x: MAP_CENTER_X + 150, z: MAP_CENTER_Z + 200 },
        width: 8,
        type: "street",
        name: "Rüütli tänav"
    },
    
    // Lai tänav (широкая улица)
    {
        start: { x: MAP_CENTER_X - 100, z: MAP_CENTER_Z - 250 },
        end: { x: MAP_CENTER_X + 250, z: MAP_CENTER_Z - 250 },
        width: 10,
        type: "street",
        name: "Lai tänav"
    },
    
    // Kooli tänav (школьная улица)
    {
        start: { x: MAP_CENTER_X + 300, z: MAP_CENTER_Z - 200 },
        end: { x: MAP_CENTER_X + 300, z: MAP_CENTER_Z + 300 },
        width: 8,
        type: "street",
        name: "Kooli tänav"
    },
    
    // Puiestee tänav (аллея)
    {
        start: { x: MAP_CENTER_X - 500, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X - 500, z: MAP_CENTER_Z + 400 },
        width: 12,
        type: "street",
        name: "Puiestee tänav"
    },
    
    // Ringtee (кольцевая дорога вокруг центра)
    {
        start: { x: MAP_CENTER_X - 300, z: MAP_CENTER_Z - 300 },
        end: { x: MAP_CENTER_X + 300, z: MAP_CENTER_Z - 300 },
        width: 10,
        type: "street",
        name: "Ringtee (север)"
    },
    {
        start: { x: MAP_CENTER_X + 300, z: MAP_CENTER_Z - 300 },
        end: { x: MAP_CENTER_X + 300, z: MAP_CENTER_Z + 300 },
        width: 10,
        type: "street",
        name: "Ringtee (восток)"
    },
    {
        start: { x: MAP_CENTER_X + 300, z: MAP_CENTER_Z + 300 },
        end: { x: MAP_CENTER_X - 300, z: MAP_CENTER_Z + 300 },
        width: 10,
        type: "street",
        name: "Ringtee (юг)"
    },
    {
        start: { x: MAP_CENTER_X - 300, z: MAP_CENTER_Z + 300 },
        end: { x: MAP_CENTER_X - 300, z: MAP_CENTER_Z - 300 },
        width: 10,
        type: "street",
        name: "Ringtee (запад)"
    },
    
    // Второстепенные улицы
    // Oru tänav
    {
        start: { x: MAP_CENTER_X - 250, z: MAP_CENTER_Z - 250 },
        end: { x: MAP_CENTER_X - 250, z: MAP_CENTER_Z + 150 },
        width: 8,
        type: "street",
        name: "Oru tänav"
    },
    // Tähe tänav
    {
        start: { x: MAP_CENTER_X - 100, z: MAP_CENTER_Z - 350 },
        end: { x: MAP_CENTER_X + 200, z: MAP_CENTER_Z - 350 },
        width: 10,
        type: "street",
        name: "Tähe tänav"
    },
    // Kalevi tänav
    {
        start: { x: MAP_CENTER_X + 150, z: MAP_CENTER_Z - 100 },
        end: { x: MAP_CENTER_X + 150, z: MAP_CENTER_Z + 250 },
        width: 8,
        type: "street",
        name: "Kalevi tänav"
    },
    // Vabaduse puiestee
    {
        start: { x: MAP_CENTER_X - 450, z: MAP_CENTER_Z - 200 },
        end: { x: MAP_CENTER_X - 450, z: MAP_CENTER_Z + 200 },
        width: 12,
        type: "street",
        name: "Vabaduse puiestee"
    },
    // Aleksandri tänav
    {
        start: { x: MAP_CENTER_X + 50, z: MAP_CENTER_Z - 300 },
        end: { x: MAP_CENTER_X + 50, z: MAP_CENTER_Z + 150 },
        width: 8,
        type: "street",
        name: "Aleksandri tänav"
    },
    // Kroonuaia tänav
    {
        start: { x: MAP_CENTER_X - 180, z: MAP_CENTER_Z - 80 },
        end: { x: MAP_CENTER_X + 80, z: MAP_CENTER_Z - 80 },
        width: 8,
        type: "street",
        name: "Kroonuaia tänav"
    },
    // Tiigi tänav
    {
        start: { x: MAP_CENTER_X - 320, z: MAP_CENTER_Z - 50 },
        end: { x: MAP_CENTER_X - 320, z: MAP_CENTER_Z + 200 },
        width: 8,
        type: "street",
        name: "Tiigi tänav"
    },
    // Magasini tänav
    {
        start: { x: MAP_CENTER_X + 250, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X + 250, z: MAP_CENTER_Z + 350 },
        width: 8,
        type: "street",
        name: "Magasini tänav"
    },
    // Kastani tänav
    {
        start: { x: MAP_CENTER_X - 80, z: MAP_CENTER_Z + 250 },
        end: { x: MAP_CENTER_X + 180, z: MAP_CENTER_Z + 250 },
        width: 8,
        type: "street",
        name: "Kastani tänav"
    },
    // Soola tänav
    {
        start: { x: MAP_CENTER_X - 220, z: MAP_CENTER_Z - 180 },
        end: { x: MAP_CENTER_X - 220, z: MAP_CENTER_Z + 80 },
        width: 8,
        type: "street",
        name: "Soola tänav"
    },
    // Raekoja plats (площадь перед ратушей - пешеходная зона)
    {
        start: { x: MAP_CENTER_X - 30, z: MAP_CENTER_Z - 30 },
        end: { x: MAP_CENTER_X + 30, z: MAP_CENTER_Z - 30 },
        width: 6,
        type: "path",
        name: "Raekoja plats (север)"
    },
    {
        start: { x: MAP_CENTER_X + 30, z: MAP_CENTER_Z - 30 },
        end: { x: MAP_CENTER_X + 30, z: MAP_CENTER_Z + 30 },
        width: 6,
        type: "path",
        name: "Raekoja plats (восток)"
    },
    {
        start: { x: MAP_CENTER_X + 30, z: MAP_CENTER_Z + 30 },
        end: { x: MAP_CENTER_X - 30, z: MAP_CENTER_Z + 30 },
        width: 6,
        type: "path",
        name: "Raekoja plats (юг)"
    },
    {
        start: { x: MAP_CENTER_X - 30, z: MAP_CENTER_Z + 30 },
        end: { x: MAP_CENTER_X - 30, z: MAP_CENTER_Z - 30 },
        width: 6,
        type: "path",
        name: "Raekoja plats (запад)"
    },
    // Пешеходные дорожки в парке Toomemägi
    {
        start: { x: MAP_CENTER_X - 250, z: MAP_CENTER_Z - 150 },
        end: { x: MAP_CENTER_X - 150, z: MAP_CENTER_Z - 150 },
        width: 4,
        type: "path",
        name: "Toomemägi path 1"
    },
    {
        start: { x: MAP_CENTER_X - 200, z: MAP_CENTER_Z - 180 },
        end: { x: MAP_CENTER_X - 200, z: MAP_CENTER_Z - 80 },
        width: 4,
        type: "path",
        name: "Toomemägi path 2"
    },
    // Мост Kaarsild через Эмайыги
    {
        start: { x: MAP_CENTER_X - 30, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X + 30, z: MAP_CENTER_Z },
        width: 12,
        type: "highway",
        name: "Kaarsild"
    },
    // Дополнительные мосты
    {
        start: { x: MAP_CENTER_X - 200, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X - 200, z: MAP_CENTER_Z },
        width: 10,
        type: "street",
        name: "Vabaduse sild"
    },
    {
        start: { x: MAP_CENTER_X + 200, z: MAP_CENTER_Z },
        end: { x: MAP_CENTER_X + 200, z: MAP_CENTER_Z },
        width: 10,
        type: "street",
        name: "Ihaste sild"
    },
    // Еще второстепенные улицы
    {
        start: { x: MAP_CENTER_X - 50, z: MAP_CENTER_Z - 180 },
        end: { x: MAP_CENTER_X + 100, z: MAP_CENTER_Z - 180 },
        width: 8,
        type: "street",
        name: "Uus tänav"
    },
    {
        start: { x: MAP_CENTER_X + 80, z: MAP_CENTER_Z - 220 },
        end: { x: MAP_CENTER_X + 80, z: MAP_CENTER_Z + 100 },
        width: 8,
        type: "street",
        name: "Pikk tänav"
    },
    {
        start: { x: MAP_CENTER_X - 300, z: MAP_CENTER_Z - 80 },
        end: { x: MAP_CENTER_X - 100, z: MAP_CENTER_Z - 80 },
        width: 8,
        type: "street",
        name: "Küüni tänav"
    },
    {
        start: { x: MAP_CENTER_X - 280, z: MAP_CENTER_Z + 50 },
        end: { x: MAP_CENTER_X - 280, z: MAP_CENTER_Z + 280 },
        width: 8,
        type: "street",
        name: "Küüni tänav (продолжение)"
    },
    {
        start: { x: MAP_CENTER_X + 180, z: MAP_CENTER_Z - 150 },
        end: { x: MAP_CENTER_X + 180, z: MAP_CENTER_Z + 180 },
        width: 8,
        type: "street",
        name: "Turu tänav (продолжение)"
    },
    {
        start: { x: MAP_CENTER_X - 150, z: MAP_CENTER_Z + 150 },
        end: { x: MAP_CENTER_X + 120, z: MAP_CENTER_Z + 150 },
        width: 8,
        type: "street",
        name: "Kastani tänav (продолжение)"
    },
    {
        start: { x: MAP_CENTER_X - 400, z: MAP_CENTER_Z - 50 },
        end: { x: MAP_CENTER_X - 400, z: MAP_CENTER_Z + 250 },
        width: 8,
        type: "street",
        name: "Vallikraavi tänav (продолжение)"
    },
    {
        start: { x: MAP_CENTER_X + 350, z: MAP_CENTER_Z - 100 },
        end: { x: MAP_CENTER_X + 350, z: MAP_CENTER_Z + 200 },
        width: 8,
        type: "street",
        name: "Kooli tänav (продолжение)"
    },
    {
        start: { x: MAP_CENTER_X - 120, z: MAP_CENTER_Z - 320 },
        end: { x: MAP_CENTER_X + 150, z: MAP_CENTER_Z - 320 },
        width: 8,
        type: "street",
        name: "Vanemuise tänav (продолжение)"
    },
    {
        start: { x: MAP_CENTER_X + 220, z: MAP_CENTER_Z - 250 },
        end: { x: MAP_CENTER_X + 220, z: MAP_CENTER_Z + 100 },
        width: 8,
        type: "street",
        name: "Kompanii tänav (продолжение)"
    }
];

/**
 * Получить все дороги Тарту
 */
export function getTartuRoads(): TartuRoadSegment[] {
    return TARTU_ROADS;
}

/**
 * Получить дороги, которые пересекают указанный чанк
 */
export function getTartuRoadsInChunk(
    chunkX: number,
    chunkZ: number,
    chunkSize: number
): TartuRoadSegment[] {
    const worldX = chunkX * chunkSize;
    const worldZ = chunkZ * chunkSize;
    const chunkMinX = worldX;
    const chunkMaxX = worldX + chunkSize;
    const chunkMinZ = worldZ;
    const chunkMaxZ = worldZ + chunkSize;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tartuRoads.ts:230',message:'getTartuRoadsInChunk called',data:{chunkX,chunkZ,chunkSize,worldX,worldZ,chunkMinX,chunkMaxX,chunkMinZ,chunkMaxZ,totalRoads:TARTU_ROADS.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    const filtered = TARTU_ROADS.filter(road => {
        // Проверяем, пересекается ли дорога с чанком
        const roadMinX = Math.min(road.start.x, road.end.x);
        const roadMaxX = Math.max(road.start.x, road.end.x);
        const roadMinZ = Math.min(road.start.z, road.end.z);
        const roadMaxZ = Math.max(road.start.z, road.end.z);
        
        // Учитываем ширину дороги
        const roadWidth = road.width;
        const expandedMinX = roadMinX - roadWidth / 2;
        const expandedMaxX = roadMaxX + roadWidth / 2;
        const expandedMinZ = roadMinZ - roadWidth / 2;
        const expandedMaxZ = roadMaxZ + roadWidth / 2;
        
        return !(expandedMaxX < chunkMinX || expandedMinX > chunkMaxX ||
                 expandedMaxZ < chunkMinZ || expandedMinZ > chunkMaxZ);
    });
    
    // #region agent log
    if (filtered.length > 0) {
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tartuRoads.ts:250',message:'Found roads in chunk',data:{chunkX,chunkZ,filteredCount:filtered.length,roads:filtered.map(r=>({name:r.name,start:r.start,end:r.end}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    }
    // #endregion
    
    return filtered;
}

/**
 * Конвертировать дорогу Тарту в формат RoadSegment для RoadNetwork
 */
export function convertTartuRoadToSegment(road: TartuRoadSegment): {
    start: Vector3;
    end: Vector3;
    width: number;
    type: "highway" | "street" | "path";
} {
    return {
        start: new Vector3(road.start.x, 0.02, road.start.z),
        end: new Vector3(road.end.x, 0.02, road.end.z),
        width: road.width,
        type: road.type
    };
}

/**
 * Найти ближайшую дорогу к позиции
 */
function findNearestRoad(x: number, z: number, maxDistance: number = 100): { road: TartuRoadSegment; distance: number; projection: number } | null {
    let nearest: { road: TartuRoadSegment; distance: number; projection: number } | null = null;
    
    for (const road of TARTU_ROADS) {
        if (!road.name) continue; // Пропускаем дороги без названий
        
        // Вычисляем расстояние от точки до сегмента дороги
        const dx = road.end.x - road.start.x;
        const dz = road.end.z - road.start.z;
        const lengthSq = dx * dx + dz * dz;
        
        if (lengthSq < 0.01) continue; // Слишком короткий сегмент
        
        // Проекция точки на линию дороги
        const t = Math.max(0, Math.min(1, ((x - road.start.x) * dx + (z - road.start.z) * dz) / lengthSq));
        const projX = road.start.x + t * dx;
        const projZ = road.start.z + t * dz;
        
        // Расстояние от точки до проекции
        const distX = x - projX;
        const distZ = z - projZ;
        const distance = Math.sqrt(distX * distX + distZ * distZ);
        
        // Учитываем ширину дороги
        const effectiveDistance = Math.max(0, distance - road.width / 2);
        
        if (effectiveDistance <= maxDistance && (!nearest || effectiveDistance < nearest.distance)) {
            nearest = { road, distance: effectiveDistance, projection: t };
        }
    }
    
    return nearest;
}

/**
 * Конвертировать GPS координаты в игровые координаты
 * 
 * @param lat Широта (градусы)
 * @param lon Долгота (градусы)
 * @returns Игровые координаты {x, z}
 */
export function gpsToGameCoords(lat: number, lon: number): { x: number; z: number } {
    // Центр карты = Raekoja plats (58.3797°N, 26.7239°E)
    const TARTU_CENTER_LAT = 58.3797;
    const TARTU_CENTER_LON = 26.7239;
    
    // 1 градус широты ≈ 111 км
    // 1 градус долготы ≈ 111 км * cos(широта)
    const METERS_PER_DEGREE_LAT = 111000;
    const METERS_PER_DEGREE_LON = 111000 * Math.cos(TARTU_CENTER_LAT * Math.PI / 180);
    
    const dLat = lat - TARTU_CENTER_LAT;
    const dLon = lon - TARTU_CENTER_LON;
    
    // Конвертируем в метры, затем применяем масштаб
    const x = dLon * METERS_PER_DEGREE_LON * MAP_SCALE;
    const z = dLat * METERS_PER_DEGREE_LAT * MAP_SCALE;
    
    return { x, z };
}

/**
 * Получить реальный адрес по координатам
 */
export function getAddressFromCoordinates(x: number, z: number): string {
    const nearest = findNearestRoad(x, z, 150);
    
    if (!nearest || !nearest.road.name) {
        // Если не нашли дорогу рядом, возвращаем координаты
        return `X:${Math.round(x)}, Z:${Math.round(z)}`;
    }
    
    const road = nearest.road;
    const projection = nearest.projection;
    
    // Вычисляем длину дороги
    const dx = road.end.x - road.start.x;
    const dz = road.end.z - road.start.z;
    const roadLength = Math.sqrt(dx * dx + dz * dz);
    
    // Вычисляем расстояние от начала дороги (в единицах карты)
    const distanceFromStart = projection * roadLength;
    
    // Конвертируем в "номер дома" (примерно 1 номер на каждые 10 единиц карты)
    // Начинаем с номера 1 и увеличиваем по мере удаления от начала
    const baseNumber = Math.floor(distanceFromStart / 10) + 1;
    
    // Определяем, на какой стороне улицы мы находимся
    // Для этого используем перпендикулярный вектор от линии дороги
    const perpX = -dz / roadLength;
    const perpZ = dx / roadLength;
    
    // Вектор от проекции на дорогу к фактической позиции
    const offsetX = x - (road.start.x + projection * dx);
    const offsetZ = z - (road.start.z + projection * dz);
    
    // Определяем сторону (dot product)
    const side = (offsetX * perpX + offsetZ * perpZ) > 0 ? 1 : -1;
    
    // Для четных/нечетных номеров (примерно)
    const houseNumber = baseNumber + (side > 0 ? 0 : 1);
    
    return `${road.name}, ${houseNumber}`;
}

