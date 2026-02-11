/**
 * TX Map Objects Library
 * Pre-defined objects for building Protocol TX game maps
 */

import { CubeElement } from '../types';

export type TXObjectCategory = 'buildings' | 'covers' | 'nature' | 'infrastructure' | 'gameplay' | 'npcs';

export interface TXObjectDefinition {
    id: string;
    name: string;
    nameRu: string;
    category: TXObjectCategory;
    icon: string;
    description: string;
    // Default cube properties
    size: { x: number; y: number; z: number };
    color: string;
    // Optional multi-cube composition
    cubes?: Array<{
        offset: { x: number; y: number; z: number };
        size: { x: number; y: number; z: number };
        color: string;
        name?: string;
    }>;
    // TX-specific properties
    hasCollision: boolean;
    isDestructible: boolean;
    txType: 'building' | 'tree' | 'rock' | 'spawn' | 'garage' | 'custom' | 'npc';
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// ============================================
// BUILDINGS
// ============================================

export const TX_BUILDINGS: TXObjectDefinition[] = [
    {
        id: 'bunker',
        name: 'Bunker',
        nameRu: 'Бункер',
        category: 'buildings',
        icon: '🏰',
        description: 'Укреплённый бункер с толстыми стенами',
        size: { x: 8, y: 4, z: 8 },
        color: '#4a4a4a',
        cubes: [
            // Main body
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 8, y: 3, z: 8 }, color: '#4a4a4a', name: 'base' },
            // Roof
            { offset: { x: 0, y: 3, z: 0 }, size: { x: 9, y: 1, z: 9 }, color: '#3a3a3a', name: 'roof' },
            // Entrance
            { offset: { x: 0, y: 0, z: 4.5 }, size: { x: 3, y: 2.5, z: 1 }, color: '#2a2a2a', name: 'entrance' },
        ],
        hasCollision: true,
        isDestructible: false,
        txType: 'building'
    },
    {
        id: 'barracks',
        name: 'Barracks',
        nameRu: 'Казарма',
        category: 'buildings',
        icon: '🏠',
        description: 'Длинное здание казармы',
        size: { x: 12, y: 5, z: 6 },
        color: '#5c4a3a',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 12, y: 4, z: 6 }, color: '#5c4a3a', name: 'body' },
            { offset: { x: 0, y: 4, z: 0 }, size: { x: 12, y: 2, z: 6 }, color: '#4a3a2a', name: 'roof' },
        ],
        hasCollision: true,
        isDestructible: true,
        txType: 'building'
    },
    {
        id: 'warehouse',
        name: 'Warehouse',
        nameRu: 'Склад',
        category: 'buildings',
        icon: '🏭',
        description: 'Большой складской ангар',
        size: { x: 15, y: 8, z: 10 },
        color: '#6a6a6a',
        hasCollision: true,
        isDestructible: true,
        txType: 'building'
    },
    {
        id: 'factory',
        name: 'Factory',
        nameRu: 'Фабрика',
        category: 'buildings',
        icon: '🏗️',
        description: 'Промышленное здание с трубой',
        size: { x: 20, y: 10, z: 15 },
        color: '#5a5a5a',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 8, z: 15 }, color: '#5a5a5a', name: 'main' },
            { offset: { x: 8, y: 8, z: 5 }, size: { x: 2, y: 6, z: 2 }, color: '#4a4a4a', name: 'chimney' },
        ],
        hasCollision: true,
        isDestructible: true,
        txType: 'building'
    },
    {
        id: 'ruins',
        name: 'Ruins',
        nameRu: 'Руины',
        category: 'buildings',
        icon: '🏚️',
        description: 'Разрушенное здание',
        size: { x: 10, y: 6, z: 8 },
        color: '#7a6a5a',
        cubes: [
            { offset: { x: -3, y: 0, z: 0 }, size: { x: 4, y: 5, z: 8 }, color: '#7a6a5a', name: 'wall1' },
            { offset: { x: 3, y: 0, z: 0 }, size: { x: 4, y: 3, z: 8 }, color: '#6a5a4a', name: 'wall2' },
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 8 }, color: '#5a4a3a', name: 'rubble' },
        ],
        hasCollision: true,
        isDestructible: false,
        txType: 'building'
    },
    {
        id: 'watchtower',
        name: 'Watch Tower',
        nameRu: 'Сторожевая башня',
        category: 'buildings',
        icon: '🗼',
        description: 'Высокая наблюдательная вышка',
        size: { x: 4, y: 12, z: 4 },
        color: '#5c4a3a',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 8, z: 4 }, color: '#5c4a3a', name: 'tower' },
            { offset: { x: 0, y: 8, z: 0 }, size: { x: 5, y: 4, z: 5 }, color: '#4c3a2a', name: 'platform' },
        ],
        hasCollision: true,
        isDestructible: true,
        txType: 'building'
    }
];

