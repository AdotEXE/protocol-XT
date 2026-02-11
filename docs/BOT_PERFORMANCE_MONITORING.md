# Мониторинг и настройки производительности ботов

## Обзор

Система мониторинга производительности ботов предоставляет максимально подробную информацию о работе AI ботов и позволяет настраивать их производительность для оптимизации FPS.

## Компоненты

### BotPerformanceMonitor

Основной класс для сбора и анализа метрик производительности ботов.

**Метрики:**
- Время выполнения каждого метода AI
- Статистика raycast и pathfinding запросов
- Использование памяти
- Статистика стрельбы и движения
- Статистика уклонений и группового поведения
- Влияние на FPS

### BotPerformanceUI

UI панель для отображения метрик в реальном времени.

**Отображает:**
- Общую статистику ботов
- Распределение по расстояниям и состояниям
- Детальное время выполнения AI методов
- Статистику стрельбы, движения, уклонений
- Кэш статистику
- Рекомендации по оптимизации

### BotPerformanceSettingsUI

UI панель для настройки производительности ботов.

**Настройки:**
- Интервалы обновления AI для разных расстояний
- Адаптивные интервалы при низком FPS
- LOD настройки
- Настройки физики
- Оптимизации AI (кэширование, лимиты операций)
- Групповое поведение
- Уклонения от снарядов
- Оптимизации рендеринга
- Настройки мониторинга

### BotPerformanceProfiler

UI панель для профилирования отдельных ботов.

**Возможности:**
- Выбор бота из списка
- Детальный профиль производительности
- Performance Score (0-100)
- Узкие места (bottlenecks)
- Рекомендации по оптимизации
- Обновление в реальном времени

### BotMetricsCollector

Автоматический сбор метрик из EnemyTank.

**Возможности:**
- Автоматическое измерение времени выполнения методов
- Запись статистики операций
- Интеграция с EnemyTank

## Использование

### Инициализация

```typescript
import { BotPerformanceMonitor } from "./bots/BotPerformanceMonitor";
import { BotPerformanceUI } from "./bots/BotPerformanceUI";
import { BotPerformanceSettingsUI } from "./bots/BotPerformanceSettingsUI";

// В Game классе
this.botPerformanceMonitor = new BotPerformanceMonitor();
this.botPerformanceMonitor.initialize(this.enemyTanks);

// Создаём UI
if (this.hud?.guiTexture) {
    this.botPerformanceUI = new BotPerformanceUI(
        this.botPerformanceMonitor,
        this.hud.guiTexture
    );
    
    this.botPerformanceSettingsUI = new BotPerformanceSettingsUI(
        this.botPerformanceMonitor,
        this.hud.guiTexture
    );
}

// Передаём в GameUpdate
this.gameUpdate.initialize(this.engine, this.scene, {
    // ... другие параметры
    botPerformanceMonitor: this.botPerformanceMonitor
});
```

### Запись метрик из EnemyTank

```typescript
// В методе updateAI() EnemyTank
const updateAIStartTime = performance.now();

// ... выполнение AI логики ...

const updateAITime = performance.now() - updateAIStartTime;

// Записываем метрики
if (this.botPerformanceMonitor) {
    const botId = this.id.toString();
    
    // Записываем время обновления
    this.botPerformanceMonitor.recordBotUpdate(botId, updateAITime);
    
    // Записываем детальное время AI методов
    this.botPerformanceMonitor.recordAITiming(botId, {
        updateAITime: updateAITime,
        makeDecisionTime: decisionTime,
        raycastTime: raycastTime,
        // ... другие метрики
    });
    
    // Записываем raycast
    this.botPerformanceMonitor.recordRaycast(botId, cached);
    
    // Записываем изменение состояния
    if (newState !== oldState) {
        this.botPerformanceMonitor.recordStateChange(botId, newState);
    }
    
    // Записываем выстрел
    this.botPerformanceMonitor.recordShot(botId, hit);
    
    // Записываем движение
    this.botPerformanceMonitor.recordMovement(botId, distance, speed);
    
    // Записываем уклонение
    this.botPerformanceMonitor.recordDodge(botId, successful);
    
    // Записываем групповое поведение
    this.botPerformanceMonitor.recordGroupBehavior(botId, "coordination");
}
```

