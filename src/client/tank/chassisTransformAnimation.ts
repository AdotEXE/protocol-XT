/**
 * Chassis Transformation Animation Module
 * Анимация трансформации корпуса танка при смене оборудования
 * 
 * 3 фазы анимации (общая длительность 1.5 секунды):
 * 1. Разборка (0-0.5 сек) - корпус разлетается на части
 * 2. Трансформация (0.5-1.0 сек) - части меняют размер, цвет, детали появляются/исчезают
 * 3. Сборка (1.0-1.5 сек) - части собираются в новый корпус
 * 
 * Включает трансформацию корпуса, пушки и гусениц
 */

import { 
    Scene, 
    Mesh, 
    MeshBuilder, 
    Vector3, 
    Color3, 
    StandardMaterial, 
    Quaternion,
    Animation,
    ParticleSystem,
    Texture,
    Color4,
    PhysicsBody,
    PhysicsShape,
    PhysicsShapeType,
    PhysicsMotionType
} from "@babylonjs/core";
import { ChassisType, getChassisById } from "../tankTypes";
import { ChassisDetailsGenerator } from "../garage/chassisDetails";
import { MaterialFactory } from "../garage/materials";
import { createUniqueChassis, ChassisAnimationElements } from "./tankChassis";
import { getSkinById, loadSelectedSkin, applySkinToTank } from "./tankSkins";
import { getCannonById, type CannonType } from "../tankTypes";
import { getTrackById, type TrackType } from "../trackTypes";

interface TransformPart {
    mesh: Mesh;
    startPos: Vector3;
    endPos: Vector3;
    scatteredPos: Vector3;
    startScale: Vector3;
    endScale: Vector3;
    startColor: Color3;
    endColor: Color3;
    shouldFadeOut: boolean;
    shouldFadeIn: boolean;
    originalMaterial: StandardMaterial | null;
    physicsBody?: PhysicsBody | null; // Физическое тело для падения
    hasPhysics: boolean; // Флаг, что часть имеет физику
}

export class ChassisTransformAnimation {
    private scene: Scene;
    private parts: TransformPart[] = [];
    private duration: number = 1500; // 1.5 секунды в мс
    private startTime: number = 0;
    private isRunning: boolean = false;
    private onCompleteCallback: (() => void) | null = null;
    
    // Particle system for effects
    private particleSystem: ParticleSystem | null = null;
    
    // Фазы анимации
    private readonly PHASE_DISASSEMBLY_END = 500; // 0-0.5 сек
    private readonly PHASE_TRANSFORM_END = 1000; // 0.5-1.0 сек
    private readonly PHASE_ASSEMBLY_END = 1500; // 1.0-1.5 сек
    
    // Корпуса с детализацией
    private readonly DETAILED_CHASSIS = ["light", "medium", "racer", "scout"];
    
    constructor(scene: Scene) {
        this.scene = scene;
    }
    
