# Примеры кода

## Базовые примеры

### Инициализация игры

```typescript
import { Game } from "./game";

// Создание экземпляра игры
const game = new Game();

// Игра автоматически покажет меню
// После нажатия "Start Game" произойдет инициализация
```

### Работа с танком

```typescript
// Получение танка после инициализации
const tank = game.tank;

if (tank) {
    // Получение позиции
    const position = tank.chassis.getAbsolutePosition();
    console.log(`Tank position: ${position.x}, ${position.y}, ${position.z}`);
    
    // Получение здоровья
    console.log(`Health: ${tank.health}/${tank.maxHealth}`);
    
    // Получение скорости
    const velocity = tank.physicsBody.getLinearVelocity();
    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
    console.log(`Speed: ${speed.toFixed(2)} m/s`);
}
```

### Создание эффекта взрыва

```typescript
if (game.effectsManager && game.tank) {
    const position = game.tank.chassis.getAbsolutePosition();
    game.effectsManager.createExplosion(position, 2.0);
}
```

### Воспроизведение звука

```typescript
if (game.soundManager) {
    game.soundManager.playSound("explosion", position);
}
```

## Продвинутые примеры

### Создание кастомного врага

```typescript
import { EnemyTank } from "./enemyTank";
import { HUNTER_CHASSIS, RAILGUN_CANNON } from "./tankTypes";

// Создание врага
const enemy = new EnemyTank(
    game.scene,
    new Vector3(10, 2, 10),
    HUNTER_CHASSIS,
    RAILGUN_CANNON
);

// Добавление в список врагов
game.enemyTanks.push(enemy);
```

### Настройка физики танка

```typescript
if (game.tank) {
    // Изменение параметров физики
    game.tank.hoverHeight = 2.5;
    game.tank.hoverStiffness = 500;
    game.tank.hoverDamping = 50;
    game.tank.uprightForce = 5000;
    game.tank.movementDamping = 0.7;
    
    // Применение изменений к физическому телу
    game.tank.physicsBody.setMassProperties({
        mass: game.tank.mass,
        centerOfMass: new Vector3(0, -0.4, 0)
    });
}
```

### Работа с системой опыта

```typescript
if (game.experienceSystem) {
    // Добавление опыта
    game.experienceSystem.addExperience(100, "kill");
    
    // Подписка на изменения опыта
    if (game.experienceSystem.onExperienceChanged) {
        game.experienceSystem.onExperienceChanged.add((data) => {
            console.log(`Experience: ${data.current}/${data.required}`);
            console.log(`Level: ${data.level}`);
        });
    }
}
```

### Работа с Chunk System

```typescript
if (game.chunkSystem && game.tank) {
    // Получение позиции игрока
    const playerPos = game.tank.chassis.getAbsolutePosition();
    
    // Обновление чанков
    game.chunkSystem.update(playerPos);
    
    // Получение чанка по координатам
    const chunkX = Math.floor(playerPos.x / 80);
    const chunkZ = Math.floor(playerPos.z / 80);
    const chunk = game.chunkSystem.getChunkAt(chunkX, chunkZ);
    
    if (chunk) {
        console.log(`Current chunk: ${chunkX}, ${chunkZ}`);
    }
}
```

### Создание кастомного эффекта

```typescript
// В EffectsManager
createCustomEffect(position: Vector3) {
    // Создание частиц
    const particleSystem = new ParticleSystem("customEffect", 100, this.scene);
    
    // Настройка частиц
    particleSystem.emitter = position;
    particleSystem.particleTexture = this.createTexture();
    
    // Запуск
    particleSystem.start();
    
    // Остановка через 2 секунды
    setTimeout(() => {
        particleSystem.stop();
    }, 2000);
}
```

### Обработка событий

```typescript
// Подписка на события меню
window.addEventListener("menuVisibilityChanged", (e: CustomEvent) => {
    const isVisible = e.detail?.visible ?? false;
    console.log(`Menu is now ${isVisible ? 'visible' : 'hidden'}`);
});

// Подписка на события камеры
window.addEventListener("centerCamera", (e: CustomEvent) => {
    console.log("Camera centering requested");
    if (e.detail?.lerpSpeed) {
        console.log(`Lerp speed: ${e.detail.lerpSpeed}`);
    }
});

// Остановка центрирования
window.addEventListener("stopCenterCamera", () => {
    console.log("Camera centering stopped");
});
```

### Работа с HUD

```typescript
if (game.hud) {
    // Обновление всех элементов HUD
    if (game.tank) {
        game.hud.setHealth(game.tank.health, game.tank.maxHealth);
        
        const velocity = game.tank.physicsBody.getLinearVelocity();
        const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
        game.hud.setSpeed(speed);
        
        const pos = game.tank.chassis.getAbsolutePosition();
        game.hud.setPosition(pos.x, pos.z);
    }
    
    // Переключение карты
    game.hud.toggleFullMap();
}
```

### Создание кастомного консьюмабла