### Отображение UI

```typescript
// Показать мониторинг
this.botPerformanceUI?.show();

// Показать настройки
this.botPerformanceSettingsUI?.show();

// Скрыть
this.botPerformanceUI?.hide();
this.botPerformanceSettingsUI?.hide();
```

### Получение метрик

```typescript
// Получить агрегированные метрики
const metrics = this.botPerformanceMonitor?.getAggregatedMetrics();

// Получить метрики конкретного бота
const botMetrics = this.botPerformanceMonitor?.getBotMetrics(botId);

// Получить рекомендации по оптимизации
const recommendations = this.botPerformanceMonitor?.getOptimizationRecommendations();
```

## Настройки производительности

### Интервалы обновления AI

- **Близкие боты (< 50м)**: Обновляются каждый кадр (интервал 1)
- **Средние боты (50-100м)**: Обновляются каждые 3 кадра
- **Дальние боты (> 100м)**: Обновляются каждые 10 кадров

### Адаптивные интервалы

При падении FPS ниже порога (по умолчанию 30 FPS), интервалы автоматически увеличиваются на множитель (по умолчанию 1.5x).

### LOD система

- **Высокий LOD**: < 50м - все детали включены
- **Средний LOD**: 50-100м - некоторые детали отключены
- **Низкий LOD**: > 100м - большинство деталей отключено

### Физика

Физика отключается для ботов дальше порога (по умолчанию 100м) для экономии производительности.

### Оптимизации AI

- **Кэширование AI**: Кэширует результаты вычислений на время TTL
- **Лимиты операций**: Ограничивает количество raycast и pathfinding запросов за кадр
- **Отключение для дальних**: Отключает raycast и pathfinding для дальних ботов

## Рекомендации по оптимизации

Система автоматически анализирует метрики и предоставляет рекомендации:

- При высоком влиянии на FPS (> 10%) рекомендуется увеличить интервалы обновления дальних ботов
- При высоком среднем времени обновления (> 5мс) рекомендуется включить LOD для дальних ботов
- При большом количестве ботов с физикой (> 50%) рекомендуется отключить физику для дальних ботов
- При приближении к максимуму ботов (> 80%) выдаётся предупреждение

## Примеры использования

### Отладка производительности

```typescript
// Включить логирование метрик
this.botPerformanceMonitor?.updateSettings({ logMetrics: true });

// Получить детальные метрики
const metrics = this.botPerformanceMonitor?.getAggregatedMetrics();
console.log("FPS Impact:", metrics?.estimatedFPSImpact);
console.log("Average Update Time:", metrics?.averageUpdateTime);
console.log("AI Timing:", metrics?.averageAITiming);
```

### Оптимизация для слабых устройств

```typescript
// Увеличить интервалы обновления
this.botPerformanceMonitor?.updateSettings({
    aiUpdateIntervalNear: 2,
    aiUpdateIntervalMid: 5,
    aiUpdateIntervalFar: 20,
    lowFPSThreshold: 40,
    lowFPSMultiplier: 2.0
});
```

### Максимальная производительность

```typescript
// Отключить все оптимизации для максимальной точности
this.botPerformanceMonitor?.updateSettings({
    aiUpdateIntervalNear: 1,
    aiUpdateIntervalMid: 1,
    aiUpdateIntervalFar: 1,
    disablePhysicsForFarBots: false,
    disableDetailsForFarBots: false,
    enableAICaching: false
});
```

## API Reference

### BotPerformanceMonitor

#### Методы