    /**
     * Запускает анимацию трансформации корпуса, пушки и гусениц
     */
    start(
        oldChassis: Mesh,
        oldChassisType: ChassisType,
        newChassisType: ChassisType,
        turret: Mesh,
        barrel: Mesh,
        oldCannonType?: CannonType,
        newCannonType?: CannonType,
        oldTrackType?: TrackType,
        newTrackType?: TrackType,
        leftTrack?: Mesh | null,
        rightTrack?: Mesh | null,
        onComplete?: () => void
    ): void {
        if (this.isRunning) {
            console.warn("[ChassisTransform] Animation already running!");
            return;
        }
        
        this.onCompleteCallback = onComplete || null;
        this.isRunning = true;
        this.startTime = performance.now();
        this.parts = [];
        
        console.log(`[ChassisTransform] Starting transformation: ${oldChassisType.id} -> ${newChassisType.id}`);
        
        // Получаем цвета (учитываем скин)
        const oldColor = this.getChassisColor(oldChassisType);
        const newColor = this.getChassisColor(newChassisType);
        
        // Получаем базовую позицию танка
        const basePos = oldChassis.position.clone();
        
        // 1. Создаем части из старого корпуса
        this.createPartsFromChassis(oldChassis, oldChassisType, oldColor, basePos);
        
        // 2. Добавляем пушку в анимацию
        if (barrel && oldCannonType && newCannonType) {
            this.addCannonToAnimation(barrel, oldCannonType, newCannonType, basePos);
        }
        
        // 3. Добавляем гусеницы в анимацию
        if (leftTrack && rightTrack && oldTrackType && newTrackType) {
            this.addTracksToAnimation(leftTrack, rightTrack, oldTrackType, newTrackType, basePos);
        }
        
        // 4. Вычисляем целевые параметры для нового корпуса
        this.calculateTargetParams(newChassisType, newColor, basePos);
        
        // 5. Создаем новые детали, если нужно (для перехода с простого на детальный)
        this.createNewDetailsIfNeeded(oldChassisType, newChassisType, newColor, basePos);
        
        // 6. Отсоединяем башню и ствол временно
        if (turret) {
            turret.setParent(null);
            turret.position = basePos.clone();
            turret.position.y += oldChassisType.height * 0.5;
        }
        if (barrel) {
            barrel.setParent(null);
            const barrelPos = barrel.getAbsolutePosition();
            barrel.position = barrelPos.clone();
        }
        if (leftTrack) {
            leftTrack.setParent(null);
            const leftPos = leftTrack.getAbsolutePosition();
            leftTrack.position = leftPos.clone();
        }
        if (rightTrack) {
            rightTrack.setParent(null);
            const rightPos = rightTrack.getAbsolutePosition();
            rightTrack.position = rightPos.clone();
        }
        
        // 7. Запускаем эффекты частиц
        this.startParticleEffects(basePos);
        
        // 8. Скрываем оригинальный корпус (НЕ меняем позицию!)
        // КРИТИЧНО: Сохраняем позицию перед скрытием, чтобы она не потерялась
        const savedChassisPos = oldChassis.position.clone();
        oldChassis.setEnabled(false);
        // Восстанавливаем позицию после скрытия (на случай если setEnabled меняет позицию)
        oldChassis.position.copyFrom(savedChassisPos);
        
        // 9. Запускаем цикл анимации
        this.runAnimationLoop(oldChassis, newChassisType, turret, barrel, basePos);
    }
    
    /**
     * Получает цвет корпуса с учетом выбранного скина
     */
    private getChassisColor(chassisType: ChassisType): Color3 {
        const selectedSkinId = loadSelectedSkin();
        if (selectedSkinId) {
            const skin = getSkinById(selectedSkinId);
            if (skin) {
                const skinColors = applySkinToTank(skin);
                return skinColors.chassisColor;
            }
        }
        return Color3.FromHexString(chassisType.color);
    }
    
