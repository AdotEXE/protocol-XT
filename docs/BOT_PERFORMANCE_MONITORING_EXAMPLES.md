# Примеры использования системы мониторинга ботов

## Базовое использование

### Инициализация

```typescript
import { BotPerformanceMonitor } from "./bots/BotPerformanceMonitor";
import { BotPerformanceUI } from "./bots/BotPerformanceUI";
import { BotPerformanceSettingsUI } from "./bots/BotPerformanceSettingsUI";
import { BotPerformanceProfiler } from "./bots/BotPerformanceProfiler";
import { integrateBotMetrics } from "./bots/BotMetricsCollector";

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
    
    this.botPerformanceProfiler = new BotPerformanceProfiler(
        this.botPerformanceMonitor,
        this.hud.guiTexture
    );
}

// Интегрируем автоматический сбор метрик
this.enemyTanks.forEach(enemy => {
    integrateBotMetrics(enemy, this.botPerformanceMonitor);
});
```

## Автоматическая оптимизация

### Периодическая автооптимизация

```typescript
// Каждые 10 секунд проверяем и оптимизируем
setInterval(() => {
    const result = this.botPerformanceMonitor?.autoOptimize();
    if (result?.optimized) {
        console.log("Автооптимизация применена:", result.changes);
        // Уведомление пользователю
        this.hud?.showMessage("⚡ Автооптимизация применена", "#0f0", 2000);
    }
}, 10000);
```

### Оптимизация при низком FPS

```typescript
// В GameUpdate
if (this.botPerformanceMonitor && this._lastFPS < 30) {
    const result = this.botPerformanceMonitor.autoOptimize();
    if (result.optimized) {
        logger.log("[GameUpdate] Auto-optimized bots due to low FPS");
    }
}
```

## Мониторинг и алерты

### Отображение алертов в UI

```typescript
// В BotPerformanceUI
const alerts = this.monitor.getPerformanceAlerts();
alerts.forEach(alert => {
    if (alert.level === "critical") {
        // Показать критический алерт
        this.hud?.showMessage(alert.message, "#f00", 5000);
    }
});
```

### Логирование критических проблем

```typescript
// В GameUpdate
if (this.botPerformanceMonitor) {
    const alerts = this.botPerformanceMonitor.getPerformanceAlerts();
    alerts.filter(a => a.level === "critical").forEach(alert => {
        logger.error(`[BotPerformance] ${alert.message}`);
    });
}
```

## Профилирование ботов

### Профилирование проблемного бота

```typescript
// Найти бота с худшей производительностью
const comparison = this.botPerformanceMonitor.compareBots(
    this.enemyTanks.map(e => e.id.toString())
);

if (comparison.worst) {
    // Показать профиль худшего бота
    this.botPerformanceProfiler?.show(comparison.worst);
}
```

### Анализ топ ботов

```typescript
// Получить топ 5 лучших ботов по производительности
const topBots = this.botPerformanceMonitor.getTopPerformingBots(5);

// Получить топ 5 худших ботов
const worstBots = this.botPerformanceMonitor.getWorstPerformingBots(5);

// С сортировкой по разным критериям
const topByFPS = this.botPerformanceMonitor.getTopBots(5, "fpsImpact");
const topByTime = this.botPerformanceMonitor.getTopBots(5, "updateTime");
const topByPerformance = this.botPerformanceMonitor.getTopBots(5, "performance");

topBots.forEach((bot, index) => {
    console.log(`${index + 1}. Bot ${bot.id}: Score ${bot.score.toFixed(0)}`);
    console.log(`   Update Time: ${bot.metrics.averageUpdateTime.toFixed(2)}ms`);
    console.log(`   FPS Impact: ${bot.metrics.fpsImpact.toFixed(2)}%`);
    
    // Получить детальный профиль
    const profile = this.botPerformanceMonitor.getBotProfile(bot.id);
    console.log(`   Bottlenecks: ${profile.bottlenecks.join(", ")}`);
});
```

