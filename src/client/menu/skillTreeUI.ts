/**
 * Menu Skill Tree UI Module
 * UI логика скил-дерева из menu.ts
 */

import { 
    SKILL_TREE_NODES, 
    SKILL_TREE_EDGES, 
    SKILL_BRANCHES, 
    isNodeUnlocked, 
    getSkillCost,
    calculateAllNodePositions,
    BRANCH_CATEGORIES,
    CATEGORY_COLORS
} from "../skillTreeConfig";

export interface PlayerStats {
    skillPoints: number;
    skills: Record<string, number>;
    level: number;
    experience: number;
    experienceToNext: number;
}

export interface SkillTreeCallbacks {
    onUpgrade: (skillId: string) => void;
    onUpdate: () => void;
}

/**
 * Создает HTML структуру панели скил-дерева
 */
export function createSkillsPanelHTML(): string {
    return `
        <div class="panel-content">
            <button class="panel-close" id="skills-close">✕</button>
            <div class="skills-main-title">TX</div>
            <div class="panel-title">Навыки</div>
            <div class="skill-category-tabs" id="skill-category-tabs">
                <button class="skill-category-tab active" data-category="attack">⚔️ Атака</button>
                <button class="skill-category-tab" data-category="defense">🛡️ Защита</button>
                <button class="skill-category-tab" data-category="mobility">🏃 Мобильность</button>
                <button class="skill-category-tab" data-category="tech">🔧 Технологии</button>
                <button class="skill-category-tab" data-category="stealth">👁️ Скрытность</button>
                <button class="skill-category-tab" data-category="leadership">🎖️ Лидерство</button>
            </div>
            <div class="skill-tree-header">
                <div id="skill-points-display" class="skill-points-pill">ОЧКОВ НАВЫКОВ: 0</div>
            </div>
            <div class="skill-tree-wrapper">
                <div class="skill-tree" id="skill-tree"></div>
            </div>
            <div class="panel-buttons">
                <button class="panel-btn" id="skills-back">Закрыть</button>
            </div>
        </div>
    `;
}

/**
 * Обновляет отображение скил-дерева
 */
// Глобальное состояние выбранной категории
let selectedCategory: "combat" | "defense" | "utility" | null = null;
// Глобальное состояние выбранной ветки (для вкладок)
let selectedBranch: string | null = "attack"; // По умолчанию выбрана вкладка "Атака"