    /**
     * Создает части из существующего корпуса
     */
    private createPartsFromChassis(
        chassis: Mesh,
        chassisType: ChassisType,
        color: Color3,
        basePos: Vector3
    ): void {
        // Основной корпус - разделяем на несколько частей для эффекта разлёта
        const w = chassisType.width;
        const h = chassisType.height;
        const d = chassisType.depth;
        
        // Создаём 12-16 частей корпуса разного размера
        const partCount = 12 + Math.floor(Math.random() * 5); // 12-16 частей
        const offsets: Vector3[] = [];
        
        // Генерируем случайные позиции для частей
        for (let i = 0; i < partCount; i++) {
            const x = (Math.random() - 0.5) * w * 0.8;
            const y = (Math.random() - 0.5) * h * 0.8;
            const z = (Math.random() - 0.5) * d * 0.8;
            offsets.push(new Vector3(x, y, z));
        }
        
        for (let i = 0; i < offsets.length; i++) {
            const offset = offsets[i]!;
            
            // Каждая часть имеет случайный размер (от 0.2 до 0.6 от базового размера)
            const sizeMultiplier = 0.2 + Math.random() * 0.4; // 0.2 - 0.6
            const partSize = {
                width: w * sizeMultiplier * (0.5 + Math.random() * 0.5), // 0.5-1.0 от размера
                height: h * sizeMultiplier * (0.5 + Math.random() * 0.5),
                depth: d * sizeMultiplier * (0.5 + Math.random() * 0.5)
            };
            
            // Минимальные размеры для стабильности физики
            partSize.width = Math.max(partSize.width, 0.1);
            partSize.height = Math.max(partSize.height, 0.1);
            partSize.depth = Math.max(partSize.depth, 0.1);
            
            const part = MeshBuilder.CreateBox(`transformPart_${i}`, partSize, this.scene);
            part.position = basePos.add(offset);
            
            const mat = new StandardMaterial(`transformPartMat_${i}`, this.scene);
            mat.diffuseColor = color.clone();
            mat.specularColor = Color3.Black();
            part.material = mat;
            
            // Вычисляем позицию разлёта
            const scatterDir = offset.normalize();
            const scatterDist = 2 + Math.random() * 1.5;
            const scatteredPos = basePos.add(scatterDir.scale(scatterDist));
            scatteredPos.y += Math.random() * 1.5;
            
            // Создаём физическое тело для падения
            const physicsBody = new PhysicsBody(part, PhysicsMotionType.DYNAMIC, false, this.scene);
            const shape = new PhysicsShape({
                type: PhysicsShapeType.BOX,
                parameters: {
                    extents: new Vector3(partSize.width, partSize.height, partSize.depth)
                }
            }, this.scene);
            physicsBody.shape = shape;
            physicsBody.setMassProperties({ mass: 0.5 + Math.random() * 0.5 }); // Масса 0.5-1.0
            
            // Начальная скорость разлёта
            const scatterVelocity = scatterDir.scale(3 + Math.random() * 2); // Скорость разлёта
            scatterVelocity.y += 1 + Math.random() * 1.5; // Добавляем вертикальную скорость
            physicsBody.setLinearVelocity(scatterVelocity);
            
            // Добавляем случайное вращение
            const angularVelocity = new Vector3(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5
            );
            physicsBody.setAngularVelocity(angularVelocity);
            
            this.parts.push({
                mesh: part,
                startPos: basePos.add(offset),
                endPos: basePos.add(offset), // Будет обновлено позже
                scatteredPos: scatteredPos,
                startScale: new Vector3(1, 1, 1),
                endScale: new Vector3(1, 1, 1), // Будет обновлено позже
                startColor: color.clone(),
                endColor: color.clone(), // Будет обновлено позже
                shouldFadeOut: false,
                shouldFadeIn: false,
                originalMaterial: mat,
                physicsBody: physicsBody,
                hasPhysics: true
            });
        }
        
        // Добавляем дочерние детали корпуса, если они есть
        this.extractChildMeshes(chassis, color, basePos);
    }
    
    /**
     * Добавляет пушку в анимацию трансформации
     */
    private addCannonToAnimation(
        barrel: Mesh,
        oldCannonType: CannonType,
        newCannonType: CannonType,
        basePos: Vector3
    ): void {
        if (!barrel || barrel.isDisposed()) return;
        
        const worldPos = barrel.getAbsolutePosition();
        const oldColor = Color3.FromHexString(oldCannonType.color);
        const newColor = Color3.FromHexString(newCannonType.color);
        
        // Клонируем пушку для анимации
        const barrelClone = barrel.clone(`transformBarrel_${Date.now()}`, null);
        if (!barrelClone) return;
        
        barrelClone.setParent(null);
        barrelClone.position = worldPos.clone();
        
        // Случайная позиция разлёта
        const scatterDir = worldPos.subtract(basePos).normalize();
        if (scatterDir.length() < 0.1) {
            scatterDir.x = Math.random() - 0.5;
            scatterDir.y = 0.5 + Math.random() * 0.5;
            scatterDir.z = Math.random() - 0.5;
            scatterDir.normalize();
        }
        const scatterDist = 1.5 + Math.random() * 1;
        const scatteredPos = worldPos.add(scatterDir.scale(scatterDist));
        
        // Масштаб для новой пушки
        const oldScale = barrel.scaling.clone();
        const newScale = new Vector3(
            oldScale.x * (newCannonType.barrelWidth / oldCannonType.barrelWidth),
            oldScale.y * (newCannonType.barrelLength / oldCannonType.barrelLength),
            oldScale.z * (newCannonType.barrelWidth / oldCannonType.barrelWidth)
        );
        
        const mat = new StandardMaterial(`transformBarrelMat`, this.scene);
        mat.diffuseColor = oldColor.clone();
        mat.specularColor = Color3.Black();
        barrelClone.material = mat;
        
        this.parts.push({
            mesh: barrelClone,
            startPos: worldPos.clone(),
            endPos: worldPos.clone(), // Будет обновлено при сборке
            scatteredPos: scatteredPos,
            startScale: oldScale,
            endScale: newScale,
            startColor: oldColor,
            endColor: newColor,
            shouldFadeOut: false,
            shouldFadeIn: false,
            originalMaterial: mat,
            physicsBody: null,
            hasPhysics: false
        });
    }
    