// ============================================
// COVERS (Укрытия)
// ============================================

export const TX_COVERS: TXObjectDefinition[] = [
    {
        id: 'sandbags',
        name: 'Sandbags',
        nameRu: 'Мешки с песком',
        category: 'covers',
        icon: '🧱',
        description: 'Низкое укрытие из мешков',
        size: { x: 4, y: 1.5, z: 1 },
        color: '#8b7355',
        hasCollision: true,
        isDestructible: true,
        txType: 'custom'
    },
    {
        id: 'concrete_block',
        name: 'Concrete Block',
        nameRu: 'Бетонный блок',
        category: 'covers',
        icon: '⬜',
        description: 'Тяжёлый бетонный блок',
        size: { x: 3, y: 2, z: 2 },
        color: '#808080',
        hasCollision: true,
        isDestructible: false,
        txType: 'rock'
    },
    {
        id: 'trench',
        name: 'Trench Segment',
        nameRu: 'Сегмент траншеи',
        category: 'covers',
        icon: '🕳️',
        description: 'Часть оборонительной траншеи',
        size: { x: 6, y: 2, z: 3 },
        color: '#4a3a2a',
        hasCollision: true,
        isDestructible: false,
        txType: 'custom'
    },
    {
        id: 'crates',
        name: 'Crates',
        nameRu: 'Ящики',
        category: 'covers',
        icon: '📦',
        description: 'Штабель ящиков',
        size: { x: 2, y: 2, z: 2 },
        color: '#8b4513',
        hasCollision: true,
        isDestructible: true,
        txType: 'custom'
    },
    {
        id: 'barrels',
        name: 'Barrels',
        nameRu: 'Бочки',
        category: 'covers',
        icon: '🛢️',
        description: 'Металлические бочки',
        size: { x: 1.5, y: 2, z: 1.5 },
        color: '#2f4f4f',
        hasCollision: true,
        isDestructible: true,
        txType: 'custom'
    }
];

// ============================================
// NATURE
// ============================================

export const TX_NATURE: TXObjectDefinition[] = [
    {
        id: 'tree_pine',
        name: 'Pine Tree',
        nameRu: 'Сосна',
        category: 'nature',
        icon: '🌲',
        description: 'Высокая хвойная сосна',
        size: { x: 2, y: 10, z: 2 },
        color: '#228b22',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 4, z: 1 }, color: '#8b4513', name: 'trunk' },
            { offset: { x: 0, y: 4, z: 0 }, size: { x: 4, y: 6, z: 4 }, color: '#228b22', name: 'leaves' },
        ],
        hasCollision: true,
        isDestructible: false,
        txType: 'tree'
    },
    {
        id: 'tree_oak',
        name: 'Oak Tree',
        nameRu: 'Дуб',
        category: 'nature',
        icon: '🌳',
        description: 'Широкий дуб с густой кроной',
        size: { x: 4, y: 8, z: 4 },
        color: '#2e8b57',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 1.5, y: 3, z: 1.5 }, color: '#654321', name: 'trunk' },
            { offset: { x: 0, y: 3, z: 0 }, size: { x: 6, y: 5, z: 6 }, color: '#2e8b57', name: 'crown' },
        ],
        hasCollision: true,
        isDestructible: false,
        txType: 'tree'
    },
    {
        id: 'rock_large',
        name: 'Large Rock',
        nameRu: 'Большой камень',
        category: 'nature',
        icon: '🪨',
        description: 'Массивный валун',
        size: { x: 4, y: 3, z: 3 },
        color: '#696969',
        hasCollision: true,
        isDestructible: false,
        txType: 'rock'
    },
    {
        id: 'rock_small',
        name: 'Small Rock',
        nameRu: 'Маленький камень',
        category: 'nature',
        icon: '🪨',
        description: 'Небольшой камень',
        size: { x: 1.5, y: 1, z: 1.5 },
        color: '#808080',
        hasCollision: true,
        isDestructible: false,
        txType: 'rock'
    },
    {
        id: 'bush',
        name: 'Bush',
        nameRu: 'Куст',
        category: 'nature',
        icon: '🌿',
        description: 'Декоративный куст',
        size: { x: 2, y: 1.5, z: 2 },
        color: '#3cb371',
        hasCollision: false,
        isDestructible: false,
        txType: 'tree'
    }
];

