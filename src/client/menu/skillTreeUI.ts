/**
 * Menu Skill Tree UI Module
 * UI логика скил-дерева из menu.ts
 */

import { SKILL_TREE_NODES, SKILL_TREE_EDGES, SKILL_BRANCHES, isNodeUnlocked, getSkillCost } from "../skillTreeConfig";

/**
 * Создает UI элементы для скил-дерева
 */
export function createSkillTreeUI(container: HTMLElement): void {
    // TODO: Переместить логику создания UI скил-дерева из menu.ts
}

/**
 * Обновляет отображение скил-дерева
 */
export function updateSkillTreeDisplay(
    unlockedSkills: Set<string>,
    availableCurrency: number
): void {
    // TODO: Переместить логику обновления из menu.ts
}

/**
 * Обрабатывает клик по скиллу
 */
export function handleSkillClick(
    skillId: string,
    unlockedSkills: Set<string>,
    availableCurrency: number,
    onPurchase: (skillId: string, cost: number) => boolean
): void {
    if (unlockedSkills.has(skillId)) {
        return; // Уже разблокирован
    }

    if (!isNodeUnlocked(skillId, Array.from(unlockedSkills))) {
        alert("Предварительные навыки не разблокированы!");
        return;
    }

    const cost = getSkillCost(skillId);
    if (availableCurrency < cost) {
        alert("Недостаточно валюты!");
        return;
    }

    if (onPurchase(skillId, cost)) {
        unlockedSkills.add(skillId);
        updateSkillTreeDisplay(unlockedSkills, availableCurrency - cost);
    }
}