    /**
     * Добавляет гусеницы в анимацию трансформации
     */
    private addTracksToAnimation(
        leftTrack: Mesh,
        rightTrack: Mesh,
        oldTrackType: TrackType,
        newTrackType: TrackType,
        basePos: Vector3
    ): void {
        const oldColor = Color3.FromHexString(oldTrackType.color);
        const newColor = Color3.FromHexString(newTrackType.color);
        
        // Левая гусеница
        if (leftTrack && !leftTrack.isDisposed()) {
            const leftWorldPos = leftTrack.getAbsolutePosition();
            const leftClone = leftTrack.clone(`transformLeftTrack_${Date.now()}`, null);
            if (leftClone) {
                leftClone.setParent(null);
                leftClone.position = leftWorldPos.clone();
                
                const scatterDir = leftWorldPos.subtract(basePos).normalize();
                if (scatterDir.length() < 0.1) {
                    scatterDir.x = -0.5;
                    scatterDir.y = -0.3;
                    scatterDir.z = Math.random() - 0.5;
                    scatterDir.normalize();
                }
                const scatterDist = 1 + Math.random() * 0.8;
                const scatteredPos = leftWorldPos.add(scatterDir.scale(scatterDist));
                
                const mat = new StandardMaterial(`transformLeftTrackMat`, this.scene);
                mat.diffuseColor = oldColor.clone();
                mat.specularColor = Color3.Black();
                leftClone.material = mat;
                
                this.parts.push({
                    mesh: leftClone,
                    startPos: leftWorldPos.clone(),
                    endPos: leftWorldPos.clone(),
                    scatteredPos: scatteredPos,
                    startScale: leftTrack.scaling.clone(),
                    endScale: leftTrack.scaling.clone(),
                    startColor: oldColor,
                    endColor: newColor,
                    shouldFadeOut: false,
                    shouldFadeIn: false,
                    originalMaterial: mat,
                    physicsBody: null,
                    hasPhysics: false
                });
            }
        }
        
        // Правая гусеница
        if (rightTrack && !rightTrack.isDisposed()) {
            const rightWorldPos = rightTrack.getAbsolutePosition();
            const rightClone = rightTrack.clone(`transformRightTrack_${Date.now()}`, null);
            if (rightClone) {
                rightClone.setParent(null);
                rightClone.position = rightWorldPos.clone();
                
                const scatterDir = rightWorldPos.subtract(basePos).normalize();
                if (scatterDir.length() < 0.1) {
                    scatterDir.x = 0.5;
                    scatterDir.y = -0.3;
                    scatterDir.z = Math.random() - 0.5;
                    scatterDir.normalize();
                }
                const scatterDist = 1 + Math.random() * 0.8;
                const scatteredPos = rightWorldPos.add(scatterDir.scale(scatterDist));
                
                const mat = new StandardMaterial(`transformRightTrackMat`, this.scene);
                mat.diffuseColor = oldColor.clone();
                mat.specularColor = Color3.Black();
                rightClone.material = mat;
                
                this.parts.push({
                    mesh: rightClone,
                    startPos: rightWorldPos.clone(),
                    endPos: rightWorldPos.clone(),
                    scatteredPos: scatteredPos,
                    startScale: rightTrack.scaling.clone(),
                    endScale: rightTrack.scaling.clone(),
                    startColor: oldColor,
                    endColor: newColor,
                    shouldFadeOut: false,
                    shouldFadeIn: false,
                    originalMaterial: mat,
                    physicsBody: null,
                    hasPhysics: false
                });
            }
        }
    }
    
