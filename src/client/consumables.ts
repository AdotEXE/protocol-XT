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
import { logger } from "./utils/logger";

export interface ConsumableType {
    id: string;
    name: string;
    description: string;
    icon: string; // Эмодзи или символ для UI
    color: string; // Hex цвет для визуализации
    effect: (tank: any) => void; // Функция эффекта
    duration?: number; // Длительность эффекта в мс (если есть)
}

// 8 типов припасов (Supply Drop System)
export const CONSUMABLE_TYPES: ConsumableType[] = [
    {
        id: "health",
        name: "Ремкомплект",
        description: "Восстанавливает 50% HP",
        icon: "❤️",
        color: "#ff4444",
        effect: (tank: any) => {
            if (tank.currentHealth < tank.maxHealth) {
                const healAmount = Math.floor(tank.maxHealth * 0.5);
                tank.currentHealth = Math.min(tank.maxHealth, tank.currentHealth + healAmount);
                if (tank.hud) {
                    tank.hud.heal(healAmount);
                }
                if (tank.chatSystem) {
                    tank.chatSystem.success(`❤️ Ремкомплект: +${healAmount} HP`);
                }
                if (tank.soundManager) {
                    tank.soundManager.playHit();
                }
                if (tank.effectsManager && tank.chassis) {
                    const color = Color3.FromHexString("#00ff00");
                    tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "heal");
                }
                logger.log(`[Consumable] Healed ${healAmount} HP (50%)`);
            }
        }
    },
    {
        id: "speed",
        name: "Двойная скорость",
        description: "2x скорость на 10 сек",
        icon: "⚡",
        color: "#ffff00",
        duration: 10000,
        effect: (tank: any) => {
            const originalSpeed = tank.moveSpeed;
            tank.moveSpeed *= 2; // 2x вместо 1.5x
            if (tank.hud) {
                tank.hud.addActiveEffect("Двойная скорость", "⚡", "#ff0", 10000);
            }
            if (tank.chatSystem) {
                tank.chatSystem.success("⚡ Двойная скорость активирована!");
            }
            if (tank.soundManager) {
                tank.soundManager.playShoot();
            }
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#ffff00");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "speed");
            }
            logger.log(`[Consumable] 2x Speed boost activated`);

            setTimeout(() => {
                tank.moveSpeed = originalSpeed;
                if (tank.hud) {
                    tank.hud.removeActiveEffect("Двойная скорость");
                }
                if (tank.chatSystem) {
                    tank.chatSystem.log("⚡ Двойная скорость закончилась");
                }
                logger.log(`[Consumable] Speed boost ended`);
            }, 10000);
        }
    },
    {
        id: "armor",
        name: "Двойная броня",
        description: "2x защита на 15 сек",
        icon: "🛡️",
        color: "#00ffff",
        duration: 15000,
        effect: (tank: any) => {
            if (!tank._armorActive) {
                tank._armorActive = true;
                tank._damageReduction = 0.5; // Получает 50% урона = 2x броня
                if (tank.hud) {
                    tank.hud.addActiveEffect("Двойная броня", "🛡️", "#0ff", 15000);
                }
                if (tank.chatSystem) {
                    tank.chatSystem.success("🛡️ Двойная броня активирована!");
                }
                if (tank.soundManager) {
                    tank.soundManager.playShoot();
                }
                if (tank.effectsManager && tank.chassis) {
                    const color = Color3.FromHexString("#00ffff");
                    tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "armor");
                }
                logger.log(`[Consumable] 2x Armor boost activated`);

                setTimeout(() => {
                    tank._armorActive = false;
                    tank._damageReduction = 1;
                    if (tank.hud) {
                        tank.hud.removeActiveEffect("Двойная броня");
                    }
                    if (tank.chatSystem) {
                        tank.chatSystem.log("🛡️ Двойная броня закончилась");
                    }
                    logger.log(`[Consumable] Armor boost ended`);
                }, 15000);
            }
        }
    },
    {
        id: "ammo",
        name: "Боеприпасы",
        description: "Мгновенная перезарядка",
        icon: "💣",
        color: "#ff8800",
        effect: (tank: any) => {
            tank.lastShotTime = 0;
            tank.isReloading = false;
            if (tank.hud) {
                tank.hud.reloadTime = 0;
            }
            if (tank.chatSystem) {
                tank.chatSystem.combat("💣 Мгновенная перезарядка!");
            }
            if (tank.soundManager) {
                tank.soundManager.playReloadComplete();
            }
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#ff8800");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "ammo");
            }
            logger.log(`[Consumable] Instant reload`);
        }
    },
    {
        id: "damage",
        name: "Двойной урон",
        description: "2x урон на 20 сек",
        icon: "🔥",
        color: "#ff0000",
        duration: 20000,
        effect: (tank: any) => {
            if (!tank._originalDamage) {
                tank._originalDamage = tank.damage || 25;
            }
            tank.damage = Math.floor(tank._originalDamage * 2); // 2x вместо 1.5x
            if (tank.hud) {
                tank.hud.addActiveEffect("Двойной урон", "🔥", "#f00", 20000);
            }
            if (tank.chatSystem) {
                tank.chatSystem.combat("🔥 Двойной урон активирован!");
            }
            if (tank.soundManager) {
                tank.soundManager.playShoot();
            }
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#ff0000");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "damage");
            }
            logger.log(`[Consumable] 2x Damage boost activated`);

            setTimeout(() => {
                tank.damage = tank._originalDamage;
                if (tank.hud) {
                    tank.hud.removeActiveEffect("Двойной урон");
                }
                if (tank.chatSystem) {
                    tank.chatSystem.log("🔥 Двойной урон закончился");
                }
                logger.log(`[Consumable] Damage boost ended`);
            }, 20000);
        }
    },
    {
        id: "fuel",
        name: "Топливо",
        description: "Восстанавливает 50% топлива",
        icon: "⛽",
        color: "#88ff00",
        effect: (tank: any) => {
            const fuelAmount = 50;
            tank.fuel = Math.min(100, (tank.fuel || 0) + fuelAmount);
            if (tank.hud) {
                tank.hud.setFuel?.(tank.fuel);
            }
            if (tank.chatSystem) {
                tank.chatSystem.success(`⛽ Топливо: +${fuelAmount}%`);
            }
            if (tank.soundManager) {
                tank.soundManager.playHit();
            }
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#88ff00");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "fuel");
            }
            logger.log(`[Consumable] +${fuelAmount}% fuel`);
        }
    },
    {
        id: "stealth",
        name: "Невидимость",
        description: "Скрытие от радара 15 сек",
        icon: "👻",
        color: "#8800ff",
        duration: 15000,
        effect: (tank: any) => {
            tank._isStealthed = true;
            // Делаем танк полупрозрачным
            if (tank.chassis?.material) {
                tank._originalAlpha = (tank.chassis.material as any).alpha || 1;
                (tank.chassis.material as any).alpha = 0.3;
            }
            if (tank.hud) {
                tank.hud.addActiveEffect("Невидимость", "👻", "#80f", 15000);
            }
            if (tank.chatSystem) {
                tank.chatSystem.success("👻 Невидимость активирована!");
            }
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#8800ff");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "stealth");
            }
            logger.log(`[Consumable] Stealth activated`);

            setTimeout(() => {
                tank._isStealthed = false;
                if (tank.chassis?.material && tank._originalAlpha !== undefined) {
                    (tank.chassis.material as any).alpha = tank._originalAlpha;
                }
                if (tank.hud) {
                    tank.hud.removeActiveEffect("Невидимость");
                }
                if (tank.chatSystem) {
                    tank.chatSystem.log("👻 Невидимость закончилась");
                }
                logger.log(`[Consumable] Stealth ended`);
            }, 15000);
        }
    },
    {
        id: "shield",
        name: "Энергощит",
        description: "Неуязвимость 5 сек",
        icon: "🔮",
        color: "#ff00ff",
        duration: 5000,
        effect: (tank: any) => {
            tank.godMode = true;
            if (tank.hud) {
                tank.hud.addActiveEffect("Энергощит", "🔮", "#f0f", 5000);
            }
            if (tank.chatSystem) {
                tank.chatSystem.success("🔮 Энергощит активирован! НЕУЯЗВИМОСТЬ!");
            }
            if (tank.soundManager) {
                tank.soundManager.playShoot();
            }
            // Визуальный эффект щита
            if (tank.effectsManager && tank.chassis) {
                const color = Color3.FromHexString("#ff00ff");
                tank.effectsManager.createConsumableEffect(tank.chassis.absolutePosition, color, "shield");
            }
            logger.log(`[Consumable] Shield activated - INVINCIBLE`);

            setTimeout(() => {
                tank.godMode = false;
                if (tank.hud) {
                    tank.hud.removeActiveEffect("Энергощит");
                }
                if (tank.chatSystem) {
                    tank.chatSystem.log("🔮 Энергощит закончился");
                }
                logger.log(`[Consumable] Shield ended`);
            }, 5000);
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
        logger.log(`[Consumables] Picked up ${consumable.name} in slot ${slot}`);
        return true;
    }

    // Использовать припас из слота
    use(slot: number, tank: any): boolean {
        const consumable = this.consumables.get(slot);
        if (!consumable) {
            logger.log(`[Consumables] Slot ${slot} is empty`);
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
        logger.log(`[Consumables] Used ${consumable.name} from slot ${slot}`);
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

