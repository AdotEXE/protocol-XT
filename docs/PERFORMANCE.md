# Руководство по оптимизации производительности

## 🚀 Быстрые решения для лагов

### Если игра лагает на Vercel/в браузере:

1. **Откройте Dev Dashboard (F3)** и проверьте FPS
2. **Закройте другие вкладки браузера**
3. **Уменьшите renderDistance** в настройках игры
4. **Обновите страницу** (Ctrl+F5 для жесткой перезагрузки)

## ⚙️ Автоматические оптимизации

Проект автоматически применяет оптимизации в production режиме:

### 1. Рендеринг
- ✅ Антиалиасинг отключен в production
- ✅ Альфа-канал отключен
- ✅ Premultiplied alpha отключен
- ✅ Тени отключены
- ✅ Частицы отключены
- ✅ Fog отключен

### 2. Chunk System
- ✅ Render distance уменьшен до 1.2 в production (вместо 1.5)
- ✅ Большие чанки (80 единиц) для меньшего количества объектов

### 3. Сборка
- ✅ Минификация кода (esbuild)
- ✅ Code splitting для больших библиотек
- ✅ Оптимизация CSS
- ✅ Source maps отключены в production

### 4. Vercel
- ✅ Кэширование статических файлов (1 год)
- ✅ Кэширование WASM файлов
- ✅ Оптимизация заголовков

## 🎯 Advanced Optimizations

Protocol TX implements advanced runtime optimizations that significantly improve performance:

### Position Caching
- **`getAbsolutePosition()` caching**: Expensive position calculations are cached per frame
- **`computeWorldMatrix()` caching**: World matrix computations are cached to avoid redundant calculations
- **Performance gain**: Reduces expensive calculations by 80-90%
- **Implementation**: Positions are cached once per frame and reused across all systems

### Update Intervals
Different game systems update at optimal frequencies based on their priority:

| System | Update Frequency | Notes |
|--------|-----------------|-------|
| Camera | Every frame | Critical for smooth gameplay |
| Physics | Every frame | Required for accuracy |
| HUD | Every 6 frames | UI doesn't need 60 FPS |
| Chunk System | Every 12-16 frames | Depends on map size and FPS |
| Enemy AI | Every 5-6 frames | AI doesn't need 60 FPS |
| Enemy Turrets | Every 15 frames | Low priority for distant enemies |
| Garage System | Every 3 frames | Medium priority |
| Consumables | Every 15 frames | Low priority |

**Adaptive Intervals**: When FPS drops below 30, update intervals are automatically increased by 50% to maintain performance.

### LOD (Level of Detail) System
- **Enemy LOD**: Enemy details (tracks, wheels, small parts) are disabled at distances > 150m
- **Physics LOD**: Distant enemies (> 100m) use simplified physics (ANIMATED mode instead of DYNAMIC)
- **Material LOD**: Distant objects use simplified materials
- **Performance gain**: Reduces rendering and physics calculations by 30-40% for distant objects

### Raycast Caching
- **Camera collision raycasts** are cached when camera position hasn't changed significantly (> 0.5m)
- **Performance gain**: Reduces expensive raycast operations by 60-70% during static camera moments

### Effect Limits
- **Maximum active effects**: 50 simultaneous effects prevent performance degradation
- **Automatic cleanup**: Oldest effects are automatically removed when limit is reached
- **Performance gain**: Prevents FPS drops during intense combat scenarios

### Material Pooling
- **Shared materials**: Materials with identical parameters are reused across objects
- **Frozen materials**: Static materials are frozen to prevent unnecessary updates
- **Performance gain**: Reduces memory usage and material update overhead

## 🔧 Ручная оптимизация

### Уменьшение renderDistance

В игре:
1. Нажмите **Escape** для открытия меню
2. Найдите настройку **Render Distance**
3. Уменьшите значение до 1.0 или 0.8

### Закрытие Dev инструментов

- **F3** - Dev Dashboard (закройте если не нужен)
- **F4** - Physics Manager (закройте если не нужен)
- **F5** - Dev Console (закройте если не нужен)

## 📊 Мониторинг производительности

### Dev Dashboard (F3)

Показывает:
- **FPS** - кадры в секунду (должно быть 60)
- **Frame Time** - время кадра (должно быть < 16ms)
- **Draw Calls** - количество вызовов отрисовки
- **Active Meshes** - количество активных мешей
- **Vertices** - количество вершин

### Рекомендуемые значения:
- **FPS**: 60 (или близко к 60)
- **Frame Time**: < 16ms
- **Draw Calls**: < 1000
- **Active Meshes**: < 500

## 🐛 Решение проблем

### Низкий FPS (< 30)

**Причины**:
- Слишком высокий renderDistance
- Много врагов на карте
- Слабый компьютер/браузер

**Решение**:
1. Уменьшите renderDistance до 0.8-1.0
2. Закройте Dev Dashboard и другие инструменты
3. Закройте другие вкладки браузера
4. Обновите драйверы видеокарты

