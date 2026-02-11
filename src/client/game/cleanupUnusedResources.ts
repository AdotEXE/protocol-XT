/**
 * Очистка неиспользуемых материалов и текстур сцены.
 * Вызывается из Game при смене карты, выходе из комнаты или периодически.
 */

import type { Scene } from "@babylonjs/core";
import { logger } from "../utils/logger";

/** Порог: показывать уведомление, если освобождено больше этого количества */
const NOTIFY_THRESHOLD = 10;

function isProtectedMaterial(name: string): boolean {
    return name.startsWith("default") || name.includes("skybox") || name.includes("ground") || name.includes("tank") || name.includes("bullet");
}

function isProtectedTexture(name: string): boolean {
    return name.includes("skybox") || name.includes("env");
}

export interface CleanupUnusedResourcesOptions {
    /** Вызывается при освобождении большого объёма (мат./текст.) для показа сообщения игроку */
    onNotify?: (text: string, color: string, duration: number) => void;
}

/**
 * Удаляет материалы и текстуры сцены, не привязанные к мешам.
 * Защищает системные материалы/текстуры по имени.
 */
export function cleanupUnusedResources(
    scene: Scene,
    options: CleanupUnusedResourcesOptions = {}
): void {
    const beforeMaterials = scene.materials.length;
    const beforeTextures = scene.textures.length;

    const usedMaterials = new Set<string>();
    for (const mesh of scene.meshes) {
        if (mesh.material) {
            usedMaterials.add(mesh.material.uniqueId.toString());
        }
    }

    const materialsToDispose: unknown[] = [];
    for (const material of scene.materials) {
        if (isProtectedMaterial(material.name)) {
            continue;
        }
        if (!usedMaterials.has(material.uniqueId.toString())) {
            materialsToDispose.push(material);
        }
    }

    for (const mat of materialsToDispose) {
        try {
            (mat as { dispose(a?: boolean, b?: boolean): void }).dispose(true, true);
        } catch {
            // ignore
        }
    }

    const usedTextures = new Set<string>();
    for (const material of scene.materials) {
        const mat = material as Record<string, { uniqueId?: { toString(): string } } | undefined>;
        ["diffuseTexture", "albedoTexture", "emissiveTexture", "bumpTexture"].forEach((key) => {
            const tex = mat[key];
            if (tex?.uniqueId) usedTextures.add(tex.uniqueId.toString());
        });
    }

    const texturesToDispose: unknown[] = [];
    for (const texture of scene.textures) {
        if (isProtectedTexture(texture.name)) continue;
        if (!usedTextures.has(texture.uniqueId?.toString())) {
            texturesToDispose.push(texture);
        }
    }

    for (const tex of texturesToDispose) {
        try {
            (tex as { dispose(): void }).dispose();
        } catch {
            // ignore
        }
    }

    const afterMaterials = scene.materials.length;
    const afterTextures = scene.textures.length;

    logger.log(`[Game] 🧹 Memory cleanup: Materials ${beforeMaterials} → ${afterMaterials} (freed ${materialsToDispose.length}), Textures ${beforeTextures} → ${afterTextures} (freed ${texturesToDispose.length})`);

    if ((materialsToDispose.length > NOTIFY_THRESHOLD || texturesToDispose.length > NOTIFY_THRESHOLD) && options.onNotify) {
        options.onNotify(`🧹 Очищено: ${materialsToDispose.length} мат. ${texturesToDispose.length} текст.`, "#4ade80", 2000);
    }
}

export interface MemoryStats {
    materials: number;
    textures: number;
    meshes: number;
}

/**
 * Возвращает количество материалов, текстур и мешей сцены (для мониторинга памяти).
 */
export function getMemoryStatsFromScene(scene: Scene | null | undefined): MemoryStats {
    return {
        materials: scene?.materials.length ?? 0,
        textures: scene?.textures.length ?? 0,
        meshes: scene?.meshes.length ?? 0
    };
}
