# Лучшие практики разработки

## 🎯 Общие принципы

### 1. Разделение ответственности

Каждая система должна отвечать только за свою область:

```typescript
// ✅ Хорошо
class TankController {
    updatePhysics() { /* только физика танка */ }
    shoot() { /* только стрельба */ }
}

// ❌ Плохо
class TankController {
    updatePhysics() { 
        /* физика */
        /* рендеринг */
        /* звуки */
        /* UI */
    }
}
```

### 2. Использование событий для слабой связанности

```typescript
// ✅ Хорошо - слабая связанность через события
tank.setCameraShakeCallback((intensity) => {
    game.addCameraShake(intensity);
});

// ❌ Плохо - жесткая связанность
tank.game.addCameraShake(intensity);
```

### 3. Оптимизация обновлений

Обновляйте системы с разной частотой:

```typescript
// ✅ Хорошо - оптимизированная частота
if (this._updateTick % 2 === 0) {
    this.updateCamera(); // Каждые 2 кадра
}
if (this._updateTick % 4 === 0) {
    this.chunkSystem.update(); // Каждые 4 кадра
}

// ❌ Плохо - обновление каждый кадр
this.updateCamera(); // Каждый кадр
this.chunkSystem.update(); // Каждый кадр
```

## 🔧 Работа с физикой

### Правильное использование позиций

```typescript
// ✅ Хорошо - в onBeforePhysicsObservable
onBeforePhysicsObservable.add(() => {
    const pos = this.chassis.position; // Используем position
    // Применяем силы
});

// ✅ Хорошо - в onAfterPhysicsObservable
onAfterPhysicsObservable.add(() => {
    const pos = this.chassis.getAbsolutePosition(); // Используем getAbsolutePosition
    // Обновляем камеру
});

// ❌ Плохо - смешивание
onBeforePhysicsObservable.add(() => {
    const pos = this.chassis.getAbsolutePosition(); // Может быть устаревшим!
});
```

### Применение сил

```typescript
// ✅ Хорошо - применение сил в onBeforePhysicsObservable
onBeforePhysicsObservable.add(() => {
    const pos = this.chassis.position;
    const force = forward.scale(moveSpeed);
    body.applyForce(force, pos);
});

// ❌ Плохо - применение сил в update()
update() {
    body.applyForce(force, pos); // Неправильный момент времени
}
```

### Синхронизация меша и физического тела

```typescript
// ✅ Хорошо - Havok автоматически синхронизирует
// Не нужно вручную обновлять mesh.position

// ❌ Плохо - ручная синхронизация
mesh.position.copyFrom(physicsBody.position); // Конфликт!
```

## 🎨 Работа с рендерингом

### Переиспользование объектов

```typescript
// ✅ Хорошо - переиспользование векторов
private _tmpVector = new Vector3();
private _tmpVector2 = new Vector3();

updatePhysics() {
    const pos = this._tmpVector;
    pos.copyFrom(this.chassis.position);
    // Используем pos
}

// ❌ Плохо - создание новых объектов каждый кадр
updatePhysics() {
    const pos = this.chassis.position.clone(); // Утечка памяти!
}
```

### Оптимизация матриц

```typescript
// ✅ Хорошо - автоматическое обновление
const matrix = mesh.getWorldMatrix(); // Обновляется автоматически

// ❌ Плохо - принудительное обновление каждый кадр
mesh.computeWorldMatrix(true); // Дорогая операция
```

### Кэширование вычислений

```typescript
// ✅ Хорошо - кэширование позиций
private _cachedPosition: Vector3 | null = null;
private _cacheFrame = 0;

getPosition(): Vector3 {
    if (this._cacheFrame !== this._updateTick) {
        this._cachedPosition = this.chassis.getAbsolutePosition();
        this._cacheFrame = this._updateTick;
    }
    return this._cachedPosition!;
}

// ❌ Плохо - вычисление каждый раз
getPosition(): Vector3 {
    return this.chassis.getAbsolutePosition(); // Дорого каждый раз
}
```