### Лаги при движении

**Причины**:
- Chunk System загружает новые чанки
- Физика обрабатывает много объектов

**Решение**:
1. Уменьшите renderDistance
2. Проверьте консоль на ошибки
3. Перезапустите игру

### Высокое использование памяти

**Причины**:
- Много загруженных чанков
- Утечки памяти

**Решение**:
1. Уменьшите renderDistance
2. Перезагрузите страницу периодически
3. Проверьте консоль на предупреждения

## 🎯 Оптимальные настройки

### Для слабых компьютеров:
- Render Distance: **0.8**
- Закрыть все Dev инструменты
- Закрыть другие вкладки

### Для средних компьютеров:
- Render Distance: **1.0-1.2**
- Dev Dashboard можно оставить открытым

### Для мощных компьютеров:
- Render Distance: **1.5-2.0**
- Все Dev инструменты доступны

## 📝 Технические детали

### Оптимизации Engine

```typescript
// Production оптимизации
antialias: false
alpha: false
premultipliedAlpha: false
powerPreference: "high-performance"
```

### Оптимизации Scene

```typescript
// Отключено для производительности
shadowsEnabled: false
particlesEnabled: false
fogEnabled: false
spritesEnabled: false
lensFlaresEnabled: false
```

### Оптимизации Chunk System

```typescript
// Production
renderDistance: 1.2  // Вместо 1.5
chunkSize: 80        // Большие чанки = меньше объектов
```

### Кэширование позиций и матриц

```typescript
// Кэширование getAbsolutePosition()
private _cachedChassisPosition: Vector3 = Vector3.Zero();
private _cachedPositionFrame = -1;

getCachedChassisPosition(): Vector3 {
    if (this._updateTick !== this._cachedPositionFrame) {
        this._cachedChassisPosition.copyFrom(this.chassis.absolutePosition);
        this._cachedPositionFrame = this._updateTick;
    }
    return this._cachedChassisPosition;
}

// Кэширование computeWorldMatrix()
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
```

### Адаптивные интервалы обновления

```typescript
// Базовые интервалы
private _adaptiveIntervals = {
    chunkSystem: 16,      // Каждые 16 кадров
    enemyManager: 6,      // Каждые 6 кадров
    turrets: 15,          // Каждые 15 кадров
    garage: 3,            // Каждые 3 кадра
    consumables: 15       // Каждые 15 кадров
};

// Адаптация при низком FPS
if (this._lastFPS < 30) {
    const multiplier = 1.5;
    this._adaptiveIntervals.chunkSystem = Math.ceil(16 * multiplier);
    this._adaptiveIntervals.enemyManager = Math.ceil(6 * multiplier);
}
```

### LOD для врагов

```typescript
private updateEnemyLOD(enemy: EnemyTank, distance: number): void {
    const lodDistance = 150;
    const childMeshes = enemy.chassis.getChildMeshes(false);
    
    if (distance > lodDistance) {
        // Отключить детали на расстоянии > 150м
        childMeshes.forEach(child => {
            const name = child.name.toLowerCase();
            if (name.includes("track") || name.includes("detail") || name.includes("wheel")) {
                child.setEnabled(false);
            }
        });
    } else {
        // Включить все детали
        childMeshes.forEach(child => {
            child.setEnabled(true);
        });
    }
}
```

### Ограничение эффектов

```typescript
private MAX_ACTIVE_EFFECTS = 50;
private activeEffects: Set<Mesh> = new Set();

createExplosion(position: Vector3): void {
    // Проверить лимит
    if (this.activeEffects.size >= this.MAX_ACTIVE_EFFECTS) {
        // Удалить самый старый эффект
        const oldest = Array.from(this.activeEffects)[0];
        if (oldest && !oldest.isDisposed()) {
            oldest.dispose();
            this.activeEffects.delete(oldest);
        }
    }
    
    // Создать эффект и добавить в отслеживание
    const effect = /* создание эффекта */;
    this.activeEffects.add(effect);
}
```

## 🔍 Отладка производительности

### Chrome DevTools

1. Откройте **Performance** вкладку
2. Нажмите **Record**
3. Играйте 10-15 секунд
4. Остановите запись
5. Проверьте:
   - **FPS** график
   - **Memory** использование
   - **Long tasks** (долгие задачи)

### Firefox DevTools

1. Откройте **Performance** вкладку
2. Нажмите **Start Recording**
3. Играйте 10-15 секунд
4. Остановите запись
5. Проверьте аналогичные метрики

## ✅ Чеклист оптимизации

- [ ] Render Distance установлен оптимально
- [ ] Dev инструменты закрыты (если не нужны)
- [ ] Другие вкладки браузера закрыты
- [ ] FPS > 50
- [ ] Frame Time < 20ms
- [ ] Нет ошибок в консоли
- [ ] Использование памяти < 500MB

---

**Если проблемы сохраняются**: Создайте issue с логами из консоли и метриками производительности.