    /**
     * Извлекает дочерние меши (детали) из корпуса
     */
    private extractChildMeshes(chassis: Mesh, color: Color3, basePos: Vector3): void {
        const children = chassis.getChildMeshes(false);
        
        for (const child of children) {
            if (child instanceof Mesh && child.name.includes("game") && !child.name.includes("turret") && !child.name.includes("barrel")) {
                // Клонируем для анимации
                const clone = child.clone(`transformDetail_${child.name}`, null);
                if (!clone) continue;
                
                clone.setParent(null);
                const worldPos = child.getAbsolutePosition();
                clone.position = worldPos.clone();
                
                // Случайная позиция разлёта
                const scatterDir = worldPos.subtract(basePos).normalize();
                if (scatterDir.length() < 0.1) {
                    scatterDir.x = Math.random() - 0.5;
                    scatterDir.z = Math.random() - 0.5;
                }
                const scatterDist = 1.5 + Math.random() * 1;
                const scatteredPos = worldPos.add(scatterDir.scale(scatterDist));
                scatteredPos.y += 0.5 + Math.random();
                
                // Копируем материал
                let detailColor = color.clone();
                if (child.material instanceof StandardMaterial) {
                    detailColor = child.material.diffuseColor.clone();
                }
                
                const mat = new StandardMaterial(`transformDetailMat_${child.name}`, this.scene);
                mat.diffuseColor = detailColor;
                mat.specularColor = Color3.Black();
                clone.material = mat;
                
                this.parts.push({
                    mesh: clone,
                    startPos: worldPos.clone(),
                    endPos: worldPos.clone(),
                    scatteredPos: scatteredPos,
                    startScale: clone.scaling.clone(),
                    endScale: clone.scaling.clone(),
                    startColor: detailColor,
                    endColor: detailColor,
                    shouldFadeOut: true, // Детали старого корпуса исчезают
                    shouldFadeIn: false,
                    originalMaterial: mat,
                    physicsBody: null,
                    hasPhysics: false
                });
            }
        }
    }
    
    /**
     * Вычисляет целевые параметры для нового корпуса
     */
    private calculateTargetParams(
        newChassisType: ChassisType,
        newColor: Color3,
        basePos: Vector3
    ): void {
        const newW = newChassisType.width;
        const newH = newChassisType.height;
        const newD = newChassisType.depth;
        
        // Пропорции для разных типов корпусов (из tankChassis.ts)
        const multipliers = this.getChassisMultipliers(newChassisType.id);
        
        // Находим все части с физикой (основные части корпуса)
        const mainParts = this.parts.filter(p => p.hasPhysics);
        
        // Генерируем новые случайные позиции для частей нового корпуса
        for (let i = 0; i < mainParts.length; i++) {
            const part = mainParts[i];
            if (!part) continue;
            
            // Генерируем случайную позицию в пределах нового корпуса
            const x = (Math.random() - 0.5) * newW * 0.8 * multipliers.w;
            const y = (Math.random() - 0.5) * newH * 0.8 * multipliers.h;
            const z = (Math.random() - 0.5) * newD * 0.8 * multipliers.d;
            const newOffset = new Vector3(x, y, z);
            
            part.endPos = basePos.add(newOffset);
            
            // Новый размер части (также случайный, но пропорциональный новому корпусу)
            const newSizeMultiplier = 0.2 + Math.random() * 0.4; // 0.2 - 0.6
            const newPartWidth = newW * newSizeMultiplier * (0.5 + Math.random() * 0.5);
            const newPartHeight = newH * newSizeMultiplier * (0.5 + Math.random() * 0.5);
            const newPartDepth = newD * newSizeMultiplier * (0.5 + Math.random() * 0.5);
            
            // Вычисляем масштаб относительно текущего размера части
            // Используем текущий масштаб части как базовый
            const currentScale = part.mesh.scaling;
            const currentBoundingBox = part.mesh.getBoundingInfo().boundingBox;
            const currentSize = currentBoundingBox.maximum.subtract(currentBoundingBox.minimum);
            
            // Вычисляем целевой масштаб
            const scaleX = (newPartWidth / Math.max(currentSize.x, 0.1)) * (1 / currentScale.x);
            const scaleY = (newPartHeight / Math.max(currentSize.y, 0.1)) * (1 / currentScale.y);
            const scaleZ = (newPartDepth / Math.max(currentSize.z, 0.1)) * (1 / currentScale.z);
            
            part.endScale = new Vector3(scaleX, scaleY, scaleZ);
            part.endColor = newColor.clone();
            part.shouldFadeOut = false;
        }
    }
    