// ============================================
// INFRASTRUCTURE
// ============================================

export const TX_INFRASTRUCTURE: TXObjectDefinition[] = [
    {
        id: 'road_straight',
        name: 'Road (Straight)',
        nameRu: 'Дорога (прямая)',
        category: 'infrastructure',
        icon: '🛣️',
        description: 'Прямой участок дороги',
        size: { x: 10, y: 0.2, z: 6 },
        color: '#333333',
        hasCollision: false,
        isDestructible: false,
        txType: 'custom'
    },
    {
        id: 'bridge',
        name: 'Bridge',
        nameRu: 'Мост',
        category: 'infrastructure',
        icon: '🌉',
        description: 'Мост над препятствием',
        size: { x: 15, y: 4, z: 6 },
        color: '#555555',
        cubes: [
            { offset: { x: 0, y: 3, z: 0 }, size: { x: 15, y: 1, z: 6 }, color: '#555555', name: 'deck' },
            { offset: { x: -6, y: 0, z: 0 }, size: { x: 2, y: 3, z: 2 }, color: '#444444', name: 'pillar1' },
            { offset: { x: 6, y: 0, z: 0 }, size: { x: 2, y: 3, z: 2 }, color: '#444444', name: 'pillar2' },
        ],
        hasCollision: true,
        isDestructible: false,
        txType: 'building'
    },
    {
        id: 'ramp',
        name: 'Ramp',
        nameRu: 'Рампа',
        category: 'infrastructure',
        icon: '📐',
        description: 'Наклонная рампа для подъёма',
        size: { x: 8, y: 4, z: 4 },
        color: '#666666',
        hasCollision: true,
        isDestructible: false,
        txType: 'custom'
    },
    {
        id: 'wall_segment',
        name: 'Wall Segment',
        nameRu: 'Сегмент стены',
        category: 'infrastructure',
        icon: '🧱',
        description: 'Участок защитной стены',
        size: { x: 10, y: 5, z: 1 },
        color: '#4a4a4a',
        hasCollision: true,
        isDestructible: true,
        txType: 'building'
    },
    {
        id: 'fence',
        name: 'Fence',
        nameRu: 'Забор',
        category: 'infrastructure',
        icon: '🚧',
        description: 'Металлический забор',
        size: { x: 8, y: 3, z: 0.5 },
        color: '#3a3a3a',
        hasCollision: true,
        isDestructible: true,
        txType: 'custom'
    }
];

// ============================================
// GAMEPLAY OBJECTS
// ============================================

