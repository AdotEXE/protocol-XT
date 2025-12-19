// Система припасов (consumables)

import { 
    Scene, 
    Mesh, 
    MeshBuilder, 
    Vector3, 
    StandardMaterial, 
    Color3, 
    PhysicsBody,
    PhysicsMotionType,
    PhysicsShape,
    PhysicsShapeType,
    Quaternion
} from "@babylonjs/core";

export interface ConsumableType {
    id: string;
    name: string;
    description: string;
    icon: string; // Эмодзи или символ для UI
    color: string; // Hex цвет для визуализации
    effect: (tank: any) => void; // Функция эффекта
    duration?: number; // Длительность эффекта в мс (если есть)
}

// 5 типов припасов
export const CONSUMABLE_TYPES: ConsumableType[] = [
    {
        id: "health",
        name: "Medkit",
        description: "Restores 50 HP",
        icon: "❤️",
        color: "#ff0000",
        effect: (tank: any) => {
            if (tank.currentHealth < tank.maxHealth) {
                const healAmount = Math.min(50, tank.maxHealth - tank.currentHealth);
                tank.currentHealth += healAmount;
                if (tank.hud) {
                    tank.hud.heal(healAmount);
                }
                if (tank.chatSystem) {
                    tank.chatSystem.success(`Used medkit: +${healAmount} HP`);
                }
                if (tank.soundManager) {
                    tank.soundManager.playHit();
                }
                // Визуальный эффект
                if (tank.effectsManager && tank.chassis) {
                    const color = Color3.FromHexString("#00ff00");
                    tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "heal");
                }
                console.log(`[Consumable] Healed ${healAmount} HP`);
            }
        }
    },
    {
        id: "speed",
        name: "Speed Boost",
        description: "+50% speed for 10 sec",
        icon: "⚡",
        color: "#ffff00",
        duration: 10000,
        effect: (tank: any) => {
            const originalSpeed = tank.moveSpeed;
            tank.moveSpeed *= 1.5;
            if (tank.hud) {
                tank.hud.addActiveEffect("Speed Boost", "⚡", "#ff0", 10000);
            }
            if (tank.chatSystem) {
                tank.chatSystem.success("⚡ Speed boost activated");
            }
            if (tank.soundManager) {
                tank.soundManager.playShoot();
            }
            // Визуальный эффект
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#ffff00");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "speed");
            }
            console.log(`[Consumable] Speed boost activated`);
            
            setTimeout(() => {
                tank.moveSpeed = originalSpeed;
                if (tank.hud) {
                    tank.hud.removeActiveEffect("Speed Boost");
                }
                if (tank.chatSystem) {
                    tank.chatSystem.log("Speed boost ended");
                }
                console.log(`[Consumable] Speed boost ended`);
            }, 10000);
        }
    },
    {
        id: "armor",
        name: "Armor",
        description: "+50% defense for 15 sec",
        icon: "🛡️",
        color: "#00ffff",
        duration: 15000,
        effect: (tank: any) => {
            const originalMaxHealth = tank.maxHealth;
            tank.maxHealth = Math.floor(tank.maxHealth * 1.5);
            tank.currentHealth = Math.floor(tank.currentHealth * 1.5);
            if (tank.hud) {
                tank.hud.setHealth(tank.currentHealth, tank.maxHealth);
                tank.hud.addActiveEffect("Armor", "🛡️", "#0ff", 15000);
            }
            if (tank.chatSystem) {
                tank.chatSystem.success("🛡️ Enhanced armor activated");
            }
            if (tank.soundManager) {
                tank.soundManager.playShoot();
            }
            // Визуальный эффект
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#00ffff");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "armor");
            }
            console.log(`[Consumable] Armor boost activated`);
            
            setTimeout(() => {
                tank.maxHealth = originalMaxHealth;
                if (tank.currentHealth > tank.maxHealth) {
                    tank.currentHealth = tank.maxHealth;
                }
                if (tank.hud) {
                    tank.hud.setHealth(tank.currentHealth, tank.maxHealth);
                    tank.hud.removeActiveEffect("Armor");
                }
                if (tank.chatSystem) {
                    tank.chatSystem.log("Enhanced armor ended");
                }
                console.log(`[Consumable] Armor boost ended`);
            }, 15000);
        }
    },
    {
        id: "ammo",
        name: "Ammo",
        description: "Instant reload",
        icon: "💣",
        color: "#ff8800",
        effect: (tank: any) => {
            tank.lastShotTime = 0;
            tank.isReloading = false;
            if (tank.hud) {
                tank.hud.reloadTime = 0;
            }
            if (tank.chatSystem) {
                tank.chatSystem.combat("💣 Instant reload");
            }
            if (tank.soundManager) {
                tank.soundManager.playReloadComplete();
            }
            // Визуальный эффект
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#ff8800");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "ammo");
            }
            console.log(`[Consumable] Instant reload`);
        }
    },
    {
        id: "damage",
        name: "Damage Boost",
        description: "+50% damage for 20 sec",
        icon: "🔥",
        color: "#ff0000",
        duration: 20000,
        effect: (tank: any) => {
            // Сохраняем оригинальный урон (будет использоваться при стрельбе)
            if (!tank._originalDamage) {
                tank._originalDamage = tank.damage || 25;
            }
            tank.damage = Math.floor(tank._originalDamage * 1.5);
            if (tank.hud) {
                tank.hud.addActiveEffect("Damage Boost", "🔥", "#f00", 20000);
            }
            if (tank.chatSystem) {
                tank.chatSystem.combat("🔥 Damage boost activated");
            }
            if (tank.soundManager) {
                tank.soundManager.playShoot();
            }
            // Визуальный эффект
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#ff0000");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "damage");
            }
            console.log(`[Consumable] Damage boost activated`);
            
            setTimeout(() => {
                tank.damage = tank._originalDamage;
                if (tank.hud) {
                    tank.hud.removeActiveEffect("Damage Boost");
                }
                if (tank.chatSystem) {
                    tank.chatSystem.log("Damage boost ended");
                }
                console.log(`[Consumable] Damage boost ended`);
            }, 20000);
        }
    }
];