    /**
     * Возвращает множители размеров для типа корпуса
     */
    private getChassisMultipliers(chassisId: string): { w: number, h: number, d: number } {
        switch (chassisId) {
            case "light": return { w: 0.75, h: 0.7, d: 1.2 };
            case "scout": return { w: 0.7, h: 0.65, d: 0.85 };
            case "heavy": return { w: 1.08, h: 1.2, d: 1.08 };
            case "assault": return { w: 1.12, h: 1.1, d: 1.05 };
            case "stealth": return { w: 1.05, h: 0.7, d: 1.15 };
            case "hover": return { w: 1.1, h: 0.95, d: 1.1 };
            case "siege": return { w: 1.25, h: 1.35, d: 1.2 };
            case "racer": return { w: 0.75, h: 0.55, d: 1.3 };
            case "amphibious": return { w: 1.15, h: 1.1, d: 1.1 };
            case "shield": return { w: 1.2, h: 1.1, d: 1.2 };
            case "drone": return { w: 1.1, h: 1.12, d: 1.05 };
            case "artillery": return { w: 1.2, h: 1.25, d: 1.15 };
            case "destroyer": return { w: 0.85, h: 0.75, d: 1.4 };
            case "command": return { w: 1.1, h: 1.2, d: 1.1 };
            default: return { w: 1.0, h: 1.0, d: 1.0 };
        }
    }
    
    /**
     * Создает новые детали, если нужно (переход на детальный корпус)
     */
    private createNewDetailsIfNeeded(
        oldChassisType: ChassisType,
        newChassisType: ChassisType,
        newColor: Color3,
        basePos: Vector3
    ): void {
        const oldHasDetails = this.DETAILED_CHASSIS.includes(oldChassisType.id);
        const newHasDetails = this.DETAILED_CHASSIS.includes(newChassisType.id);
        
        if (newHasDetails && !oldHasDetails) {
            // Нужно создать новые детали с fade-in
            // Создаём placeholder-части, которые появятся
            const detailCount = 10; // Примерное количество деталей
            
            for (let i = 0; i < detailCount; i++) {
                const size = 0.1 + Math.random() * 0.15;
                const detail = MeshBuilder.CreateBox(`newDetail_${i}`, {
                    width: size,
                    height: size * 0.5,
                    depth: size
                }, this.scene);
                
                // Начальная позиция - разбросана вокруг базы
                const angle = (i / detailCount) * Math.PI * 2;
                const radius = 2 + Math.random();
                const startPos = new Vector3(
                    basePos.x + Math.cos(angle) * radius,
                    basePos.y + 1 + Math.random(),
                    basePos.z + Math.sin(angle) * radius
                );
                detail.position = startPos.clone();
                
                // Конечная позиция - на корпусе
                const endOffset = new Vector3(
                    (Math.random() - 0.5) * newChassisType.width,
                    newChassisType.height * 0.3 + Math.random() * 0.2,
                    (Math.random() - 0.5) * newChassisType.depth
                );
                
                const mat = new StandardMaterial(`newDetailMat_${i}`, this.scene);
                mat.diffuseColor = newColor.clone();
                mat.specularColor = Color3.Black();
                mat.alpha = 0; // Начинаем с прозрачного
                detail.material = mat;
                
                this.parts.push({
                    mesh: detail,
                    startPos: startPos,
                    endPos: basePos.add(endOffset),
                    scatteredPos: startPos.clone(),
                    startScale: new Vector3(0.5, 0.5, 0.5),
                    endScale: new Vector3(1, 1, 1),
                    startColor: newColor.clone(),
                    endColor: newColor.clone(),
                    shouldFadeOut: false,
                    shouldFadeIn: true,
                    originalMaterial: mat,
                    physicsBody: null,
                    hasPhysics: false
                });
            }
        }
    }
    
