// ═══════════════════════════════════════════════════════════════════════════
// SKILL TREE CONFIGURATION - Конфигурация дерева навыков
// ═══════════════════════════════════════════════════════════════════════════

export interface SkillNode {
    id: string;
    title: string;
    desc: string;
    icon: string;
    row: number; // Оставляем для обратной совместимости, но не используем
    col: number; // Оставляем для обратной совместимости, но не используем
    type: "hub" | "skill" | "module" | "meta";
    badge?: string;
    skillId?: keyof {
        tankMastery: number;
        combatExpert: number;
        survivalInstinct: number;
        resourcefulness: number;
        tacticalGenius: number;
    };
    moduleId?: string; // ID модуля, который разблокируется
    parentId?: string; // ID родительского узла для линейной разблокировки
    branchColor?: string; // Цвет ветки
    cost?: number; // Стоимость в очках (если не указано, используется растущая)
    maxLevel?: number; // Максимальный уровень (по умолчанию 5)
    effects?: string[]; // Описание эффектов
    // Новые поля для полярного позиционирования
    calculatedX?: number; // Вычисленная X позиция
    calculatedY?: number; // Вычисленная Y позиция
    branchIndex?: number; // Индекс ветки от родителя (для угла)
    category?: "combat" | "defense" | "utility"; // Категория для группировки
}

export interface SkillEdge {
    from: string;
    to: string;
}

export interface SkillBranch {
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
}

export const SKILL_BRANCHES: SkillBranch[] = [
    { id: "attack", name: "Атака", icon: "⚔️", color: "#f00", description: "Урон, ультимативные способности" },
    { id: "defense", name: "Защита", icon: "🛡️", color: "#00f", description: "Броня, щиты, регенерация" },
    { id: "mobility", name: "Мобильность", icon: "🏃", color: "#0ff", description: "Скорость, прыжки, манёвры" },
    { id: "tech", name: "Технологии", icon: "🔧", color: "#ff0", description: "Дроны, турели, гаджеты" },
    { id: "stealth", name: "Скрытность", icon: "👁️", color: "#888", description: "Невидимость, засады" },
    { id: "leadership", name: "Лидерство", icon: "🎖️", color: "#0f0", description: "Поддержка, экономика, ауры" }
];

// Функция для расчёта стоимости (растущая: 1, 2, 3, 4, 5)
export function getSkillCost(level: number, baseCost: number = 1): number {
    return baseCost + (level - 1);
}

// Маппинг веток к категориям (3 основные категории)
export const BRANCH_CATEGORIES = {
    combat: ["attackHub"],                    // Атака
    defense: ["defenseHub", "mobilityHub"],   // Защита + Мобильность
    utility: ["techHub", "stealthHub", "leadershipHub"]  // Технологии + Скрытность + Лидерство
};

// Цвета категорий
export const CATEGORY_COLORS = {
    combat: "#f00",
    defense: "#00f",
    utility: "#0f0"
};

// Константы для нового размещения
const NODE_WIDTH = 220;
const NODE_HEIGHT = 130;
const MIN_NODE_SPACING = 150;
const TREE_SPACING = 100; // Отступ между деревьями
const TREE_WIDTH = 800; // Ширина каждого дерева

// Продвинутое структурированное размещение узлов дерева навыков
// Центральный узел в центре, ветки по кругу с учётом их ширины и глубины
// С автоматическим выравниванием и оптимизацией пространства

// Константы для старого размещения (используются в старых функциях)
const HUB_RADIUS = 750; // Расстояние от центра до веток (хабов) - увеличено для большего пространства
const NODE_VERTICAL_STEP = 350; // Вертикальный шаг между узлами в ветке
const NODE_HORIZONTAL_OFFSET = 280; // Горизонтальное смещение для узлов с несколькими детьми
const LEVEL_ALIGNMENT_TOLERANCE = 20; // Допуск для выравнивания узлов на одном уровне

// Структура для хранения информации о ветке
interface BranchInfo {
    id: string;
    depth: number;
    width: number;
    maxWidth: number; // Максимальная ширина на любом уровне
}

// Вычисление глубины и ширины ветки
function calculateBranchInfo(nodeId: string, visited: Set<string> = new Set()): BranchInfo {
    if (visited.has(nodeId)) return { id: nodeId, depth: 0, width: 0, maxWidth: 0 };
    visited.add(nodeId);
    
    const children = SKILL_TREE_NODES.filter(n => n.parentId === nodeId);
    if (children.length === 0) {
        return { id: nodeId, depth: 1, width: NODE_WIDTH, maxWidth: NODE_WIDTH };
    }
    
    if (children.length === 1) {
        const childInfo = calculateBranchInfo(children[0]!.id, visited);
        return {
            id: nodeId,
            depth: 1 + childInfo.depth,
            width: childInfo.width,
            maxWidth: Math.max(NODE_WIDTH, childInfo.maxWidth)
        };
        } else {
        // Если несколько детей, вычисляем общую ширину и максимальную глубину
        const childrenInfo = children.map(child => calculateBranchInfo(child.id, visited));
        const totalWidth = NODE_HORIZONTAL_OFFSET * (children.length - 1) + NODE_WIDTH;
        const maxDepth = Math.max(...childrenInfo.map(info => info.depth));
        const maxWidth = Math.max(NODE_WIDTH, totalWidth, ...childrenInfo.map(info => info.maxWidth));
    
    return { 
            id: nodeId,
            depth: 1 + maxDepth,
            width: totalWidth,
            maxWidth: maxWidth
        };
    }
}

