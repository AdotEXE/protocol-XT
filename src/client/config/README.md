# Конфигурация физики игры

## Описание

Файл `physicsConfig.ts` содержит централизованную конфигурацию всех параметров физики игры. Это позволяет легко настраивать физику без изменения кода в различных файлах.

## Использование

### Импорт конфигурации

```typescript
import { PHYSICS_CONFIG, applyPhysicsConfig, resetPhysicsConfig } from './config/physicsConfig';
```

### Применение параметров в коде

Вместо использования хардкодных значений, используйте конфигурацию:

```typescript
// ❌ Плохо (хардкод)
this.mass = 3500;
this.moveSpeed = 24;

// ✅ Хорошо (из конфига)
this.mass = PHYSICS_CONFIG.tank.basic.mass;
this.moveSpeed = PHYSICS_CONFIG.tank.basic.moveSpeed;
```

### Изменение параметров

#### Вариант 1: Прямое изменение конфига

```typescript
import { PHYSICS_CONFIG } from './config/physicsConfig';

// Изменить конкретный параметр
PHYSICS_CONFIG.tank.basic.moveSpeed = 30;
PHYSICS_CONFIG.tank.basic.mass = 4000;
```

#### Вариант 2: Применение частичной конфигурации

```typescript
import { applyPhysicsConfig } from './config/physicsConfig';

// Применить изменения
applyPhysicsConfig({
    tank: {
        basic: {
            moveSpeed: 30,
            mass: 4000,
        }
    }
});
```

#### Вариант 3: Сброс к значениям по умолчанию

```typescript
import { resetPhysicsConfig } from './config/physicsConfig';

resetPhysicsConfig();
```

### Сохранение и загрузка конфигурации

```typescript
import { 
    savePhysicsConfigToStorage, 
    loadPhysicsConfigFromStorage 
} from './config/physicsConfig';

// Сохранить в localStorage
savePhysicsConfigToStorage();

// Загрузить из localStorage
loadPhysicsConfigFromStorage();
```

## Структура конфигурации

### 1. Мир (world)
- Гравитация
- Подшаги физики
- Параметры расчёта траекторий

### 2. Танк (tank)
- Основные параметры (масса, скорость, здоровье)
- Стабильность и подвеска
- Движение и управление
- Система подъёма на препятствия
- Вертикальные стены
- Ограничения скорости
- Центр масс
- Материалы коллизий
- Фильтры коллизий

### 3. Башня (turret)
- Управление башней
- Управление стволом

### 4. Стрельба (shooting)
- Параметры стрельбы
- Отдача
- Параметры снарядов
- Типы боеприпасов
- Гильзы

### 5. Вражеские танки (enemyTank)
- Основные параметры
- Стабильность
- Система подъёма
- Снаряды

### 6. Турели врагов (enemyTurret)
- Параметры турелей

### 7. Модули (modules)
- Модуль 6 (Защитные стены)
- Модуль 7 (Ускоренная стрельба)
- Модуль 8 (Автонаводка)
- Модуль 9 (Маневрирование)
- Модуль 0 (Прыжок)

### 8. Топливо (fuel)
- Максимальное топливо
- Расход топлива

### 9. Трассеры (tracer)
- Количество
- Урон
- Длительность метки

### 10. Константы (constants)
- Защита от урона
- Радиусы попаданий
- Рикошеты
- Границы карты

### 11. Движение по типам шасси (chassisMovement)
- Light
- Medium
- Heavy
- Superheavy

### 12. Окружение (environment)
- Параметры статических объектов

### 13. Система попаданий (hitSystem)
- Радиусы попаданий
- Дальность снарядов

### 14. Дополнительные параметры (additional)
- Экстренное демпфирование
- Raycast параметры
- Защита от проваливания

## Примеры настройки

### Увеличить скорость танка

```typescript
PHYSICS_CONFIG.tank.basic.moveSpeed = 30;
```

### Увеличить силу отдачи

```typescript
PHYSICS_CONFIG.shooting.recoil.force = 5000;
PHYSICS_CONFIG.shooting.recoil.torque = 20000;
```

### Изменить гравитацию

```typescript
PHYSICS_CONFIG.world.gravity = new Vector3(0, -29.4, 0); // Луна
```

### Увеличить проходимость

```typescript
PHYSICS_CONFIG.tank.climbing.climbAssistForce = 80000;
PHYSICS_CONFIG.tank.climbing.maxClimbHeight = 2.5;
```

### Настроить модуль прыжка

```typescript
PHYSICS_CONFIG.modules.module0.basePower = 50000;
PHYSICS_CONFIG.modules.module0.maxPower = 1000000;
```

## Миграция существующего кода

Для миграции существующего кода на использование конфигурации:

1. Найдите хардкодные значения в коде
2. Замените их на значения из `PHYSICS_CONFIG`
3. Убедитесь, что изменения применяются в нужный момент

Пример миграции в `tankController.ts`:

```typescript
// Было:
this.mass = 3500;

// Стало:
this.mass = PHYSICS_CONFIG.tank.basic.mass;
```

## Примечания

- Все значения в конфигурации соответствуют текущим значениям из игры
- Изменения конфигурации применяются немедленно (если код использует конфиг)
- Конфигурация может быть сохранена в localStorage для постоянства между сессиями
- Vector3 объекты автоматически восстанавливаются при загрузке из localStorage

## Полный список параметров

См. `docs/PHYSICS_PARAMETERS.md` для полного списка всех параметров с описаниями.

