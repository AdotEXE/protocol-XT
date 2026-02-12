/**
 * @module menu/skillTreeUI
 * @description Древо навыков: разметка панели НАВЫКИ, узлы с уровнями и кнопкой улучшения
 */

const SKILL_TREE_CAMERA_KEY = "tx_skill_tree_camera";
const SKILL_TREE_ZOOM_KEY = "tx_skill_tree_zoom";
const MAX_SKILL_LEVEL = 15;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

interface SkillConfig {
    id: string;
    name: string;
    icon: string;
    desc: string;
    /**
     * Позиция узла в "решётке" древа (колонка/строка).
     * Используем целые индексы, чтобы потом перевести их в пиксели.
     */
    col: number;
    row: number;
    /**
     * Идентификаторы родительских навыков для отрисовки связей.
     * Если массив пустой или не задан — узел считается корневым.
     */
    parents?: string[];
    /**
     * Категория навыка (для визуальной группировки)
     */
    category?: "combat" | "survival" | "utility" | "mastery";
    /**
     * Является ли узел хабом (центральным узлом ветки)
     */
    isHub?: boolean;
    /**
     * Является ли узел мета-навыком (особо мощным)
     */
    isMeta?: boolean;
}

/** Статистика игрока для отображения в скилл-дереве */
export interface PlayerStats {
    skillPoints: number;
    skills: Record<string, number>;
    level: number;
    experience: number;
    experienceToNext: number;
}

/** Колбэки скилл-дерева */
export interface SkillTreeCallbacks {
    onUpgrade: (skillId: string) => void;
    onUpdate: () => void;
}

/**
 * ПОЛНОЦЕННОЕ ДРЕВО НАВЫКОВ
 * 
 * Структура:
 * 
 * ВЕТКА БОЯ (левая):
 *   [Мастер танка] (hub)
 *     ├─ [Боевой эксперт]
 *     │   ├─ [Точность]
 *     │   ├─ [Критический удар]
 *     │   └─ [Скорострельность]
 *     └─ [Урон]
 *         ├─ [Усиление бронебойности]
 *         └─ [Разрушитель]
 * 
 * ВЕТКА ВЫЖИВАНИЯ (правая):
 *   [Инстинкт выживания] (hub)
 *     ├─ [Броня]
 *     │   ├─ [Регенерация]
 *     │   └─ [Щит]
 *     └─ [Здоровье]
 *         ├─ [Живучесть]
 *         └─ [Неуязвимость]
 * 
 * ВЕТКА УТИЛИТ (нижняя левая):
 *   [Находчивость] (hub)
 *     ├─ [Экономика]
 *     │   ├─ [Добытчик]
 *     │   └─ [Торговец]
 *     └─ [Опыт]
 *         ├─ [Ученик]
 *         └─ [Мудрец]
 * 
 * ВЕТКА МАСТЕРСТВА (нижняя правая):
 *   [Тактический гений] (hub)
 *     ├─ [Скорость башни]
 *     │   ├─ [Молниеносный поворот]
 *     │   └─ [Точное наведение]
 *     └─ [Перезарядка]
 *         ├─ [Быстрая перезарядка]
 *         └─ [Автоматическая перезарядка]
 * 
 * МЕТА-НАВЫКИ (верхний центр):
 *   [Легенда] (meta) - требует все основные хабы
 */