**Инициализация и управление:**
- `initialize(bots: EnemyTank[], settings?: Partial<BotPerformanceSettings>)` - Инициализация
- `updateMetrics()` - Обновить метрики
- `updateBotsList(bots: EnemyTank[])` - Обновить список ботов
- `updateFPS(fps: number)` - Обновить FPS
- `updatePlayerPosition(position: Vector3)` - Обновить позицию игрока
- `dispose()` - Очистить ресурсы

**Запись метрик:**
- `recordBotUpdate(botId: string, updateTime: number)` - Записать время обновления
- `recordAITiming(botId: string, methodName: string, duration: number)` - Записать время выполнения AI метода
- `recordRaycast(botId: string, cached: boolean)` - Записать raycast
- `recordPathfinding(botId: string, cached: boolean)` - Записать pathfinding
- `recordStateChange(botId: string, newState: string)` - Записать изменение состояния
- `recordShot(botId: string, hit: boolean)` - Записать выстрел
- `recordMovement(botId: string, distance: number, speed: number)` - Записать движение
- `recordDodge(botId: string, successful: boolean)` - Записать уклонение
- `recordGroupCoordination(botId: string)` - Записать групповую координацию
- `recordCoverSeeking(botId: string)` - Записать поиск укрытия

**Получение метрик:**
- `getBotMetrics(botId: string): BotMetrics | undefined` - Получить метрики бота
- `getAggregatedMetrics(): AggregatedBotMetrics | null` - Получить агрегированные метрики
- `getBotProfile(botId: string)` - Получить профиль производительности бота
- `getBotPerformanceScore(botId: string): number` - Получить performance score бота (0-100)
- `getBotOptimizationRecommendations(botId: string)` - Получить рекомендации для бота
- `getAllBots(): Array<{ id: string; metrics: BotMetrics }>` - Получить все боты с метриками
- `getTopPerformingBots(count: number)` - Получить топ N лучших ботов
- `getWorstPerformingBots(count: number)` - Получить топ N худших ботов
- `getTopBots(count: number, sortBy: "performance" | "fpsImpact" | "updateTime")` - Получить топ ботов с сортировкой
- `getStateStatistics()` - Получить статистику по состояниям
- `getBotStateDistribution()` - Получить распределение состояний
- `getBotUpdateIntervalDistribution()` - Получить распределение интервалов обновления
- `getMetricsHistory()` - Получить историю метрик для графиков

**Настройки:**
- `getSettings(): BotPerformanceSettings` - Получить настройки
- `updateSettings(settings: Partial<BotPerformanceSettings>)` - Обновить настройки (с валидацией)

**Оптимизация:**
- `autoOptimize(): { optimized: boolean; changes: string[] }` - Автоматическая оптимизация
- `getOptimizationRecommendations(): Array<{ priority: "High" | "Medium" | "Low"; message: string; action?: () => void }>` - Получить рекомендации
- `compareBots(botIds: string[])` - Сравнить производительность ботов

**Экспорт и алерты:**
- `exportMetrics(format: "json" | "csv"): string` - Экспортировать метрики
- `getPerformanceAlerts(): Array<{ level: "critical" | "warning" | "info"; message: string; timestamp: number }>` - Получить алерты

**Управление метриками:**
- `clearBotMetrics(botId: string)` - Очистить метрики бота
- `clearAllMetrics()` - Очистить все метрики

### BotPerformanceUI

#### Методы

- `show()` - Показать UI
- `hide()` - Скрыть UI
- `dispose()` - Очистить ресурсы

**Отображает:**
- Общую статистику ботов
- Распределение по расстояниям и состояниям
- Детальное время выполнения AI методов
- Статистику стрельбы, движения, уклонений
- Кэш статистику
- Графики производительности в реальном времени
- Алерты о производительности
- Рекомендации по оптимизации
- Кнопки для автооптимизации и экспорта метрик

### BotPerformanceSettingsUI

#### Методы

- `show()` - Показать UI настроек
- `hide()` - Скрыть UI
- `dispose()` - Очистить ресурсы