```typescript
import { ConsumableType } from "./consumables";

const MY_CONSUMABLE: ConsumableType = {
    id: "my_consumable",
    name: "My Consumable",
    description: "Custom consumable",
    effect: (tank: TankController) => {
        // Эффект
        tank.health = Math.min(tank.health + 50, tank.maxHealth);
    },
    cooldown: 30,
    icon: "path/to/icon.png"
};

// Добавление в систему
if (game.consumablesManager) {
    game.consumablesManager.addConsumable(MY_CONSUMABLE);
}
```

### Работа с системой прогресса

```typescript
if (game.playerProgression) {
    // Получение статистики
    const stats = game.playerProgression.getStats();
    console.log(`Level: ${stats.level}`);
    console.log(`Experience: ${stats.experience}`);
    console.log(`Skill Points: ${stats.skillPoints}`);
    
    // Подписка на изменения опыта
    if (game.playerProgression.onExperienceChanged) {
        game.playerProgression.onExperienceChanged.add((data) => {
            console.log(`Level up! New level: ${data.level}`);
        });
    }
    
    // Вложение очков навыков
    game.playerProgression.investSkillPoint("tankMastery");
}
```

### Создание кастомной системы

```typescript
// Создание новой системы
export class WeatherSystem {
    private scene: Scene;
    private rainParticles: ParticleSystem | null = null;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.init();
    }
    
    private init() {
        // Инициализация системы погоды
        this.createRain();
    }
    
    private createRain() {
        this.rainParticles = new ParticleSystem("rain", 1000, this.scene);
        // Настройка дождя
    }
    
    update(deltaTime: number) {
        // Обновление погоды
        if (this.rainParticles) {
            // Обновление частиц
        }
    }
}

// Использование в Game
// В game.ts:
private weatherSystem: WeatherSystem | undefined;

// В init():
this.weatherSystem = new WeatherSystem(this.scene);

// В update():
if (this.weatherSystem) {
    this.weatherSystem.update(deltaTime);
}
```

### Работа с камерой

```typescript
if (game.camera) {
    // Получение позиции камеры
    const cameraPos = game.camera.position;
    console.log(`Camera position: ${cameraPos.x}, ${cameraPos.y}, ${cameraPos.z}`);
    
    // Получение цели камеры
    const target = game.camera.getTarget();
    console.log(`Camera target: ${target.x}, ${target.y}, ${target.z}`);
    
    // Изменение радиуса камеры
    game.camera.radius = 15;
    
    // Изменение угла камеры
    game.camera.beta = Math.PI / 3;
    game.camera.alpha = -Math.PI / 2;
}
```

### Отладка физики

```typescript
// Включение визуализации физики
if (game.scene && game.scene.getPhysicsEngine()) {
    // Визуализация коллайдеров (требует включения в настройках)
    game.scene.getPhysicsEngine()?.setDebugMode(true);
}

// Получение информации о физическом теле
if (game.tank) {
    const body = game.tank.physicsBody;
    const velocity = body.getLinearVelocity();
    const angularVelocity = body.getAngularVelocity();
    
    console.log(`Linear velocity: ${velocity.x}, ${velocity.y}, ${velocity.z}`);
    console.log(`Angular velocity: ${angularVelocity.x}, ${angularVelocity.y}, ${angularVelocity.z}`);
}
```

## Интеграция с внешними системами

### Работа с Firebase

```typescript
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// Сохранение прогресса
async function saveProgress(playerId: string, stats: PlayerStats) {
    const db = getFirestore();
    await setDoc(doc(db, "players", playerId), stats);
}

// Загрузка прогресса
async function loadProgress(playerId: string): Promise<PlayerStats | null> {
    const db = getFirestore();
    const docRef = doc(db, "players", playerId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
        return docSnap.data() as PlayerStats;
    }
    return null;
}
```

### Работа с WebSocket (для мультиплеера)

```typescript
// Создание WebSocket соединения
const ws = new WebSocket("wss://game-server.example.com");

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // Обработка данных от сервера
    if (data.type === "playerUpdate") {
        updatePlayerPosition(data.playerId, data.position);
    }
};

// Отправка данных на сервер
function sendPlayerUpdate(position: Vector3) {
    ws.send(JSON.stringify({
        type: "playerUpdate",
        position: { x: position.x, y: position.y, z: position.z }
    }));
}
```

---

## Полезные утилиты

### Вычисление расстояния

```typescript
function distance(pos1: Vector3, pos2: Vector3): number {
    return Vector3.Distance(pos1, pos2);
}

// Использование
const dist = distance(tank1.position, tank2.position);
```

### Интерполяция позиции

```typescript
function lerpPosition(start: Vector3, end: Vector3, t: number): Vector3 {
    return Vector3.Lerp(start, end, t);
}

// Использование
const interpolated = lerpPosition(currentPos, targetPos, 0.1);
```

### Проверка видимости

```typescript
function isVisible(from: Vector3, to: Vector3, scene: Scene): boolean {
    const direction = to.subtract(from);
    const distance = direction.length();
    direction.normalize();
    
    const ray = new Ray(from, direction);
    const hit = scene.pickWithRay(ray);
    
    if (hit && hit.distance < distance) {
        return false; // Что-то блокирует
    }
    return true;
}
```

---

Эти примеры помогут вам начать работу с Protocol TX и расширить его функциональность!

