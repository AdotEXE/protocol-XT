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
    type SkillNode 
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
        height: 130,
        colGap: 80,
        rowGap: 90
    };

    const toPosition = (node: { col: number; row: number }) => {
        const left = node.col * (layout.width + layout.colGap);
        const top = node.row * (layout.height + layout.rowGap);
        return {
            left,
            top,
            centerX: left + layout.width / 2,
            centerY: top + layout.height / 2
        };
    };

    const maxCol = nodes.length > 0 ? Math.max(...nodes.map((n) => n.col)) : 0;
    const maxRow = nodes.length > 0 ? Math.max(...nodes.map((n) => n.row)) : 0;

    const treeWidth = (maxCol + 1) * (layout.width + layout.colGap);
    const treeHeight = (maxRow + 1) * (layout.height + layout.rowGap) + layout.height;
    
    skillTree.style.minWidth = `${treeWidth}px`;
    skillTree.style.minHeight = `${treeHeight}px`;
    
    console.log(`[Skills] Tree size: ${treeWidth}x${treeHeight}, maxCol: ${maxCol}, maxRow: ${maxRow}`);
    skillTree.innerHTML = "";

    const nodePositions = new Map<string, ReturnType<typeof toPosition>>();
    nodes.forEach((node) => nodePositions.set(node.id, toPosition(node)));

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
        
        // Создаем извилистую кривую с несколькими контрольными точками
        const controlOffset = Math.min(distance * 0.3, 60);
        const randomOffset1 = (Math.sin(edge.from.charCodeAt(0) + edge.to.charCodeAt(0)) * controlOffset);
        const randomOffset2 = (Math.cos(edge.from.charCodeAt(0) + edge.to.charCodeAt(0)) * controlOffset);
        
        // Первая контрольная точка (смещение перпендикулярно направлению)
        const cp1x = from.centerX + dx * 0.3 + randomOffset1;
        const cp1y = from.centerY + dy * 0.3 - randomOffset2;
        
        // Вторая контрольная точка
        const cp2x = from.centerX + dx * 0.7 - randomOffset1;
        const cp2y = from.centerY + dy * 0.7 + randomOffset2;
        
        // Создаем кривую Безье (кубическую)
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

    // === УЛУЧШЕННЫЙ ЗУМ С НАКОПЛЕНИЕМ И ОПТИМИЗАЦИЕЙ ===
    let currentZoom = 1.0;
    const MIN_ZOOM = 0.3;
    const MAX_ZOOM = 2.5;
    const ZOOM_STEP = 0.1;
    const ZOOM_ANIMATION_DURATION = 200;

    // Накопление изменений зума для wheel событий
    let accumulatedZoomDelta = 0;
    let wheelThrottleTimeout: number | null = null;
    const WHEEL_THROTTLE_MS = 16;

    // Функция зума к точке с плавной анимацией
    let zoomAnimationFrame: number | null = null;
    let pendingZoom: { clientX: number; clientY: number; targetZoom: number } | null = null;
    let zoomLevelDisplayUpdateFrame: number | null = null;
    
    const updateZoomDisplay = () => {
        const zoomLevel = wrapper.parentElement?.querySelector(".skill-zoom-level") as HTMLElement;
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
        }
    };
    
    const zoomAtPoint = (clientX: number, clientY: number, targetZoom: number, immediate: boolean = false) => {
        if (!wrapper || !skillTree) return;
        
        if (zoomAnimationFrame !== null && !immediate) {
            pendingZoom = { clientX, clientY, targetZoom };
            return;
        }
        
        const oldZoom = currentZoom;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
        if (Math.abs(newZoom - oldZoom) < 0.001) {
            if (pendingZoom) {
                const pending = pendingZoom;
                pendingZoom = null;
                zoomAtPoint(pending.clientX, pending.clientY, pending.targetZoom, true);
            }
            return;
        }
        
        if (zoomAnimationFrame !== null) {
            cancelAnimationFrame(zoomAnimationFrame);
            zoomAnimationFrame = null;
        }
        
        const wrapperRect = wrapper.getBoundingClientRect();
        const mouseX = clientX - wrapperRect.left;
        const mouseY = clientY - wrapperRect.top;
        
        const scrollX = wrapper.scrollLeft;
        const scrollY = wrapper.scrollTop;
        
        const contentX = (scrollX + mouseX) / oldZoom;
        const contentY = (scrollY + mouseY) / oldZoom;
        
        const startZoom = oldZoom;
        const endZoom = newZoom;
        const startTime = performance.now();
        const duration = immediate ? 100 : ZOOM_ANIMATION_DURATION;
        
        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const easeOutCubic = 1 - Math.pow(1 - progress, 3);
            const interpolatedZoom = startZoom + (endZoom - startZoom) * easeOutCubic;
            
            currentZoom = interpolatedZoom;
            skillTree.style.transform = `scale(${currentZoom})`;
            skillTree.style.transformOrigin = "top left";
            
            const newScrollX = contentX * currentZoom - mouseX;
            const newScrollY = contentY * currentZoom - mouseY;
            
            const maxScrollX = Math.max(0, skillTree.scrollWidth * currentZoom - wrapper.clientWidth);
            const maxScrollY = Math.max(0, skillTree.scrollHeight * currentZoom - wrapper.clientHeight);
            
            wrapper.scrollLeft = Math.max(0, Math.min(maxScrollX, newScrollX));
            wrapper.scrollTop = Math.max(0, Math.min(maxScrollY, newScrollY));
            
            if (zoomLevelDisplayUpdateFrame === null) {
                zoomLevelDisplayUpdateFrame = requestAnimationFrame(() => {
                    updateZoomDisplay();
                    zoomLevelDisplayUpdateFrame = null;
                });
            }
            
            if (progress < 1) {
                zoomAnimationFrame = requestAnimationFrame(animate);
            } else {
                zoomAnimationFrame = null;
                currentZoom = endZoom;
                skillTree.style.transform = `scale(${currentZoom})`;
                skillTree.style.transformOrigin = "top left";
                
                const finalMaxScrollX = Math.max(0, skillTree.scrollWidth * currentZoom - wrapper.clientWidth);
                const finalMaxScrollY = Math.max(0, skillTree.scrollHeight * currentZoom - wrapper.clientHeight);
                
                const finalScrollX = contentX * currentZoom - mouseX;
                const finalScrollY = contentY * currentZoom - mouseY;
                wrapper.scrollLeft = Math.max(0, Math.min(finalMaxScrollX, finalScrollX));
                wrapper.scrollTop = Math.max(0, Math.min(finalMaxScrollY, finalScrollY));
                
                updateZoomDisplay();
                
                if (pendingZoom) {
                    const pending = pendingZoom;
                    pendingZoom = null;
                    zoomAtPoint(pending.clientX, pending.clientY, pending.targetZoom, true);
                }
            }
        };
        
        zoomAnimationFrame = requestAnimationFrame(animate);
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
            zoomAtPoint(wrapper.clientWidth / 2, wrapper.clientHeight / 2, currentZoom + ZOOM_STEP);
        });
        
        zoomControls.querySelector("#zoom-out")?.addEventListener("click", () => {
            zoomAtPoint(wrapper.clientWidth / 2, wrapper.clientHeight / 2, currentZoom - ZOOM_STEP);
        });
    }

    // Wheel zoom
    wrapper.addEventListener("wheel", (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        
        accumulatedZoomDelta += e.deltaY;
        
        if (wheelThrottleTimeout === null) {
            wheelThrottleTimeout = window.setTimeout(() => {
                const zoomDelta = -accumulatedZoomDelta * 0.001;
                const rect = wrapper.getBoundingClientRect();
                zoomAtPoint(e.clientX - rect.left, e.clientY - rect.top, currentZoom + zoomDelta);
                
                accumulatedZoomDelta = 0;
                wheelThrottleTimeout = null;
            }, WHEEL_THROTTLE_MS);
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


