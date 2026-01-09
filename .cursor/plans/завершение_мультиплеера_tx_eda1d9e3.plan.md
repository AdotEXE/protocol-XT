---
name: Завершение мультиплеера TX
overview: "Детальный план завершения мультиплеерной системы Protocol TX - от критического Client-Side Prediction до финальной оптимизации. Текущий прогресс: 85%, цель: 100%."
todos:
  - id: mp-prediction
    content: Реализовать Client-Side Prediction в multiplayer.ts и tankController.ts
    status: completed
  - id: mp-reconciliation
    content: Реализовать Server Reconciliation с sequence numbers
    status: completed
    dependencies:
      - mp-prediction
  - id: mp-real-ping
    content: Активировать измерение реального ping (структуры уже есть)
    status: completed
    dependencies:
      - mp-reconciliation
  - id: mp-jitter-buffer
    content: Реализовать Jitter Buffer для сглаживания задержки
    status: completed
    dependencies:
      - mp-real-ping
  - id: mp-position-history
    content: Добавить историю позиций в ServerPlayer для lag compensation
    status: completed
    dependencies:
      - mp-jitter-buffer
  - id: mp-lag-compensation
    content: Реализовать Lag Compensation с rewind time на сервере
    status: completed
    dependencies:
      - mp-position-history
  - id: mp-server-hit-validation
    content: Перенести проверку попаданий полностью на сервер
    status: completed
    dependencies:
      - mp-lag-compensation
  - id: mp-cubic-interpolation
    content: Заменить линейную интерполяцию на Hermite сплайн
    status: completed
    dependencies:
      - mp-server-hit-validation
  - id: mp-dead-reckoning
    content: Добавить экстраполяцию при пропуске обновлений
    status: completed
    dependencies:
      - mp-cubic-interpolation
  - id: mp-fix-binary
    content: Исправить и включить бинарную сериализацию в protocol.ts
    status: completed
    dependencies:
      - mp-dead-reckoning
  - id: mp-batch-updates
    content: Реализовать группировку обновлений в batch сообщения
    status: completed
    dependencies:
      - mp-fix-binary
  - id: mp-adaptive-rate
    content: Интегрировать адаптивную частоту обновлений из PrioritizedBroadcaster
    status: completed
    dependencies:
      - mp-batch-updates
  - id: mp-anticheat-integration
    content: Интегрировать detectAimbot и detectSpeedHack в gameServer
    status: completed
    dependencies:
      - mp-adaptive-rate
  - id: mp-auto-bans
    content: Реализовать систему автоматических банов по suspiciousScore
    status: completed
    dependencies:
      - mp-anticheat-integration
---

# Исправление потери характеристик при респавне

## Проблема

При респавне танка теряются бонусы от гусениц (`trackType.stats`) и модулей, потому что метод `applyUpgrades()` в [`src/client/tankController.ts`](src/client/tankController.ts) не применяет эти бонусы.

## Решение

Добавить применение бонусов от гусениц и модулей в метод `applyUpgrades()` после сброса базовых характеристик, но до применения других бонусов.

## Изменения

### 1. Добавить применение бонусов от гусениц

В методе `applyUpgrades()` в [`src/client/tankController.ts`](src/client/tankController.ts) (после строки 1852, где вызывается `resetBaseStats()`) добавить:

```typescript
// === 0. БОНУСЫ ОТ ГУСЕНИЦ (применяются ПЕРВЫМИ после сброса) ===
if (this.trackType?.stats) {
    if (this.trackType.stats.speedBonus) {
        this.moveSpeed *= (1 + this.trackType.stats.speedBonus);
    }
    if (this.trackType.stats.armorBonus) {
        this.maxHealth *= (1 + this.trackType.stats.armorBonus);
    }
    if (this.trackType.stats.durabilityBonus) {
        this.maxHealth *= (1 + this.trackType.stats.durabilityBonus);
    }
    logger.log(`[Tank] Track bonuses applied: speed=${this.trackType.stats.speedBonus || 0}, armor=${this.trackType.stats.armorBonus || 0}, durability=${this.trackType.stats.durabilityBonus || 0}`);
}
```

### 2. Добавить применение бонусов от модулей

После бонусов от гусениц добавить применение бонусов от установленных модулей:

```typescript
// === 0.5. БОНУСЫ ОТ МОДУЛЕЙ ===
const installedModules = this.getInstalledModules();
if (installedModules.size > 0) {
    const { MODULE_PRESETS, getModuleById } = require('./tank/modules');
    for (const moduleSlotId of installedModules) {
        // Нужно найти способ получить ID модуля из слота
        // Пока что используем маппинг слотов на модули из гаража
        const moduleId = this.getModuleIdFromSlot(moduleSlotId);
        if (moduleId) {
            const module = getModuleById(moduleId);
            if (module && module.stats) {
                if (module.stats.armor) {
                    this.maxHealth *= (1 + module.stats.armor);
                }
                if (module.stats.health) {
                    this.maxHealth *= (1 + module.stats.health);
                }
                if (module.stats.speed) {
                    this.moveSpeed *= (1 + module.stats.speed);
                }
                if (module.stats.damage) {
                    this.damage *= (1 + module.stats.damage);
                }
                if (module.stats.reload) {
                    this.cooldown *= (1 + module.stats.reload); // reload -0.15 означает -15% cooldown
                }
            }
        }
    }
    logger.log(`[Tank] Module bonuses applied from ${installedModules.size} modules`);
}
```

### 3. Добавить метод для получения ID модуля из слота

Добавить приватный метод `getModuleIdFromSlot()` в `TankController`, который будет получать ID модуля из localStorage или из гаража. Нужно проверить, как хранится маппинг слотов на модули.

### 4. Убедиться, что бонусы применяются в правильном порядке

Порядок применения бонусов должен быть:

1. `resetBaseStats()` - сброс к базовым значениям
2. Бонусы от гусениц
3. Бонусы от модулей
4. Улучшения из гаража
5. Бонусы от опыта
6. Бонусы от навыков
7. Бонусы от уровня
8. Бонусы от UpgradeManager

## Файлы для изменения

- [`src/client/tankController.ts`](src/client/tankController.ts) - добавить применение бонусов от гусениц и модулей в `applyUpgrades()`

## Примечания

- Бонусы от гусениц уже применяются в `createVisualWheels()`, но это вызывается только при создании визуальных элементов, а не при респавне
- Бонусы от модулей вообще нигде не применяются к характеристикам танка
- Нужно проверить, как хранится маппинг слотов модулей (1-10) на ID модулей в localStorage или в гараже

---

# Оптимизация анимаций и радара

## Задачи

### 1. Уменьшить продолжительность анимации переодевания до 1.5 секунд

**Файл**: [`src/client/tank/chassisTransformAnimation.ts`](src/client/tank/chassisTransformAnimation.ts)

**Текущее состояние**: Уже установлено 1500мс (1.5 секунды) в строке 57, но нужно проверить все места где используется эта анимация и убедиться что везде 1.5 секунды.

**Изменения**:
- Проверить что `duration` в конструкторе `ChassisTransformAnimation` = 1500мс
- Проверить что все фазы анимации (PHASE_DISASSEMBLY_END, PHASE_TRANSFORM_END, PHASE_ASSEMBLY_END) соответствуют 1.5 секундам
- Убедиться что в `GameGarage.ts` при вызове анимации переодевания используется правильная длительность

### 2. Уменьшить продолжительность анимации респавна до 1.5 секунд

**Файл**: [`src/client/tank/tankHealth.ts`](src/client/tank/tankHealth.ts)

**Текущее состояние**: 3000мс (3 секунды) в строке 782

**Изменения**:
- Изменить `duration = 3000` на `duration = 1500` в методе `animateReassembly()` (строка 782)
- Проверить что анимация камеры в `animateCameraToPosition()` также использует 1500мс (уже установлено в строке 483)

### 3. Изменить отображение танков на радаре на прямоугольники

**Файл**: [`src/client/hud.ts`](src/client/hud.ts)

**Текущее состояние**: Маркеры танков создаются как `Rectangle`, но имеют `cornerRadius = baseSize / 2` (строка 5266), что делает их круглыми

**Изменения**:
- Убрать или установить `cornerRadius = 0` для маркеров танков в методе `updateMinimap()` (строка 5266)
- Убедиться что маркеры остаются прямоугольными независимо от размера

## Файлы для изменения

- [`src/client/tank/tankHealth.ts`](src/client/tank/tankHealth.ts) - изменить длительность анимации респавна с 3000мс на 1500мс
- [`src/client/hud.ts`](src/client/hud.ts) - убрать cornerRadius для маркеров танков на радаре