// Новая функция для размещения трех деревьев с гибким разветвлением
export function calculateThreeTreesLayout(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    
    // Функция для вычисления базового расстояния в зависимости от глубины
    const getBaseDistance = (depth: number, childCount: number): number => {
        let base = 200;
        if (depth >= 5) base = 350;
        else if (depth >= 3) base = 280;
        else if (depth >= 1) base = 240;
        
        // Увеличиваем расстояние если много детей
        if (childCount >= 3) base *= 1.25;
        
        return base;
    };
    
    // Функция для проверки коллизий (строгая проверка перекрытия прямоугольников)
    const checkCollision = (x: number, y: number, existingPositions: Map<string, { x: number; y: number }>): boolean => {
        // Проверяем перекрытие с учетом размеров узлов и минимального отступа
        const nodeLeft = x - NODE_WIDTH / 2 - MIN_NODE_SPACING / 2;
        const nodeRight = x + NODE_WIDTH / 2 + MIN_NODE_SPACING / 2;
        const nodeTop = y - NODE_HEIGHT / 2 - MIN_NODE_SPACING / 2;
        const nodeBottom = y + NODE_HEIGHT / 2 + MIN_NODE_SPACING / 2;
        
        for (const [_, pos] of existingPositions) {
            const existingLeft = pos.x - NODE_WIDTH / 2 - MIN_NODE_SPACING / 2;
            const existingRight = pos.x + NODE_WIDTH / 2 + MIN_NODE_SPACING / 2;
            const existingTop = pos.y - NODE_HEIGHT / 2 - MIN_NODE_SPACING / 2;
            const existingBottom = pos.y + NODE_HEIGHT / 2 + MIN_NODE_SPACING / 2;
            
            // Строгая проверка перекрытия прямоугольников
            if (nodeRight > existingLeft && nodeLeft < existingRight &&
                nodeBottom > existingTop && nodeTop < existingBottom) {
                return true;
            }
        }
        return false;
    };
    
    // Функция для поиска свободной позиции справа с органичным смещением
    // ВСЕГДА возвращает позицию (никогда null)
    const findFreePosition = (
        startX: number,
        startY: number,
        existingPositions: Map<string, { x: number; y: number }>,
        maxAttempts: number = 100
    ): { x: number; y: number } => {
        // Пробуем позиции справа с небольшими вертикальными смещениями (имитация ветки)
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Органичное смещение: небольшие случайные отклонения вверх/вниз
            const offsetY = (Math.sin(attempt * 0.5) + Math.cos(attempt * 0.3)) * (MIN_NODE_SPACING * 0.5);
            const testX = startX + (attempt * MIN_NODE_SPACING * 0.3);
            const testY = startY + offsetY;
            
            if (!checkCollision(testX, testY, existingPositions)) {
                return { x: testX, y: testY };
            }
        }
        // Если не нашли свободную позицию - сильно сдвигаем вправо (гарантированная позиция)
        return { x: startX + maxAttempts * MIN_NODE_SPACING * 0.5, y: startY };
    };
    
    // Функция для размещения узла с избежанием коллизий
    const placeNodeWithCollisionAvoidance = (
        nodeId: string,
        parentPos: { x: number; y: number },
        angle: number,
        distance: number,
        existingPositions: Map<string, { x: number; y: number }>,
        maxAttempts: number = 8
    ): { x: number; y: number } | null => {
        let baseX = parentPos.x + Math.cos(angle) * distance;
        let baseY = parentPos.y + Math.sin(angle) * distance;
        
        // Пробуем разместить в базовой позиции
        if (!checkCollision(baseX, baseY, existingPositions)) {
            return { x: baseX, y: baseY };
        }
        
        // Если коллизия, пробуем разные углы
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const angleOffset = (attempt * Math.PI * 2) / maxAttempts;
            const testAngle = angle + angleOffset;
            const testX = parentPos.x + Math.cos(testAngle) * distance;
            const testY = parentPos.y + Math.sin(testAngle) * distance;
            
            if (!checkCollision(testX, testY, existingPositions)) {
                return { x: testX, y: testY };
            }
        }
        
        // Если все попытки неудачны, увеличиваем расстояние
        const fallbackDistance = distance * 1.3;
        return {
            x: parentPos.x + Math.cos(angle) * fallbackDistance,
            y: parentPos.y + Math.sin(angle) * fallbackDistance
        };
    };
    
    // Рекурсивная функция для размещения узлов с гибким разветвлением
    const placeNodesRecursive = (
        nodeId: string,
            parentPos: { x: number; y: number }, 
            depth: number,
        existingPositions: Map<string, { x: number; y: number }>,
        category: "combat" | "defense" | "utility"
        ) => {
        const children = SKILL_TREE_NODES.filter(n => n.parentId === nodeId);
            if (children.length === 0) return;
            
        const baseDistance = getBaseDistance(depth, children.length);
        
        // Разрешенные углы для движения СЛЕВА НАПРАВО: 45, 0, -45 градусов (все идут вправо)
        // Углы 90 и -90 исключены, так как они строго вертикальные
        const allowedAngles = [
            Math.PI / 4,      // 45° (вниз-вправо)
            0,                // 0° (строго вправо)
            -Math.PI / 4      // -45° (вверх-вправо)
        ];
        
        // ДЕРЕВО: ветки расходятся в разные стороны от начальной плоскости (0°)
        // Используем углы: 45°, 0°, -45° для расхождения веток
        
        if (children.length === 1) {
            // Один ребенок - размещаем вправо с органичным смещением (имитация продолжения ветки)
            const child = children[0]!;
            let pos: { x: number; y: number } | null = null;
            
            // Органичное смещение для имитации ветки (чередование вверх/вниз)
            const patternOffset = Math.sin(depth * 0.8) * (baseDistance * 0.25);
            
            // Пробуем углы в порядке приоритета: 0° (вправо), 45° (вниз-вправо), -45° (вверх-вправо)
            for (const angle of [0, Math.PI / 4, -Math.PI / 4]) {
                const testX = parentPos.x + Math.cos(angle) * baseDistance;
                const testY = parentPos.y + Math.sin(angle) * baseDistance + patternOffset;
                
                if (!checkCollision(testX, testY, existingPositions)) {
                    pos = { x: testX, y: testY };
                    break;
                }
            }
            
            // Если все углы заняты, ищем свободную позицию справа
            if (!pos) {
                const startX = parentPos.x + baseDistance;
                const startY = parentPos.y + patternOffset;
                pos = findFreePosition(startX, startY, existingPositions);
            }
            
            // pos всегда будет существовать (findFreePosition гарантированно возвращает позицию)
            existingPositions.set(child.id, pos);
            placeNodesRecursive(child.id, pos, depth + 1, existingPositions, category);
        } else {
            // Несколько детей - ВЕТВЛЕНИЕ ДЕРЕВА: расходимся в разные стороны
            // Используем углы: -45° (вверх-вправо), 0° (вправо), 45° (вниз-вправо)
            // Это создает веерное расхождение веток
            
            const branchAngles = [-Math.PI / 4, 0, Math.PI / 4]; // -45°, 0°, 45°
            
            children.forEach((child, index) => {
                // Выбираем угол для этой ветки (циклически используем доступные углы)
                const angleIndex = index % branchAngles.length;
                const angle = branchAngles[angleIndex]!;
                
                // Органичное смещение для каждой ветки (имитация естественного ветвления)
                const organicOffset = (Math.sin(depth * 0.9 + index * 0.6) + Math.cos(depth * 0.7 + index * 0.4)) * (baseDistance * 0.2);
                
                // Если детей больше чем углов, добавляем небольшие вариации
                let finalAngle = angle;
                if (children.length > branchAngles.length) {
                    const variation = (index - angleIndex) * 0.1; // Небольшое отклонение
                    finalAngle = angle + variation;
                    // Ограничиваем углы в диапазоне -45° до +45°
                    finalAngle = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, finalAngle));
                }
                
                let testX = parentPos.x + Math.cos(finalAngle) * baseDistance;
                let testY = parentPos.y + Math.sin(finalAngle) * baseDistance + organicOffset;
                
                // Проверяем коллизию и ищем свободное место
                if (checkCollision(testX, testY, existingPositions)) {
                    const freePos = findFreePosition(testX, testY, existingPositions);
                    testX = freePos.x;
                    testY = freePos.y;
                }
                
                // Размещаем узел (findFreePosition гарантирует валидную позицию)
                const pos = { x: testX, y: testY };
                existingPositions.set(child.id, pos);
                placeNodesRecursive(child.id, pos, depth + 1, existingPositions, category);
            });
        }
        };
        
    // Обрабатываем каждую категорию
    const categories: Array<{ id: "combat" | "defense" | "utility"; name: string; icon: string }> = [
        { id: "combat", name: "БОЕВЫЕ", icon: "⚔️" },
        { id: "defense", name: "ЗАЩИТА", icon: "🛡️" },
        { id: "utility", name: "УТИЛИТЫ", icon: "🛠️" }
    ];
    
    categories.forEach((category, treeIndex) => {
        const hubIds = BRANCH_CATEGORIES[category.id];
        const categoryHubs = SKILL_TREE_NODES.filter(n => hubIds.includes(n.id));
        
        // Центральная позиция дерева
        const treeCenterX = treeIndex * (TREE_WIDTH + TREE_SPACING) + TREE_WIDTH / 2;
        const treeTopY = 100;
        
        // Размещаем hub категории (если нужен) или первый hub ветки
        if (categoryHubs.length > 0) {
            // Размещаем hub-узлы веток органично
            const hubSpacing = Math.min(300, TREE_WIDTH / (categoryHubs.length + 1));
            const startX = treeCenterX - (categoryHubs.length - 1) * hubSpacing / 2;
            
            categoryHubs.forEach((hub, hubIndex) => {
                const hubX = startX + hubIndex * hubSpacing;
                const hubY = treeTopY + 200 + hubIndex * 400; // Размещаем вертикально с большим отступом
                const hubPos = { x: hubX, y: hubY };
                
                positions.set(hub.id, hubPos);
                
                // Размещаем дочерние узлы рекурсивно (они будут расходиться в разные стороны как дерево)
                placeNodesRecursive(hub.id, hubPos, 1, positions, category.id);
            });
        }
    });
    
    // Обрабатываем мета-узел синергии (если есть) - размещаем внизу по центру
    const synergyNode = SKILL_TREE_NODES.find(n => n.id === "commandSynergy");
    if (synergyNode) {
        // Находим максимальную Y координату
        let maxY = 0;
        positions.forEach(pos => {
            if (pos.y > maxY) maxY = pos.y;
        });
        // Размещаем мета-узел ниже всех остальных
        const centerX = (categories.length - 1) * (TREE_WIDTH + TREE_SPACING) / 2 + TREE_WIDTH / 2;
        positions.set(synergyNode.id, { x: centerX, y: maxY + 300 });
    }
    
    return positions;
}

// Основная функция для вычисления позиций (использует новую систему трех деревьев)
export function calculateAllNodePositions(): Map<string, { x: number; y: number }> {
    return calculateThreeTreesLayout();
}

// Центральный узел
const COMMAND_CORE: SkillNode = {
    id: "commandCore",
    title: "Командный штаб",
    desc: "Центральный протокол, который питает все ветки дерева.",
    icon: "🛰️",
    row: 0,
    col: 5,
    type: "hub",
    badge: "Центр"
};

