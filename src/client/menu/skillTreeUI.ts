/**
 * @module menu/skillTreeUI
 * @description Древо навыков: разметка панели НАВЫКИ, узлы с уровнями и кнопкой улучшения
 */

const SKILL_TREE_CAMERA_KEY = "tx_skill_tree_camera";
const MAX_SKILL_LEVEL = 15;

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

const SKILLS: Array<{ id: string; name: string; icon: string; desc: string }> = [
    { id: "tankMastery", name: "Мастер танка", icon: "🎯", desc: "+0.5 скорости за уровень" },
    { id: "combatExpert", name: "Боевой эксперт", icon: "💥", desc: "+4 урона за уровень" },
    { id: "survivalInstinct", name: "Инстинкт выживания", icon: "🛡️", desc: "+15 HP, +2% брони за уровень" },
    { id: "resourcefulness", name: "Находчивость", icon: "💰", desc: "+8% опыта и кредитов за уровень" },
    { id: "tacticalGenius", name: "Тактический гений", icon: "⚡", desc: "+75 мс перезарядки, +15% скорости башни" }
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
        const el = document.getElementById("skill-tree-wrapper");
        if (el) {
            const scroll = { x: el.scrollLeft, y: el.scrollTop };
            localStorage.setItem(SKILL_TREE_CAMERA_KEY, JSON.stringify(scroll));
        }
    } catch {
        // ignore
    }
}

function restoreSkillTreeCameraPosition(): void {
    try {
        const raw = localStorage.getItem(SKILL_TREE_CAMERA_KEY);
        if (!raw) return;
        const scroll = JSON.parse(raw) as { x?: number; y?: number };
        const el = document.getElementById("skill-tree-wrapper");
        if (el && typeof scroll.x === "number") el.scrollLeft = scroll.x;
        if (el && typeof scroll.y === "number") el.scrollTop = scroll.y;
    } catch {
        // ignore
    }
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
    container.style.minWidth = "1200px";
    container.style.minHeight = "400px";

    SKILLS.forEach((skill, index) => {
        const level = Math.min(MAX_SKILL_LEVEL, stats.skills?.[skill.id] ?? 0);
        const canUpgrade = (stats.skillPoints ?? 0) > 0 && level < MAX_SKILL_LEVEL;
        const col = index % 3;
        const row = Math.floor(index / 3);
        const left = startX + col * (nodeWidth + gap);
        const top = startY + row * (nodeHeight + gap);

        const node = document.createElement("div");
        node.className = "skill-node";
        node.dataset.skillId = skill.id;
        node.style.left = `${left}px`;
        node.style.top = `${top}px`;

        const pips = Array.from({ length: MAX_SKILL_LEVEL }, (_, i) =>
            i < level ? '<span class="skill-pip filled"></span>' : '<span class="skill-pip"></span>'
        ).join("");

        node.innerHTML = `
            <div class="skill-node-header">
                <span class="skill-node-icon">${skill.icon}</span>
                <span class="skill-node-title">${skill.name}</span>
                <span class="skill-node-badge">Ур.${level}</span>
            </div>
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
                const skillId = (btn as HTMLElement).dataset.skillId;
                if (skillId) callbacks.onUpgrade(skillId);
                callbacks.onUpdate();
            });
        }

        container.appendChild(node);
    });

    restoreSkillTreeCameraPosition();
}