### Кэширование матриц

```typescript
// ✅ Хорошо - кэширование computeWorldMatrix
private _cachedWorldMatrix: Matrix | null = null;
private _worldMatrixCacheFrame = -1;

getWorldMatrix(): Matrix {
    if (this._updateTick !== this._worldMatrixCacheFrame) {
        this.mesh.computeWorldMatrix(true);
        this._cachedWorldMatrix = this.mesh.getWorldMatrix();
        this._worldMatrixCacheFrame = this._updateTick;
    }
    return this._cachedWorldMatrix!;
}

// ❌ Плохо - вычисление каждый раз
getWorldMatrix(): Matrix {
    this.mesh.computeWorldMatrix(true); // Дорогая операция каждый кадр
    return this.mesh.getWorldMatrix();
}
```

### Кэширование результатов raycast

```typescript
// ✅ Хорошо - кэширование raycast
private _lastRaycastResult: { hit: boolean, distance: number, frame: number } | null = null;
private _lastRaycastPos: Vector3 = Vector3.Zero();
private _raycastCacheDistance = 0.5;

checkCollision(): boolean {
    const cameraMoved = this.camera.position.subtract(this._lastRaycastPos).lengthSquared() > 
        this._raycastCacheDistance * this._raycastCacheDistance;
    
    if (!cameraMoved && this._lastRaycastResult && 
        this._lastRaycastResult.frame === this._updateTick - 1) {
        // Использовать кэшированный результат
        return this._lastRaycastResult.hit;
    }
    
    // Выполнить новый raycast
    const hit = this.scene.pickWithRay(this.ray, this.filter);
    this._lastRaycastResult = {
        hit: hit?.hit || false,
        distance: hit?.distance || 0,
        frame: this._updateTick
    };
    this._lastRaycastPos.copyFrom(this.camera.position);
    return this._lastRaycastResult.hit;
}
```

## 🎮 Работа с игровым циклом

### Правильный порядок обновлений

```typescript
// ✅ Хорошо - правильный порядок
update() {
    // 1. Обновление ввода
    this.updateInputs();
    
    // 2. Обновление логики
    this.updateGameLogic();
    
    // 3. Обновление визуализации
    this.updateVisuals();
}

// ❌ Плохо - неправильный порядок
update() {
    this.updateVisuals(); // До обновления логики
    this.updateGameLogic();
}
```

### Обработка ошибок

```typescript
// ✅ Хорошо - обработка ошибок
try {
    this.updatePhysics();
} catch (e) {
    console.error("[TankController] Physics update failed:", e);
    // Продолжаем работу, не крашим игру
}

// ❌ Плохо - отсутствие обработки
this.updatePhysics(); // Может упасть и сломать игру
```

## 📊 Работа с данными

### Типизация

```typescript
// ✅ Хорошо - явная типизация
interface TankData {
    health: number;
    position: Vector3;
    rotation: Quaternion;
}

function processTank(data: TankData): void {
    // ...
}

// ❌ Плохо - any типы
function processTank(data: any): void {
    // ...
}
```

### Валидация данных

```typescript
// ✅ Хорошо - валидация
function takeDamage(amount: number): void {
    if (!isFinite(amount) || amount < 0) {
        console.warn("Invalid damage amount:", amount);
        return;
    }
    this.health -= amount;
}

// ❌ Плохо - отсутствие валидации
function takeDamage(amount: number): void {
    this.health -= amount; // Может быть NaN или Infinity
}
```

## 🚀 Производительность

### Избегайте дорогих операций в циклах

```typescript
// ✅ Хорошо - кэширование
const expensiveValue = this.calculateExpensiveValue();
for (let i = 0; i < 1000; i++) {
    this.useValue(expensiveValue);
}

// ❌ Плохо - вычисление в цикле
for (let i = 0; i < 1000; i++) {
    const expensiveValue = this.calculateExpensiveValue(); // 1000 раз!
    this.useValue(expensiveValue);
}
```

