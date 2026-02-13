/**
 * Shared cannon and chassis animation runners.
 * Used by TankController, NetworkPlayerTank, and optionally EnemyTank.
 */

import { Mesh, StandardMaterial, Color3 } from "@babylonjs/core";
import type { CannonAnimationElements } from "./tankCannon";
import type { ChassisAnimationElements } from "./tankChassis";

/**
 * Run cannon animation logic (gatling, sniper, tesla, plasma, etc.).
 * deltaTime in seconds.
 */
export function runCannonAnimations(
    cannonElements: CannonAnimationElements,
    barrel: Mesh | null,
    cannonTypeId: string,
    deltaTime: number
): void {
    if (!cannonElements || !barrel || barrel.isDisposed()) return;

    if (!cannonElements.animationTime) cannonElements.animationTime = 0;
    cannonElements.animationTime += deltaTime;
    const time = cannonElements.animationTime;

    if (cannonElements.gatlingBarrels) {
        const rotationSpeed = 10;
        const gatlingBarrels = cannonElements.gatlingBarrels;
        for (let i = 0; i < gatlingBarrels.length; i++) {
            const b = gatlingBarrels[i];
            if (b && !b.isDisposed()) b.rotation.z += rotationSpeed * deltaTime;
        }
    }
    if (cannonElements.gatlingPowerBlock && !cannonElements.gatlingPowerBlock.isDisposed()) {
        const powerBlock = cannonElements.gatlingPowerBlock;
        const pulse = Math.sin(time * 2) * 0.05 + 1.0;
        powerBlock.scaling.setAll(pulse);
        const mat = powerBlock.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor.set((Math.sin(time * 2) + 1) * 0.05, (Math.sin(time * 2) + 1) * 0.05, (Math.sin(time * 2) + 1) * 0.05);
    }
    if (cannonElements.sniperLens && !cannonElements.sniperLens.isDisposed()) {
        const lens = cannonElements.sniperLens;
        const pulse = Math.sin(time * 1.5) * 0.1 + 1.0;
        lens.scaling.setAll(pulse);
        const mat = lens.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor.set((Math.sin(time * 1.5) + 1) * 0.05, (Math.sin(time * 1.5) + 1) * 0.1, (Math.sin(time * 1.5) + 1) * 0.15);
    }
    if (cannonElements.teslaCoils) {
        for (let i = 0; i < cannonElements.teslaCoils.length; i++) {
            const coil = cannonElements.teslaCoils[i];
            if (coil && !coil.isDisposed()) {
                const pulse = Math.sin(time * 3 + i * 0.5) * 0.15 + 1.0;
                coil.scaling.setAll(pulse);
                coil.rotation.y += deltaTime * (2.5 + i * 0.3);
                const mat = coil.material as StandardMaterial;
                if (mat?.emissiveColor) mat.emissiveColor = new Color3(0, 0.4 * ((Math.sin(time * 3 + i * 0.5) + 1) * 0.5), 0.5 * ((Math.sin(time * 3 + i * 0.5) + 1) * 0.5));
            }
        }
    }
    if (cannonElements.teslaGen && !cannonElements.teslaGen.isDisposed()) {
        const gen = cannonElements.teslaGen;
        const pulse = Math.sin(time * 5) * 0.2 + 1.0;
        gen.scaling.setAll(pulse);
        gen.rotation.y += deltaTime * 4;
        gen.rotation.x += deltaTime * 3;
        const mat = gen.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0, 0.5 * ((Math.sin(time * 5) + 1) * 0.5), 0.7 * ((Math.sin(time * 5) + 1) * 0.5));
    }
    if (cannonElements.railgunCapacitors) {
        for (let i = 0; i < cannonElements.railgunCapacitors.length; i++) {
            const cap = cannonElements.railgunCapacitors[i];
            if (cap && !cap.isDisposed()) {
                const pulse = Math.sin(time * 2 + i * 0.6) * 0.1 + 1.0;
                cap.scaling.setAll(pulse);
                const mat = cap.material as StandardMaterial;
                const intensity = (Math.sin(time * 2 + i * 0.6) + 1) * 0.5;
                if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.05 * intensity, 0.15 * intensity, 0.5 * intensity);
            }
        }
    }
    if (cannonElements.plasmaCore && !cannonElements.plasmaCore.isDisposed()) {
        const core = cannonElements.plasmaCore;
        const pulse = Math.sin(time * 4) * 0.2 + 1.0;
        core.scaling.setAll(pulse);
        core.rotation.y += deltaTime * 3;
        core.rotation.x += deltaTime * 2;
        const mat = core.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.6 * ((Math.sin(time * 4) + 1) * 0.5), 0, 0.6 * ((Math.sin(time * 4) + 1) * 0.5));
    }
    if (cannonElements.plasmaCoils) {
        for (let i = 0; i < cannonElements.plasmaCoils.length; i++) {
            const coil = cannonElements.plasmaCoils[i];
            if (coil && !coil.isDisposed()) {
                coil.rotation.y += deltaTime * (2 + i * 0.5);
                const pulse = Math.sin(time * 3 + i * 0.8) * 0.1 + 1.0;
                coil.scaling.setAll(pulse);
                const mat = coil.material as StandardMaterial;
                if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.4 * ((Math.sin(time * 3 + i * 0.8) + 1) * 0.5), 0, 0.4 * ((Math.sin(time * 3 + i * 0.8) + 1) * 0.5));
            }
        }
    }
    if (cannonElements.laserLens && !cannonElements.laserLens.isDisposed()) {
        const lens = cannonElements.laserLens;
        const flicker = Math.sin(time * 8) * 0.15 + 1.0;
        lens.scaling.setAll(flicker);
        const mat = lens.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.4 * ((Math.sin(time * 8) + 1) * 0.5), 0, 0);
    }
    if (cannonElements.laserRings) {
        for (let i = 0; i < cannonElements.laserRings.length; i++) {
            const ring = cannonElements.laserRings[i];
            if (ring && !ring.isDisposed()) {
                ring.rotation.y += deltaTime * (1.5 + i * 0.3);
                ring.scaling.setAll(Math.sin(time * 5 + i * 0.5) * 0.08 + 1.0);
            }
        }
    }
    if (cannonElements.vortexRings) {
        for (let i = 0; i < cannonElements.vortexRings.length; i++) {
            const ring = cannonElements.vortexRings[i];
            if (ring && !ring.isDisposed()) {
                const speed = (i + 1) * 2.5;
                ring.rotation.x += deltaTime * speed;
                ring.rotation.z += deltaTime * speed * 0.5;
                ring.scaling.setAll(Math.sin(time * 2 + i * 0.8) * 0.1 + 1.0);
                const mat = ring.material as StandardMaterial;
                if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.1 * ((Math.sin(time * 2 + i * 0.8) + 1) * 0.5), 0.05 * ((Math.sin(time * 2 + i * 0.8) + 1) * 0.5), 0.2 * ((Math.sin(time * 2 + i * 0.8) + 1) * 0.5));
            }
        }
    }
    if (cannonElements.vortexGen && !cannonElements.vortexGen.isDisposed()) {
        const gen = cannonElements.vortexGen;
        gen.scaling.setAll(Math.sin(time * 3) * 0.2 + 1.0);
        gen.rotation.y += deltaTime * 4;
        gen.rotation.x += deltaTime * 3;
        const mat = gen.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.15 * ((Math.sin(time * 3) + 1) * 0.5), 0.075 * ((Math.sin(time * 3) + 1) * 0.5), 0.25 * ((Math.sin(time * 3) + 1) * 0.5));
    }
    if (cannonElements.supportEmitter && !cannonElements.supportEmitter.isDisposed()) {
        const emitter = cannonElements.supportEmitter;
        emitter.scaling.setAll(Math.sin(time * 3) * 0.15 + 1.0);
        emitter.rotation.y += deltaTime * 2;
        const mat = emitter.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0, 0.4 * ((Math.sin(time * 3) + 1) * 0.5), 0.2 * ((Math.sin(time * 3) + 1) * 0.5));
    }
    if (cannonElements.supportRings) {
        for (let i = 0; i < cannonElements.supportRings.length; i++) {
            const ring = cannonElements.supportRings[i];
            if (ring && !ring.isDisposed()) {
                ring.rotation.y += deltaTime * (3 + i * 1);
                ring.scaling.setAll(Math.sin(time * 4 + i * 0.5) * 0.1 + 1.0);
            }
        }
    }
    if (cannonElements.repairGen && !cannonElements.repairGen.isDisposed()) {
        const gen = cannonElements.repairGen;
        gen.scaling.setAll(Math.sin(time * 2.5) * 0.15 + 1.0);
        gen.rotation.y += deltaTime * 3;
        gen.rotation.x += deltaTime * 2;
    }
    if (cannonElements.rocketTube && !cannonElements.rocketTube.isDisposed()) cannonElements.rocketTube.scaling.y = Math.sin(time * 2) * 0.05 + 1.0;
    if (cannonElements.mortarBase && !cannonElements.mortarBase.isDisposed()) cannonElements.mortarBase.rotation.z = Math.sin(time * 5) * 0.02;
    if (cannonElements.clusterTubes) {
        for (let i = 0; i < cannonElements.clusterTubes.length; i++) {
            const tube = cannonElements.clusterTubes[i];
            if (tube && !tube.isDisposed()) tube.rotation.z += deltaTime * (2 + i * 0.5);
        }
    }
    if (cannonElements.acidTank && !cannonElements.acidTank.isDisposed()) {
        const tank = cannonElements.acidTank;
        tank.scaling.y = Math.sin(time * 1.5) * 0.1 + 1.0;
        tank.rotation.y += deltaTime * 0.5;
        const mat = tank.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.05 * ((Math.sin(time * 1.5) + 1) * 0.5), 0.2 * ((Math.sin(time * 1.5) + 1) * 0.5), 0.05 * ((Math.sin(time * 1.5) + 1) * 0.5));
    }
    if (cannonElements.freezeFins) {
        for (let i = 0; i < cannonElements.freezeFins.length; i++) {
            const fin = cannonElements.freezeFins[i];
            if (fin && !fin.isDisposed()) {
                fin.rotation.x = Math.sin(time * 4 + i * 0.5) * 0.05;
                const mat = fin.material as StandardMaterial;
                if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.05 * ((Math.sin(time * 4 + i * 0.5) + 1) * 0.5), 0.1 * ((Math.sin(time * 4 + i * 0.5) + 1) * 0.5), 0.15 * ((Math.sin(time * 4 + i * 0.5) + 1) * 0.5));
            }
        }
    }
    if (cannonElements.cryoTank && !cannonElements.cryoTank.isDisposed()) {
        const cryo = cannonElements.cryoTank;
        cryo.scaling.setAll(Math.sin(time * 2) * 0.1 + 1.0);
        cryo.rotation.y += deltaTime * 1;
    }
    if (cannonElements.poisonInjector && !cannonElements.poisonInjector.isDisposed()) {
        const injector = cannonElements.poisonInjector;
        injector.scaling.setAll(Math.sin(time * 3) * 0.1 + 1.0);
        injector.rotation.y += deltaTime * 2;
    }
    if (cannonElements.empDish && !cannonElements.empDish.isDisposed()) {
        const dish = cannonElements.empDish;
        dish.rotation.y += deltaTime * 1.5;
        dish.scaling.setAll(Math.sin(time * 3) * 0.1 + 1.0);
    }
    if (cannonElements.empCoils) {
        for (let i = 0; i < cannonElements.empCoils.length; i++) {
            const coil = cannonElements.empCoils[i];
            if (coil && !coil.isDisposed()) {
                coil.rotation.y += deltaTime * (2 + i * 0.5);
                coil.scaling.setAll(Math.sin(time * 3 + i * 0.6) * 0.1 + 1.0);
            }
        }
    }
    if (cannonElements.empGen && !cannonElements.empGen.isDisposed()) {
        const gen = cannonElements.empGen;
        gen.scaling.setAll(Math.sin(time * 4) * 0.15 + 1.0);
        gen.rotation.y += deltaTime * 3;
        gen.rotation.x += deltaTime * 2;
        const mat = gen.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.25 * ((Math.sin(time * 4) + 1) * 0.5), 0.25 * ((Math.sin(time * 4) + 1) * 0.5), 0.075 * ((Math.sin(time * 4) + 1) * 0.5));
    }
    if (cannonElements.rocketGuides) {
        for (let i = 0; i < cannonElements.rocketGuides.length; i++) {
            const guide = cannonElements.rocketGuides[i];
            if (guide && !guide.isDisposed()) guide.scaling.setAll(Math.sin(time * 2 + i * 0.3) * 0.05 + 1.0);
        }
    }
    if (cannonElements.flamethrowerNozzle && !cannonElements.flamethrowerNozzle.isDisposed()) {
        const nozzle = cannonElements.flamethrowerNozzle;
        nozzle.scaling.setAll(Math.sin(time * 5) * 0.1 + 1.0);
        const mat = nozzle.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.15 * ((Math.sin(time * 5) + 1) * 0.5), 0.05 * ((Math.sin(time * 5) + 1) * 0.5), 0);
    }
    if (cannonElements.shotgunBarrels) {
        for (let i = 0; i < cannonElements.shotgunBarrels.length; i++) {
            const b = cannonElements.shotgunBarrels[i];
            if (b && !b.isDisposed()) b.rotation.z += deltaTime * (1 + i * 0.1);
        }
    }
    if (cannonElements.multishotBarrels) {
        for (let i = 0; i < cannonElements.multishotBarrels.length; i++) {
            const b = cannonElements.multishotBarrels[i];
            if (b && !b.isDisposed()) b.rotation.z += deltaTime * (1 + i * 0.3);
        }
    }
    if (cannonElements.homingGuidance && !cannonElements.homingGuidance.isDisposed()) {
        const guidance = cannonElements.homingGuidance;
        guidance.scaling.setAll(Math.sin(time * 4) * 0.1 + 1.0);
        guidance.rotation.y += deltaTime * 3;
        const mat = guidance.material as StandardMaterial;
        if (mat?.diffuseColor) mat.diffuseColor = new Color3(0.2, 0.8 * ((Math.sin(time * 4) + 1) * 0.5), 0.2 * ((Math.sin(time * 4) + 1) * 0.5));
    }
    if (cannonElements.piercingTip && !cannonElements.piercingTip.isDisposed()) cannonElements.piercingTip.rotation.y += deltaTime * 5;
    if (cannonElements.shockwaveAmp && !cannonElements.shockwaveAmp.isDisposed()) {
        const amp = cannonElements.shockwaveAmp;
        amp.scaling.setAll(Math.sin(time * 2.5) * 0.15 + 1.0);
    }
    if (cannonElements.beamFocuser && !cannonElements.beamFocuser.isDisposed()) {
        const focuser = cannonElements.beamFocuser;
        focuser.rotation.y += deltaTime * 4;
        focuser.scaling.setAll(Math.sin(time * 5) * 0.1 + 1.0);
        const mat = focuser.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.2 * ((Math.sin(time * 5) + 1) * 0.5), 0.1 * ((Math.sin(time * 5) + 1) * 0.5), 0);
    }
    if (cannonElements.beamLenses) {
        for (let i = 0; i < cannonElements.beamLenses.length; i++) {
            const lens = cannonElements.beamLenses[i];
            if (lens && !lens.isDisposed()) {
                lens.rotation.y += deltaTime * (2 + i * 0.5);
                lens.scaling.setAll(Math.sin(time * 4 + i * 0.3) * 0.05 + 1.0);
            }
        }
    }
    if (barrel && !barrel.isDisposed() && ["standard", "rapid", "heavy", "sniper", "explosive", "flamethrower", "poison", "shotgun"].includes(cannonTypeId)) {
        barrel.scaling.y = Math.sin(time * 0.5) * 0.01 + 1.0;
    }
}