const SKILLS: SkillConfig[] = [
    // ========== КОРНЕВЫЕ ХАБЫ ==========
    {
        id: "tankMastery",
        name: "Мастер танка",
        icon: "🎯",
        desc: "+0.5 скорости за уровень",
        col: 2,
        row: 0,
        parents: [],
        category: "combat",
        isHub: true
    },
    {
        id: "survivalInstinct",
        name: "Инстинкт выживания",
        icon: "🛡️",
        desc: "+15 HP, +2% брони за уровень",
        col: 6,
        row: 0,
        parents: [],
        category: "survival",
        isHub: true
    },
    {
        id: "resourcefulness",
        name: "Находчивость",
        icon: "💰",
        desc: "+8% опыта и кредитов за уровень",
        col: 0,
        row: 4,
        parents: [],
        category: "utility",
        isHub: true
    },
    {
        id: "tacticalGenius",
        name: "Тактический гений",
        icon: "⚡",
        desc: "+75 мс перезарядки, +15% скорости башни",
        col: 8,
        row: 4,
        parents: [],
        category: "mastery",
        isHub: true
    },

    // ========== ВЕТКА БОЯ (от tankMastery) ==========
    {
        id: "combatExpert",
        name: "Боевой эксперт",
        icon: "💥",
        desc: "+4 урона за уровень",
        col: 1,
        row: 2,
        parents: ["tankMastery"],
        category: "combat"
    },
    {
        id: "damageBoost",
        name: "Урон",
        icon: "⚔️",
        desc: "+6 урона за уровень",
        col: 3,
        row: 2,
        parents: ["tankMastery"],
        category: "combat"
    },
    {
        id: "accuracy",
        name: "Точность",
        icon: "🎯",
        desc: "+5% точности за уровень",
        col: 0,
        row: 3,
        parents: ["combatExpert"],
        category: "combat"
    },
    {
        id: "criticalStrike",
        name: "Критический удар",
        icon: "💀",
        desc: "+3% шанс крита за уровень",
        col: 1,
        row: 4,
        parents: ["combatExpert"],
        category: "combat"
    },
    {
        id: "fireRate",
        name: "Скорострельность",
        icon: "🔥",
        desc: "-50 мс перезарядки за уровень",
        col: 2,
        row: 3,
        parents: ["combatExpert"],
        category: "combat"
    },
    {
        id: "armorPenetration",
        name: "Усиление бронебойности",
        icon: "🔪",
        desc: "+2% пробития брони за уровень",
        col: 3,
        row: 3,
        parents: ["damageBoost"],
        category: "combat"
    },
    {
        id: "destroyer",
        name: "Разрушитель",
        icon: "💣",
        desc: "+10% урона по строениям за уровень",
        col: 4,
        row: 3,
        parents: ["damageBoost"],
        category: "combat"
    },

    // ========== ВЕТКА ВЫЖИВАНИЯ (от survivalInstinct) ==========
    {
        id: "armor",
        name: "Броня",
        icon: "🛡️",
        desc: "+3% брони за уровень",
        col: 5,
        row: 2,
        parents: ["survivalInstinct"],
        category: "survival"
    },
    {
        id: "health",
        name: "Здоровье",
        icon: "❤️",
        desc: "+20 HP за уровень",
        col: 7,
        row: 2,
        parents: ["survivalInstinct"],
        category: "survival"
    },
    {
        id: "regeneration",
        name: "Регенерация",
        icon: "💚",
        desc: "+1 HP/сек регенерации за уровень",
        col: 5,
        row: 3,
        parents: ["armor"],
        category: "survival"
    },
    {
        id: "shield",
        name: "Щит",
        icon: "🔰",
        desc: "+5% поглощения урона за уровень",
        col: 6,
        row: 3,
        parents: ["armor"],
        category: "survival"
    },
    {
        id: "vitality",
        name: "Живучесть",
        icon: "💪",
        desc: "+25 HP за уровень",
        col: 7,
        row: 3,
        parents: ["health"],
        category: "survival"
    },
    {
        id: "invulnerability",
        name: "Неуязвимость",
        icon: "✨",
        desc: "+2% сопротивления урону за уровень",
        col: 8,
        row: 3,
        parents: ["health"],
        category: "survival"
    },

    // ========== ВЕТКА УТИЛИТ (от resourcefulness) ==========
    {
        id: "economy",
        name: "Экономика",
        icon: "💵",
        desc: "+10% кредитов за уровень",
        col: 0,
        row: 5,
        parents: ["resourcefulness"],
        category: "utility"
    },
    {
        id: "experience",
        name: "Опыт",
        icon: "⭐",
        desc: "+10% опыта за уровень",
        col: 1,
        row: 5,
        parents: ["resourcefulness"],
        category: "utility"
    },
    {
        id: "scavenger",
        name: "Добытчик",
        icon: "🔍",
        desc: "+15% кредитов с убийств за уровень",
        col: 0,
        row: 6,
        parents: ["economy"],
        category: "utility"
    },
    {
        id: "trader",
        name: "Торговец",
        icon: "💼",
        desc: "-5% стоимость покупок за уровень",
        col: 1,
        row: 6,
        parents: ["economy"],
        category: "utility"
    },
    {
        id: "student",
        name: "Ученик",
        icon: "📚",
        desc: "+12% опыта за уровень",
        col: 0,
        row: 7,
        parents: ["experience"],
        category: "utility"
    },
    {
        id: "sage",
        name: "Мудрец",
        icon: "🧙",
        desc: "+15% опыта, +1 очко навыков за уровень",
        col: 1,
        row: 7,
        parents: ["experience"],
        category: "utility"
    },

    // ========== ВЕТКА МАСТЕРСТВА (от tacticalGenius) ==========
    {
        id: "turretSpeed",
        name: "Скорость башни",
        icon: "🌀",
        desc: "+20% скорости башни за уровень",
        col: 7,
        row: 5,
        parents: ["tacticalGenius"],
        category: "mastery"
    },
    {
        id: "reloadSpeed",
        name: "Перезарядка",
        icon: "⚡",
        desc: "-100 мс перезарядки за уровень",
        col: 9,
        row: 5,
        parents: ["tacticalGenius"],
        category: "mastery"
    },
    {
        id: "lightningTurn",
        name: "Молниеносный поворот",
        icon: "⚡",
        desc: "+25% скорости башни за уровень",
        col: 7,
        row: 6,
        parents: ["turretSpeed"],
        category: "mastery"
    },
    {
        id: "preciseAiming",
        name: "Точное наведение",
        icon: "🎯",
        desc: "+10% точности, +15% скорости башни за уровень",
        col: 8,
        row: 6,
        parents: ["turretSpeed"],
        category: "mastery"
    },
    {
        id: "fastReload",
        name: "Быстрая перезарядка",
        icon: "🔥",
        desc: "-120 мс перезарядки за уровень",
        col: 9,
        row: 6,
        parents: ["reloadSpeed"],
        category: "mastery"
    },
    {
        id: "autoReload",
        name: "Автоматическая перезарядка",
        icon: "🔄",
        desc: "-150 мс перезарядки, +5% урона за уровень",
        col: 10,
        row: 6,
        parents: ["reloadSpeed"],
        category: "mastery"
    },

    // ========== МЕТА-НАВЫКИ ==========
    {
        id: "legend",
        name: "Легенда",
        icon: "👑",
        desc: "+5% ко всем характеристикам за уровень. Требует все основные навыки",
        col: 4,
        row: 1,
        parents: ["tankMastery", "survivalInstinct", "resourcefulness", "tacticalGenius"],
        category: "mastery",
        isMeta: true
    }
];

