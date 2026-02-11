/**
 * @module menu/skillTreeUI
 * @description UI скилл-дерева: разметка панели, обновление отображения, сохранение камеры
 */

const SKILL_TREE_CAMERA_KEY = "tx_skill_tree_camera";

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
 * Возвращает HTML разметку панели скилл-дерева.
 */
export function createSkillsPanelHTML(): string {
    return `
    <div class="panel-overlay-content" id="skills-panel-content">
        <button type="button" id="skills-close" class="panel-close" aria-label="Закрыть">×</button>
        <button type="button" id="skills-back" class="panel-back">← Назад</button>
        <div class="skills-header">
            <h2>Древо навыков</h2>
            <p class="skill-points" id="skills-points">Очки: 0</p>
        </div>
        <div id="skill-tree-container" class="skill-tree-container"></div>
        <button type="button" id="skills-prokachka" class="btn-primary">Прокачка танка</button>
    </div>`;
}

/**
 * Сохраняет позицию камеры скилл-дерева (например в localStorage).
 */
export function saveSkillTreeCameraPosition(): void {
    try {
        const el = document.getElementById("skill-tree-container");
        if (el) {
            const scroll = { x: el.scrollLeft, y: el.scrollTop };
            localStorage.setItem(SKILL_TREE_CAMERA_KEY, JSON.stringify(scroll));
        }
    } catch {
        // ignore
    }
}

/**
 * Восстанавливает позицию камеры (scroll) в контейнере скилл-дерева.
 */
function restoreSkillTreeCameraPosition(): void {
    try {
        const raw = localStorage.getItem(SKILL_TREE_CAMERA_KEY);
        if (!raw) return;
        const scroll = JSON.parse(raw) as { x?: number; y?: number };
        const el = document.getElementById("skill-tree-container");
        if (el && typeof scroll.x === "number") el.scrollLeft = scroll.x;
        if (el && typeof scroll.y === "number") el.scrollTop = scroll.y;
    } catch {
        // ignore
    }
}

/**
 * Обновляет отображение скилл-дерева по переданной статистике и колбэкам.
 */
export function updateSkillTreeDisplay(stats: PlayerStats, callbacks: SkillTreeCallbacks): void {
    const pointsEl = document.getElementById("skills-points");
    if (pointsEl) pointsEl.textContent = `Очки: ${stats.skillPoints ?? 0}`;

    const container = document.getElementById("skill-tree-container");
    if (!container) return;

    // Минимальная разметка узлов навыков (можно расширить под реальные скиллы)
    const skillIds = ["tankMastery", "combatExpert", "survivalInstinct", "resourcefulness", "tacticalGenius"];
    const labels: Record<string, string> = {
        tankMastery: "Мастер танка",
        combatExpert: "Боевой эксперт",
        survivalInstinct: "Инстинкт выживания",
        resourcefulness: "Находчивость",
        tacticalGenius: "Тактический гений"
    };

    container.innerHTML = skillIds
        .map(
            (id) =>
                `<div class="skill-node" data-skill-id="${id}">
          <span class="skill-label">${labels[id] ?? id}</span>
          <span class="skill-value">${stats.skills?.[id] ?? 0}</span>
          <button type="button" class="skill-upgrade" data-skill-id="${id}">+</button>
        </div>`
        )
        .join("");

    container.querySelectorAll(".skill-upgrade").forEach((btn) => {
        btn.addEventListener("click", () => {
            const skillId = (btn as HTMLElement).dataset.skillId;
            if (skillId) callbacks.onUpgrade(skillId);
            callbacks.onUpdate();
        });
    });

    restoreSkillTreeCameraPosition();
}