    /**
     * Запускает систему частиц для визуальных эффектов
     */
    private startParticleEffects(position: Vector3): void {
        this.particleSystem = new ParticleSystem("transformParticles", 500, this.scene);
        
        // Текстура для частиц (используем стандартную)
        this.particleSystem.particleTexture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAADNJREFUeNpiYGBg+M8AAYxQhgHIJw5gDIZA2v//DAxMDCgAJHf/P0gMFTCiuJEJiIEAAQYAjvwHAVfkfhMAAAAASUVORK5CYII=", this.scene);
        
        this.particleSystem.emitter = position;
        this.particleSystem.minEmitBox = new Vector3(-1, 0, -1);
        this.particleSystem.maxEmitBox = new Vector3(1, 0.5, 1);
        
        this.particleSystem.color1 = new Color4(1, 0.8, 0.2, 1);
        this.particleSystem.color2 = new Color4(1, 0.5, 0.1, 1);
        this.particleSystem.colorDead = new Color4(0.5, 0.5, 0.5, 0);
        
        this.particleSystem.minSize = 0.05;
        this.particleSystem.maxSize = 0.15;
        
        this.particleSystem.minLifeTime = 0.3;
        this.particleSystem.maxLifeTime = 0.8;
        
        this.particleSystem.emitRate = 100;
        
        this.particleSystem.gravity = new Vector3(0, -2, 0);
        
        this.particleSystem.direction1 = new Vector3(-1, 2, -1);
        this.particleSystem.direction2 = new Vector3(1, 3, 1);
        
        this.particleSystem.minEmitPower = 1;
        this.particleSystem.maxEmitPower = 2;
        
        this.particleSystem.start();
    }
    