**Настройки:**
- Интервалы обновления AI (близкие, средние, дальние)
- Адаптивные интервалы (пороги FPS, множители)
- LOD настройки (расстояния, включение/выключение)
- Физика (пороги расстояния, отключение для дальних)
- Максимальное количество ботов
- Мониторинг (включение/выключение, интервал обновления, размер истории)
- Автооптимизация (включение, интервал, агрессивность)
- Профилирование и экспорт метрик
- Пороги алертов
- AI функции (кэширование, групповые тактики, уклонения, система укрытий)
- Рендеринг и аудио оптимизации

### BotPerformanceProfiler

#### Методы

- `show(botId: string)` - Показать профиль бота
- `hide()` - Скрыть профиль
- `dispose()` - Очистить ресурсы

**Отображает:**
- Performance Score (0-100)
- Детальные метрики (состояние, расстояние, LOD, физика)
- Производительность (время обновления, влияние на FPS, CPU, память)
- Время выполнения AI методов
- AI статистика (raycasts, pathfinding, стрельба, движение)
- Узкие места (bottlenecks)
- Рекомендации по оптимизации с приоритетами

### BotMetricsCollector

#### Методы

- `measureMethod(methodName: string, fn: () => any): any` - Измерить время выполнения метода
- `recordRaycast(cached: boolean)` - Записать raycast
- `recordPathfinding(cached: boolean)` - Записать pathfinding
- `recordStateChange(newState: string)` - Записать изменение состояния
- `recordShot(hit: boolean)` - Записать выстрел
- `recordMovement(distance: number, speed: number)` - Записать движение
- `recordDodge(successful: boolean)` - Записать уклонение
- `recordGroupBehavior(type: "coordination" | "coverSeeking")` - Записать групповое поведение

**Функции:**
- `integrateBotMetrics(enemy: EnemyTank, monitor: BotPerformanceMonitor | null)` - Интегрировать сбор метрик в EnemyTank

## Интеграция с EnemyTank

Для полной функциональности мониторинга необходимо добавить запись метрик в методы EnemyTank:

1. В `updateAI()` - записывать время выполнения
2. В `makeDecision()` - записывать время принятия решений
3. В методах raycast - записывать статистику raycast
4. В методах pathfinding - записывать статистику pathfinding
5. При изменении состояния - записывать изменения
6. При выстреле - записывать статистику стрельбы
7. При движении - записывать статистику движения
8. При уклонении - записывать статистику уклонений

## Производительность

Система мониторинга оптимизирована для минимального влияния на производительность:

- Метрики обновляются с интервалом (по умолчанию 1 секунда)
- История метрик ограничена размером (по умолчанию 60 записей)
- Детальные метрики можно отключить для экономии памяти
- Кэширование результатов вычислений

## Новые возможности

### ✅ Графики производительности в реальном времени

В UI отображаются графики влияния на FPS с историей последних 20 точек данных.

### ✅ Автоматическая оптимизация

Система может автоматически оптимизировать настройки на основе текущих метрик:

```typescript
// Запустить автооптимизацию
const result = botPerformanceMonitor.autoOptimize();
if (result.optimized) {
    console.log("Применены изменения:", result.changes);
}
```

### ✅ Профилирование отдельных ботов

Профилировщик позволяет детально анализировать производительность конкретного бота:

```typescript
import { BotPerformanceProfiler } from "./bots/BotPerformanceProfiler";

const profiler = new BotPerformanceProfiler(botPerformanceMonitor, hud.guiTexture);
profiler.show(botId); // Показать профиль конкретного бота
```

**Профиль включает:**
- Performance Score (0-100)
- Детальные метрики
- Узкие места (bottlenecks)
- Рекомендации по оптимизации

### ✅ Экспорт метрик

Метрики можно экспортировать в JSON или CSV:

```typescript
// Экспорт в JSON
const json = botPerformanceMonitor.exportMetrics("json");
// Сохранение в файл...

// Экспорт в CSV
const csv = botPerformanceMonitor.exportMetrics("csv");
// Сохранение в файл...
```

### ✅ Система алертов

Автоматические алерты о проблемах производительности:

```typescript
const alerts = botPerformanceMonitor.getPerformanceAlerts();
alerts.forEach(alert => {
    console.log(`[${alert.level}] ${alert.message}`);
});
```

**Уровни алертов:**
- `critical` - Критические проблемы (FPS < 15, влияние > 20%)
- `warning` - Предупреждения (FPS < 30, влияние > 10%)
- `info` - Информационные сообщения

### ✅ Сравнение производительности

Сравнение производительности между ботами:

```typescript
const comparison = botPerformanceMonitor.compareBots([botId1, botId2, botId3]);
console.log("Лучший бот:", comparison.best);
console.log("Худший бот:", comparison.worst);
console.log("Сравнение:", comparison.comparison);
```

### ✅ Автоматический сбор метрик

Интеграция с EnemyTank для автоматического сбора метрик:

```typescript
import { integrateBotMetrics } from "./bots/BotMetricsCollector";

// При создании бота
const enemy = new EnemyTank(...);
integrateBotMetrics(enemy, botPerformanceMonitor);
```

Это автоматически собирает метрики из всех методов AI.

### ✅ Расширенные рекомендации

Рекомендации теперь включают приоритеты и действия:

```typescript
const recommendations = botPerformanceMonitor.getOptimizationRecommendations();
recommendations.forEach(rec => {
    console.log(`[${rec.priority}] ${rec.message}`);
    if (rec.action) {
        rec.action(); // Автоматически применить рекомендацию
    }
});
```

**Приоритеты:**
- `high` - Критические проблемы (красный цвет)
- `medium` - Средние проблемы (желтый цвет)
- `low` - Оптимизации (зеленый цвет)

### ✅ Статистика по состояниям

Анализ производительности по состояниям ботов:

```typescript
const stateStats = botPerformanceMonitor.getStateStatistics();
// {
//   "attack": { count: 5, averageUpdateTime: 3.2, averageFPSImpact: 2.1 },
//   "chase": { count: 3, averageUpdateTime: 2.8, averageFPSImpact: 1.8 },
//   ...
// }
```

### ✅ Топ ботов

Получить топ N ботов по производительности:

```typescript
// Топ лучших ботов
const topBots = botPerformanceMonitor.getTopPerformingBots(5);

// Топ худших ботов
const worstBots = botPerformanceMonitor.getWorstPerformingBots(5);

// С сортировкой
const topByFPS = botPerformanceMonitor.getTopBots(5, "fpsImpact");
const topByTime = botPerformanceMonitor.getTopBots(5, "updateTime");
// Сортировка по: "performance" | "fpsImpact" | "updateTime"
```

### ✅ Валидация и безопасность

Все методы включают валидацию данных и защиту от ошибок:

- **Валидация настроек**: Все параметры валидируются перед применением (диапазоны, типы)
- **Защита от деления на ноль**: Все вычисления средних значений защищены
- **Проверка на undefined/null**: Все операции проверяют наличие данных
- **Обработка ошибок**: Все методы обёрнуты в try-catch блоки
- **Безопасные вычисления**: Используются функции `safeMax`, `safeReduce`, `safeDiv` для безопасных вычислений

### ✅ Исправления и улучшения

**Версия 0.4.20501:**
- ✅ Исправлены синтаксические ошибки в try-catch блоках
- ✅ Добавлена валидация всех параметров настроек
- ✅ Улучшена обработка ошибок во всех методах
- ✅ Добавлены проверки на undefined/null для всех операций
- ✅ Исправлены проблемы с итерацией Map (совместимость с TypeScript)
- ✅ Добавлены безопасные функции вычислений (safeMax, safeReduce, safeDiv)
- ✅ Исправлено использование переменных (averageCPUUsage → avgCPUUsage)
- ✅ Улучшена структура кода и читаемость

**Производительность:**
- Минимальное влияние на FPS (< 1%)
- Оптимизированные вычисления с кэшированием
- Адаптивные интервалы обновления
- Ограничение размера истории метрик