## Экспорт и анализ

### Экспорт метрик при проблемах

```typescript
// При критическом падении FPS
if (this.currentFPS < 20) {
    const json = this.botPerformanceMonitor.exportMetrics("json");
    // Отправить на сервер для анализа
    this.sendMetricsToServer(json);
}
```

### Периодический экспорт

```typescript
// Экспорт каждые 5 минут
setInterval(() => {
    const csv = this.botPerformanceMonitor.exportMetrics("csv");
    this.saveMetricsToFile(csv, `metrics-${Date.now()}.csv`);
}, 5 * 60 * 1000);
```

## Анализ производительности

### Анализ по состояниям

```typescript
const stateStats = this.botPerformanceMonitor.getStateStatistics();

// Найти состояние с худшей производительностью
let worstState = "";
let worstTime = 0;

for (const [state, stats] of Object.entries(stateStats)) {
    if (stats.averageUpdateTime > worstTime) {
        worstTime = stats.averageUpdateTime;
        worstState = state;
    }
}

console.log(`Худшее состояние: ${worstState} (${worstTime.toFixed(2)}ms)`);
```

### Сравнение производительности

```typescript
// Сравнить двух ботов
const bot1 = this.enemyTanks[0].id.toString();
const bot2 = this.enemyTanks[1].id.toString();

const comparison = this.botPerformanceMonitor.compareBots([bot1, bot2]);

console.log("Лучший:", comparison.best);
console.log("Худший:", comparison.worst);

comparison.comparison.forEach(bot => {
    console.log(`Bot ${bot.botId}: Score ${bot.score.toFixed(0)}`);
});
```

## Интеграция с EnemyTank

### Ручной сбор метрик

```typescript
// В методе updateAI() EnemyTank
const collector = (this as any).metricsCollector;
if (collector) {
    const updateStart = performance.now();
    
    // ... выполнение AI ...
    
    const updateTime = performance.now() - updateStart;
    collector.measureMethod("updateAI", () => {}, false); // Уже измерено
    
    // Записать другие метрики
    if (didRaycast) {
        collector.recordRaycast(wasCached);
    }
    
    if (didPathfinding) {
        collector.recordPathfinding(wasCached);
    }
}
```

### Отслеживание изменений состояния

```typescript
// В методе makeDecision() EnemyTank
const oldState = this.state;
this.state = newState;

if (oldState !== newState) {
    const collector = (this as any).metricsCollector;
    collector?.recordStateChange(newState);
}
```

## Настройка для разных сценариев

### Максимальная производительность (слабые устройства)

```typescript
this.botPerformanceMonitor.updateSettings({
    aiUpdateIntervalNear: 2,
    aiUpdateIntervalMid: 5,
    aiUpdateIntervalFar: 20,
    lowFPSThreshold: 40,
    lowFPSMultiplier: 2.0,
    disablePhysicsForFarBots: true,
    disableDetailsForFarBots: true,
    disableEffectsForFarBots: true,
    disableSoundsForFarBots: true,
    lodEnabled: true,
    maxBots: 20
});
```

### Максимальное качество (сильные устройства)

```typescript
this.botPerformanceMonitor.updateSettings({
    aiUpdateIntervalNear: 1,
    aiUpdateIntervalMid: 1,
    aiUpdateIntervalFar: 3,
    disablePhysicsForFarBots: false,
    disableDetailsForFarBots: false,
    lodEnabled: false,
    maxBots: 100
});
```

### Сбалансированный режим

```typescript
this.botPerformanceMonitor.updateSettings({
    aiUpdateIntervalNear: 1,
    aiUpdateIntervalMid: 3,
    aiUpdateIntervalFar: 10,
    adaptiveUpdateEnabled: true,
    lowFPSThreshold: 30,
    lodEnabled: true,
    maxBots: 50
});
```

## Отладка проблем