// Класс для припаса на карте
export class ConsumablePickup {
    public mesh: Mesh;
    private type: ConsumableType;
    private _scene: Scene;
    private rotationSpeed = 0.02;
    private bobSpeed = 0.003;
    private bobAmount = 0.3;
    private initialY: number;
    private time = 0;

    constructor(scene: Scene, position: Vector3, type: ConsumableType) {
        this._scene = scene;
        this.type = type;
        this.initialY = position.y;

        // Создаём визуализацию припаса
        this.mesh = MeshBuilder.CreateBox(`consumable_${type.id}`, {
            width: 0.8,
            height: 0.8,
            depth: 0.8
        }, scene);

        this.mesh.position.copyFrom(position);
        this.mesh.position.y = this.initialY + 0.4;

        // Материал с цветом припаса
        const mat = new StandardMaterial(`consumableMat_${type.id}`, scene);
        mat.diffuseColor = Color3.FromHexString(type.color);
        mat.emissiveColor = Color3.FromHexString(type.color).scale(0.5);
        mat.specularColor = Color3.Black();
        this.mesh.material = mat;

        // Добавляем физику для подбора
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: Vector3.Zero(),
                rotation: Quaternion.Identity(),
                extents: new Vector3(0.8, 0.8, 0.8)
            }
        }, scene);

        const physicsBody = new PhysicsBody(
            this.mesh,
            PhysicsMotionType.STATIC,
            false,
            scene
        );
        physicsBody.shape = shape;

        // Metadata для обнаружения
        this.mesh.metadata = { type: "consumable", consumableType: type.id, pickup: this };
    }
    
    // Обновление анимации (вызывается из централизованного update)
    update(deltaTime: number): void {
        if (this.mesh.isDisposed()) return;
        this.time += deltaTime;
        this.mesh.rotation.y += this.rotationSpeed;
        this.mesh.position.y = this.initialY + 0.4 + Math.sin(this.time * this.bobSpeed * 1000) * this.bobAmount;
    }

    getType(): ConsumableType {
        return this.type;
    }

    dispose(): void {
        this.mesh.dispose();
    }
}

// Менеджер припасов игрока
export class ConsumablesManager {
    private consumables: Map<number, ConsumableType | null> = new Map();
    private activeEffects: Map<string, number> = new Map(); // effectId -> timeoutId

    constructor() {
        // Инициализируем слоты 1-5 как пустые
        for (let i = 1; i <= 5; i++) {
            this.consumables.set(i, null);
        }
    }

    // Подобрать припас в слот
    pickUp(consumable: ConsumableType, slot: number): boolean {
        if (slot < 1 || slot > 5) return false;
        this.consumables.set(slot, consumable);
        console.log(`[Consumables] Picked up ${consumable.name} in slot ${slot}`);
        return true;
    }

    // Использовать припас из слота
    use(slot: number, tank: any): boolean {
        const consumable = this.consumables.get(slot);
        if (!consumable) {
            console.log(`[Consumables] Slot ${slot} is empty`);
            return false;
        }

        // Применяем эффект
        consumable.effect(tank);

        // Если эффект временный, сохраняем таймер
        if (consumable.duration) {
            const effectId = `${consumable.id}_${Date.now()}`;
            const timeoutId = window.setTimeout(() => {
                this.activeEffects.delete(effectId);
            }, consumable.duration);
            this.activeEffects.set(effectId, timeoutId);
        }

        // Удаляем припас из слота
        this.consumables.set(slot, null);
        console.log(`[Consumables] Used ${consumable.name} from slot ${slot}`);
        return true;
    }

    // Получить припас из слота
    get(slot: number): ConsumableType | null {
        return this.consumables.get(slot) || null;
    }

    // Получить все припасы
    getAll(): Map<number, ConsumableType | null> {
        return new Map(this.consumables);
    }

    // Очистить все активные эффекты
    clearAllEffects(): void {
        this.activeEffects.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeEffects.clear();
    }
}