export function updateSkillTreeDisplay(
    stats: PlayerStats,
    callbacks: SkillTreeCallbacks
): void {
    const skillTree = document.getElementById("skill-tree");
    const skillPointsDisplay = document.getElementById("skill-points-display");
    if (!skillTree) {
        console.error("[Skills] skill-tree element not found!");
        return;
    }
    
    // Проверяем что конфиг загружен
    if (!SKILL_TREE_NODES || SKILL_TREE_NODES.length === 0) {
        console.error("[Skills] SKILL_TREE_NODES is not loaded or empty!");
        skillTree.innerHTML = `<div class="skill-empty">Ошибка: конфиг навыков не загружен. Проверьте импорт.</div>`;
        return;
    }
    
    const wrapper = skillTree.closest(".skill-tree-wrapper") as HTMLElement | null;
    
    if (skillPointsDisplay) {
        skillPointsDisplay.textContent = `ОЧКОВ НАВЫКОВ: ${stats.skillPoints}`;
    }
    
    // Обновляем легенду веток с кликабельностью
    const legend = document.getElementById("skill-tree-legend");
    if (legend) {
        legend.innerHTML = SKILL_BRANCHES.map(branch => 
            `<span class="skill-branch-filter" data-branch-id="${branch.id}" style="border-color: ${branch.color}; color: ${branch.color}; cursor: pointer;">
                ${branch.icon} ${branch.name}
            </span>`
        ).join("");
    }

    const totalInvested = Object.values(stats.skills).reduce((sum: number, val) => {
        const numeric = typeof val === "number" ? val : 0;
        return sum + numeric;
    }, 0);
    const synergyBadge = totalInvested >= 50 ? "АКТИВНО" : totalInvested >= 30 ? "ГОТОВО" : "ЗАКРЫТО";

    // Обновляем мета-узел синергии
    const synergyNode = SKILL_TREE_NODES.find(n => n.id === "commandSynergy");
    if (synergyNode) {
        synergyNode.badge = synergyBadge;
        (synergyNode as any).meta = `Вложено: ${totalInvested}/50. Бонусы на 30 и 50 очков.`;
    }

    // Создаём копию узлов для работы (чтобы не мутировать оригинал)
    const nodes = SKILL_TREE_NODES.map(n => ({ ...n }));
    const edges = SKILL_TREE_EDGES;

    // Отладка: проверяем что узлы загружены
    if (nodes.length === 0) {
        console.error("[Skills] SKILL_TREE_NODES is empty!");
        skillTree.innerHTML = `<div class="skill-empty">Ошибка: узлы навыков не загружены. Проверьте конфиг.</div>`;
        return;
    }

    console.log(`[Skills] Rendering ${nodes.length} nodes, ${edges.length} edges`);

    const layout = {
        width: 220,
        height: 130
    };

    // Вычисляем позиции всех узлов используя новую систему трех деревьев
    const calculatedPositions = calculateAllNodePositions();
    
    // Находим границы дерева для определения размера
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    calculatedPositions.forEach((pos) => {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x + layout.width);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y + layout.height);
    });
    
    // Добавляем отступы для трех деревьев
    const padding = 150;
    const treeWidth = (maxX - minX) + padding * 2;
    const treeHeight = (maxY - minY) + padding * 2;
    
    // Смещаем все позиции так, чтобы начало было в левом верхнем углу (учитываем отрицательные координаты)
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;
    
    const nodePositions = new Map<string, { left: number; top: number; centerX: number; centerY: number }>();
    calculatedPositions.forEach((pos, nodeId) => {
        const left = pos.x + offsetX;
        const top = pos.y + offsetY;
        nodePositions.set(nodeId, {
            left,
            top,
            centerX: left + layout.width / 2,
            centerY: top + layout.height / 2
        });
    });
    
    // Упрощённая проверка на пересечения (с новым структурированным алгоритмом коллизии должны быть редкими)
    const nodeSize = { width: 220, height: 130 };
    const minNodeDistance = 250; // Минимальное расстояние между узлами
    
    const nodeIds: string[] = Array.from(nodePositions.keys());
    let totalCollisions = 0;
    
    // Простая однопроходная проверка коллизий (для диагностики)
    for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
            const pos1 = nodePositions.get(nodeIds[i]!);
            const pos2 = nodePositions.get(nodeIds[j]!);
            if (!pos1 || !pos2) continue;
            
            const dx = pos1.centerX - pos2.centerX;
            const dy = pos1.centerY - pos2.centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minNodeDistance) {
                totalCollisions++;
                // С новым структурированным алгоритмом коллизии не должны возникать
                // Но если они есть, просто логируем для диагностики
                if (totalCollisions <= 5) {
                    console.warn(`[Skills] Collision detected between ${nodeIds[i]} and ${nodeIds[j]} (distance: ${distance.toFixed(1)}px)`);
                }
            }
        }
    }
    
    if (totalCollisions > 0) {
        console.warn(`[Skills] Found ${totalCollisions} potential collisions. This should not happen with structured layout.`);
    } else {
        console.log(`[Skills] No collisions detected - structured layout working correctly`);
    }
    
    skillTree.style.minWidth = `${treeWidth}px`;
    skillTree.style.minHeight = `${treeHeight}px`;
    
    console.log(`[Skills] Tree size: ${treeWidth}x${treeHeight}, calculated positions: ${calculatedPositions.size}`);
    skillTree.innerHTML = "";

    if (wrapper) {
        // Прокручиваем к началу первого дерева
        wrapper.scrollLeft = 0;
        wrapper.scrollTop = 0;
    }

    // Функция для определения категории узла (определяем до использования)
    const getNodeCategory = (nodeId: string): "combat" | "defense" | "utility" | null => {
        for (const [category, hubIds] of Object.entries(BRANCH_CATEGORIES)) {
            if (hubIds.includes(nodeId)) {
                return category as "combat" | "defense" | "utility";
            }
        }
        // Проверяем родителя
        const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
        if (node?.parentId) {
            return getNodeCategory(node.parentId);
        }
        return null;
    };

    // Функция для проверки, принадлежит ли узел к категории (включая дочерние узлы)
    const isNodeInCategory = (nodeId: string, category: "combat" | "defense" | "utility"): boolean => {
        const nodeCategory = getNodeCategory(nodeId);
        return nodeCategory === category;
    };
    
    // Функция для проверки, принадлежит ли узел к ветке
    const isNodeInBranch = (nodeId: string, branchId: string): boolean => {
        const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
        if (!node) return false;
        
        // Проверяем, является ли узел хабом этой ветки
        if (nodeId === `${branchId}Hub`) return true;
        
        // Проверяем родителя рекурсивно
        if (node.parentId) {
            return isNodeInBranch(node.parentId, branchId);
        }
        
        return false;
    };

    // Создаем заголовки категорий
    const categories: Array<{ id: "combat" | "defense" | "utility"; name: string; icon: string }> = [
        { id: "combat", name: "БОЕВЫЕ", icon: "⚔️" },
        { id: "defense", name: "ЗАЩИТА", icon: "🛡️" },
        { id: "utility", name: "УТИЛИТЫ", icon: "🛠️" }
    ];

    // Находим позиции для заголовков категорий (центр каждого дерева)
    const categoryHeaders: Array<{ category: "combat" | "defense" | "utility"; x: number; y: number }> = [];
    categories.forEach((category, treeIndex) => {
        const hubIds = BRANCH_CATEGORIES[category.id];
        const categoryHubs = SKILL_TREE_NODES.filter(n => hubIds.includes(n.id));
        if (categoryHubs.length > 0) {
            // Находим минимальную X координату для этой категории
            let minCategoryX = Infinity;
            let minCategoryY = Infinity;
            categoryHubs.forEach(hub => {
                const pos = nodePositions.get(hub.id);
                if (pos) {
                    minCategoryX = Math.min(minCategoryX, pos.left);
                    minCategoryY = Math.min(minCategoryY, pos.top);
                }
            });
            if (minCategoryX !== Infinity) {
                categoryHeaders.push({
                    category: category.id,
                    x: minCategoryX - 50,
                    y: minCategoryY - 80
                });
            }
        }
    });

    // Создаем SVG для извилистых коннекторов
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "skill-connectors-svg");
    svg.setAttribute("width", `${treeWidth}`);
    svg.setAttribute("height", `${treeHeight}`);
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "0";
    
    edges.forEach((edge) => {
        const from = nodePositions.get(edge.from);
        const to = nodePositions.get(edge.to);
        if (!from || !to) return;

        // Фильтрация: показываем только линии выбранной категории или ветки (если выбрана)
        if (selectedBranch !== null) {
            if (!isNodeInBranch(edge.from, selectedBranch) && !isNodeInBranch(edge.to, selectedBranch)) {
                return; // Пропускаем линии не выбранной ветки
            }
        } else if (selectedCategory !== null) {
            const fromCategory = getNodeCategory(edge.from);
            const toCategory = getNodeCategory(edge.to);
            if (fromCategory !== selectedCategory && toCategory !== selectedCategory) {
                return; // Пропускаем линии не выбранной категории
            }
        }

        // Определяем цвет линии по категории
        const category = getNodeCategory(edge.to) || getNodeCategory(edge.from);
        const lineColor = category ? CATEGORY_COLORS[category] : "#0f0";

        // Линии с диагональным изгибом под 45° посередине
        const dx = to.centerX - from.centerX;
        const dy = to.centerY - from.centerY;
        const absDy = Math.abs(dy);

        let pathData = `M ${from.centerX} ${from.centerY}`;

        // Если движение почти горизонтальное - прямая линия
        if (absDy < 10) {
            pathData += ` L ${to.centerX} ${to.centerY}`;
        } else {
            // Горизонтально -> Диагональ 45° -> Горизонтально
            // Диагональный сегмент: |dy| по X и |dy| по Y (строго 45°)
            // Горизонтальные сегменты делят оставшуюся длину пополам
            const horizontalPart = (Math.abs(dx) - absDy) / 2;
            const dirY = dy > 0 ? 1 : -1;
            
            // Точка начала диагонали
            const diag1X = from.centerX + horizontalPart;
            const diag1Y = from.centerY;
            
            // Точка конца диагонали (смещение на |dy| по X и dy по Y)
            const diag2X = diag1X + absDy;
            const diag2Y = from.centerY + dy;
            
            pathData += ` L ${diag1X} ${diag1Y}`; // Горизонтально до начала диагонали
            pathData += ` L ${diag2X} ${diag2Y}`; // Диагонально под 45°
            pathData += ` L ${to.centerX} ${to.centerY}`; // Горизонтально до конца
        }
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        path.setAttribute("stroke", lineColor);
        path.setAttribute("stroke-width", "2");
        path.setAttribute("fill", "none");
        path.setAttribute("opacity", "0.4");
        svg.appendChild(path);
    });
    
    const connectors = document.createDocumentFragment();
    connectors.appendChild(svg);

    const nodesFragment = document.createDocumentFragment();
    let nodesCreated = 0;
    nodes.forEach((node) => {
        const pos = nodePositions.get(node.id);
        if (!pos) {
            console.warn(`[Skills] No position for node: ${node.id}`);
            return;
        }
        nodesCreated++;

        const maxLevel = node.maxLevel || 5;
        const level = node.skillId ? (stats.skills[node.skillId] || 0) : 0;
        const isUnlocked = isNodeUnlocked(node.id, stats);
        const nextLevel = level + 1;
        const cost = node.skillId ? getSkillCost(nextLevel, node.cost || 1) : 0;
        const canAfford = stats.skillPoints >= cost;
        const canUpgrade = node.skillId && isUnlocked && canAfford && level < maxLevel;
        
        const pips = node.skillId
            ? Array(maxLevel)
                  .fill(0)
                  .map((_, i) => `<div class="skill-pip ${i < level ? "filled" : ""}"></div>`)
                  .join("")
            : "";

        // Определяем цвет границы по категории
        let borderColor = node.branchColor;
        if (!borderColor) {
            const category = getNodeCategory(node.id);
            if (category) {
                borderColor = CATEGORY_COLORS[category];
            } else {
                borderColor = node.type === "hub" ? "#0f0" : node.type === "meta" ? "#5cf" : "#0f0";
            }
        }
        
        // Скрываем центральный узел commandCore
        if (node.id === "commandCore") {
            return; // Пропускаем центральный узел
        }

        // Фильтрация: показываем только узлы выбранной категории или ветки (если выбрана)
        if (selectedBranch !== null) {
            if (!isNodeInBranch(node.id, selectedBranch)) {
                return; // Пропускаем узлы не выбранной ветки
            }
        } else if (selectedCategory !== null) {
            if (!isNodeInCategory(node.id, selectedCategory)) {
                return; // Пропускаем узлы не выбранной категории
            }
        }
        
        const isLocked = !isUnlocked && node.type !== "hub";
        
        const nodeEl = document.createElement("div");
        nodeEl.className = `skill-node${node.type === "hub" ? " is-hub" : ""}${node.type === "meta" ? " is-meta" : ""}${isLocked ? " is-locked" : ""}`;
        nodeEl.style.left = `${pos.left}px`;
        nodeEl.style.top = `${pos.top}px`;
        nodeEl.style.borderColor = borderColor;
        
        let moduleInfo = "";
        if (node.moduleId && isUnlocked) {
            moduleInfo = `<div class="skill-module-info">🔓 Модуль: ${node.moduleId}</div>`;
        } else if (node.moduleId && !isUnlocked) {
            moduleInfo = `<div class="skill-module-info locked">🔒 Модуль заблокирован</div>`;
        }

        nodeEl.innerHTML = `
            <div class="skill-node-header">
                <div style="display:flex;align-items:center;gap:6px;flex:1;">
                    <span class="skill-node-icon">${node.icon}</span>
                    <div class="skill-node-title">${node.title}</div>
                </div>
                ${node.badge ? `<span class="skill-node-badge">${node.badge}</span>` : ""}
            </div>
            <div class="skill-node-desc">${node.desc}</div>
            ${moduleInfo}
            ${
                node.skillId
                    ? `
                        <div class="skill-node-level">
                            Уровень ${level}/${maxLevel}
                            ${cost > 0 && level < maxLevel ? `<span class="skill-cost">Стоимость: ${cost} SP</span>` : ""}
                        </div>
                        <div class="skill-meter">${pips}</div>
                        <button class="skill-upgrade-btn" data-skill="${node.skillId}" ${canUpgrade ? "" : "disabled"}>
                            ${level >= maxLevel ? "MAX" : isLocked ? "Заблокировано" : canAfford ? `Улучшить (${cost})` : `Нужно ${cost} SP`}
                        </button>
                      `
                    : ""
            }
            ${node.type === "meta" && (node as any).meta ? `<div class="skill-node-meta">${(node as any).meta}</div>` : ""}
            ${node.effects && node.effects.length > 0 ? `<div class="skill-effects">${node.effects.map(e => `• ${e}`).join("<br>")}</div>` : ""}
        `;

        nodesFragment.appendChild(nodeEl);
    });

    // Создаем заголовки категорий
    const headersFragment = document.createDocumentFragment();
    categoryHeaders.forEach((headerInfo) => {
        const categoryInfo = categories.find(c => c.id === headerInfo.category);
        if (!categoryInfo) return;

        const headerEl = document.createElement("div");
        headerEl.className = "skill-category-header";
        headerEl.dataset.category = headerInfo.category;
        headerEl.style.left = `${headerInfo.x}px`;
        headerEl.style.top = `${headerInfo.y}px`;
        headerEl.style.borderColor = CATEGORY_COLORS[headerInfo.category];
        headerEl.style.color = CATEGORY_COLORS[headerInfo.category];
        
        if (selectedCategory === headerInfo.category) {
            headerEl.classList.add("active");
        }
        
        headerEl.innerHTML = `${categoryInfo.icon} ${categoryInfo.name}`;
        headersFragment.appendChild(headerEl);
    });

    skillTree.appendChild(connectors);
    skillTree.appendChild(headersFragment);
    skillTree.appendChild(nodesFragment);
    
    console.log(`[Skills] Created ${nodesCreated} nodes, ${connectors.children.length} connectors`);
    console.log(`[Skills] skillTree children count: ${skillTree.children.length}`);
    
    // Проверяем что узлы действительно в DOM
    const renderedNodes = skillTree.querySelectorAll('.skill-node');
    console.log(`[Skills] Rendered nodes in DOM: ${renderedNodes.length}`);
    
    // Функция плавного перемещения камеры к позиции
    const smoothScrollTo = (targetX: number, targetY: number, duration: number = 600) => {
        if (!wrapper) return;
        
        const startX = wrapper.scrollLeft;
        const startY = wrapper.scrollTop;
        const distanceX = targetX - startX;
        const distanceY = targetY - startY;
        const startTime = performance.now();
        
        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing функция (ease-out)
            const easeOut = 1 - Math.pow(1 - progress, 3);
            
            wrapper!.scrollLeft = startX + distanceX * easeOut;
            wrapper!.scrollTop = startY + distanceY * easeOut;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    };
    
    // Добавляем обработчики кликов на заголовки категорий
    skillTree.querySelectorAll(".skill-category-header").forEach((headerEl) => {
        headerEl.addEventListener("click", () => {
            const category = (headerEl as HTMLElement).dataset.category as "combat" | "defense" | "utility" | undefined;
            if (!category) return;
            
            // Переключаем выбранную категорию
            if (selectedCategory === category) {
                selectedCategory = null; // Снимаем выбор
            } else {
                selectedCategory = category;
            }
            
            // Находим позицию для перемещения камеры
            const headerInfo = categoryHeaders.find(h => h.category === category);
            if (headerInfo && wrapper) {
                // Находим первый hub этой категории для центрирования
                const hubIds = BRANCH_CATEGORIES[category];
                const categoryHubs = SKILL_TREE_NODES.filter(n => hubIds.includes(n.id));
                if (categoryHubs.length > 0) {
                    const firstHub = categoryHubs[0]!;
                    const hubPos = nodePositions.get(firstHub.id);
                    if (hubPos) {
                        const targetX = Math.max(0, hubPos.centerX - wrapper.clientWidth / 2);
                        const targetY = Math.max(0, hubPos.centerY - wrapper.clientHeight / 2);
                        smoothScrollTo(targetX, targetY, 500);
                    }
                }
            }
            
            // Перерисовываем дерево с фильтрацией
            updateSkillTreeDisplay(stats, callbacks);
        });
    });
    
    // Добавляем обработчики кликов для веток в легенде
    if (legend) {
        legend.querySelectorAll(".skill-branch-filter").forEach((el) => {
            el.addEventListener("click", () => {
                const branchId = (el as HTMLElement).dataset.branchId;
                if (branchId) {
                    // Сбрасываем фильтр по категории, чтобы все ветки были видны
                    if (selectedCategory !== null) {
                        selectedCategory = null;
                        // Перерисовываем дерево без фильтра
                        updateSkillTreeDisplay(stats, callbacks);
                        // После перерисовки нужно заново получить позицию и прокрутить
                        setTimeout(() => {
                            const updatedNodePositions = calculateAllNodePositions();
                            const hubNode = SKILL_TREE_NODES.find(n => n.id === `${branchId}Hub`);
                            if (hubNode && wrapper) {
                                const hubPos = updatedNodePositions.get(hubNode.id);
                                if (hubPos) {
                                    const targetX = Math.max(0, hubPos.x + 200 - wrapper.clientWidth / 2);
                                    const targetY = Math.max(0, hubPos.y + 200 - wrapper.clientHeight / 2);
                                    smoothScrollTo(targetX, targetY, 500);
                                }
                            }
                        }, 50);
                    } else {
                        // Просто прокручиваем к ветке
                        const hubNode = SKILL_TREE_NODES.find(n => n.id === `${branchId}Hub`);
                        if (hubNode) {
                            const hubPos = nodePositions.get(hubNode.id);
                            if (hubPos && wrapper) {
                                const targetX = Math.max(0, hubPos.centerX - wrapper.clientWidth / 2);
                                const targetY = Math.max(0, hubPos.centerY - wrapper.clientHeight / 2);
                                smoothScrollTo(targetX, targetY, 500);
                            }
                        }
                    }
                }
            });
        });
    }

    skillTree.querySelectorAll(".skill-upgrade-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const skillId = (btn as HTMLElement).dataset.skill as keyof typeof stats.skills | undefined;
            if (skillId) {
                const node = nodes.find(n => n.skillId === skillId);
                if (node) {
                    const currentLevel = stats.skills[skillId] || 0;
                    const nextLevel = currentLevel + 1;
                    const cost = getSkillCost(nextLevel, node.cost || 1);
                    if (stats.skillPoints >= cost && nextLevel <= (node.maxLevel || 5)) {
                        // Потратить очки за один уровень
                        for (let i = 0; i < cost && stats.skillPoints > 0; i++) {
                            callbacks.onUpgrade(skillId);
                        }
                        callbacks.onUpdate();
                    }
                } else {
                    // Fallback для старых навыков
                    callbacks.onUpgrade(skillId);
                    callbacks.onUpdate();
                }
            }
        });
    });

    setupSkillTreeNavigation(wrapper);
    
    // Настройка обработчиков вкладок категорий
    setupCategoryTabs(stats, callbacks);
    
    // Инициализация активной вкладки при первой загрузке
    const tabsContainer = document.getElementById("skill-category-tabs");
    if (tabsContainer) {
        const activeTab = tabsContainer.querySelector(".skill-category-tab.active");
        if (activeTab) {
            const category = (activeTab as HTMLElement).dataset.category;
            if (category) {
                const branchToCategoryMap: Record<string, "combat" | "defense" | "utility"> = {
                    "attack": "combat",
                    "defense": "defense",
                    "mobility": "defense",
                    "tech": "utility",
                    "stealth": "utility",
                    "leadership": "utility"
                };
                selectedCategory = branchToCategoryMap[category] || null;
                selectedBranch = category;
            }
        }
    }
}

