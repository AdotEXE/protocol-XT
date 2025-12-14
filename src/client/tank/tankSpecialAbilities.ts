/**
 * Tank Special Abilities Module
 * Анимации и логика специальных способностей корпусов (stealth, hover, shield, drone, command)
 */

import { Scene, Mesh } from "@babylonjs/core";
import { ChassisAnimationElements } from "./tankChassis";

/**
 * Обновляет анимацию специальной способности
 */
export function updateSpecialAbilityAnimation(
    animationElements: ChassisAnimationElements,
    deltaTime: number
): void {
    if (!animationElements.animationTime) {
        animationElements.animationTime = 0;
    }
    animationElements.animationTime += deltaTime;

    // Stealth анимация
    if (animationElements.stealthActive && animationElements.stealthMesh) {
        updateStealthAnimation(animationElements.stealthMesh, animationElements.animationTime);
    }

    // Hover анимация
    if (animationElements.hoverThrusters) {
        updateHoverAnimation(animationElements.hoverThrusters, animationElements.animationTime);
    }

    // Shield анимация
    if (animationElements.shieldActive && animationElements.shieldMesh) {
        updateShieldAnimation(animationElements.shieldMesh, animationElements.animationTime);
    }

    // Drone анимация
    if (animationElements.droneMeshes) {
        updateDroneAnimation(animationElements.droneMeshes, animationElements.animationTime);
    }

    // Command анимация
    if (animationElements.commandAura) {
        updateCommandAnimation(animationElements.commandAura, animationElements.animationTime);
    }
}

function updateStealthAnimation(stealthMesh: Mesh, time: number): void {
    // TODO: Переместить логику из tankController.ts
    const opacity = 0.3 + Math.sin(time * 2) * 0.2;
    if (stealthMesh.material) {
        (stealthMesh.material as any).alpha = opacity;
    }
}

function updateHoverAnimation(thrusters: Mesh[], time: number): void {
    // TODO: Переместить логику из tankController.ts
    thrusters.forEach((thruster, index) => {
        const offset = Math.sin(time * 3 + index) * 0.1;
        thruster.position.y = offset;
    });
}

function updateShieldAnimation(shieldMesh: Mesh, time: number): void {
    // TODO: Переместить логику из tankController.ts
    shieldMesh.rotation.y = time;
    const scale = 1 + Math.sin(time * 2) * 0.1;
    shieldMesh.scaling.set(scale, scale, scale);
}

function updateDroneAnimation(drones: Mesh[], time: number): void {
    // TODO: Переместить логику из tankController.ts
    drones.forEach((drone, index) => {
        const angle = (time * 0.5 + index * Math.PI * 2 / drones.length) % (Math.PI * 2);
        const radius = 2;
        drone.position.x = Math.cos(angle) * radius;
        drone.position.z = Math.sin(angle) * radius;
        drone.position.y = Math.sin(time * 2 + index) * 0.5;
    });
}

function updateCommandAnimation(aura: Mesh, time: number): void {
    // TODO: Переместить логику из tankController.ts
    aura.rotation.y = time * 0.5;
    const scale = 1 + Math.sin(time) * 0.2;
    aura.scaling.set(scale, scale, scale);
}

/**
 * Активирует специальную способность
 */
export function activateSpecialAbility(
    abilityType: "stealth" | "hover" | "shield" | "drone" | "command",
    animationElements: ChassisAnimationElements,
    scene: Scene,
    duration: number
): void {
    // TODO: Переместить логику активации из tankController.ts
    switch (abilityType) {
        case "stealth":
            animationElements.stealthActive = true;
            break;
        case "hover":
            // Hover всегда активен, если корпус hover
            break;
        case "shield":
            animationElements.shieldActive = true;
            break;
        case "drone":
            // Дроны активируются на время
            break;
        case "command":
            // Команда активируется на время
            break;
    }
}

/**
 * Деактивирует специальную способность
 */
export function deactivateSpecialAbility(
    abilityType: "stealth" | "hover" | "shield" | "drone" | "command",
    animationElements: ChassisAnimationElements
): void {
    // TODO: Переместить логику деактивации из tankController.ts
    switch (abilityType) {
        case "stealth":
            animationElements.stealthActive = false;
            break;
        case "shield":
            animationElements.shieldActive = false;
            break;
        case "drone":
            // Очистить дроны
            if (animationElements.droneMeshes) {
                animationElements.droneMeshes.forEach(drone => drone.dispose());
                animationElements.droneMeshes = undefined;
            }
            break;
    }
}

