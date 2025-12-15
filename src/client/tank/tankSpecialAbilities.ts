/**
 * Tank Special Abilities Module
 * Анимации и логика специальных способностей корпусов (stealth, hover, shield, drone, command)
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import { ChassisAnimationElements } from "./tankChassis";
import type { ChassisType } from "../tankTypes";

/**
 * Интерфейс для колбэков уведомлений
 */
export interface AbilityCallbacks {
    onEffectStart?: (name: string, icon: string, color: string, duration: number) => void;
    onEffectEnd?: (name: string) => void;
    onMessage?: (message: string, type: "success" | "warning" | "error") => void;
}

/**
 * Обновляет анимацию специальной способности
 */
export function updateSpecialAbilityAnimation(
    animationElements: ChassisAnimationElements,
    deltaTime: number,
    chassis?: Mesh
): void {
    if (!animationElements.animationTime) {
        animationElements.animationTime = 0;
    }
    animationElements.animationTime += deltaTime;
    const time = animationElements.animationTime;

    // Stealth анимация - применяется к корпусу
    if (animationElements.stealthActive && chassis) {
        updateStealthAnimation(chassis, time);
    }

    // Hover анимация - всегда активна для hover корпусов
    if (animationElements.hoverThrusters && animationElements.hoverThrusters.length > 0) {
        updateHoverAnimation(animationElements.hoverThrusters, time);
    }

    // Shield анимация
    if (animationElements.shieldActive && animationElements.shieldMesh) {
        updateShieldAnimation(animationElements.shieldMesh, time);
    }

    // Drone анимация - нужна позиция корпуса
    if (animationElements.droneMeshes && animationElements.droneMeshes.length > 0 && chassis) {
        const basePos = chassis.getAbsolutePosition();
        updateDroneAnimation(animationElements.droneMeshes, { x: basePos.x, y: basePos.y, z: basePos.z }, time);
    }

    // Command анимация
    if (animationElements.commandAura) {
        updateCommandAnimation(animationElements.commandAura, time);
    }
}

