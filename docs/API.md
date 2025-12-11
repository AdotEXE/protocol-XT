# API Документация

## Основные классы

### Game

Главный класс игры, оркестрирующий все системы.

#### Конструктор

```typescript
constructor()
```

Создает новый экземпляр игры и инициализирует меню.

#### Методы

##### `async init(): Promise<void>`

Инициализирует игру: создает сцену, загружает физику, создает все системы.

```typescript
await game.init();
```

##### `startGame(): void`

Запускает игру после инициализации.

```typescript
game.startGame();
```

##### `updateCamera(): void`

Обновляет позицию и ориентацию камеры.

```typescript
game.updateCamera();
```

##### `togglePause(): void`

Переключает паузу игры.

```typescript
game.togglePause();
```

#### Свойства

```typescript
engine: Engine                    // Babylon.js движок
scene: Scene                      // Основная сцена
tank: TankController | undefined  // Контроллер танка игрока
camera: ArcRotateCamera | undefined // Основная камера
hud: HUD | undefined              // Интерфейс пользователя
```

---

### TankController

Управление танком игрока, физика и движение.

#### Конструктор

```typescript
constructor(
    scene: Scene,
    position: Vector3,
    chassisType: ChassisType,
    cannonType: CannonType
)
```

#### Методы

##### `updatePhysics(): void`

Обновляет физику танка. Вызывается в `onBeforePhysicsObservable`.

```typescript
// Автоматически вызывается системой
```

##### `shoot(): void`

Производит выстрел из пушки.

```typescript
tank.shoot();
```

##### `takeDamage(amount: number, source?: string): void`

Наносит урон танку.

```typescript
tank.takeDamage(50, "enemy");
```

##### `reset(): void`

Сбрасывает танк в начальное состояние (респавн).

```typescript
tank.reset();
```

##### `setHUD(hud: HUD): void`

Устанавливает HUD для отображения информации.

```typescript
tank.setHUD(hud);
```

#### Свойства

```typescript
chassis: Mesh                    // Меш корпуса
turret: Mesh                     // Меш башни
barrel: Mesh                     // Меш пушки
physicsBody: PhysicsBody         // Физическое тело
health: number                   // Текущее здоровье
maxHealth: number               // Максимальное здоровье
mass: number                    // Масса танка
hoverHeight: number            // Высота парения
```

#### Параметры физики

```typescript
hoverStiffness: number          // Жесткость подвески
hoverDamping: number            // Демпфирование
uprightForce: number            // Сила выравнивания
movementDamping: number         // Демпфирование движения
moveSpeed: number               // Скорость движения
turnSpeed: number               // Скорость поворота
```

---

### HUD

Интерфейс пользователя.

#### Конструктор

```typescript
constructor(scene: Scene)
```

#### Методы

##### `setHealth(current: number, max: number): void`

Устанавливает отображаемое здоровье.

```typescript
hud.setHealth(75, 100);
```

##### `setSpeed(speed: number): void`

Устанавливает отображаемую скорость.

```typescript
hud.setSpeed(15.5);
```

##### `setPosition(x: number, z: number): void`

Устанавливает позицию на карте.

```typescript
hud.setPosition(100, 200);
```

##### `toggleFullMap(): void`

Переключает отображение полной карты.

```typescript
hud.toggleFullMap();
```

##### `updateCompassEnemies(enemies: EnemyData[], playerPos: Vector3, angle: number): void`

Обновляет компас с врагами.

```typescript
hud.updateCompassEnemies(enemies, playerPos, angle);
```

---

### ChunkSystem

Система генерации и управления миром.

#### Конструктор

```typescript
constructor(
    scene: Scene,
    options: {
        chunkSize: number;
        renderDistance: number;
        unloadDistance: number;
        worldSeed: number;
        mapType: MapType;
    }
)
```

#### Методы

##### `update(playerPosition: Vector3): void`

Обновляет чанки на основе позиции игрока.

```typescript
chunkSystem.update(playerPosition);
```

##### `getChunkAt(x: number, z: number): Chunk | null`

Получает чанк по координатам.

```typescript
const chunk = chunkSystem.getChunkAt(0, 0);
```

#### Свойства

```typescript
garagePositions: Vector3[]       // Позиции гаражей
garageDoors: GarageDoor[]       // Данные о дверях гаражей
```

---

### EnemyTank

Контроллер вражеского танка с AI.

#### Конструктор

```typescript
constructor(
    scene: Scene,
    position: Vector3,
    chassisType: ChassisType,
    cannonType: CannonType
)
```

#### Методы

##### `update(): void`

Обновляет AI и поведение врага.

```typescript
enemy.update();
```

##### `takeDamage(amount: number, source?: string): void`

Наносит урон врагу.

```typescript
enemy.takeDamage(50);
```

#### Свойства

```typescript
isAlive: boolean                 // Жив ли враг
chassis: Mesh                    // Меш корпуса
health: number                   // Текущее здоровье
```