    /**
     * Запускает цикл анимации
     */
    private runAnimationLoop(
        oldChassis: Mesh,
        newChassisType: ChassisType,
        turret: Mesh,
        barrel: Mesh,
        basePos: Vector3
    ): void {
        const animate = () => {
            if (!this.isRunning) return;
            
            const elapsed = performance.now() - this.startTime;
            
            if (elapsed >= this.duration) {
                // Анимация завершена
                this.finishAnimation(oldChassis, newChassisType, turret, barrel, basePos);
                return;
            }
            
            // Определяем текущую фазу и прогресс
            if (elapsed < this.PHASE_DISASSEMBLY_END) {
                // Фаза 1: Разборка
                const t = elapsed / this.PHASE_DISASSEMBLY_END;
                this.animateDisassembly(t);
            } else if (elapsed < this.PHASE_TRANSFORM_END) {
                // Фаза 2: Трансформация
                const t = (elapsed - this.PHASE_DISASSEMBLY_END) / (this.PHASE_TRANSFORM_END - this.PHASE_DISASSEMBLY_END);
                this.animateTransformation(t);
            } else {
                // Фаза 3: Сборка
                const t = (elapsed - this.PHASE_TRANSFORM_END) / (this.PHASE_ASSEMBLY_END - this.PHASE_TRANSFORM_END);
                this.animateAssembly(t);
            }
            
            // Следующий кадр
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Фаза 1: Разборка - части разлетаются с физикой (падают)
     */
    private animateDisassembly(t: number): void {
        // В фазе разборки части используют физику и падают естественно
        // Физика уже настроена при создании частей, просто обновляем позиции мешей из физики
        for (const part of this.parts) {
            if (part.hasPhysics && part.physicsBody) {
                // Позиция и вращение управляются физикой
                // Меш автоматически синхронизируется с физическим телом
                // Ничего не делаем - физика сама управляет движением
            } else {
                // Для частей без физики используем старую логику
                const easedT = this.easeOutQuad(t);
                part.mesh.position = Vector3.Lerp(part.startPos, part.scatteredPos, easedT);
                part.mesh.rotation.x += 0.02 * (1 - easedT);
                part.mesh.rotation.y += 0.03 * (1 - easedT);
            }
        }
        
        // В конце фазы разборки (t близко к 1) отключаем физику и переходим на ручное управление
        if (t > 0.9) {
            for (const part of this.parts) {
                if (part.hasPhysics && part.physicsBody) {
                    // Сохраняем текущую позицию из физики
                    const currentPos = part.mesh.position.clone();
                    part.scatteredPos = currentPos;
                    
                    // Останавливаем физику и удаляем физическое тело
                    part.physicsBody.setLinearVelocity(Vector3.Zero());
                    part.physicsBody.setAngularVelocity(Vector3.Zero());
                    try {
                        part.physicsBody.dispose();
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                    part.physicsBody = null;
                    part.hasPhysics = false;
                }
            }
        }
    }
    
    /**
     * Фаза 2: Трансформация - части меняют размер, цвет (без физики, kinematic)
     */
    private animateTransformation(t: number): void {
        const easedT = this.easeInOutSine(t);
        
        for (const part of this.parts) {
            // Интерполяция цвета
            if (part.originalMaterial) {
                const newColor = Color3.Lerp(part.startColor, part.endColor, easedT);
                part.originalMaterial.diffuseColor = newColor;
                
                // Fade out для старых деталей
                if (part.shouldFadeOut) {
                    part.originalMaterial.alpha = 1 - easedT;
                }
                
                // Fade in для новых деталей
                if (part.shouldFadeIn) {
                    part.originalMaterial.alpha = easedT;
                }
            }
            
            // Интерполяция масштаба
            part.mesh.scaling = Vector3.Lerp(part.startScale, part.endScale, easedT);
            
            // Лёгкая пульсация для эффекта трансформации
            const pulse = 1 + Math.sin(t * Math.PI * 4) * 0.05;
            part.mesh.scaling.scaleInPlace(pulse);
            
            // Физика уже отключена после фазы разборки, управление ручное
        }
        
        // Увеличиваем эффект частиц в середине трансформации
        if (this.particleSystem) {
            this.particleSystem.emitRate = 100 + Math.sin(t * Math.PI) * 150;
        }
    }
    
    /**
     * Фаза 3: Сборка - части собираются вместе (kinematic)
     */
    private animateAssembly(t: number): void {
        const easedT = this.easeInQuad(t);
        
        for (const part of this.parts) {
            // Интерполяция позиции к конечной
            const newPos = Vector3.Lerp(part.scatteredPos, part.endPos, easedT);
            part.mesh.position = newPos;
            
            // Сбрасываем вращение постепенно
            part.mesh.rotation.x *= (1 - easedT);
            part.mesh.rotation.y *= (1 - easedT);
            part.mesh.rotation.z *= (1 - easedT);
            
            // Физика уже отключена после фазы разборки, управление ручное
        }
        
        // Уменьшаем эффект частиц к концу
        if (this.particleSystem) {
            this.particleSystem.emitRate = 100 * (1 - easedT);
        }
    }
    
    /**
     * Завершает анимацию - создаёт финальный корпус
     */
    private finishAnimation(
        oldChassis: Mesh,
        newChassisType: ChassisType,
        turret: Mesh,
        barrel: Mesh,
        basePos: Vector3
    ): void {
        this.isRunning = false;
        
        // Останавливаем частицы
        if (this.particleSystem) {
            this.particleSystem.stop();
            setTimeout(() => {
                this.particleSystem?.dispose();
                this.particleSystem = null;
            }, 1000);
        }
        
        // Удаляем все временные части
        for (const part of this.parts) {
            // Удаляем физическое тело, если есть
            if (part.physicsBody) {
                try {
                    part.physicsBody.dispose();
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
            
            if (part.mesh && !part.mesh.isDisposed()) {
                part.mesh.dispose();
            }
            if (part.originalMaterial) {
                try {
                    part.originalMaterial.dispose();
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
        }
        this.parts = [];
        
        // Удаляем старый корпус
        if (oldChassis && !oldChassis.isDisposed()) {
            // Удаляем все дочерние детали
            const children = oldChassis.getChildMeshes(false);
            for (const child of children) {
                if (child instanceof Mesh && !child.isDisposed()) {
                    child.dispose();
                }
            }
            oldChassis.dispose();
        }
        
        console.log(`[ChassisTransform] Animation complete, creating new chassis: ${newChassisType.id}`);
        
        // Вызываем callback завершения
        if (this.onCompleteCallback) {
            this.onCompleteCallback();
        }
    }
    
    /**
     * Принудительно останавливает анимацию
     */
    stop(): void {
        this.isRunning = false;
        
        if (this.particleSystem) {
            this.particleSystem.stop();
            this.particleSystem.dispose();
            this.particleSystem = null;
        }
        
        for (const part of this.parts) {
            if (part.mesh && !part.mesh.isDisposed()) {
                part.mesh.dispose();
            }
        }
        this.parts = [];
    }
    
    /**
     * Проверяет, запущена ли анимация
     */
    isAnimating(): boolean {
        return this.isRunning;
    }
    
    // === Easing функции ===
    
    private easeOutQuad(t: number): number {
        return 1 - (1 - t) * (1 - t);
    }
    
    private easeInOutSine(t: number): number {
        return -(Math.cos(Math.PI * t) - 1) / 2;
    }
    
    private easeInQuad(t: number): number {
        return t * t;
    }
}