/**
 * Настраивает обработчики кликов для вкладок категорий
 */
function setupCategoryTabs(
    stats: PlayerStats,
    callbacks: SkillTreeCallbacks
): void {
    const tabsContainer = document.getElementById("skill-category-tabs");
    if (!tabsContainer) return;
    
    const flag = "_categoryTabsBound";
    if ((tabsContainer as any)[flag]) return;
    (tabsContainer as any)[flag] = true;
    
    const tabs = tabsContainer.querySelectorAll(".skill-category-tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            // Убираем активный класс со всех вкладок
            tabs.forEach(t => t.classList.remove("active"));
            // Добавляем активный класс к выбранной вкладке
            tab.classList.add("active");
            
            const category = (tab as HTMLElement).dataset.category;
            if (category) {
                // Маппинг веток к категориям для фильтрации
                const branchToCategoryMap: Record<string, "combat" | "defense" | "utility"> = {
                    "attack": "combat",
                    "defense": "defense",
                    "mobility": "defense",
                    "tech": "utility",
                    "stealth": "utility",
                    "leadership": "utility"
                };
                
                selectedCategory = branchToCategoryMap[category] || null;
                selectedBranch = category;
                
                // Перерисовываем дерево с фильтрацией
                updateSkillTreeDisplay(stats, callbacks);
            }
        });
    });
}