---

### ExperienceSystem

Система опыта и комбо.

#### Методы

##### `addExperience(amount: number, source: string): void`

Добавляет опыт игроку.

```typescript
experienceSystem.addExperience(100, "kill");
```

##### `getCurrentExperience(): number`

Получает текущий опыт.

```typescript
const exp = experienceSystem.getCurrentExperience();
```

---

### SoundManager

Управление звуками.

#### Методы

##### `playSound(name: string, position?: Vector3): void`

Воспроизводит звук.

```typescript
soundManager.playSound("explosion", position);
```

##### `updateEngine(speedRatio: number, throttle: number, position: Vector3): void`

Обновляет звук двигателя.

```typescript
soundManager.updateEngine(0.5, 0.8, tankPosition);
```

---

### EffectsManager

Управление визуальными эффектами.

#### Методы

##### `createExplosion(position: Vector3, size: number): void`

Создает эффект взрыва.

```typescript
effectsManager.createExplosion(position, 2.0);
```

##### `createSmoke(position: Vector3, duration: number): void`

Создает эффект дыма.

```typescript
effectsManager.createSmoke(position, 5.0);
```

---

## Типы данных

### ChassisType

```typescript
interface ChassisType {
    id: string;
    name: string;
    health: number;
    speed: number;
    // ... другие свойства
}
```

### CannonType

```typescript
interface CannonType {
    id: string;
    name: string;
    damage: number;
    cooldown: number;
    projectileSpeed: number;
    // ... другие свойства
}
```

### GameSettings

```typescript
interface GameSettings {
    renderDistance: number;
    showFPS: boolean;
    mouseSensitivity: number;
    // ... другие настройки
}
```

---

## События

### События игры

```typescript
// Событие изменения видимости меню
window.addEventListener("menuVisibilityChanged", (e) => {
    console.log("Menu visibility changed:", e.detail);
});

// Событие центрирования камеры
window.addEventListener("centerCamera", (e) => {
    console.log("Center camera requested");
});

// Событие остановки центрирования
window.addEventListener("stopCenterCamera", () => {
    console.log("Stop center camera");
});
```

---

## Примеры использования

### Создание игры

```typescript
import { Game } from "./game";

const game = new Game();
// Игра автоматически инициализируется при нажатии "Start Game"
```

### Работа с танком

```typescript
// Получение танка
const tank = game.tank;
if (tank) {
    // Нанесение урона
    tank.takeDamage(25);
    
    // Проверка здоровья
    console.log(`Health: ${tank.health}/${tank.maxHealth}`);
    
    // Выстрел
    tank.shoot();
}
```

### Работа с HUD

```typescript
const hud = game.hud;
if (hud) {
    // Обновление здоровья
    hud.setHealth(75, 100);
    
    // Обновление скорости
    hud.setSpeed(15.5);
    
    // Переключение карты
    hud.toggleFullMap();
}
```

### Работа с ChunkSystem

```typescript
const chunkSystem = game.chunkSystem;
if (chunkSystem && game.tank) {
    // Обновление чанков
    const playerPos = game.tank.chassis.getAbsolutePosition();
    chunkSystem.update(playerPos);
    
    // Получение позиций гаражей
    const garages = chunkSystem.garagePositions;
    console.log(`Found ${garages.length} garages`);
}
```

---

## Расширение функциональности

### Добавление новой системы

```typescript
// 1. Создайте новый класс
export class MySystem {
    constructor(scene: Scene) {
        // Инициализация
    }
    
    update(deltaTime: number) {
        // Обновление
    }
}

// 2. Добавьте в Game
// В game.ts:
private mySystem: MySystem | undefined;

// В init():
this.mySystem = new MySystem(this.scene);

// В update():
if (this._updateTick % 10 === 0 && this.mySystem) {
    this.mySystem.update(deltaTime);
}
```

### Добавление нового типа танка

```typescript
// В tankTypes.ts:
export const MY_CHASSIS: ChassisType = {
    id: "my_chassis",
    name: "My Chassis",
    health: 150,
    speed: 10,
    // ... другие свойства
};
```

---

## Лучшие практики

### Работа с физикой

- Всегда используйте `getAbsolutePosition()` для получения позиции после обновления физики
- Применяйте силы в `onBeforePhysicsObservable`
- Обновляйте камеру в `onAfterPhysicsObservable`

### Оптимизация

- Обновляйте системы с разной частотой
- Используйте кэширование для дорогих вычислений
- Переиспользуйте векторы и матрицы

### Обработка ошибок

```typescript
try {
    // Код с потенциальными ошибками
} catch (e) {
    console.error("Error:", e);
    // Обработка ошибки
}
```

---

## Дополнительные ресурсы

- [Babylon.js API](https://doc.babylonjs.com/typedoc/)
- [Havok Physics](https://www.havok.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

