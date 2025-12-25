# Архитектура Protocol TX

## Обзор

Protocol TX построен на архитектуре клиент-сервер с использованием современных веб-технологий. Проект использует компонентный подход с четким разделением ответственности между системами.

## Технологический стек

### Frontend
- **Babylon.js 8.40** - Графический движок
- **Havok Physics 1.3.10** - Физический движок
- **TypeScript 5.9** - Язык программирования
- **Vite 7.2** - Сборщик и dev-сервер

### Backend (в разработке)
- **Firebase** - Backend-as-a-Service
  - Authentication - Авторизация
  - Firestore - База данных
  - Cloud Functions - Серверная логика

## Архитектурные принципы

### 1. Разделение ответственности
Каждая система отвечает за свою область:
- `Game` - Оркестрация всех систем
- `TankController` - Управление танком и физика
- `HUD` - Интерфейс пользователя
- `ChunkSystem` - Генерация мира
- И т.д.

### 2. Событийно-ориентированная архитектура
Системы взаимодействуют через события и колбэки:
```typescript
// Пример из кода
this.tank.setCameraShakeCallback((intensity: number) => {
    this.addCameraShake(intensity);
});
```

### 3. Оптимизация производительности
- Lazy loading компонентов
- Кэширование вычислений
- Оптимизированный рендеринг (frustum culling)
- Обновление систем с разной частотой

## Основные системы

### Game (game.ts)
**Ответственность**: Главный оркестратор всех систем

**Основные функции**:
- Инициализация всех систем
- Управление игровым циклом
- Обработка ввода
- Управление камерой
- Координация между системами

**Зависимости**: Все остальные системы

### TankController (tankController.ts)
**Ответственность**: Управление танком игрока

**Основные функции**:
- Физика движения (hover-механика)
- Обработка ввода (движение, стрельба)
- Управление здоровьем
- Система респавна

**Зависимости**: 
- PhysicsBody (Havok)
- HUD
- SoundManager
- EffectsManager

### ChunkSystem (chunkSystem.ts)
**Ответственность**: Генерация и управление миром

**Основные функции**:
- Генерация чанков
- Управление видимостью объектов
- Система гаражей
- Оптимизация рендеринга

**Зависимости**: Scene (Babylon.js)

### EnemyManager (enemy.ts)
**Ответственность**: Управление врагами

**Основные функции**:
- Спавн врагов
- AI логика
- Управление жизненным циклом

**Зависимости**: 
- EnemyTank
- ChunkSystem
- Game

### HUD (hud.ts)
**Ответственность**: Интерфейс пользователя

**Основные функции**:
- Отображение здоровья
- Мини-карта
- Компас
- Индикаторы

**Зависимости**: Scene (Babylon.js GUI)

## Цикл обновления

### Инициализация
```
1. Создание Engine и Scene
2. Загрузка Havok Physics
3. Создание всех систем
4. Настройка камеры
5. Запуск render loop
```

### Игровой цикл
```
Каждый кадр:
1. Render Loop (60 FPS)
   ├── onBeforePhysicsObservable
   │   └── updatePhysics() - Применение сил
   ├── Physics Step - Обновление физики
   ├── onAfterPhysicsObservable
   │   └── updateCamera() - Обновление камеры
   └── Scene.render() - Рендеринг

2. Update Loop (оптимизированная частота)
   ├── updateCamera() - Каждые 2 кадра
   ├── ChunkSystem.update() - Каждые 4 кадра
   ├── EnemyManager.update() - Каждые 5 кадров
   └── HUD.updateAnimations() - Каждые 2 кадра
```

## Физика

### Havok Physics Integration
- **PhysicsBody** - Основной компонент для физических объектов
- **onBeforePhysicsObservable** - Применение сил перед шагом физики
- **onAfterPhysicsObservable** - Синхронизация после шага физики

### Hover-механика
Танки используют hover-физику вместо колес:
- 4 луча для определения высоты
- Формула подвески: `F = -k * (x - L_rest) - c * v`
- Анизотропное трение для дрифта

## Оптимизация

### Рендеринг
- **Frustum Culling** - Рендеринг только видимых объектов
- **LOD System** - Уровни детализации (в разработке)
- **Occlusion Culling** - Скрытие объектов за препятствиями (в разработке)

### Обновление систем
Системы обновляются с разной частотой для оптимизации:
- Камера: каждые 2 кадра
- Chunk System: каждые 4 кадра
- Enemy Manager: каждые 5 кадров
- HUD анимации: каждые 2 кадра

### Кэширование
- Кэширование позиции танка
- Кэширование результатов raycast
- Переиспользование векторов и матриц

## Синхронизация

### Физика и рендеринг
Критически важно синхронизировать физическое тело и визуальный меш:

```typescript
// Правильный подход
onAfterPhysicsObservable.add(() => {
    // Физика обновилась, теперь можно обновлять камеру
    updateCamera();
});

// В updateCamera()
const tankPos = this.tank.chassis.getAbsolutePosition(); // Используем getAbsolutePosition()
```

### Проблемы и решения

**Проблема**: Тряска танка при движении
**Решение**: 
- Обновление камеры после шага физики
- Использование `getAbsolutePosition()` вместо `position`
- Синхронизация в `onAfterPhysicsObservable`

## Расширяемость

### Добавление новой системы

1. Создайте новый класс системы
2. Инициализируйте в `Game.init()`
3. Обновляйте в `Game.update()` (если нужно)
4. Добавьте документацию

### Пример:
```typescript
// Новая система
export class NewSystem {
    constructor(scene: Scene) {
        // Инициализация
    }
    
    update(deltaTime: number) {
        // Обновление
    }
}

// В Game.init()
this.newSystem = new NewSystem(this.scene);

// В Game.update()
if (this._updateTick % 10 === 0) {
    this.newSystem.update(deltaTime);
}
```

## Модульная архитектура (2024-12-25)

### Рефакторинг больших файлов

Проект был рефакторирован для улучшения модульности:

#### Модули танка (`src/client/tank/`)
- ✅ **tankChassis.ts** - Создание корпусов (~3300 строк)
- ✅ **tankCannon.ts** - Создание пушек (~1812 строк)
- ✅ **tankSpecialAbilities.ts** - Специальные способности (~377 строк)
- ✅ **movement/TankMovementConfig.ts** - Конфигурация движения
- ✅ **combat/TankWeaponConfig.ts** - Конфигурация оружия
- ✅ **combat/TankAiming.ts** - Логика прицеливания
- ✅ **combat/TankDamage.ts** - Расчёт урона

#### Модули карт (`src/client/maps/`)
- ✅ **shared/BaseMapGenerator.ts** - Базовый класс генераторов
- ✅ **shared/ChunkHelpers.ts** - Вспомогательные методы (водопады, мосты, скалы)
- ✅ **polygon/PolygonGenerator.ts** - Генератор карты Polygon
- ✅ **frontline/FrontlineGenerator.ts** - Генератор карты Frontline
- ✅ **ruins/RuinsGenerator.ts** - Генератор карты Ruins
- ✅ **canyon/CanyonGenerator.ts** - Генератор карты Canyon
- ✅ **industrial/IndustrialGenerator.ts** - Генератор карты Industrial
- ✅ **urban_warfare/UrbanWarfareGenerator.ts** - Генератор карты Urban Warfare
- ✅ **underground/UndergroundGenerator.ts** - Генератор карты Underground
- ✅ **coastal/CoastalGenerator.ts** - Генератор карты Coastal

#### Модули игры (`src/client/game/`)
- ✅ **LoadingScreen.ts** - Экран загрузки
- ✅ **SettingsManager.ts** - Управление настройками
- ✅ **FrontlineMode.ts** - Режим игры Frontline

#### Компоненты HUD (`src/client/hud/components/`)
- ✅ **Crosshair.ts** - Компонент прицела
- ✅ **HealthBar.ts** - Компонент полосы здоровья
- ✅ **Minimap.ts** - Компонент миникарты
- ✅ **Compass.ts** - Компонент компаса
- ✅ **ConsumablesBar.ts** - Компонент панели расходников

#### Экраны меню (`src/client/menu/screens/`)
- ✅ **MainMenuScreen.ts** - Главный экран меню
- ✅ **SettingsScreen.ts** - Экран настроек

#### Модули гаража
- ✅ **garage/ui.ts** - UI логика гаража (~825 строк)
- ✅ **garage/preview.ts** - 3D превью логика
- ✅ **garage/materials.ts** - Фабрика материалов
- ✅ **garage/chassisDetails.ts** - Генератор деталей корпусов
- ✅ **garage/cannonDetails.ts** - Генератор деталей пушек

#### Модули меню
- ✅ **menu/settings.ts** - Настройки игры (~558 строк)
- ✅ **menu/skillTreeUI.ts** - UI дерева навыков

### Результаты рефакторинга

| Метрика | До | После |
|---------|-----|-------|
| tankController.ts | ~9660 строк | ~7774 строк |
| Новые модули | 0 | 30+ файлов |
| Генераторы карт | 1 файл | 10 модулей |
| Компоненты HUD | 0 | 5 компонентов |

## Будущие улучшения

- [x] Сетевая синхронизация (реализовано 85-90%)
- [x] Система реплеев (базовая реализация)
- [x] Рефакторинг больших файлов
- [ ] Профилирование производительности
- [ ] Автоматические тесты
- [ ] CI/CD пайплайн