### Найти проблемного бота

```typescript
// Найти бота с худшей производительностью
const allBots = this.botPerformanceMonitor.getAllBots();
const worstBot = allBots.reduce((worst, bot) => {
    if (!worst || bot.metrics.fpsImpact > worst.metrics.fpsImpact) {
        return bot;
    }
    return worst;
}, null as { id: string; metrics: BotMetrics } | null);

if (worstBot) {
    console.log("Проблемный бот:", worstBot.id);
    console.log("FPS Impact:", worstBot.metrics.fpsImpact);
    console.log("Update Time:", worstBot.metrics.averageUpdateTime);
    
    // Показать профиль
    this.botPerformanceProfiler?.show(worstBot.id);
}
```

### Анализ узких мест

```typescript
const profile = this.botPerformanceMonitor.getBotProfile(botId);

console.log("Performance Score:", profile.performanceScore);
console.log("Bottlenecks:", profile.bottlenecks);
console.log("Recommendations:", profile.recommendations);

// Получить рекомендации с приоритетами
const recommendations = this.botPerformanceMonitor.getBotOptimizationRecommendations(botId);
recommendations.forEach(rec => {
    const color = rec.priority === "High" ? "🔴" : rec.priority === "Medium" ? "🟡" : "🟢";
    console.log(`${color} [${rec.priority}] ${rec.text}`);
});

// Получить performance score
const score = this.botPerformanceMonitor.getBotPerformanceScore(botId);
console.log(`Performance Score: ${score}/100`);
```

### Валидация настроек

```typescript
// Все настройки автоматически валидируются при применении
this.botPerformanceMonitor.updateSettings({
    aiUpdateIntervalNear: 0, // Автоматически будет установлено в 1 (минимум)
    aiUpdateIntervalFar: 200, // Автоматически будет установлено в 100 (максимум)
    maxBots: -5, // Автоматически будет установлено в 1 (минимум)
    maxBots: 500, // Автоматически будет установлено в 200 (максимум)
    lowFPSThreshold: 5, // Автоматически будет установлено в 10 (минимум)
    lowFPSThreshold: 200, // Автоматически будет установлено в 60 (максимум)
});

// Все значения будут автоматически ограничены допустимыми диапазонами
```

### Безопасная работа с метриками

```typescript
// Все методы защищены от ошибок и некорректных данных
const metrics = this.botPerformanceMonitor.getBotMetrics(botId);

if (metrics) {
    // Все значения гарантированно валидны (isFinite, в допустимых диапазонах)
    console.log("Update Time:", metrics.averageUpdateTime); // Всегда число
    console.log("FPS Impact:", metrics.fpsImpact); // Всегда 0-100
    console.log("CPU Usage:", metrics.cpuUsage); // Всегда 0-100
}

// Агрегированные метрики также защищены
const aggregated = this.botPerformanceMonitor.getAggregatedMetrics();
if (aggregated) {
    // Все вычисления защищены от деления на ноль и некорректных значений
    console.log("Average Update Time:", aggregated.averageUpdateTime);
    console.log("Average CPU Usage:", aggregated.averageCPUUsage);
}
```

### Обработка ошибок

```typescript
// Все методы обрабатывают ошибки автоматически
try {
    const result = this.botPerformanceMonitor.autoOptimize();
    if (result.optimized) {
        console.log("Изменения применены:", result.changes);
    }
} catch (e) {
    // Ошибки логируются автоматически, но не прерывают выполнение
    logger.warn("[BotPerformance] Auto-optimization error:", e);
}

// Методы возвращают безопасные значения даже при ошибках
const profile = this.botPerformanceMonitor.getBotProfile("invalid_id");
// Вернёт: { metrics: undefined, performanceScore: 0, bottlenecks: [], recommendations: [] }

const alerts = this.botPerformanceMonitor.getPerformanceAlerts();
// Всегда возвращает массив (может быть пустым)
```