/**
 * Возвращает HTML разметку панели НАВЫКИ (древо навыков).
 */
export function createSkillsPanelHTML(): string {
    return `
    <div class="panel-content">
        <button type="button" class="panel-close" id="skills-close" aria-label="Закрыть">×</button>
        <div class="panel-title">НАВЫКИ</div>
        <div class="skill-tree-header">
            <div class="skill-points-pill" id="skills-points">Очки: 0</div>
            <div class="skill-tree-legend">
                <span>● Уровень 0–15</span>
                <span>▶ Кнопка «Улучшить»</span>
            </div>
        </div>
        <div class="skill-tree-wrapper" id="skill-tree-wrapper">
            <div class="skill-zoom-controls">
                <button type="button" class="skill-zoom-btn" id="skill-zoom-out" title="Уменьшить">−</button>
                <span class="skill-zoom-level" id="skill-zoom-level">100%</span>
                <button type="button" class="skill-zoom-btn" id="skill-zoom-in" title="Увеличить">+</button>
                <button type="button" class="skill-zoom-btn" id="skill-zoom-reset" title="Сбросить">⌂</button>
            </div>
            <div class="skill-tree" id="skill-tree-container"></div>
        </div>
        <div class="panel-buttons">
            <button type="button" class="panel-btn" id="skills-prokachka">Прокачка танка</button>
        </div>
    </div>`;
}

