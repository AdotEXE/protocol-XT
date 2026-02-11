# Оптимизации производительности - Февраль 2026

## Резюме

Выполнены критические оптимизации производительности для устранения узких мест в коде.

---

## 1. Кэширование результатов getChassisById/getCannonById

**Проблема:** Функции вызывались 84 раза в 20 файлах, каждый раз создавая новый объект через `{ ...base, ...mod }`.

**Решение:**
- Добавлены Map кэши `chassisCacheWithModifiers` и `cannonCacheWithModifiers`
- Функции проверяют кэш перед применением модификаторов
- Результаты сохраняются в кэш после первого применения

**Эффект:** Устранены избыточные аллокации объектов при повторных вызовах.

**Файлы:**
- `src/client/tankTypes.ts` - добавлены кэши и оптимизированы функции

---

## 2. Оптимизация поиска в массивах CHASSIS_TYPES/CANNON_TYPES

**Проблема:** Использовался `.find()` с O(n) сложностью для поиска по ID.

**Решение:**
- Добавлены лениво инициализируемые Map: `chassisTypesMap` и `cannonTypesMap`
- Функции `getChassisTypesMap()` и `getCannonTypesMap()` создают Map при первом использовании
- Поиск заменён с `.find()` на `.get()` с O(1) сложностью

**Эффект:** Ускорение поиска корпусов и пушек с O(n) до O(1).

**Файлы:**
- `src/client/tankTypes.ts` - добавлены Map и функции поиска

---

## 3. Кэширование getAircraftPhysicsConfig()

**Проблема:** Функция создавала новый объект каждый раз через `deepMergeAircraftConfig()`.

**Решение:**
- Добавлен кэш `cachedAircraftConfig` с проверкой хэша модификаторов
- Если модификаторы не изменились, возвращается закэшированный результат
- Функция `clearAircraftConfigCache()` для очистки кэша при изменении модификаторов

**Эффект:** Устранено создание новых объектов при повторных вызовах.

**Файлы:**
- `src/client/config/aircraftVehicleConfig.ts` - добавлен кэш и функция очистки

---

## 4. Замена Date.now() на timeProvider

**Проблема:** 664 вызова `Date.now()` разбросаны по коду, каждый вызов - syscall.

**Решение:**
- Заменены вызовы `Date.now()` на `timeProvider.now` в критических местах:
  - `PerformanceOptimizer.update()`
  - `GameUpdate.update()` (survival time, globalIntel)
  - `FloatingDamageNumbers.update()` и `cleanupOldNumbers()`

**Эффект:** Уменьшение syscall overhead, использование кэшированного времени кадра.

**Файлы:**
- `src/client/optimization/PerformanceOptimizer.ts`
- `src/client/game/GameUpdate.ts`
- `src/client/hud/components/FloatingDamageNumbers.ts`

---

## 5. Функции очистки кэша

**Добавлено:**
- `clearVehiclePhysicsCache()` в `vehiclePhysicsConfig.ts` и `tankTypes.ts`
- `clearAircraftConfigCache()` в `aircraftVehicleConfig.ts`
- Функции доступны через `window.vehiclePhysicsConfig` и `window.aircraftVehicleConfig`

**Использование:** Вызывать после изменения модификаторов в runtime для обновления кэша.

---

## Статистика оптимизаций

- **Кэширование:** 3 места (chassis, cannon, aircraft config)
- **Оптимизация поиска:** 2 Map (O(n) → O(1))
- **Замена Date.now():** 5 мест
- **Функции очистки кэша:** 2 функции

---

## Дополнительные возможности оптимизации

### Выявленные проблемы (требуют дальнейшей работы):

1. **2103 создания Vector3/Matrix/Quaternion** - частично решено через пулы, но не везде используется
2. **1057 операций .find/.filter/.map** - некоторые можно оптимизировать через Map/Set
3. **Операции в enemyTank.ts** - несколько `.find()` и `.filter()` в update циклах

### Рекомендации:

1. Использовать `vector3Pool` везде вместо `new Vector3()`
2. Заменить частые `.find()` на Map lookup где возможно
3. Использовать `timeProvider.now` вместо `Date.now()` везде кроме критических измерений
4. Рассмотреть object pooling для Matrix и Quaternion

---

## Использование в консоли браузера

```javascript
// Проверка кэша корпусов/пушек
window.vehiclePhysicsConfig.CHASSIS_MODIFIERS.racer = { moveSpeed: 45 };
window.vehiclePhysicsConfig.clearVehiclePhysicsCache(); // Очистить кэш

// Проверка кэша самолёта
window.aircraftVehicleConfig.AIRCRAFT_MODIFIERS.maxSpeed = 85;
window.aircraftVehicleConfig.clearAircraftConfigCache(); // Очистить кэш
```

---

## Файлы изменений

- `src/client/tankTypes.ts` - кэширование и Map поиск
- `src/client/config/vehiclePhysicsConfig.ts` - функция очистки кэша
- `src/client/config/aircraftVehicleConfig.ts` - кэширование конфига
- `src/client/optimization/PerformanceOptimizer.ts` - timeProvider
- `src/client/game/GameUpdate.ts` - timeProvider
- `src/client/hud/components/FloatingDamageNumbers.ts` - timeProvider