function updateStealthAnimation(chassis: Mesh, time: number): void {
    if (!chassis || chassis.isDisposed()) return;
    const mat = chassis.material as StandardMaterial;
    if (mat) {
        // Плавное мигание прозрачности для эффекта невидимости
        const opacity = 0.3 + Math.sin(time * 2) * 0.2;
        mat.alpha = Math.max(0.1, Math.min(0.5, opacity));
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
    if (!shieldMesh || shieldMesh.isDisposed()) return;
    // Плавное вращение и пульсация щита
    shieldMesh.rotation.y = time * 0.5;
    const pulseScale = 1 + Math.sin(time * 2) * 0.05;
    shieldMesh.scaling.setAll(pulseScale);
    
    // Пульсация цвета (если есть материал)
    if (shieldMesh.material) {
        const mat = shieldMesh.material as StandardMaterial;
        if (mat.emissiveColor) {
            const intensity = 0.25 + Math.sin(time * 3) * 0.15;
            mat.emissiveColor.set(intensity, intensity * 0.5, intensity * 0.25);
        }
    }
}

function updateDroneAnimation(drones: Mesh[], basePosition: { x: number; y: number; z: number }, time: number): void {
    if (!drones || drones.length === 0) return;
    
    drones.forEach((drone, index) => {
        if (drone.isDisposed()) return;
        
        // Орбитальное движение вокруг базы
        const angle = (time * 0.5 + index * Math.PI * 2 / drones.length) % (Math.PI * 2);
        const radius = 2;
        
        drone.position.x = basePosition.x + Math.cos(angle) * radius;
        drone.position.z = basePosition.z + Math.sin(angle) * radius;
        drone.position.y = basePosition.y + 2 + Math.sin(time * 2 + index) * 0.5;
        
        // Вращение дрона
        drone.rotation.y += 0.1;
        drone.rotation.x = Math.sin(time * 3 + index) * 0.2;
    });
}

function updateCommandAnimation(aura: Mesh, time: number): void {
    if (!aura || aura.isDisposed()) return;
    // Медленное вращение и пульсация ауры
    aura.rotation.y = time * 0.3;
    const pulseScale = 1 + Math.sin(time * 1.5) * 0.15;
    aura.scaling.setAll(pulseScale);
    
    // Пульсация свечения (если есть материал)
    if (aura.material) {
        const mat = aura.material as StandardMaterial;
        if (mat.emissiveColor) {
            const intensity = 0.4 + Math.sin(time * 2) * 0.2;
            mat.emissiveColor.set(intensity, intensity * 0.9, 0);
        }
    }
}

/**
 * Активирует специальную способность
 */
export function activateSpecialAbility(
    abilityType: "stealth" | "hover" | "shield" | "drone" | "command",
    animationElements: ChassisAnimationElements,
    scene: Scene,
    chassisType: ChassisType,
    chassis?: Mesh,
    callbacks?: AbilityCallbacks
): {
    success: boolean;
    cooldown: number; // Время кулдауна в мс
    duration: number; // Длительность действия в мс
} {
    switch (abilityType) {
        case "stealth":
            if (animationElements.stealthActive) {
                return { success: false, cooldown: 0, duration: 0 };
            }
            animationElements.stealthActive = true;
            if (callbacks?.onEffectStart) {
                callbacks.onEffectStart("Невидимость", "👁️", "#333", 5000);
            }
            if (callbacks?.onMessage) {
                callbacks.onMessage("👁️ Невидимость активирована!", "success");
            }
            // Деактивируется через 5 секунд
            setTimeout(() => {
                animationElements.stealthActive = false;
                if (chassis && !chassis.isDisposed()) {
                    const mat = chassis.material as StandardMaterial;
                    if (mat) mat.alpha = 1.0;
                }
                if (callbacks?.onEffectEnd) {
                    callbacks.onEffectEnd("Невидимость");
                }
            }, 5000);
            return { success: true, cooldown: 20000, duration: 5000 };
            
        case "shield":
            if (animationElements.shieldActive) {
                return { success: false, cooldown: 0, duration: 0 };
            }
            animationElements.shieldActive = true;
            
            // Создаём визуальный щит
            if (chassis && !chassis.isDisposed()) {
                const shield = MeshBuilder.CreateBox("energyShield", { width: chassisType.width * 1.5, height: chassisType.width * 1.5, depth: chassisType.width * 1.5 }, scene);
                const chassisPos = chassis.getAbsolutePosition();
                shield.position = chassisPos.clone();
                shield.parent = chassis;
                
                const shieldMat = new StandardMaterial("energyShieldMat", scene);
                shieldMat.diffuseColor = new Color3(0, 1, 0.5);
                shieldMat.emissiveColor = new Color3(0, 0.5, 0.25);
                shieldMat.disableLighting = true;
                shieldMat.alpha = 0.7;
                shield.material = shieldMat;
                
                animationElements.shieldMesh = shield;
            }
            
            if (callbacks?.onEffectStart) {
                callbacks.onEffectStart("Энергощит", "🛡️", "#0f5", 8000);
            }
            if (callbacks?.onMessage) {
                callbacks.onMessage("🛡️ Энергощит активирован!", "success");
            }
            
            // Деактивируется через 8 секунд
            setTimeout(() => {
                animationElements.shieldActive = false;
                if (animationElements.shieldMesh && !animationElements.shieldMesh.isDisposed()) {
                    animationElements.shieldMesh.dispose();
                    animationElements.shieldMesh = undefined;
                }
                if (callbacks?.onEffectEnd) {
                    callbacks.onEffectEnd("Энергощит");
                }
            }, 8000);
            return { success: true, cooldown: 30000, duration: 8000 };
            
        case "drone":
            // Создаём дроны
            if (!animationElements.droneMeshes) {
                animationElements.droneMeshes = [];
            }
            
            if (chassis && !chassis.isDisposed()) {
                const chassisPos = chassis.getAbsolutePosition();
                for (let i = 0; i < 2; i++) {
                    const drone = MeshBuilder.CreateBox(`drone${i}`, { 
                        width: 0.3, 
                        height: 0.2, 
                        depth: 0.3 
                    }, scene);
                    drone.position = chassisPos.clone();
                    drone.position.y += 2;
                    drone.position.x += (i === 0 ? -1 : 1) * 1.5;
                    
                    const droneMat = new StandardMaterial(`droneMat${i}`, scene);
                    droneMat.diffuseColor = new Color3(0.5, 0, 1);
                    droneMat.emissiveColor = new Color3(0.3, 0, 0.6);
                    droneMat.disableLighting = true;
                    drone.material = droneMat;
                    
                    animationElements.droneMeshes.push(drone);
                }
            }
            
            if (callbacks?.onEffectStart) {
                callbacks.onEffectStart("Дроны", "🚁", "#a0f", 15000);
            }
            if (callbacks?.onMessage) {
                callbacks.onMessage("🚁 Боевые дроны выпущены!", "success");
            }
            
            // Дроны исчезают через 15 секунд
            setTimeout(() => {
                if (animationElements.droneMeshes) {
                    animationElements.droneMeshes.forEach(drone => {
                        if (!drone.isDisposed()) drone.dispose();
                    });
                    animationElements.droneMeshes = undefined;
                }
                if (callbacks?.onEffectEnd) {
                    callbacks.onEffectEnd("Дроны");
                }
            }, 15000);
            return { success: true, cooldown: 25000, duration: 15000 };
            
        case "command":
            // Создаём ауру командования
            if (chassis && !chassis.isDisposed()) {
                const aura = MeshBuilder.CreateBox("commandAura", { width: chassisType.width * 2, height: chassisType.width * 2, depth: chassisType.width * 2 }, scene);
                const chassisPos = chassis.getAbsolutePosition();
                aura.position = chassisPos.clone();
                aura.parent = chassis;
                
                const auraMat = new StandardMaterial("commandAuraMat", scene);
                auraMat.diffuseColor = new Color3(1, 0.9, 0);
                auraMat.emissiveColor = new Color3(0.4, 0.35, 0);
                auraMat.disableLighting = true;
                auraMat.alpha = 0.3;
                aura.material = auraMat;
                
                animationElements.commandAura = aura;
            }
            
            if (callbacks?.onEffectStart) {
                callbacks.onEffectStart("Командная аура", "⭐", "#ffd700", 10000);
            }
            if (callbacks?.onMessage) {
                callbacks.onMessage("⭐ Командная аура активирована! +20% урон, +15% скорость", "success");
            }
            
            // Аура исчезает через 10 секунд
            setTimeout(() => {
                if (animationElements.commandAura && !animationElements.commandAura.isDisposed()) {
                    animationElements.commandAura.dispose();
                    animationElements.commandAura = undefined;
                }
                if (callbacks?.onEffectEnd) {
                    callbacks.onEffectEnd("Командная аура");
                }
            }, 10000);
            return { success: true, cooldown: 20000, duration: 10000 };
            
        case "hover":
            // Hover всегда активен для hover корпусов, ничего не нужно активировать
            return { success: true, cooldown: 0, duration: Infinity };
            
        default:
            return { success: false, cooldown: 0, duration: 0 };
    }
}

/**
 * Деактивирует специальную способность
 */
export function deactivateSpecialAbility(
    abilityType: "stealth" | "hover" | "shield" | "drone" | "command",
    animationElements: ChassisAnimationElements,
    chassis?: Mesh,
    callbacks?: AbilityCallbacks
): void {
    switch (abilityType) {
        case "stealth":
            animationElements.stealthActive = false;
            if (chassis && !chassis.isDisposed()) {
                const mat = chassis.material as StandardMaterial;
                if (mat) mat.alpha = 1.0;
            }
            if (callbacks?.onEffectEnd) {
                callbacks.onEffectEnd("Невидимость");
            }
            break;
            
        case "shield":
            animationElements.shieldActive = false;
            if (animationElements.shieldMesh && !animationElements.shieldMesh.isDisposed()) {
                animationElements.shieldMesh.dispose();
                animationElements.shieldMesh = undefined;
            }
            if (callbacks?.onEffectEnd) {
                callbacks.onEffectEnd("Энергощит");
            }
            break;
            
        case "drone":
            if (animationElements.droneMeshes) {
                animationElements.droneMeshes.forEach(drone => {
                    if (!drone.isDisposed()) drone.dispose();
                });
                animationElements.droneMeshes = undefined;
            }
            if (callbacks?.onEffectEnd) {
                callbacks.onEffectEnd("Дроны");
            }
            break;
            
        case "command":
            if (animationElements.commandAura && !animationElements.commandAura.isDisposed()) {
                animationElements.commandAura.dispose();
                animationElements.commandAura = undefined;
            }
            if (callbacks?.onEffectEnd) {
                callbacks.onEffectEnd("Командная аура");
            }
            break;
            
        case "hover":
            // Hover не деактивируется, это постоянная способность корпуса
            break;
    }
}