/**
 * Сохраняет позицию скролла древа (wrapper).
 */
export function saveSkillTreeCameraPosition(): void {
    try {
        const wrapper = document.getElementById("skill-tree-wrapper");
        const container = document.getElementById("skill-tree-container");
        if (wrapper && container) {
            const scroll = { x: wrapper.scrollLeft, y: wrapper.scrollTop };
            const zoom = parseFloat(container.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] || "1");
            localStorage.setItem(SKILL_TREE_CAMERA_KEY, JSON.stringify(scroll));
            localStorage.setItem(SKILL_TREE_ZOOM_KEY, zoom.toString());
        }
    } catch {
        // ignore
    }
}

function restoreSkillTreeCameraPosition(): void {
    try {
        const wrapper = document.getElementById("skill-tree-wrapper");
        const container = document.getElementById("skill-tree-container");
        if (!wrapper || !container) return;
        
        // Восстанавливаем позицию скролла
        const scrollRaw = localStorage.getItem(SKILL_TREE_CAMERA_KEY);
        if (scrollRaw) {
            const scroll = JSON.parse(scrollRaw) as { x?: number; y?: number };
            if (typeof scroll.x === "number") wrapper.scrollLeft = scroll.x;
            if (typeof scroll.y === "number") wrapper.scrollTop = scroll.y;
        }
        
        // Восстанавливаем зум
        const zoomRaw = localStorage.getItem(SKILL_TREE_ZOOM_KEY);
        if (zoomRaw) {
            const zoom = parseFloat(zoomRaw);
            if (!isNaN(zoom) && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM) {
                container.style.transform = `scale(${zoom})`;
                container.style.transformOrigin = "top left";
                updateZoomDisplay(zoom);
            }
        }
    } catch {
        // ignore
    }
}

/**
 * Обновляет отображение уровня зума
 */
function updateZoomDisplay(zoom: number): void {
    const zoomLevelEl = document.getElementById("skill-zoom-level");
    if (zoomLevelEl) {
        zoomLevelEl.textContent = `${Math.round(zoom * 100)}%`;
    }
}

/**
 * Инициализирует drag-to-pan и zoom для дерева навыков
 */