/**
 * Run chassis animation logic (stealth, hover, shield, drone, command).
 * deltaTime in seconds.
 */
export function runChassisAnimations(
    chassisElements: ChassisAnimationElements,
    chassis: Mesh | null,
    deltaTime: number
): void {
    if (!chassisElements || !chassis || chassis.isDisposed()) return;

    if (!chassisElements.animationTime) chassisElements.animationTime = 0;
    chassisElements.animationTime += deltaTime;
    const time = chassisElements.animationTime;

    if (chassisElements.stealthMesh && !chassisElements.stealthMesh.isDisposed()) {
        const gen = chassisElements.stealthMesh;
        gen.scaling.setAll(Math.sin(time * 2) * 0.1 + 1.0);
        gen.rotation.y += deltaTime * 2;
        const mat = gen.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.1 * ((Math.sin(time * 2) + 1) * 0.5), 0.1 * ((Math.sin(time * 2) + 1) * 0.5), 0.1 * ((Math.sin(time * 2) + 1) * 0.5));
    }
    if (chassisElements.hoverThrusters) {
        for (let i = 0; i < chassisElements.hoverThrusters.length; i++) {
            const thruster = chassisElements.hoverThrusters[i];
            if (thruster && !thruster.isDisposed()) {
                thruster.scaling.setAll(Math.sin(time * 3 + i * 0.5) * 0.15 + 1.0);
                const mat = thruster.material as StandardMaterial;
                if (mat?.emissiveColor) mat.emissiveColor = new Color3(0, 0.3 * ((Math.sin(time * 3 + i * 0.5) + 1) * 0.5), 0.6 * ((Math.sin(time * 3 + i * 0.5) + 1) * 0.5));
            }
        }
    }
    if (chassisElements.shieldMesh && !chassisElements.shieldMesh.isDisposed()) {
        const gen = chassisElements.shieldMesh;
        gen.scaling.setAll(Math.sin(time * 2.5) * 0.12 + 1.0);
        gen.rotation.y += deltaTime * 3;
        gen.rotation.x += deltaTime * 2;
        const mat = gen.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0, 0.5 * ((Math.sin(time * 2.5) + 1) * 0.5), 0.25 * ((Math.sin(time * 2.5) + 1) * 0.5));
    }
    if (chassisElements.droneMeshes) {
        for (let i = 0; i < chassisElements.droneMeshes.length; i++) {
            const platform = chassisElements.droneMeshes[i];
            if (platform && !platform.isDisposed()) {
                platform.scaling.setAll(Math.sin(time * 2 + i * 0.8) * 0.1 + 1.0);
                platform.rotation.y += deltaTime * (1 + i * 0.5);
                const mat = platform.material as StandardMaterial;
                if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.3 * ((Math.sin(time * 2 + i * 0.8) + 1) * 0.5), 0, 0.6 * ((Math.sin(time * 2 + i * 0.8) + 1) * 0.5));
            }
        }
    }
    if (chassisElements.commandAura && !chassisElements.commandAura.isDisposed()) {
        const aura = chassisElements.commandAura;
        aura.rotation.y += deltaTime * 1.5;
        aura.scaling.setAll(Math.sin(time * 1.5) * 0.08 + 1.0);
        const mat = aura.material as StandardMaterial;
        if (mat?.emissiveColor) mat.emissiveColor = new Color3(0.5 * ((Math.sin(time * 1.5) + 1) * 0.5), 0.42 * ((Math.sin(time * 1.5) + 1) * 0.5), 0);
    }
}