### Используйте пулы объектов

```typescript
// ✅ Хорошо - пул объектов
class ObjectPool<T> {
    private pool: T[] = [];
    
    get(): T {
        return this.pool.pop() || this.create();
    }
    
    release(obj: T): void {
        this.pool.push(obj);
    }
}

// ❌ Плохо - создание новых объектов
function createEffect() {
    return new ParticleSystem(...); // Новый объект каждый раз
}
```

### Оптимизация проверок

```typescript
// ✅ Хорошо - ранний выход
function updateEnemy(enemy: EnemyTank): void {
    if (!enemy.isAlive) return; // Ранний выход
    if (enemy.chassis.isDisposed()) return;
    
    // Дальнейшая обработка
}

// ❌ Плохо - вложенные проверки
function updateEnemy(enemy: EnemyTank): void {
    if (enemy.isAlive) {
        if (!enemy.chassis.isDisposed()) {
            // Дальнейшая обработка
        }
    }
}
```

## 🐛 Отладка

### Логирование

```typescript
// ✅ Хорошо - структурированное логирование
console.log("[TankController] Shooting:", {
    position: this.chassis.position,
    health: this.health,
    ammo: this.ammo
});

// ❌ Плохо - неструктурированное логирование
console.log("Shooting"); // Недостаточно информации
```

### Проверка состояний

```typescript
// ✅ Хорошо - проверка перед использованием
if (this.tank && this.tank.chassis && !this.tank.chassis.isDisposed()) {
    this.updateTank();
}

// ❌ Плохо - отсутствие проверок
this.tank.chassis.position; // Может быть undefined
```

## 📝 Комментарии и документация

### Полезные комментарии

```typescript
// ✅ Хорошо - объяснение "почему"
// Используем getAbsolutePosition() здесь, потому что физика уже обновилась
// и нам нужна актуальная позиция после синхронизации
const pos = this.chassis.getAbsolutePosition();

// ❌ Плохо - очевидные комментарии
// Получаем позицию
const pos = this.chassis.position;
```

### JSDoc для публичных API

```typescript
// ✅ Хорошо - JSDoc документация
/**
 * Наносит урон танку
 * @param amount - Количество урона
 * @param source - Источник урона (опционально)
 * @throws {Error} Если amount не является числом
 */
takeDamage(amount: number, source?: string): void {
    // ...
}
```

## 🔒 Безопасность

### Проверка ввода

```typescript
// ✅ Хорошо - валидация ввода
function setHealth(value: number): void {
    if (!isFinite(value) || value < 0) {
        throw new Error("Invalid health value");
    }
    this.health = Math.min(value, this.maxHealth);
}

// ❌ Плохо - отсутствие валидации
function setHealth(value: number): void {
    this.health = value; // Может быть любое значение
}
```

### Защита от переполнения

```typescript
// ✅ Хорошо - защита от переполнения
function addExperience(amount: number): void {
    const newExp = this.experience + amount;
    this.experience = Math.min(newExp, Number.MAX_SAFE_INTEGER);
}

// ❌ Плохо - возможное переполнение
function addExperience(amount: number): void {
    this.experience += amount; // Может переполниться
}
```

## 🎯 Резюме

1. **Разделяйте ответственность** - каждая система делает свою работу
2. **Используйте события** - для слабой связанности
3. **Оптимизируйте обновления** - разная частота для разных систем
4. **Правильно работайте с физикой** - используйте правильные методы в правильное время
5. **Переиспользуйте объекты** - избегайте создания новых объектов в циклах
6. **Обрабатывайте ошибки** - не позволяйте ошибкам крашить игру
7. **Валидируйте данные** - проверяйте входные данные
8. **Документируйте код** - особенно публичные API
9. **Логируйте правильно** - структурированные логи с контекстом
10. **Тестируйте** - проверяйте код перед коммитом

Следуя этим практикам, вы создадите более надежный, производительный и поддерживаемый код!

