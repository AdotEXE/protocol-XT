// Модуль управления снарядами и гильзами танка
import { 
    Vector3, 
    Mesh, 
    PhysicsBody, 
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    PhysicsShape,
    PhysicsShapeType,
    PhysicsMotionType,
    Quaternion
} from "@babylonjs/core";
import type { ITankController, ShellCasing } from "./types";
import { TANK_CONSTANTS } from "./constants";

export class TankProjectilesModule {
    private tank: ITankController;
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    /**
     * Создание гильзы после выстрела
     */
    createShellCasing(muzzlePos: Vector3, barrelDir: Vector3): void {
        const bulletSize = this.tank.projectileSize;
        const casingDiameter = bulletSize * TANK_CONSTANTS.SHELL_CASING_DIAMETER_MULTIPLIER;
        const casingLength = bulletSize * TANK_CONSTANTS.SHELL_CASING_LENGTH_MULTIPLIER;
        
        // Создаем гильзу как прямоугольную коробку (не цилиндр)
        const casing = MeshBuilder.CreateBox("shellCasing", {
            width: casingDiameter,
            height: casingLength,
            depth: casingDiameter
        }, this.tank.scene);
        // Повернуть на 90° по X для горизонтального положения
        casing.rotation.x = Math.PI / 2;
        
        // Позиция гильзы - немного сбоку от ствола
        const right = Vector3.Cross(barrelDir, Vector3.Up()).normalize();
        const casingStartPos = muzzlePos
            .subtract(barrelDir.scale(TANK_CONSTANTS.SHELL_CASING_POSITION_OFFSET))
            .add(right.scale(TANK_CONSTANTS.SHELL_CASING_SIDE_OFFSET));
        casing.position.copyFrom(casingStartPos);
        
        // Материал гильзы - латунный цвет
        const casingMat = new StandardMaterial("shellCasingMat", this.tank.scene);
        casingMat.diffuseColor = new Color3(0.8, 0.7, 0.4); // Латунный цвет
        casingMat.specularColor = new Color3(0.5, 0.5, 0.3);
        casing.material = casingMat;
        casing.renderingGroupId = 2;
        
        // Физика гильзы
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: Vector3.Zero(),
                rotation: Quaternion.Identity(),
                extents: new Vector3(
                    bulletSize * TANK_CONSTANTS.SHELL_CASING_PHYSICS_EXTENT_MULTIPLIER,
                    casingLength * TANK_CONSTANTS.SHELL_CASING_PHYSICS_HEIGHT_MULTIPLIER,
                    bulletSize * TANK_CONSTANTS.SHELL_CASING_PHYSICS_EXTENT_MULTIPLIER
                )
            }
        }, this.tank.scene);
        shape.filterMembershipMask = TANK_CONSTANTS.SHELL_CASING_FILTER_MEMBERSHIP_MASK;
        shape.filterCollideMask = TANK_CONSTANTS.SHELL_CASING_FILTER_COLLIDE_MASK;
        
        const body = new PhysicsBody(casing, PhysicsMotionType.DYNAMIC, false, this.tank.scene);
        body.shape = shape;
        body.setMassProperties({ mass: TANK_CONSTANTS.SHELL_CASING_MASS });
        body.setLinearDamping(TANK_CONSTANTS.SHELL_CASING_LINEAR_DAMPING);
        body.setAngularDamping(TANK_CONSTANTS.SHELL_CASING_ANGULAR_DAMPING);
        
        // Выбрасываем гильзу в сторону и назад
        const ejectDirection = right
            .add(barrelDir.scale(-0.5))
            .add(Vector3.Up().scale(0.3))
            .normalize();
        const ejectSpeed = TANK_CONSTANTS.SHELL_CASING_EJECT_SPEED_MIN + 
            Math.random() * (TANK_CONSTANTS.SHELL_CASING_EJECT_SPEED_MAX - TANK_CONSTANTS.SHELL_CASING_EJECT_SPEED_MIN);
        body.applyImpulse(ejectDirection.scale(ejectSpeed), casing.position);
        
        // Добавляем случайное вращение
        const randomRotation = new Vector3(
            (Math.random() - 0.5) * TANK_CONSTANTS.SHELL_CASING_ROTATION_MULTIPLIER,
            (Math.random() - 0.5) * TANK_CONSTANTS.SHELL_CASING_ROTATION_MULTIPLIER,
            (Math.random() - 0.5) * TANK_CONSTANTS.SHELL_CASING_ROTATION_MULTIPLIER
        );
        body.applyAngularImpulse(randomRotation);
        
        // Сохраняем гильзу для обновления
        this.tank.shellCasings.push({
            mesh: casing,
            physics: body,
            lifetime: TANK_CONSTANTS.SHELL_CASING_LIFETIME
        });
    }
    
    /**
     * Обновление гильз (вызывается каждый кадр)
     */
    updateShellCasings(): void {
        for (let i = this.tank.shellCasings.length - 1; i >= 0; i--) {
            const casing = this.tank.shellCasings[i];
            
            if (!casing.mesh || casing.mesh.isDisposed()) {
                this.tank.shellCasings.splice(i, 1);
                continue;
            }
            
            // Уменьшаем время жизни
            const deltaTime = this.tank.scene.getEngine().getDeltaTime();
            casing.lifetime -= deltaTime;
            
            // Удаляем гильзу если время истекло или она упала ниже порога
            if (casing.lifetime <= 0 || casing.mesh.absolutePosition.y < TANK_CONSTANTS.SHELL_CASING_DISPOSE_Y_THRESHOLD) {
                if (casing.physics) {
                    casing.physics.dispose();
                }
                casing.mesh.dispose();
                this.tank.shellCasings.splice(i, 1);
            }
        }
    }
}