function setupSkillTreeInteraction(): void {
    const wrapper = document.getElementById("skill-tree-wrapper");
    const container = document.getElementById("skill-tree-container");
    if (!wrapper || !container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    // Drag-to-pan
    wrapper.addEventListener("mousedown", (e) => {
        // Не начинаем drag если кликнули на кнопку или узел навыка
        const target = e.target as HTMLElement;
        if (target.closest(".skill-node") || target.closest(".skill-zoom-controls") || target.closest("button")) {
            return;
        }
        
        isDragging = true;
        wrapper.classList.add("dragging");
        wrapper.style.cursor = "grabbing";
        startX = e.pageX - wrapper.offsetLeft;
        startY = e.pageY - wrapper.offsetTop;
        scrollLeft = wrapper.scrollLeft;
        scrollTop = wrapper.scrollTop;
        e.preventDefault();
    });

    wrapper.addEventListener("mouseleave", () => {
        if (isDragging) {
            isDragging = false;
            wrapper.classList.remove("dragging");
            wrapper.style.cursor = "grab";
        }
    });

    wrapper.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            wrapper.classList.remove("dragging");
            wrapper.style.cursor = "grab";
            saveSkillTreeCameraPosition();
        }
    });

    wrapper.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - wrapper.offsetLeft;
        const y = e.pageY - wrapper.offsetTop;
        const walkX = (x - startX) * 1.5; // Множитель для скорости перемещения
        const walkY = (y - startY) * 1.5;
        wrapper.scrollLeft = scrollLeft - walkX;
        wrapper.scrollTop = scrollTop - walkY;
    });

    // Zoom колесом мыши
    wrapper.addEventListener("wheel", (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
            const currentZoom = parseFloat(container.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] || "1");
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + delta));
            container.style.transform = `scale(${newZoom})`;
            container.style.transformOrigin = "top left";
            updateZoomDisplay(newZoom);
            saveSkillTreeCameraPosition();
        }
    }, { passive: false });

    // Zoom кнопками
    const zoomInBtn = document.getElementById("skill-zoom-in");
    const zoomOutBtn = document.getElementById("skill-zoom-out");
    const zoomResetBtn = document.getElementById("skill-zoom-reset");

    if (zoomInBtn) {
        zoomInBtn.addEventListener("click", () => {
            const currentZoom = parseFloat(container.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] || "1");
            const newZoom = Math.min(MAX_ZOOM, currentZoom + ZOOM_STEP);
            container.style.transform = `scale(${newZoom})`;
            container.style.transformOrigin = "top left";
            updateZoomDisplay(newZoom);
            saveSkillTreeCameraPosition();
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener("click", () => {
            const currentZoom = parseFloat(container.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] || "1");
            const newZoom = Math.max(MIN_ZOOM, currentZoom - ZOOM_STEP);
            container.style.transform = `scale(${newZoom})`;
            container.style.transformOrigin = "top left";
            updateZoomDisplay(newZoom);
            saveSkillTreeCameraPosition();
        });
    }

    if (zoomResetBtn) {
        zoomResetBtn.addEventListener("click", () => {
            container.style.transform = "scale(1)";
            container.style.transformOrigin = "top left";
            updateZoomDisplay(1);
            // Центрируем дерево
            wrapper.scrollLeft = wrapper.scrollWidth / 2 - wrapper.clientWidth / 2;
            wrapper.scrollTop = wrapper.scrollHeight / 2 - wrapper.clientHeight / 2;
            saveSkillTreeCameraPosition();
        });
    }
}

/**
 * Проверяет, разблокирован ли навык (все родители должны быть на уровне > 0)
 */
function isSkillUnlocked(skill: SkillConfig, stats: PlayerStats): boolean {
    if (!skill.parents || skill.parents.length === 0) {
        return true; // Корневые навыки всегда разблокированы
    }
    
    // Для мета-навыков требуются ВСЕ родители
    if (skill.isMeta) {
        return skill.parents.every(parentId => (stats.skills?.[parentId] ?? 0) > 0);
    }
    
    // Для обычных навыков достаточно хотя бы одного родителя
    return skill.parents.some(parentId => (stats.skills?.[parentId] ?? 0) > 0);
}

/**
 * Обновляет отображение древа навыков: очки, узлы с уровнями, пипы и кнопки улучшения.
 */