export const TX_GAMEPLAY: TXObjectDefinition[] = [
    {
        id: 'spawn_point',
        name: 'Spawn Point',
        nameRu: 'Точка спавна',
        category: 'gameplay',
        icon: '📍',
        description: 'Точка появления игрока',
        size: { x: 3, y: 0.5, z: 3 },
        color: '#00ff00',
        hasCollision: false,
        isDestructible: false,
        txType: 'spawn'
    },
    {
        id: 'garage',
        name: 'Garage',
        nameRu: 'Гараж',
        category: 'gameplay',
        icon: '🏠',
        description: 'Гараж для ремонта танка',
        size: { x: 10, y: 6, z: 8 },
        color: '#ff8800',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 5, z: 8 }, color: '#5a4a3a', name: 'building' },
            { offset: { x: 0, y: 0, z: 4.5 }, size: { x: 6, y: 4, z: 1 }, color: '#333333', name: 'door' },
        ],
        hasCollision: true,
        isDestructible: false,
        txType: 'garage'
    },
    {
        id: 'flag',
        name: 'Flag',
        nameRu: 'Флаг',
        category: 'gameplay',
        icon: '🚩',
        description: 'Флаг точки захвата',
        size: { x: 1, y: 8, z: 1 },
        color: '#ff0000',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 0.3, y: 8, z: 0.3 }, color: '#888888', name: 'pole' },
            { offset: { x: 0.8, y: 6, z: 0 }, size: { x: 2, y: 1.5, z: 0.1 }, color: '#ff0000', name: 'flag' },
        ],
        hasCollision: false,
        isDestructible: false,
        txType: 'custom'
    },
    {
        id: 'capture_zone',
        name: 'Capture Zone',
        nameRu: 'Зона захвата',
        category: 'gameplay',
        icon: '⭕',
        description: 'Зона для захвата в режиме CTF',
        size: { x: 10, y: 0.5, z: 10 },
        color: '#0088ff',
        hasCollision: false,
        isDestructible: false,
        txType: 'custom'
    },
    {
        id: 'trigger_damage',
        name: 'Damage Zone',
        nameRu: 'Зона Урона',
        category: 'gameplay',
        icon: '☠️',
        description: 'Наносит урон игрокам внутри',
        size: { x: 4, y: 2, z: 4 },
        color: '#ff0000',
        hasCollision: false,
        isDestructible: false,
        txType: 'custom',
        // metadata for exporter
        cubes: [{
            offset: { x: 0, y: 0, z: 0 },
            size: { x: 4, y: 2, z: 4 },
            color: '#ff0000',
            name: 'trigger_damage'
        }]
    },
    {
        id: 'trigger_heal',
        name: 'Heal Zone',
        nameRu: 'Зона Лечения',
        category: 'gameplay',
        icon: '❤️',
        description: 'Лечит игроков внутри',
        size: { x: 4, y: 2, z: 4 },
        color: '#00ff00',
        hasCollision: false,
        isDestructible: false,
        txType: 'custom',
        cubes: [{
            offset: { x: 0, y: 0, z: 0 },
            size: { x: 4, y: 2, z: 4 },
            color: '#00ff00',
            name: 'trigger_heal'
        }]
    },
    {
        id: 'trigger_teleport',
        name: 'Teleport',
        nameRu: 'Телепорт',
        category: 'gameplay',
        icon: '🌀',
        description: 'Перемещает игрока в точку назначения',
        size: { x: 2, y: 3, z: 2 },
        color: '#8a2be2',
        hasCollision: false,
        isDestructible: false,
        txType: 'custom',
        cubes: [{
            offset: { x: 0, y: 0, z: 0 },
            size: { x: 2, y: 3, z: 2 },
            color: '#8a2be2',
            name: 'trigger_teleport'
        }]
    }
];


// ============================================
// NPCS (Враги)
// ============================================