// Ветка 1: Мобильность
const MOBILITY_BRANCH: SkillNode[] = [
    {
        id: "mobilityHub",
        title: "Ветка мобильности",
        desc: "Прыжки, скорость и манёвры.",
        icon: "🏃",
        row: 1,
        col: 0,
        type: "hub",
        badge: "Ветка",
        branchColor: "#0ff",
        parentId: "commandCore"
    },
    {
        id: "mobility1",
        title: "Базовая скорость",
        desc: "+2% скорости движения за уровень.",
        icon: "⚡",
        row: 2,
        col: 0,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobilityHub",
        maxLevel: 5,
        effects: ["+2% скорость"]
    },
    {
        id: "mobility2",
        title: "Улучшенные прыжки",
        desc: "Прыжок: -0.5с кулдаун за уровень.",
        icon: "🚀",
        row: 3,
        col: 0,
        type: "module",
        moduleId: "jump",
        parentId: "mobility1",
        maxLevel: 5,
        effects: ["-0.5с кулдаун прыжка"]
    },
    {
        id: "mobility3",
        title: "Манёвренность",
        desc: "+3% скорость поворота за уровень.",
        icon: "🌀",
        row: 4,
        col: 0,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "mobility2",
        maxLevel: 5,
        effects: ["+3% скорость поворота"]
    },
    {
        id: "mobility4",
        title: "Платформа",
        desc: "Модуль платформы: +1с максимальная длительность за уровень.",
        icon: "⬆️",
        row: 5,
        col: 0,
        type: "module",
        moduleId: "maneuver",
        parentId: "mobility3",
        maxLevel: 5,
        effects: ["+1с длительность маневрирования"]
    },
    {
        id: "mobility5",
        title: "Турбо-режим",
        desc: "+5% максимальная скорость за уровень.",
        icon: "💨",
        row: 6,
        col: 0,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobility4",
        maxLevel: 5,
        effects: ["+5% максимальная скорость"]
    },
    {
        id: "mobility6",
        title: "Ускорение реакции",
        desc: "+2% скорость ускорения за уровень.",
        icon: "⚡",
        row: 7,
        col: 0,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "mobility5",
        maxLevel: 5,
        effects: ["+2% скорость ускорения"]
    },
    {
        id: "mobility7",
        title: "Двойной прыжок",
        desc: "Модуль: возможность второго прыжка в воздухе.",
        icon: "🦘",
        row: 8,
        col: 0,
        type: "module",
        moduleId: "doubleJump",
        parentId: "mobility6",
        maxLevel: 5,
        effects: ["Двойной прыжок"]
    },
    {
        id: "mobility8",
        title: "Максимальная скорость",
        desc: "+3% максимальная скорость за уровень.",
        icon: "🏎️",
        row: 9,
        col: 0,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobility7",
        maxLevel: 5,
        effects: ["+3% максимальная скорость"]
    },
    // === РАЗВЕТВЛЕНИЕ от mobility5 ===
    {
        id: "mobility9",
        title: "Рывок",
        desc: "Активация: мгновенный рывок вперёд. -1с кулдаун за уровень.",
        icon: "💨",
        row: 7,
        col: 1,
        type: "module",
        moduleId: "dash",
        parentId: "mobility5",
        maxLevel: 5,
        effects: ["Рывок вперёд", "-1с кулдаун"]
    },
    {
        id: "mobility10",
        title: "Уклонение",
        desc: "+2% шанс уклонения от снарядов за уровень.",
        icon: "🌪️",
        row: 7,
        col: -1,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "mobility5",
        maxLevel: 5,
        effects: ["+2% уклонение"]
    },
    {
        id: "mobility11",
        title: "Адреналин",
        desc: "После рывка: +10% скорость на 3с за уровень.",
        icon: "⚡",
        row: 8,
        col: 1,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobility9",
        maxLevel: 5,
        effects: ["+10% скорость после рывка"]
    },
    {
        id: "mobility12",
        title: "Скольжение",
        desc: "Модуль: скольжение при торможении. +1с длительность за уровень.",
        icon: "🎿",
        row: 8,
        col: -1,
        type: "module",
        moduleId: "slide",
        parentId: "mobility10",
        maxLevel: 5,
        effects: ["Скольжение", "+1с длительность"]
    },
    {
        id: "mobility13",
        title: "Цепной рывок",
        desc: "Возможность второго рывка подряд. -0.5с между рывками за уровень.",
        icon: "⚡⚡",
        row: 9,
        col: 1,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "mobility11",
        maxLevel: 5,
        effects: ["Двойной рывок", "-0.5с задержка"]
    },
    // === РАЗВЕТВЛЕНИЕ от mobility3 (раннее) ===
    {
        id: "mobility14",
        title: "Лёгкий шаг",
        desc: "+3% скорость при полном HP за уровень.",
        icon: "🪶",
        row: 5,
        col: -2,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobility3",
        maxLevel: 5,
        effects: ["+3% скорость при полном HP"]
    },
    {
        id: "mobility15",
        title: "Инерция",
        desc: "+2% сохранение скорости при повороте за уровень.",
        icon: "🔄",
        row: 6,
        col: -2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "mobility14",
        maxLevel: 5,
        effects: ["+2% сохранение скорости"]
    },
    {
        id: "mobility16",
        title: "Ветер в спину",
        desc: "Модуль: +15% скорость на 3с после убийства.",
        icon: "💨",
        row: 7,
        col: -2,
        type: "module",
        moduleId: "windBuff",
        parentId: "mobility15",
        maxLevel: 5,
        effects: ["+15% скорость после убийства"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "mobility17",
        title: "Сверхскорость",
        desc: "+4% максимальная скорость за уровень.",
        icon: "🚀",
        row: 10,
        col: 0,
        type: "skill",
        skillId: "tankMastery",
        parentId: "mobility8",
        maxLevel: 5,
        effects: ["+4% максимальная скорость"]
    },
    {
        id: "mobility18",
        title: "Квантовый прыжок",
        desc: "Модуль: телепортация на короткое расстояние.",
        icon: "⚛️",
        row: 11,
        col: 0,
        type: "module",
        moduleId: "quantumJump",
        parentId: "mobility17",
        maxLevel: 5,
        effects: ["Квантовый прыжок"]
    }
];

// Ветка 2: Ультимативные
const ULTIMATE_BRANCH: SkillNode[] = [
    {
        id: "ultimateHub",
        title: "Ветка ультимативных",
        desc: "Мощные способности и перезарядки.",
        icon: "💥",
        row: 1,
        col: 1,
        type: "hub",
        badge: "Ветка",
        branchColor: "#f0f",
        parentId: "commandCore"
    },
    {
        id: "ultimate1",
        title: "Боевая ярость",
        desc: "+1.5% урона за уровень.",
        icon: "⚡",
        row: 2,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "attackHub",
        maxLevel: 5,
        effects: ["+1.5% урон"]
    },
    {
        id: "ultimate2",
        title: "Ускоренная стрельба",
        desc: "Модуль: +0.5с длительность за уровень.",
        icon: "🔥",
        row: 3,
        col: 1,
        type: "module",
        moduleId: "rapidFire",
        parentId: "ultimate1",
        maxLevel: 5,
        effects: ["+0.5с длительность ускоренной стрельбы"]
    },
    {
        id: "ultimate3",
        title: "Критический удар",
        desc: "+2% шанс крита за уровень.",
        icon: "💀",
        row: 4,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate2",
        maxLevel: 5,
        effects: ["+2% шанс крита"]
    },
    {
        id: "ultimate4",
        title: "Автонаводка",
        desc: "Модуль: +1с длительность за уровень.",
        icon: "🎯",
        row: 5,
        col: 1,
        type: "module",
        moduleId: "autoAim",
        parentId: "ultimate3",
        maxLevel: 5,
        effects: ["+1с длительность автонаводки"]
    },
    {
        id: "ultimate5",
        title: "Абсолютная мощь",
        desc: "+3% общий урон за уровень.",
        icon: "💣",
        row: 6,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate4",
        maxLevel: 5,
        effects: ["+3% общий урон"]
    },
    {
        id: "ultimate6",
        title: "Разрушительный удар",
        desc: "+4% урон по броне за уровень.",
        icon: "💥",
        row: 7,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate5",
        maxLevel: 5,
        effects: ["+4% урон по броне"]
    },
    {
        id: "ultimate7",
        title: "Огненный шторм",
        desc: "Модуль: множественные выстрелы одновременно.",
        icon: "🌪️",
        row: 8,
        col: 1,
        type: "module",
        moduleId: "firestorm",
        parentId: "ultimate6",
        maxLevel: 5,
        effects: ["Множественные выстрелы"]
    },
    {
        id: "ultimate8",
        title: "Абсолютное превосходство",
        desc: "+5% общий урон за уровень.",
        icon: "👑",
        row: 9,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate7",
        maxLevel: 5,
        effects: ["+5% общий урон"]
    },
    // === РАЗВЕТВЛЕНИЕ от ultimate5 ===
    {
        id: "ultimate9",
        title: "Берсерк",
        desc: "Модуль: +50% урона на 5с, -30% защиты. +1с за уровень.",
        icon: "🔥",
        row: 7,
        col: 2,
        type: "module",
        moduleId: "berserk",
        parentId: "ultimate5",
        maxLevel: 5,
        effects: ["Берсерк: +50% урон", "-30% защита", "+1с длительность"]
    },
    {
        id: "ultimate10",
        title: "Перегрузка",
        desc: "Модуль: мощный выстрел с откатом. +10% урон за уровень.",
        icon: "⚡",
        row: 7,
        col: 0,
        type: "module",
        moduleId: "overcharge",
        parentId: "ultimate5",
        maxLevel: 5,
        effects: ["Перегрузка: мощный выстрел"]
    },
    {
        id: "ultimate11",
        title: "Неудержимый",
        desc: "В режиме берсерка: иммунитет к замедлению.",
        icon: "💪",
        row: 8,
        col: 2,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate9",
        maxLevel: 5,
        effects: ["Иммунитет к замедлению"]
    },
    {
        id: "ultimate12",
        title: "Критическая перегрузка",
        desc: "Перегрузка: +25% шанс крита за уровень.",
        icon: "💥",
        row: 8,
        col: 0,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate10",
        maxLevel: 5,
        effects: ["+25% шанс крита при перегрузке"]
    },
    {
        id: "ultimate13",
        title: "Экстаз битвы",
        desc: "Убийства продлевают берсерк на 2с за уровень.",
        icon: "☠️",
        row: 9,
        col: 2,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate11",
        maxLevel: 5,
        effects: ["+2с берсерка за убийство"]
    },
    // === РАЗВЕТВЛЕНИЕ от ultimate3 (раннее) ===
    {
        id: "ultimate14",
        title: "Жажда крови",
        desc: "+2% вампиризм (восстановление HP от урона) за уровень.",
        icon: "🩸",
        row: 5,
        col: -1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate3",
        maxLevel: 5,
        effects: ["+2% вампиризм"]
    },
    {
        id: "ultimate15",
        title: "Кровавый угар",
        desc: "+5% урон при HP ниже 50% за уровень.",
        icon: "💀",
        row: 6,
        col: -1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate14",
        maxLevel: 5,
        effects: ["+5% урон при низком HP"]
    },
    {
        id: "ultimate16",
        title: "Последний рывок",
        desc: "Модуль: при HP<10% - неуязвимость на 2с. +0.5с за уровень.",
        icon: "💫",
        row: 7,
        col: -1,
        type: "module",
        moduleId: "lastStand",
        parentId: "ultimate15",
        maxLevel: 5,
        effects: ["Неуязвимость при HP<10%"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "ultimate17",
        title: "Абсолютный хаос",
        desc: "+6% общий урон за уровень.",
        icon: "🌪️",
        row: 10,
        col: 1,
        type: "skill",
        skillId: "combatExpert",
        parentId: "ultimate8",
        maxLevel: 5,
        effects: ["+6% общий урон"]
    },
    {
        id: "ultimate18",
        title: "Апокалипсис",
        desc: "Модуль: массовый урон по всем врагам в радиусе.",
        icon: "☄️",
        row: 11,
        col: 1,
        type: "module",
        moduleId: "apocalypse",
        parentId: "ultimate17",
        maxLevel: 5,
        effects: ["Массовый урон в радиусе"]
    }
];

// Ветка 3: Технологии
const TECH_BRANCH: SkillNode[] = [
    {
        id: "techHub",
        title: "Ветка технологий",
        desc: "Дроны, инженерка и автоматизация.",
        icon: "🔧",
        row: 1,
        col: 2,
        type: "hub",
        badge: "Ветка",
        branchColor: "#ff0",
        parentId: "commandCore"
    },
    {
        id: "tech1",
        title: "Базовые системы",
        desc: "+1% скорость перезарядки за уровень.",
        icon: "⚙️",
        row: 2,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "techHub",
        maxLevel: 5,
        effects: ["+1% скорость перезарядки"]
    },
    {
        id: "tech2",
        title: "Ремонтный дрон",
        desc: "Модуль: +5 HP/сек регенерации за уровень.",
        icon: "🤖",
        row: 3,
        col: 2,
        type: "module",
        moduleId: "repairDrone",
        parentId: "tech1",
        maxLevel: 5,
        effects: ["+5 HP/сек регенерации"]
    },
    {
        id: "tech3",
        title: "Улучшенная электроника",
        desc: "+2% точность за уровень.",
        icon: "📡",
        row: 4,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech2",
        maxLevel: 5,
        effects: ["+2% точность"]
    },
    {
        id: "tech4",
        title: "Боевой дрон",
        desc: "Модуль: дрон атакует врагов.",
        icon: "🛸",
        row: 5,
        col: 2,
        type: "module",
        moduleId: "combatDrone",
        parentId: "tech3",
        maxLevel: 5,
        effects: ["Дрон наносит урон врагам"]
    },
    {
        id: "tech5",
        title: "Автоматизация",
        desc: "+1.5% скорость всех систем за уровень.",
        icon: "🔬",
        row: 6,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech4",
        maxLevel: 5,
        effects: ["+1.5% скорость всех систем"]
    },
    {
        id: "tech6",
        title: "Улучшенные дроны",
        desc: "+10% эффективность дронов за уровень.",
        icon: "🤖",
        row: 7,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech5",
        maxLevel: 5,
        effects: ["+10% эффективность дронов"]
    },
    {
        id: "tech7",
        title: "Ракетная система",
        desc: "Модуль: запуск управляемых ракет.",
        icon: "🚀",
        row: 8,
        col: 2,
        type: "module",
        moduleId: "missileSystem",
        parentId: "tech6",
        maxLevel: 5,
        effects: ["Управляемые ракеты"]
    },
    {
        id: "tech8",
        title: "Квантовая синхронизация",
        desc: "+2% скорость всех систем за уровень.",
        icon: "⚛️",
        row: 9,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech7",
        maxLevel: 5,
        effects: ["+2% скорость всех систем"]
    },
    // === РАЗВЕТВЛЕНИЕ от tech5 ===
    {
        id: "tech9",
        title: "Дрон-разведчик",
        desc: "Модуль: дрон выявляет скрытых врагов. +10м радиус за уровень.",
        icon: "👁️",
        row: 7,
        col: 3,
        type: "module",
        moduleId: "scoutDrone",
        parentId: "tech5",
        maxLevel: 5,
        effects: ["Обнаружение скрытых", "+10м радиус"]
    },
    {
        id: "tech10",
        title: "Инженерная турель",
        desc: "Модуль: размещаемая автоматическая турель.",
        icon: "🗼",
        row: 7,
        col: 1,
        type: "module",
        moduleId: "turret",
        parentId: "tech5",
        maxLevel: 5,
        effects: ["Автотурель"]
    },
    {
        id: "tech11",
        title: "Рой дронов",
        desc: "+1 дополнительный дрон за 2 уровня.",
        icon: "🐝",
        row: 8,
        col: 3,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech9",
        maxLevel: 5,
        effects: ["+1 дрон за 2 уровня"]
    },
    {
        id: "tech12",
        title: "Улучшенная турель",
        desc: "+15% урон турели, +10с время жизни за уровень.",
        icon: "🗼",
        row: 8,
        col: 1,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech10",
        maxLevel: 5,
        effects: ["+15% урон турели", "+10с время жизни"]
    },
    {
        id: "tech13",
        title: "ИИ-ядро",
        desc: "Дроны самостоятельно выбирают приоритетные цели.",
        icon: "🧠",
        row: 9,
        col: 3,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech11",
        maxLevel: 5,
        effects: ["Умный ИИ дронов"]
    },
    // === РАЗВЕТВЛЕНИЕ от tech3 (раннее) ===
    {
        id: "tech14",
        title: "Нанороботы",
        desc: "Модуль: микроботы восстанавливают системы. +2% ремонт/с за уровень.",
        icon: "🔬",
        row: 5,
        col: 4,
        type: "module",
        moduleId: "nanobots",
        parentId: "tech3",
        maxLevel: 5,
        effects: ["+2% авторемонт/с"]
    },
    {
        id: "tech15",
        title: "Улучшенные наноботы",
        desc: "Наноботы также восстанавливают энергию. +1% энергия/с за уровень.",
        icon: "⚡",
        row: 6,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech14",
        maxLevel: 5,
        effects: ["+1% восстановление энергии/с"]
    },
    {
        id: "tech16",
        title: "Нанощит",
        desc: "Наноботы создают защитное поле. +5% сопротивление за уровень.",
        icon: "🛡️",
        row: 7,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech15",
        maxLevel: 5,
        effects: ["+5% сопротивление от нанощита"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "tech17",
        title: "Сингулярность",
        desc: "+3% скорость всех систем за уровень.",
        icon: "🌀",
        row: 10,
        col: 2,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "tech8",
        maxLevel: 5,
        effects: ["+3% скорость всех систем"]
    },
    {
        id: "tech18",
        title: "Технологическое превосходство",
        desc: "Модуль: все дроны получают +100% эффективность на 10с.",
        icon: "🤖",
        row: 11,
        col: 2,
        type: "module",
        moduleId: "techSupremacy",
        parentId: "tech17",
        maxLevel: 5,
        effects: ["+100% эффективность дронов"]
    }
];

// Ветка: Лидерство (объединяет поддержку + экономику + командование)
const LEADERSHIP_BRANCH: SkillNode[] = [
    {
        id: "leadershipHub",
        title: "Ветка лидерства",
        desc: "Поддержка, экономика, командование.",
        icon: "🎖️",
        row: 1,
        col: 5,
        type: "hub",
        badge: "Ветка",
        branchColor: "#0f0",
        parentId: "commandCore"
    },
    {
        id: "support1",
        title: "Базовое здоровье",
        desc: "+8 HP за уровень.",
        icon: "❤️",
        row: 2,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "leadershipHub",
        maxLevel: 5,
        effects: ["+8 HP"]
    },
    {
        id: "support2",
        title: "Аура исцеления",
        desc: "Модуль: исцеляет союзников рядом.",
        icon: "💚",
        row: 3,
        col: 3,
        type: "module",
        moduleId: "healAura",
        parentId: "support1",
        maxLevel: 5,
        effects: ["Исцеление союзников"]
    },
    {
        id: "support3",
        title: "Усиленная броня",
        desc: "+1.5% броня за уровень.",
        icon: "🛡️",
        row: 4,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support2",
        maxLevel: 5,
        effects: ["+1.5% броня"]
    },
    {
        id: "support4",
        title: "Аура урона",
        desc: "Модуль: увеличивает урон союзникам.",
        icon: "⚔️",
        row: 5,
        col: 3,
        type: "module",
        moduleId: "damageAura",
        parentId: "support3",
        maxLevel: 5,
        effects: ["+урон союзникам"]
    },
    {
        id: "support5",
        title: "Командный дух",
        desc: "+2% все характеристики за уровень.",
        icon: "🎖️",
        row: 6,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support4",
        maxLevel: 5,
        effects: ["+2% все характеристики"]
    },
    {
        id: "support6",
        title: "Массовое исцеление",
        desc: "Модуль: исцеляет всех союзников в радиусе.",
        icon: "💚",
        row: 7,
        col: 3,
        type: "module",
        moduleId: "massHeal",
        parentId: "support5",
        maxLevel: 5,
        effects: ["Массовое исцеление"]
    },
    {
        id: "support7",
        title: "Усиленная поддержка",
        desc: "+2.5% все характеристики за уровень.",
        icon: "⭐",
        row: 8,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support6",
        maxLevel: 5,
        effects: ["+2.5% все характеристики"]
    },
    {
        id: "support8",
        title: "Божественная защита",
        desc: "Модуль: временная неуязвимость для союзников.",
        icon: "✨",
        row: 9,
        col: 3,
        type: "module",
        moduleId: "divineProtection",
        parentId: "support7",
        maxLevel: 5,
        effects: ["Неуязвимость союзников"]
    },
    // === РАЗВЕТВЛЕНИЕ от support5 ===
    {
        id: "support9",
        title: "Аура скорости",
        desc: "Модуль: +5% скорость союзникам в радиусе за уровень.",
        icon: "💨",
        row: 7,
        col: 4,
        type: "module",
        moduleId: "speedAura",
        parentId: "support5",
        maxLevel: 5,
        effects: ["+5% скорость союзникам"]
    },
    {
        id: "support10",
        title: "Боевой клич",
        desc: "Модуль: +10% урон союзникам на 5с. +1с за уровень.",
        icon: "📢",
        row: 7,
        col: 2,
        type: "module",
        moduleId: "warCry",
        parentId: "support5",
        maxLevel: 5,
        effects: ["Боевой клич: +10% урон", "+1с длительность"]
    },
    {
        id: "support11",
        title: "Стремительная поддержка",
        desc: "Ауры действуют на +20% большем расстоянии за уровень.",
        icon: "🌀",
        row: 8,
        col: 4,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support9",
        maxLevel: 5,
        effects: ["+20% радиус аур"]
    },
    {
        id: "support12",
        title: "Вдохновение",
        desc: "Боевой клич также даёт +5% защиты за уровень.",
        icon: "💪",
        row: 8,
        col: 2,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support10",
        maxLevel: 5,
        effects: ["+5% защита от клича"]
    },
    {
        id: "support13",
        title: "Герой команды",
        desc: "Все бонусы поддержки действуют и на вас с +50% эффективностью.",
        icon: "🌟",
        row: 9,
        col: 4,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support11",
        maxLevel: 5,
        effects: ["+50% эффективность для себя"]
    },
    // === РАЗВЕТВЛЕНИЕ от support3 (раннее) ===
    {
        id: "support14",
        title: "Щит союзника",
        desc: "Модуль: передаёт часть своего щита союзнику. +10% за уровень.",
        icon: "🔰",
        row: 5,
        col: 5,
        type: "module",
        moduleId: "allyShield",
        parentId: "support3",
        maxLevel: 5,
        effects: ["Передача +10% щита"]
    },
    {
        id: "support15",
        title: "Связь жизней",
        desc: "Распределение урона между вами и союзником. -5% урон каждому за уровень.",
        icon: "❤️‍🔥",
        row: 6,
        col: 5,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support14",
        maxLevel: 5,
        effects: ["-5% урон при связи"]
    },
    {
        id: "support16",
        title: "Воскрешение",
        desc: "Модуль: возрождает павшего союзника с 30% HP. +10% HP за уровень.",
        icon: "✨",
        row: 7,
        col: 5,
        type: "module",
        moduleId: "resurrect",
        parentId: "support15",
        maxLevel: 5,
        effects: ["Воскрешение союзника"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "support17",
        title: "Аватар поддержки",
        desc: "+3% все характеристики за уровень.",
        icon: "👼",
        row: 10,
        col: 3,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "support8",
        maxLevel: 5,
        effects: ["+3% все характеристики"]
    },
    {
        id: "support18",
        title: "Святилище",
        desc: "Модуль: создаёт зону, где союзники получают -50% урона.",
        icon: "🏛️",
        row: 11,
        col: 3,
        type: "module",
        moduleId: "sanctuary",
        parentId: "support17",
        maxLevel: 5,
        effects: ["Зона -50% урона"]
    }
];

// Ветка 5: Скрытность
const STEALTH_BRANCH: SkillNode[] = [
    {
        id: "stealthHub",
        title: "Ветка скрытности",
        desc: "Невидимость, маскировка и уклонение.",
        icon: "👁️",
        row: 1,
        col: 4,
        type: "hub",
        badge: "Ветка",
        branchColor: "#888",
        parentId: "commandCore"
    },
    {
        id: "stealth1",
        title: "Базовое уклонение",
        desc: "+1% шанс уклонения за уровень.",
        icon: "🌀",
        row: 2,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealthHub",
        maxLevel: 5,
        effects: ["+1% уклонение"]
    },
    {
        id: "stealth2",
        title: "Камуфляж",
        desc: "Модуль: временная невидимость.",
        icon: "👻",
        row: 3,
        col: 4,
        type: "module",
        moduleId: "cloak",
        parentId: "stealth1",
        maxLevel: 5,
        effects: ["Невидимость"]
    },
    {
        id: "stealth3",
        title: "Тихий шаг",
        desc: "+2% скорость в стелсе за уровень.",
        icon: "👣",
        row: 4,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth2",
        maxLevel: 5,
        effects: ["+2% скорость в стелсе"]
    },
    {
        id: "stealth4",
        title: "Призрачный удар",
        desc: "Модуль: +50% урон из невидимости.",
        icon: "🗡️",
        row: 5,
        col: 4,
        type: "module",
        moduleId: "stealthStrike",
        parentId: "stealth3",
        maxLevel: 5,
        effects: ["+50% урон из невидимости"]
    },
    {
        id: "stealth5",
        title: "Мастер теней",
        desc: "+1.5с длительность стелса за уровень.",
        icon: "🌑",
        row: 6,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth4",
        maxLevel: 5,
        effects: ["+1.5с длительность стелса"]
    },
    {
        id: "stealth6",
        title: "Фантомный след",
        desc: "Модуль: оставляет ложные следы для врагов.",
        icon: "👻",
        row: 7,
        col: 4,
        type: "module",
        moduleId: "phantomTrail",
        parentId: "stealth5",
        maxLevel: 5,
        effects: ["Ложные следы"]
    },
    {
        id: "stealth7",
        title: "Невидимое присутствие",
        desc: "+2с длительность стелса за уровень.",
        icon: "🌙",
        row: 8,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth6",
        maxLevel: 5,
        effects: ["+2с длительность стелса"]
    },
    {
        id: "stealth8",
        title: "Теневой мастер",
        desc: "Модуль: полная невидимость даже при атаке.",
        icon: "🌌",
        row: 9,
        col: 4,
        type: "module",
        moduleId: "shadowMaster",
        parentId: "stealth7",
        maxLevel: 5,
        effects: ["Невидимость при атаке"]
    },
    // === РАЗВЕТВЛЕНИЕ от stealth5 ===
    {
        id: "stealth9",
        title: "Засада",
        desc: "+30% урон первой атаке из стелса за уровень.",
        icon: "🎯",
        row: 7,
        col: 5,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth5",
        maxLevel: 5,
        effects: ["+30% урон из засады"]
    },
    {
        id: "stealth10",
        title: "Дымовая завеса",
        desc: "Модуль: создаёт облако дыма, скрывающее от врагов.",
        icon: "💨",
        row: 7,
        col: 3,
        type: "module",
        moduleId: "smokeScreen",
        parentId: "stealth5",
        maxLevel: 5,
        effects: ["Дымовая завеса"]
    },
    {
        id: "stealth11",
        title: "Убийца из тени",
        desc: "Убийство из стелса сбрасывает кулдаун невидимости.",
        icon: "☠️",
        row: 8,
        col: 5,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth9",
        maxLevel: 5,
        effects: ["Сброс кулдауна при убийстве"]
    },
    {
        id: "stealth12",
        title: "Токсичный дым",
        desc: "Дымовая завеса наносит урон врагам внутри. +5 урон/с за уровень.",
        icon: "☠️",
        row: 8,
        col: 3,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth10",
        maxLevel: 5,
        effects: ["+5 урон/с в дыму"]
    },
    {
        id: "stealth13",
        title: "Призрак",
        desc: "При критическом HP автоматически активируется стелс.",
        icon: "👻",
        row: 9,
        col: 5,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth11",
        maxLevel: 5,
        effects: ["Авто-стелс при HP<20%"]
    },
    // === РАЗВЕТВЛЕНИЕ от stealth3 (раннее) ===
    {
        id: "stealth14",
        title: "Слепящая вспышка",
        desc: "Модуль: ослепляет врагов на 2с. +0.5с за уровень.",
        icon: "💥",
        row: 5,
        col: 6,
        type: "module",
        moduleId: "flashBang",
        parentId: "stealth3",
        maxLevel: 5,
        effects: ["Ослепление на 2с"]
    },
    {
        id: "stealth15",
        title: "Отвлечение",
        desc: "После вспышки: +20% урон по ослеплённым за уровень.",
        icon: "🎭",
        row: 6,
        col: 6,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth14",
        maxLevel: 5,
        effects: ["+20% урон по ослеплённым"]
    },
    {
        id: "stealth16",
        title: "Теневой шаг",
        desc: "Модуль: мгновенное перемещение за спину врага.",
        icon: "🌑",
        row: 7,
        col: 6,
        type: "module",
        moduleId: "shadowStep",
        parentId: "stealth15",
        maxLevel: 5,
        effects: ["Телепорт за спину врага"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "stealth17",
        title: "Абсолютная тень",
        desc: "+3с длительность стелса за уровень.",
        icon: "🌌",
        row: 10,
        col: 4,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "stealth8",
        maxLevel: 5,
        effects: ["+3с длительность стелса"]
    },
    {
        id: "stealth18",
        title: "Владыка теней",
        desc: "Модуль: в стелсе вы проходите сквозь врагов и стены.",
        icon: "👤",
        row: 11,
        col: 4,
        type: "module",
        moduleId: "shadowLord",
        parentId: "stealth17",
        maxLevel: 5,
        effects: ["Прохождение сквозь объекты"]
    }
];

// Ветка 6: Утилиты
const UTILITY_BRANCH: SkillNode[] = [
    {
        id: "utilityHub",
        title: "Ветка утилит",
        desc: "Стенки, ловушки и тактические инструменты.",
        icon: "🛠️",
        row: 1,
        col: 6,
        type: "hub",
        badge: "Ветка",
        branchColor: "#fa0",
        parentId: "commandCore"
    },
    {
        id: "utility1",
        title: "Тактическое мышление",
        desc: "+1% опыт за уровень.",
        icon: "🧠",
        row: 2,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "techHub",
        maxLevel: 5,
        effects: ["+1% опыт"]
    },
    {
        id: "utility2",
        title: "Защитная стенка",
        desc: "Модуль: +1 стенка, -1с кулдаун за уровень.",
        icon: "🧱",
        row: 3,
        col: 6,
        type: "module",
        moduleId: "wall",
        parentId: "utility1",
        maxLevel: 5,
        effects: ["+1 стенка", "-1с кулдаун"]
    },
    {
        id: "utility3",
        title: "Ресурсность",
        desc: "+1.5% кредиты за уровень.",
        icon: "💎",
        row: 4,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility2",
        maxLevel: 5,
        effects: ["+1.5% кредиты"]
    },
    {
        id: "utility4",
        title: "Мины",
        desc: "Модуль: установка взрывных мин.",
        icon: "💣",
        row: 5,
        col: 6,
        type: "module",
        moduleId: "mine",
        parentId: "utility3",
        maxLevel: 5,
        effects: ["Установка мин"]
    },
    {
        id: "utility5",
        title: "Тактический гений",
        desc: "+2% опыт и кредиты за уровень.",
        icon: "🎓",
        row: 6,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility4",
        maxLevel: 5,
        effects: ["+2% опыт и кредиты"]
    },
    {
        id: "utility6",
        title: "Улучшенные мины",
        desc: "Модуль: мины наносят больше урона.",
        icon: "💣",
        row: 7,
        col: 6,
        type: "module",
        moduleId: "enhancedMines",
        parentId: "utility5",
        maxLevel: 5,
        effects: ["+урон мин"]
    },
    {
        id: "utility7",
        title: "Тактическое превосходство",
        desc: "+2.5% опыт и кредиты за уровень.",
        icon: "🧠",
        row: 8,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility6",
        maxLevel: 5,
        effects: ["+2.5% опыт и кредиты"]
    },
    {
        id: "utility8",
        title: "Телепорт",
        desc: "Модуль: кратковременная телепортация.",
        icon: "🌀",
        row: 9,
        col: 6,
        type: "module",
        moduleId: "teleport",
        parentId: "utility7",
        maxLevel: 5,
        effects: ["Телепортация"]
    },
    // === РАЗВЕТВЛЕНИЕ от utility5 ===
    {
        id: "utility9",
        title: "Ловушки",
        desc: "Модуль: размещаемые замедляющие ловушки.",
        icon: "🪤",
        row: 7,
        col: 7,
        type: "module",
        moduleId: "traps",
        parentId: "utility5",
        maxLevel: 5,
        effects: ["Замедляющие ловушки"]
    },
    {
        id: "utility10",
        title: "EMP-граната",
        desc: "Модуль: граната отключает электронику врагов на 2с за уровень.",
        icon: "⚡",
        row: 7,
        col: 5,
        type: "module",
        moduleId: "empGrenade",
        parentId: "utility5",
        maxLevel: 5,
        effects: ["EMP: отключение на 2с"]
    },
    {
        id: "utility11",
        title: "Ядовитые ловушки",
        desc: "Ловушки наносят урон со временем. +3 урон/с за уровень.",
        icon: "☠️",
        row: 8,
        col: 7,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility9",
        maxLevel: 5,
        effects: ["+3 урон/с от ловушек"]
    },
    {
        id: "utility12",
        title: "Перегрузка EMP",
        desc: "EMP-граната также наносит +20 урон за уровень.",
        icon: "💥",
        row: 8,
        col: 5,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility10",
        maxLevel: 5,
        effects: ["+20 урон от EMP"]
    },
    {
        id: "utility13",
        title: "Мастер ловушек",
        desc: "+2 одновременных ловушки за уровень.",
        icon: "🪤",
        row: 9,
        col: 7,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility11",
        maxLevel: 5,
        effects: ["+2 ловушки одновременно"]
    },
    // === РАЗВЕТВЛЕНИЕ от utility3 (раннее) ===
    {
        id: "utility14",
        title: "Голограмма",
        desc: "Модуль: создаёт копию-приманку. Длительность +1с за уровень.",
        icon: "👥",
        row: 5,
        col: 8,
        type: "module",
        moduleId: "hologram",
        parentId: "utility3",
        maxLevel: 5,
        effects: ["Копия-приманка"]
    },
    {
        id: "utility15",
        title: "Взрывающаяся голограмма",
        desc: "Голограмма взрывается при уничтожении. +15 урон за уровень.",
        icon: "💥",
        row: 6,
        col: 8,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility14",
        maxLevel: 5,
        effects: ["+15 урон от взрыва голограммы"]
    },
    {
        id: "utility16",
        title: "Армия иллюзий",
        desc: "+1 голограмма одновременно за 2 уровня.",
        icon: "👥👥",
        row: 7,
        col: 8,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility15",
        maxLevel: 5,
        effects: ["+1 голограмма за 2 уровня"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "utility17",
        title: "Тактический гений",
        desc: "+3% опыт и кредиты за уровень.",
        icon: "🧠",
        row: 10,
        col: 6,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "utility8",
        maxLevel: 5,
        effects: ["+3% опыт и кредиты"]
    },
    {
        id: "utility18",
        title: "Врата",
        desc: "Модуль: создаёт портал для быстрого перемещения.",
        icon: "🌀",
        row: 11,
        col: 6,
        type: "module",
        moduleId: "portal",
        parentId: "utility17",
        maxLevel: 5,
        effects: ["Портал"]
    }
];

// Ветка: Атака (объединяет огневую мощь + ультимативные)
const ATTACK_BRANCH: SkillNode[] = [
    {
        id: "attackHub",
        title: "Ветка атаки",
        desc: "Урон, критический удар, разрушение.",
        icon: "⚔️",
        row: 1,
        col: 0,
        type: "hub",
        badge: "Ветка",
        branchColor: "#f00",
        parentId: "commandCore"
    },
    {
        id: "firepower1",
        title: "Базовый урон",
        desc: "+2 урона за уровень.",
        icon: "💥",
        row: 2,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "attackHub",
        maxLevel: 5,
        effects: ["+2 урон"]
    },
    {
        id: "firepower2",
        title: "Скорострельность",
        desc: "-10мс перезарядка за уровень.",
        icon: "🔥",
        row: 3,
        col: 7,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "firepower1",
        maxLevel: 5,
        effects: ["-10мс перезарядка"]
    },
    {
        id: "firepower3",
        title: "Пробивная сила",
        desc: "+1.5% пробивание брони за уровень.",
        icon: "⚡",
        row: 4,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower2",
        maxLevel: 5,
        effects: ["+1.5% пробивание"]
    },
    {
        id: "firepower4",
        title: "Залп",
        desc: "Модуль: выстрел несколькими снарядами.",
        icon: "🎆",
        row: 5,
        col: 7,
        type: "module",
        moduleId: "burst",
        parentId: "firepower3",
        maxLevel: 5,
        effects: ["Залп снарядами"]
    },
    {
        id: "firepower5",
        title: "Артиллерист",
        desc: "+3 урон за уровень.",
        icon: "💣",
        row: 6,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower4",
        maxLevel: 5,
        effects: ["+3 урон"]
    },
    {
        id: "firepower6",
        title: "Снайперская точность",
        desc: "+5% точность за уровень.",
        icon: "🎯",
        row: 7,
        col: 7,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "firepower5",
        maxLevel: 5,
        effects: ["+5% точность"]
    },
    {
        id: "firepower7",
        title: "Плазменный залп",
        desc: "Модуль: залп плазменных снарядов.",
        icon: "⚡",
        row: 8,
        col: 7,
        type: "module",
        moduleId: "plasmaBurst",
        parentId: "firepower6",
        maxLevel: 5,
        effects: ["Плазменный залп"]
    },
    {
        id: "firepower8",
        title: "Абсолютное разрушение",
        desc: "+4 урон за уровень.",
        icon: "💀",
        row: 9,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower7",
        maxLevel: 5,
        effects: ["+4 урон"]
    },
    // === РАЗВЕТВЛЕНИЕ от firepower5 ===
    {
        id: "firepower9",
        title: "Бронебойные снаряды",
        desc: "+3% игнорирования брони за уровень.",
        icon: "🔩",
        row: 7,
        col: 8,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower5",
        maxLevel: 5,
        effects: ["+3% игнорирование брони"]
    },
    {
        id: "firepower10",
        title: "Критический урон",
        desc: "+5% шанс крита, +10% урон крита за уровень.",
        icon: "💥",
        row: 7,
        col: 6,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower5",
        maxLevel: 5,
        effects: ["+5% шанс крита", "+10% урон крита"]
    },
    {
        id: "firepower11",
        title: "Разрывные снаряды",
        desc: "Модуль: снаряды взрываются при попадании. +2м радиус за уровень.",
        icon: "💣",
        row: 8,
        col: 8,
        type: "module",
        moduleId: "explosiveShells",
        parentId: "firepower9",
        maxLevel: 5,
        effects: ["Взрывные снаряды", "+2м радиус"]
    },
    {
        id: "firepower12",
        title: "Снайпер",
        desc: "+10% урон на дальних дистанциях за уровень.",
        icon: "🎯",
        row: 8,
        col: 6,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "firepower10",
        maxLevel: 5,
        effects: ["+10% урон на дистанции"]
    },
    {
        id: "firepower13",
        title: "Опустошитель",
        desc: "Каждый 5-й выстрел наносит x2 урон.",
        icon: "☠️",
        row: 9,
        col: 8,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower11",
        maxLevel: 5,
        effects: ["Каждый 5-й выстрел x2"]
    },
    // === РАЗВЕТВЛЕНИЕ от firepower3 (раннее) ===
    {
        id: "firepower14",
        title: "Зажигательные снаряды",
        desc: "Снаряды поджигают цель. +3 урон/с за уровень.",
        icon: "🔥",
        row: 5,
        col: 9,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower3",
        maxLevel: 5,
        effects: ["+3 урон/с поджог"]
    },
    {
        id: "firepower15",
        title: "Адское пламя",
        desc: "Поджог распространяется на ближайших врагов.",
        icon: "🌋",
        row: 6,
        col: 9,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower14",
        maxLevel: 5,
        effects: ["Распространение огня"]
    },
    {
        id: "firepower16",
        title: "Огненный шторм",
        desc: "Модуль: выпускает волну огня вокруг. +10 урон за уровень.",
        icon: "🔥🔥",
        row: 7,
        col: 9,
        type: "module",
        moduleId: "fireStorm",
        parentId: "firepower15",
        maxLevel: 5,
        effects: ["Волна огня +10 урон"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "firepower17",
        title: "Абсолютный урон",
        desc: "+5 урон за уровень.",
        icon: "💀",
        row: 10,
        col: 7,
        type: "skill",
        skillId: "combatExpert",
        parentId: "firepower8",
        maxLevel: 5,
        effects: ["+5 урон"]
    },
    {
        id: "firepower18",
        title: "Орбитальный удар",
        desc: "Модуль: вызывает мощный удар с орбиты.",
        icon: "☄️",
        row: 11,
        col: 7,
        type: "module",
        moduleId: "orbitalStrike",
        parentId: "firepower17",
        maxLevel: 5,
        effects: ["Орбитальный удар"]
    }
];

// Ветка 8: Защита
const DEFENSE_BRANCH: SkillNode[] = [
    {
        id: "defenseHub",
        title: "Ветка защиты",
        desc: "Броня, щиты и выживаемость.",
        icon: "🛡️",
        row: 1,
        col: 8,
        type: "hub",
        badge: "Ветка",
        branchColor: "#00f",
        parentId: "commandCore"
    },
    {
        id: "defense1",
        title: "Базовая броня",
        desc: "+10 HP за уровень.",
        icon: "🛡️",
        row: 2,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defenseHub",
        maxLevel: 5,
        effects: ["+10 HP"]
    },
    {
        id: "defense2",
        title: "Энергетический щит",
        desc: "Модуль: временный щит поглощает урон.",
        icon: "🔰",
        row: 3,
        col: 8,
        type: "module",
        moduleId: "shield",
        parentId: "defense1",
        maxLevel: 5,
        effects: ["Энергетический щит"]
    },
    {
        id: "defense3",
        title: "Усиленная броня",
        desc: "+2% сопротивление урону за уровень.",
        icon: "⚙️",
        row: 4,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense2",
        maxLevel: 5,
        effects: ["+2% сопротивление"]
    },
    {
        id: "defense4",
        title: "Регенерация",
        desc: "Модуль: +2 HP/сек регенерация за уровень.",
        icon: "💚",
        row: 5,
        col: 8,
        type: "module",
        moduleId: "regeneration",
        parentId: "defense3",
        maxLevel: 5,
        effects: ["+2 HP/сек регенерация"]
    },
    {
        id: "defense5",
        title: "Несокрушимость",
        desc: "+3% максимальное HP за уровень.",
        icon: "💎",
        row: 6,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense4",
        maxLevel: 5,
        effects: ["+3% максимальное HP"]
    },
    {
        id: "defense6",
        title: "Усиленный щит",
        desc: "Модуль: щит поглощает больше урона.",
        icon: "🔰",
        row: 7,
        col: 8,
        type: "module",
        moduleId: "enhancedShield",
        parentId: "defense5",
        maxLevel: 5,
        effects: ["+прочность щита"]
    },
    {
        id: "defense7",
        title: "Броневая пластина",
        desc: "+3.5% максимальное HP за уровень.",
        icon: "🛡️",
        row: 8,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense6",
        maxLevel: 5,
        effects: ["+3.5% максимальное HP"]
    },
    {
        id: "defense8",
        title: "Абсолютная защита",
        desc: "Модуль: временная неуязвимость.",
        icon: "💫",
        row: 9,
        col: 8,
        type: "module",
        moduleId: "absoluteDefense",
        parentId: "defense7",
        maxLevel: 5,
        effects: ["Временная неуязвимость"]
    },
    // === РАЗВЕТВЛЕНИЕ от defense5 ===
    {
        id: "defense9",
        title: "Активная регенерация",
        desc: "+3 HP/сек при низком HP за уровень.",
        icon: "💚",
        row: 7,
        col: 9,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense5",
        maxLevel: 5,
        effects: ["+3 HP/сек при HP<30%"]
    },
    {
        id: "defense10",
        title: "Отражение урона",
        desc: "+5% урона отражается атакующему за уровень.",
        icon: "🔄",
        row: 7,
        col: 7,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense5",
        maxLevel: 5,
        effects: ["+5% отражение урона"]
    },
    {
        id: "defense11",
        title: "Адаптивная броня",
        desc: "Броня усиливается после получения урона. +2% за уровень.",
        icon: "🔧",
        row: 8,
        col: 9,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense9",
        maxLevel: 5,
        effects: ["+2% броня после удара"]
    },
    {
        id: "defense12",
        title: "Шипастая броня",
        desc: "Модуль: атакующие получают урон при контакте.",
        icon: "⚔️",
        row: 8,
        col: 7,
        type: "module",
        moduleId: "thornArmor",
        parentId: "defense10",
        maxLevel: 5,
        effects: ["Урон при контакте"]
    },
    {
        id: "defense13",
        title: "Живучесть",
        desc: "Выживание с 1 HP раз в 60с. -10с кулдаун за уровень.",
        icon: "❤️‍🔥",
        row: 9,
        col: 9,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense11",
        maxLevel: 5,
        effects: ["Выживание с 1 HP", "-10с кулдаун"]
    },
    // === РАЗВЕТВЛЕНИЕ от defense3 (раннее) ===
    {
        id: "defense14",
        title: "Реактивная броня",
        desc: "При попадании: +5% броня на 3с за уровень.",
        icon: "💥",
        row: 5,
        col: 10,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense3",
        maxLevel: 5,
        effects: ["+5% броня после попадания"]
    },
    {
        id: "defense15",
        title: "Контратака",
        desc: "При попадании: 10% шанс автовыстрела за уровень.",
        icon: "⚔️",
        row: 6,
        col: 10,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense14",
        maxLevel: 5,
        effects: ["+10% шанс контратаки"]
    },
    {
        id: "defense16",
        title: "Бастион",
        desc: "Модуль: неподвижность даёт +50% броня. +10% за уровень.",
        icon: "🏰",
        row: 7,
        col: 10,
        type: "module",
        moduleId: "bastion",
        parentId: "defense15",
        maxLevel: 5,
        effects: ["+50% броня в режиме бастиона"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "defense17",
        title: "Несгибаемый",
        desc: "+4% максимальное HP за уровень.",
        icon: "💪",
        row: 10,
        col: 8,
        type: "skill",
        skillId: "survivalInstinct",
        parentId: "defense8",
        maxLevel: 5,
        effects: ["+4% максимальное HP"]
    },
    {
        id: "defense18",
        title: "Божественный щит",
        desc: "Модуль: полная неуязвимость на 5с. Кулдаун 120с.",
        icon: "✨",
        row: 11,
        col: 8,
        type: "module",
        moduleId: "divineShield",
        parentId: "defense17",
        maxLevel: 5,
        effects: ["Полная неуязвимость 5с"]
    }
];

// Ветка 9: Экономика
const SUPPLY_BRANCH: SkillNode[] = [
    {
        id: "supplyHub",
        title: "Ветка экономики",
        desc: "Ресурсы, кредиты и награды.",
        icon: "💰",
        row: 1,
        col: 9,
        type: "hub",
        badge: "Ветка",
        branchColor: "#ff0",
        parentId: "commandCore"
    },
    {
        id: "supply1",
        title: "Базовый доход",
        desc: "+2% кредиты за уровень.",
        icon: "💵",
        row: 2,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "leadershipHub",
        maxLevel: 5,
        effects: ["+2% кредиты"]
    },
    {
        id: "supply2",
        title: "Сбор ресурсов",
        desc: "Модуль: автоматический сбор ресурсов.",
        icon: "📦",
        row: 3,
        col: 9,
        type: "module",
        moduleId: "resourceCollector",
        parentId: "supply1",
        maxLevel: 5,
        effects: ["Автосбор ресурсов"]
    },
    {
        id: "supply3",
        title: "Увеличенный опыт",
        desc: "+1.5% опыт за уровень.",
        icon: "📈",
        row: 4,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply2",
        maxLevel: 5,
        effects: ["+1.5% опыт"]
    },
    {
        id: "supply4",
        title: "Бонусные награды",
        desc: "Модуль: +10% награды за убийства.",
        icon: "🎁",
        row: 5,
        col: 9,
        type: "module",
        moduleId: "bonusRewards",
        parentId: "supply3",
        maxLevel: 5,
        effects: ["+10% награды"]
    },
    {
        id: "supply5",
        title: "Магнат",
        desc: "+3% кредиты и опыт за уровень.",
        icon: "💎",
        row: 6,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply4",
        maxLevel: 5,
        effects: ["+3% кредиты и опыт"]
    },
    {
        id: "supply6",
        title: "Автоматический сбор",
        desc: "Модуль: автоматически собирает ресурсы.",
        icon: "📦",
        row: 7,
        col: 9,
        type: "module",
        moduleId: "autoCollect",
        parentId: "supply5",
        maxLevel: 5,
        effects: ["Автосбор ресурсов"]
    },
    {
        id: "supply7",
        title: "Финансовый гений",
        desc: "+3.5% кредиты и опыт за уровень.",
        icon: "💰",
        row: 8,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply6",
        maxLevel: 5,
        effects: ["+3.5% кредиты и опыт"]
    },
    {
        id: "supply8",
        title: "Золотая лихорадка",
        desc: "Модуль: удваивает награды за убийства.",
        icon: "🏆",
        row: 9,
        col: 9,
        type: "module",
        moduleId: "goldRush",
        parentId: "supply7",
        maxLevel: 5,
        effects: ["x2 награды"]
    },
    // === РАЗВЕТВЛЕНИЕ от supply5 ===
    {
        id: "supply9",
        title: "Торговец",
        desc: "-10% стоимость улучшений за уровень.",
        icon: "🏪",
        row: 7,
        col: 10,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply5",
        maxLevel: 5,
        effects: ["-10% стоимость улучшений"]
    },
    {
        id: "supply10",
        title: "Удачливый",
        desc: "+5% шанс редких дропов за уровень.",
        icon: "🍀",
        row: 7,
        col: 8,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply5",
        maxLevel: 5,
        effects: ["+5% шанс редких дропов"]
    },
    {
        id: "supply11",
        title: "Оптовик",
        desc: "Покупка нескольких улучшений даёт скидку. +5% за уровень.",
        icon: "📦",
        row: 8,
        col: 10,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply9",
        maxLevel: 5,
        effects: ["+5% скидка за опт"]
    },
    {
        id: "supply12",
        title: "Охотник за сокровищами",
        desc: "+10% шанс найти бонусные ящики за уровень.",
        icon: "🗝️",
        row: 8,
        col: 8,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply10",
        maxLevel: 5,
        effects: ["+10% шанс бонусных ящиков"]
    },
    {
        id: "supply13",
        title: "Олигарх",
        desc: "Пассивный доход: +1 кредит/сек за уровень.",
        icon: "💎",
        row: 9,
        col: 10,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply11",
        maxLevel: 5,
        effects: ["+1 кредит/сек"]
    },
    // === РАЗВЕТВЛЕНИЕ от supply3 (раннее) ===
    {
        id: "supply14",
        title: "Контрабандист",
        desc: "+3% шанс получить редкие предметы за уровень.",
        icon: "📦",
        row: 5,
        col: 11,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply3",
        maxLevel: 5,
        effects: ["+3% шанс редких предметов"]
    },
    {
        id: "supply15",
        title: "Чёрный рынок",
        desc: "Доступ к эксклюзивным предметам. -5% цена за уровень.",
        icon: "🏴",
        row: 6,
        col: 11,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply14",
        maxLevel: 5,
        effects: ["Чёрный рынок", "-5% цена"]
    },
    {
        id: "supply16",
        title: "Магнат империи",
        desc: "Модуль: удваивает все доходы на 30с. +5с за уровень.",
        icon: "👑",
        row: 7,
        col: 11,
        type: "module",
        moduleId: "empireMagnate",
        parentId: "supply15",
        maxLevel: 5,
        effects: ["x2 доходы на 30с"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "supply17",
        title: "Финансовая империя",
        desc: "+4% кредиты и опыт за уровень.",
        icon: "🏦",
        row: 10,
        col: 9,
        type: "skill",
        skillId: "resourcefulness",
        parentId: "supply8",
        maxLevel: 5,
        effects: ["+4% кредиты и опыт"]
    },
    {
        id: "supply18",
        title: "Мидас",
        desc: "Модуль: враги дропают +200% кредитов при смерти.",
        icon: "✨",
        row: 11,
        col: 9,
        type: "module",
        moduleId: "midasTouch",
        parentId: "supply17",
        maxLevel: 5,
        effects: ["+200% дроп кредитов"]
    }
];

// Ветка 10: Командование
const COMMANDER_BRANCH: SkillNode[] = [
    {
        id: "commanderHub",
        title: "Ветка командования",
        desc: "Ауры, тактика и лидерство.",
        icon: "🎖️",
        row: 1,
        col: 10,
        type: "hub",
        badge: "Ветка",
        branchColor: "#faf",
        parentId: "commandCore"
    },
    {
        id: "commander1",
        title: "Базовое лидерство",
        desc: "+1% все характеристики за уровень.",
        icon: "⭐",
        row: 2,
        col: 10,
        type: "skill",
        skillId: "tankMastery",
        parentId: "leadershipHub",
        maxLevel: 5,
        effects: ["+1% все характеристики"]
    },
    {
        id: "commander2",
        title: "Боевая аура",
        desc: "Модуль: увеличивает урон союзникам рядом.",
        icon: "⚔️",
        row: 3,
        col: 10,
        type: "module",
        moduleId: "combatAura",
        parentId: "commander1",
        maxLevel: 5,
        effects: ["Аура урона"]
    },
    {
        id: "commander3",
        title: "Тактическое превосходство",
        desc: "+1.5% скорость всех действий за уровень.",
        icon: "🎯",
        row: 4,
        col: 10,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "commander2",
        maxLevel: 5,
        effects: ["+1.5% скорость действий"]
    },
    {
        id: "commander4",
        title: "Защитная аура",
        desc: "Модуль: уменьшает урон союзникам рядом.",
        icon: "🛡️",
        row: 5,
        col: 10,
        type: "module",
        moduleId: "defenseAura",
        parentId: "commander3",
        maxLevel: 5,
        effects: ["Аура защиты"]
    },
    {
        id: "commander5",
        title: "Верховный командир",
        desc: "+2% все характеристики за уровень.",
        icon: "👑",
        row: 6,
        col: 10,
        type: "skill",
        skillId: "tankMastery",
        parentId: "commander4",
        maxLevel: 5,
        effects: ["+2% все характеристики"]
    },
    {
        id: "commander6",
        title: "Боевая команда",
        desc: "Модуль: призывает союзников в бой.",
        icon: "👥",
        row: 7,
        col: 10,
        type: "module",
        moduleId: "battleTeam",
        parentId: "commander5",
        maxLevel: 5,
        effects: ["Призыв союзников"]
    },
    {
        id: "commander7",
        title: "Тактическое господство",
        desc: "+2.5% все характеристики за уровень.",
        icon: "🎖️",
        row: 8,
        col: 10,
        type: "skill",
        skillId: "tankMastery",
        parentId: "commander6",
        maxLevel: 5,
        effects: ["+2.5% все характеристики"]
    },
    {
        id: "commander8",
        title: "Имперская воля",
        desc: "Модуль: увеличивает все характеристики союзников на 50%.",
        icon: "👑",
        row: 9,
        col: 10,
        type: "module",
        moduleId: "imperialWill",
        parentId: "commander7",
        maxLevel: 5,
        effects: ["+50% характеристики союзников"]
    },
    // === РАЗВЕТВЛЕНИЕ от commander5 ===
    {
        id: "commander9",
        title: "Тактический приказ",
        desc: "Модуль: союзники получают +20% скорость на 5с. +1с за уровень.",
        icon: "📋",
        row: 7,
        col: 11,
        type: "module",
        moduleId: "tacticalOrder",
        parentId: "commander5",
        maxLevel: 5,
        effects: ["Приказ: +20% скорость", "+1с длительность"]
    },
    {
        id: "commander10",
        title: "Вдохновляющая речь",
        desc: "Модуль: +15% урон союзникам на 5с. +1с за уровень.",
        icon: "📢",
        row: 7,
        col: 9,
        type: "module",
        moduleId: "inspiringSpeech",
        parentId: "commander5",
        maxLevel: 5,
        effects: ["Речь: +15% урон", "+1с длительность"]
    },
    {
        id: "commander11",
        title: "Молниеносный удар",
        desc: "Тактический приказ также даёт +10% шанс крита за уровень.",
        icon: "⚡",
        row: 8,
        col: 11,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "commander9",
        maxLevel: 5,
        effects: ["+10% крит от приказа"]
    },
    {
        id: "commander12",
        title: "Фанатизм",
        desc: "Вдохновляющая речь: союзники игнорируют 10% урона за уровень.",
        icon: "🔥",
        row: 8,
        col: 9,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "commander10",
        maxLevel: 5,
        effects: ["+10% игнорирование урона"]
    },
    {
        id: "commander13",
        title: "Легендарный командир",
        desc: "Все ваши ауры действуют на +50% большей территории.",
        icon: "🌟",
        row: 9,
        col: 11,
        type: "skill",
        skillId: "tankMastery",
        parentId: "commander11",
        maxLevel: 5,
        effects: ["+50% радиус аур"]
    },
    // === РАЗВЕТВЛЕНИЕ от commander3 (раннее) ===
    {
        id: "commander14",
        title: "Стратег",
        desc: "Союзники видят врагов на мини-карте. +5м радиус за уровень.",
        icon: "🗺️",
        row: 5,
        col: 12,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "commander3",
        maxLevel: 5,
        effects: ["Обнаружение врагов +5м"]
    },
    {
        id: "commander15",
        title: "Тактический анализ",
        desc: "Видны HP и характеристики врагов.",
        icon: "📊",
        row: 6,
        col: 12,
        type: "skill",
        skillId: "tacticalGenius",
        parentId: "commander14",
        maxLevel: 5,
        effects: ["Анализ характеристик врагов"]
    },
    {
        id: "commander16",
        title: "Координированная атака",
        desc: "Модуль: отмечает цель, союзники наносят +20% урон по ней.",
        icon: "🎯",
        row: 7,
        col: 12,
        type: "module",
        moduleId: "coordinatedAttack",
        parentId: "commander15",
        maxLevel: 5,
        effects: ["+20% урон по отмеченной цели"]
    },
    // === ПРОДОЛЖЕНИЕ основной ветки ===
    {
        id: "commander17",
        title: "Император",
        desc: "+3% все характеристики за уровень.",
        icon: "👑",
        row: 10,
        col: 10,
        type: "skill",
        skillId: "tankMastery",
        parentId: "commander8",
        maxLevel: 5,
        effects: ["+3% все характеристики"]
    },
    {
        id: "commander18",
        title: "Божественное командование",
        desc: "Модуль: все союзники получают +100% характеристик на 10с.",
        icon: "⚡",
        row: 11,
        col: 10,
        type: "module",
        moduleId: "divineCommand",
        parentId: "commander17",
        maxLevel: 5,
        effects: ["+100% характеристики союзников"]
    }
];

// Мета-узел синергии
const SYNERGY_NODE: SkillNode = {
    id: "commandSynergy",
    title: "Элитные протоколы",
    desc: "Бонусы за общее вложение в дерево.",
    icon: "🚀",
    row: 10,
    col: 5,
    type: "meta",
    parentId: "commandCore"
};

// Собираем все узлы (6 веток)
export const SKILL_TREE_NODES: SkillNode[] = [
    COMMAND_CORE,
    ...ATTACK_BRANCH,           // Атака (хаб: attackHub)
    ...DEFENSE_BRANCH,          // Защита (хаб: defenseHub)
    ...MOBILITY_BRANCH,         // Мобильность (хаб: mobilityHub)
    ...TECH_BRANCH,             // Технологии (хаб: techHub)
    ...STEALTH_BRANCH,          // Скрытность (хаб: stealthHub)
    ...LEADERSHIP_BRANCH,       // Лидерство (хаб: leadershipHub)
    // Навыки из объединённых веток (без хабов - привязаны к новым)
    ...ULTIMATE_BRANCH.slice(1),   // Ультимативные -> Атака (attackHub)
    ...UTILITY_BRANCH.slice(1),    // Утилиты -> Технологии (techHub)
    ...SUPPLY_BRANCH.slice(1),     // Экономика -> Лидерство (leadershipHub)
    ...COMMANDER_BRANCH.slice(1),  // Командование -> Лидерство (leadershipHub)
    SYNERGY_NODE
];

// Генерируем рёбра на основе parentId
export function generateSkillEdges(): SkillEdge[] {
    const edges: SkillEdge[] = [];
    SKILL_TREE_NODES.forEach(node => {
        if (node.parentId) {
            edges.push({ from: node.parentId, to: node.id });
        }
    });
    return edges;
}

export const SKILL_TREE_EDGES = generateSkillEdges();

// Функция для проверки доступности узла (линейная разблокировка)
export function isNodeUnlocked(nodeId: string, stats: { skills: Record<string, number> }): boolean {
    const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
    if (!node) return false;
    
    // Центральный узел всегда доступен
    if (node.id === "commandCore") return true;
    
    // Хабы всегда доступны (они разблокируются от центрального узла)
    if (node.type === "hub") return true;
    
    // Проверяем родителя
    if (node.parentId) {
        const parent = SKILL_TREE_NODES.find(n => n.id === node.parentId);
        if (!parent) return false;
        
        // Если родитель - хаб или центр, узел доступен
        if (parent.type === "hub" || parent.id === "commandCore") return true;
        
        // Если родитель - навык, проверяем что он прокачан хотя бы на 1 уровень
        // (для линейной разблокировки нужно прокачать до максимума)
        if (parent.skillId) {
            const parentLevel = stats.skills[parent.skillId] || 0;
            const parentMaxLevel = parent.maxLevel || 5;
            // Узел разблокируется когда родитель прокачан до максимума
            return parentLevel >= parentMaxLevel;
        }
        
        // Если родитель - модуль, проверяем что родитель разблокирован рекурсивно
        if (parent.moduleId) {
            return isNodeUnlocked(parent.id, stats);
        }
    }
    
    return false;
}