export function updateSkillTreeDisplay(stats: PlayerStats, callbacks: SkillTreeCallbacks): void {
    const pointsEl = document.getElementById("skills-points");
    if (pointsEl) pointsEl.textContent = `Очки: ${stats.skillPoints ?? 0}`;

    const container = document.getElementById("skill-tree-container");
    if (!container) return;

    const nodeWidth = 220;
    const nodeHeight = 140;
    const gap = 24;
    const startX = 20;
    const startY = 20;

    container.innerHTML = "";
    // Увеличиваем размер контейнера для большого дерева
    container.style.minWidth = "3000px";
    container.style.minHeight = "1200px";

    // Кэш позиций узлов, чтобы потом рисовать связи
    const nodeLayouts = new Map<string, { left: number; top: number }>();

    SKILLS.forEach((skill) => {
        const level = Math.min(MAX_SKILL_LEVEL, stats.skills?.[skill.id] ?? 0);
        const isUnlocked = isSkillUnlocked(skill, stats);
        const canUpgrade = isUnlocked && (stats.skillPoints ?? 0) > 0 && level < MAX_SKILL_LEVEL;
        
        const col = skill.col;
        const row = skill.row;
        const left = startX + col * (nodeWidth + gap);
        const top = startY + row * (nodeHeight + gap);

        const node = document.createElement("div");
        node.className = "skill-node";
        if (skill.isHub) node.classList.add("is-hub");
        if (skill.isMeta) node.classList.add("is-meta");
        if (!isUnlocked) node.classList.add("is-locked");
        
        node.dataset.skillId = skill.id;
        node.style.left = `${left}px`;
        node.style.top = `${top}px`;

        const pips = Array.from({ length: MAX_SKILL_LEVEL }, (_, i) =>
            i < level ? '<span class="skill-pip filled"></span>' : '<span class="skill-pip"></span>'
        ).join("");

        const categoryLabel = skill.category ? `<div class="skill-module-info">${skill.category.toUpperCase()}</div>` : "";

        node.innerHTML = `
            <div class="skill-node-header">
                <span class="skill-node-icon">${skill.icon}</span>
                <span class="skill-node-title">${skill.name}</span>
                <span class="skill-node-badge">Ур.${level}</span>
            </div>
            ${categoryLabel}
            <div class="skill-node-desc">${skill.desc}</div>
            <div class="skill-node-level">
                <span>Уровень</span>
                <div class="skill-meter">${pips}</div>
            </div>
            <button type="button" class="skill-upgrade-btn" data-skill-id="${skill.id}" ${canUpgrade ? "" : "disabled"}>
                Улучшить
            </button>`;

        const btn = node.querySelector(".skill-upgrade-btn");
        if (btn) {
            btn.addEventListener("click", () => {
                if (!isUnlocked) return; // Заблокированные навыки нельзя улучшать
                const skillId = (btn as HTMLElement).dataset.skillId;
                if (skillId) callbacks.onUpgrade(skillId);
                callbacks.onUpdate();
            });
        }

        container.appendChild(node);
        nodeLayouts.set(skill.id, { left, top });
    });

    // После того как все узлы созданы, рисуем линии-связи между ними
    SKILLS.forEach((skill) => {
        if (!skill.parents || skill.parents.length === 0) return;

        const childLayout = nodeLayouts.get(skill.id);
        if (!childLayout) return;

        skill.parents.forEach((parentId) => {
            const parentLayout = nodeLayouts.get(parentId);
            if (!parentLayout) return;

            const x1 = parentLayout.left + nodeWidth / 2;
            const y1 = parentLayout.top + nodeHeight;
            const x2 = childLayout.left + nodeWidth / 2;
            const y2 = childLayout.top;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= 0) return;

            const angle = Math.atan2(dy, dx);

            const line = document.createElement("div");
            line.className = "skill-connection";
            line.style.position = "absolute";
            line.style.left = `${x1}px`;
            line.style.top = `${y1}px`;
            line.style.width = `${distance}px`;
            line.style.height = "2px";
            line.style.transformOrigin = "0 0";
            line.style.transform = `rotate(${angle}rad)`;

            container.appendChild(line);
        });
    });

    restoreSkillTreeCameraPosition();
    
    // Инициализируем drag и zoom ПОСЛЕ того как дерево отрисовано
    setTimeout(() => {
        setupSkillTreeInteraction();
    }, 100);
}