export const TX_NPCS: TXObjectDefinition[] = [
    {
        id: 'npc_tank_heavy',
        name: 'Heavy Tank (AI)',
        nameRu: 'Тяжёлый Танк (Враг)',
        category: 'npcs',
        icon: '👿',
        description: 'Вражеский тяжёлый танк под управлением AI',
        size: { x: 3.5, y: 3, z: 5.5 },
        color: '#8b0000',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 3.5, y: 1.5, z: 5.5 }, color: '#500000', name: 'hull' },
            { offset: { x: 0, y: 1.5, z: 0 }, size: { x: 2.5, y: 1, z: 3 }, color: '#8b0000', name: 'turret' },
            { offset: { x: 0, y: 1.8, z: 3 }, size: { x: 0.4, y: 0.4, z: 4 }, color: '#333333', name: 'gun' },
        ],
        hasCollision: true,
        isDestructible: true,
        txType: 'npc'
    },
    {
        id: 'npc_turret',
        name: 'Turret (AI)',
        nameRu: 'Турель (Враг)',
        category: 'npcs',
        icon: '🔫',
        description: 'Стационарная автоматическая турель',
        size: { x: 2, y: 3, z: 2 },
        color: '#660000',
        cubes: [
            { offset: { x: 0, y: 0, z: 0 }, size: { x: 1.5, y: 2, z: 1.5 }, color: '#333333', name: 'base' },
            { offset: { x: 0, y: 2, z: 0 }, size: { x: 1, y: 1, z: 2 }, color: '#990000', name: 'head' },
        ],
        hasCollision: true,
        isDestructible: true,
        txType: 'npc'
    }
];

// ============================================
// ALL OBJECTS
// ============================================

export const TX_ALL_OBJECTS: TXObjectDefinition[] = [
    ...TX_BUILDINGS,
    ...TX_COVERS,
    ...TX_NATURE,
    ...TX_INFRASTRUCTURE,
    ...TX_GAMEPLAY,
    ...TX_NPCS
];

export const TX_OBJECTS_BY_CATEGORY: Record<TXObjectCategory, TXObjectDefinition[]> = {
    buildings: TX_BUILDINGS,
    covers: TX_COVERS,
    nature: TX_NATURE,
    infrastructure: TX_INFRASTRUCTURE,
    gameplay: TX_GAMEPLAY,
    npcs: TX_NPCS
};

export const TX_CATEGORY_NAMES: Record<TXObjectCategory, { en: string; ru: string; icon: string }> = {
    buildings: { en: 'Buildings', ru: 'Здания', icon: '🏢' },
    covers: { en: 'Covers', ru: 'Укрытия', icon: '🧱' },
    nature: { en: 'Nature', ru: 'Природа', icon: '🌲' },
    infrastructure: { en: 'Infrastructure', ru: 'Инфраструктура', icon: '🛣️' },
    gameplay: { en: 'Gameplay', ru: 'Игровые', icon: '🎮' },
    npcs: { en: 'NPCs', ru: 'Враги', icon: '👿' }
};

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert TX object definition to CubeElement(s)
 */
export function txObjectToCubes(
    def: TXObjectDefinition,
    position: { x: number; y: number; z: number }
): CubeElement[] {
    const baseCube: CubeElement = {
        id: generateId(),
        name: def.nameRu,
        type: 'cube',
        parentId: null,
        position: { x: position.x, y: position.y + def.size.y / 2, z: position.z },
        size: def.size,
        rotation: { x: 0, y: 0, z: 0 },
        color: def.color,
        visible: true,
        isLocked: false,
        isFavorite: false,
        material: {
            roughness: 0.8,
            metalness: 0.1,
            emissive: 0,
            opacity: 1,
            transparent: false
        },
        properties: {
            txCategory: def.category,
            txType: def.txType,
            txId: def.id
        }
    };

    if (!def.cubes || def.cubes.length === 0) {
        return [baseCube];
    }

    // Multi-cube object
    return def.cubes.map((cubeDef, index) => ({
        id: generateId(),
        name: `${def.nameRu}_${cubeDef.name || index}`,
        type: 'cube' as const,
        parentId: null,
        position: {
            x: position.x + cubeDef.offset.x,
            y: position.y + cubeDef.offset.y + cubeDef.size.y / 2,
            z: position.z + cubeDef.offset.z
        },
        size: cubeDef.size,
        rotation: { x: 0, y: 0, z: 0 },
        color: cubeDef.color,
        visible: true,
        isLocked: false,
        isFavorite: false,
        material: {
            roughness: 0.8,
            metalness: 0.1,
            emissive: 0,
            opacity: 1,
            transparent: false
        },
        properties: {
            txCategory: def.category,
            txType: def.txType,
            txId: def.id,
            subId: cubeDef.name || index
        }
    }));
}
