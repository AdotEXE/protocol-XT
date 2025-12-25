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
    calculateAllNodePositions
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
            <div class="panel-title">Навыки</div>
            <div class="skill-tree-wrapper">
                <div class="skill-tree-header">
                    <div id="skill-points-display" class="skill-points-pill">Очков навыков: 0</div>
                    <div class="skill-tree-legend" id="skill-tree-legend"></div>
                </div>
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
        skillPointsDisplay.textContent = `Очков навыков: ${stats.skillPoints}`;
    }
    
    // Обновляем легенду веток
    const legend = document.getElementById("skill-tree-legend");
    if (legend) {
        legend.innerHTML = SKILL_BRANCHES.map(branch => 
            `<span style="border-color: ${branch.color}; color: ${branch.color}">
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

    // Вычисляем позиции всех узлов используя новую полярную систему
    const calculatedPositions = calculateAllNodePositions();
    
    // Находим границы дерева для определения размера
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    calculatedPositions.forEach((pos) => {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
    });
    
    // Добавляем отступы
    const padding = 300;
    const treeWidth = Math.max(2000, (maxX - minX) + padding * 2);
    const treeHeight = Math.max(1500, (maxY - minY) + padding * 2);
    
    // Смещаем все позиции так, чтобы центральный узел был в центре
    const offsetX = treeWidth / 2;
    const offsetY = treeHeight / 2;
    
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
        const core = nodePositions.get("commandCore");
        if (core) {
            wrapper.scrollLeft = Math.max(core.centerX - wrapper.clientWidth / 2, 0);
            wrapper.scrollTop = Math.max(core.centerY - wrapper.clientHeight / 2, 0);
        }
    }

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

        // Вычисляем контрольные точки для извилистой кривой
        const dx = to.centerX - from.centerX;
        const dy = to.centerY - from.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Для веток под углом 135° делаем более плавные кривые
        // Вычисляем перпендикулярный вектор для изгиба
        const perpX = -dy / distance;
        const perpY = dx / distance;
        
        // Создаем извилистую кривую с несколькими контрольными точками
        const controlOffset = Math.min(distance * 0.25, 50);
        const randomOffset1 = (Math.sin(edge.from.charCodeAt(0) + edge.to.charCodeAt(0)) * controlOffset);
        const randomOffset2 = (Math.cos(edge.from.charCodeAt(0) + edge.to.charCodeAt(0)) * controlOffset);
        
        // Первая контрольная точка (смещение перпендикулярно направлению)
        const cp1x = from.centerX + dx * 0.35 + perpX * controlOffset * 0.5 + randomOffset1 * 0.3;
        const cp1y = from.centerY + dy * 0.35 + perpY * controlOffset * 0.5 - randomOffset2 * 0.3;
        
        // Вторая контрольная точка
        const cp2x = from.centerX + dx * 0.65 - perpX * controlOffset * 0.5 - randomOffset1 * 0.3;
        const cp2y = from.centerY + dy * 0.65 - perpY * controlOffset * 0.5 + randomOffset2 * 0.3;
        
        // Создаем кривую Безье (кубическую) для более органичного вида
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${from.centerX} ${from.centerY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.centerX} ${to.centerY}`);
        path.setAttribute("stroke", "#0f0");
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

        const borderColor = node.branchColor || (node.type === "hub" ? "#0f0" : node.type === "meta" ? "#5cf" : "#0f0");
        const isLocked = !isUnlocked && node.type !== "hub" && node.id !== "commandCore";
        
        const nodeEl = document.createElement("div");
        nodeEl.className = `skill-node${node.type === "hub" ? " is-hub" : ""}${node.type === "meta" ? " is-meta" : ""}${isLocked ? " is-locked" : ""}`;
        nodeEl.style.left = `${pos.left}px`;
        nodeEl.style.top = `${pos.top}px`;
        if (node.branchColor) {
            nodeEl.style.borderColor = borderColor;
        }
        
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

    skillTree.appendChild(connectors);
    skillTree.appendChild(nodesFragment);
    
    console.log(`[Skills] Created ${nodesCreated} nodes, ${connectors.children.length} connectors`);
    console.log(`[Skills] skillTree children count: ${skillTree.children.length}`);
    
    // Проверяем что узлы действительно в DOM
    const renderedNodes = skillTree.querySelectorAll('.skill-node');
    console.log(`[Skills] Rendered nodes in DOM: ${renderedNodes.length}`);

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

    // Wheel zoom - плавный без задержек
    wrapper.addEventListener("wheel", (e: WheelEvent) => {
        // Зум работает всегда (не только с Ctrl)
        e.preventDefault();
        
        // Вычисляем изменение зума (5-10% за прокрутку)
        const delta = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
        const newTargetZoom = targetZoom + delta;
        
        // Обновляем targetZoom и применяем зум относительно курсора
        targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newTargetZoom));
        
        // Немедленно применяем зум без throttle
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
    
    // Drag для перетаскивания дерева
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const onMouseDown = (e: MouseEvent) => {
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
        wrapper.scrollLeft = scrollLeft - (e.clientX - startX);
        wrapper.scrollTop = scrollTop - (e.clientY - startY);
    };

    const stopDrag = () => {
        isDown = false;
        wrapper.classList.remove("dragging");
    };

    wrapper.addEventListener("mousedown", onMouseDown);
    wrapper.addEventListener("mousemove", onMouseMove);
    wrapper.addEventListener("mouseleave", stopDrag);
    window.addEventListener("mouseup", stopDrag);
}