/**
 * Настраивает навигацию и зум для скил-дерева
 */
export function setupSkillTreeNavigation(wrapper: HTMLElement | null): void {
    if (!wrapper) return;
    const flag = "_skillNavBound";
    if ((wrapper as any)[flag]) return;
    (wrapper as any)[flag] = true;

    const skillTree = document.getElementById("skill-tree");
    if (!skillTree) return;

    // === ПЛАВНЫЙ ЗУМ БЕЗ ЗАДЕРЖЕК ===
    let currentZoom = 1.0;
    let targetZoom = 1.0;
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 4.0;
    const ZOOM_STEP = 0.1;
    const ZOOM_SPEED = 0.075; // 7.5% за прокрутку (средняя скорость)

    // Функция зума к точке с плавной анимацией
    let zoomAnimationId: number | null = null;
    let zoomLevelDisplayUpdateFrame: number | null = null;
    let lastZoomMouseX = 0;
    let lastZoomMouseY = 0;
    
    const updateZoomDisplay = () => {
        const zoomLevel = wrapper.parentElement?.querySelector(".skill-zoom-level") as HTMLElement;
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
        }
    };
    
    const applyZoom = (zoom: number, mouseX: number, mouseY: number) => {
        if (!wrapper || !skillTree) return;
        
        const wrapperRect = wrapper.getBoundingClientRect();
        const relativeMouseX = mouseX - wrapperRect.left;
        const relativeMouseY = mouseY - wrapperRect.top;
        
        const scrollX = wrapper.scrollLeft;
        const scrollY = wrapper.scrollTop;
        
        // Вычисляем позицию контента под курсором до зума
        const contentX = (scrollX + relativeMouseX) / currentZoom;
        const contentY = (scrollY + relativeMouseY) / currentZoom;
        
        // Применяем новый зум
        currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
        skillTree.style.transform = `scale(${currentZoom})`;
        skillTree.style.transformOrigin = "top left";
        
        // Вычисляем новую позицию скролла чтобы точка под курсором осталась на месте
        const newScrollX = contentX * currentZoom - relativeMouseX;
        const newScrollY = contentY * currentZoom - relativeMouseY;
        
        const maxScrollX = Math.max(0, skillTree.scrollWidth * currentZoom - wrapper.clientWidth);
        const maxScrollY = Math.max(0, skillTree.scrollHeight * currentZoom - wrapper.clientHeight);
        
        wrapper.scrollLeft = Math.max(0, Math.min(maxScrollX, newScrollX));
        wrapper.scrollTop = Math.max(0, Math.min(maxScrollY, newScrollY));
        
        updateZoomDisplay();
    };
    
    // Плавная анимация зума
    const animateZoom = () => {
        const diff = targetZoom - currentZoom;
        if (Math.abs(diff) > 0.001) {
            // Плавная интерполяция
            currentZoom += diff * 0.2;
            applyZoom(currentZoom, lastZoomMouseX, lastZoomMouseY);
            zoomAnimationId = requestAnimationFrame(animateZoom);
        } else {
            currentZoom = targetZoom;
            applyZoom(currentZoom, lastZoomMouseX, lastZoomMouseY);
            zoomAnimationId = null;
        }
    };
    
    const zoomAtPoint = (clientX: number, clientY: number, newTargetZoom: number) => {
        if (!wrapper || !skillTree) return;
        
        // Сохраняем позицию курсора для анимации
        lastZoomMouseX = clientX;
        lastZoomMouseY = clientY;
        
        targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newTargetZoom));
        
        // Немедленно обновляем зум относительно курсора
        applyZoom(targetZoom, clientX, clientY);
        
        // Запускаем плавную анимацию если нужно
        if (zoomAnimationId === null && Math.abs(targetZoom - currentZoom) > 0.001) {
            zoomAnimationId = requestAnimationFrame(animateZoom);
        }
    };

    // Кнопки зума
    let zoomControls = wrapper.parentElement?.querySelector(".skill-zoom-controls") as HTMLElement;
    if (!zoomControls) {
        zoomControls = document.createElement("div");
        zoomControls.className = "skill-zoom-controls";
        zoomControls.innerHTML = `
            <button class="skill-zoom-btn" id="zoom-out">−</button>
            <span class="skill-zoom-level">${Math.round(currentZoom * 100)}%</span>
            <button class="skill-zoom-btn" id="zoom-in">+</button>
        `;
        wrapper.parentElement?.appendChild(zoomControls);
        
        zoomControls.querySelector("#zoom-in")?.addEventListener("click", () => {
            const wrapperRect = wrapper.getBoundingClientRect();
            zoomAtPoint(wrapperRect.left + wrapperRect.width / 2, wrapperRect.top + wrapperRect.height / 2, targetZoom + ZOOM_STEP);
        });
        
        zoomControls.querySelector("#zoom-out")?.addEventListener("click", () => {
            const wrapperRect = wrapper.getBoundingClientRect();
            zoomAtPoint(wrapperRect.left + wrapperRect.width / 2, wrapperRect.top + wrapperRect.height / 2, targetZoom - ZOOM_STEP);
        });
    }

    // Wheel zoom - всегда работает как зум
    wrapper.addEventListener("wheel", (e: WheelEvent) => {
        e.preventDefault();
        
        // Вычисляем изменение зума
        const delta = e.deltaY > 0 ? -ZOOM_SPEED * 1.5 : ZOOM_SPEED * 1.5;
        const newTargetZoom = targetZoom + delta;
        
        // Обновляем targetZoom и применяем зум относительно курсора
        targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newTargetZoom));
        
        // Немедленно применяем зум
        const wrapperRect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        applyZoom(targetZoom, mouseX, mouseY);
        
        // Запускаем плавную анимацию если нужно
        if (zoomAnimationId === null && Math.abs(targetZoom - currentZoom) > 0.001) {
            zoomAnimationId = requestAnimationFrame(animateZoom);
        }
    }, { passive: false });

    // Навигация клавиатурой
    const onKey = (e: KeyboardEvent) => {
        if (!wrapper.parentElement?.classList.contains("visible")) return;
        const step = 80;
        switch (e.key) {
            case "ArrowLeft":
                wrapper.scrollLeft -= step;
                e.preventDefault();
                break;
            case "ArrowRight":
                wrapper.scrollLeft += step;
                e.preventDefault();
                break;
            case "ArrowUp":
                wrapper.scrollTop -= step;
                e.preventDefault();
                break;
            case "ArrowDown":
                wrapper.scrollTop += step;
                e.preventDefault();
                break;
        }
    };
    
    window.addEventListener("keydown", onKey);
    
    // Drag для перетаскивания дерева - оптимизированная версия
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const onMouseDown = (e: MouseEvent) => {
        // Игнорируем клики на кнопки и интерактивные элементы
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('.skill-upgrade-btn') || target.closest('.skill-category-header')) {
            return;
        }
        
        isDown = true;
        wrapper.classList.add("dragging");
        startX = e.clientX;
        startY = e.clientY;
        scrollLeft = wrapper.scrollLeft;
        scrollTop = wrapper.scrollTop;
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!isDown) return;
        e.preventDefault();
        
        // Прямое обновление позиции для максимальной отзывчивости
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        wrapper.scrollLeft = scrollLeft - deltaX;
        wrapper.scrollTop = scrollTop - deltaY;
    };

    const stopDrag = () => {
        isDown = false;
        wrapper.classList.remove("dragging");
    };

    wrapper.addEventListener("mousedown", onMouseDown);
    wrapper.addEventListener("mousemove", onMouseMove);
    wrapper.addEventListener("mouseleave", stopDrag);
    wrapper.addEventListener("mouseup", stopDrag);
    window.addEventListener("mouseup", stopDrag);
}


