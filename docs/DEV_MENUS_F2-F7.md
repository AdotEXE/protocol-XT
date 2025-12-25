# 📚 Документация меню разработчика F2-F7

**Версия:** 1.0  
**Дата:** 2025-12-XX

---

## 📋 Содержание

1. [F2 - Скриншот](#f2---скриншот)
2. [F3 - Debug Dashboard](#f3---debug-dashboard)
3. [F4 - Physics Panel](#f4---physics-panel)
4. [F5 - System Terminal](#f5---system-terminal)
5. [F6 - Session Settings](#f6---session-settings)
6. [F7 - Cheat Menu](#f7---cheat-menu)
7. [Общие функции](#общие-функции)
8. [API Reference](#api-reference)
9. [Примеры использования](#примеры-использования)

---

## 🖼️ F2 - Скриншот

### Описание

Расширенная система скриншотов с поддержкой различных форматов, режимов, фильтров и автоматических правил.

### Горячая клавиша

**F2** - Открыть/закрыть панель скриншотов

### Основные функции

#### 1. Форматы экспорта

- **PNG** - Без потерь, высокое качество (по умолчанию)
- **JPEG** - Сжатие с настраиваемым качеством (0-100%)
- **WebP** - Современный формат с хорошим сжатием

**Пример:**
```typescript
const screenshotManager = new ScreenshotManager(engine, scene, hud);
const blob = await screenshotManager.capture({
    format: ScreenshotFormat.JPEG,
    quality: 0.85,
    mode: ScreenshotMode.FULL_SCREEN
});
```

#### 2. Режимы скриншота

- **FULL_SCREEN** - Полный экран (игра + UI)
- **GAME_ONLY** - Только игровая сцена (UI скрывается)
- **UI_ONLY** - Только UI элементы
- **REGION** - Выбранная область (интерактивный выбор)

**Файл:** `src/client/screenshotManager.ts`

#### 3. Фильтры изображений

- **Brightness** - Яркость (-100 до +100)
- **Contrast** - Контраст (-100 до +100)
- **Saturation** - Насыщенность (-100 до +100)
- **Blur** - Размытие (0-10)
- **Sharpen** - Резкость (0-100)

**Пример:**
```typescript
const blob = await screenshotManager.capture({
    format: ScreenshotFormat.PNG,
    mode: ScreenshotMode.GAME_ONLY,
    filters: {
        brightness: 10,
        contrast: 15,
        saturation: 20
    }
});
```

#### 4. Водяной знак

- Текст или изображение
- Позиции: top-left, top-right, bottom-left, bottom-right, center
- Настраиваемая прозрачность

**Пример:**
```typescript
const blob = await screenshotManager.capture({
    format: ScreenshotFormat.PNG,
    mode: ScreenshotMode.FULL_SCREEN,
    watermark: {
        text: "Protocol TX",
        position: "bottom-right",
        opacity: 0.7,
        fontSize: 24
    }
});
```

#### 5. Автоматические скриншоты

**Триггеры:**
- `ENEMY_KILL` - При убийстве врага
- `PLAYER_DEATH` - При смерти игрока
- `ACHIEVEMENT` - При получении достижения
- `INTERVAL` - По интервалу (секунды)
- `CUSTOM_EVENT` - Пользовательские события

**Файл:** `src/client/autoScreenshot.ts`

**Пример:**
```typescript
const autoManager = new AutoScreenshotManager(screenshotManager, game);
autoManager.setupRule({
    id: "kill_screenshots",
    enabled: true,
    trigger: AutoScreenshotTrigger.ENEMY_KILL,
    format: ScreenshotFormat.PNG,
    mode: ScreenshotMode.GAME_ONLY
});
```

#### 6. Галерея скриншотов

- Просмотр всех скриншотов
- Миниатюры
- Экспорт всех в ZIP
- Удаление отдельных скриншотов

**Файл:** `src/client/screenshotGallery.ts`

**Использование:**
- Открыть панель F2
- Нажать "Галерея"
- Просмотр, экспорт или удаление

### API

```typescript
class ScreenshotManager {
    constructor(engine: Engine, scene: Scene, hud: HUD | null);
    async capture(options: ScreenshotOptions): Promise<Blob>;
    setHUD(hud: HUD | null): void;
}

interface ScreenshotOptions {
    format: ScreenshotFormat;
    quality?: number; // 0-1 для JPEG/WebP
    mode: ScreenshotMode;
    filters?: ImageFilters;
    watermark?: WatermarkOptions;
    textOverlay?: TextOverlayOptions;
    region?: { x: number; y: number; width: number; height: number };
}
```

---

## 📊 F3 - Debug Dashboard

### Описание

Панель отладки с расширенными метриками производительности, графиками и автоматизацией.

### Горячая клавиша

**F3** - Открыть/закрыть панель отладки

### Основные функции

#### 1. Метрики производительности

**GPU:**
- Использование GPU
- Память GPU
- Информация о рендерере
- Информация о вендоре

**CPU:**
- Использование CPU (ограниченно в браузере)
- Количество ядер

**Сеть:**
- Входящий трафик (bytes/s)
- Исходящий трафик (bytes/s)
- Задержка (latency)
- Количество пакетов

**Физика:**
- Количество физических объектов
- Количество коллизий
- Время обработки физики
- Количество тел

**Звук:**
- Количество источников звука
- Память звука
- Активные звуки

**Эффекты:**
- Количество частиц
- Активные системы эффектов
- Активные эффекты

**Сцена:**
- Количество мешей
- Количество источников света
- Количество камер
- Количество материалов
- Количество текстур

**Файл:** `src/client/metricsCollector.ts`

#### 2. Графики метрик

- Графики в реальном времени (Chart.js)
- Настраиваемые цвета и диапазоны
- История до 60 точек данных
- Автоматическое обновление

**Файл:** `src/client/metricsCharts.ts`

**Доступные графики:**
- FPS
- Memory (MB)
- Draw Calls
- Triangles
- Frame Time (ms)

#### 3. Экспорт метрик

- **CSV** - Для анализа в Excel/Google Sheets
- **JSON** - Для программной обработки

**Файл:** `src/client/metricsExporter.ts`

**Пример:**
```typescript
const exporter = new MetricsExporter();
const csv = exporter.exportToCSV(metricsHistory);
exporter.download(csv, "metrics.csv", "text/csv");
```

#### 4. Автоматизация

- Предупреждения при низком FPS
- Предупреждения при высоком использовании памяти
- Триггеры для автоматических действий
- Автоматические отчёты

**Файл:** `src/client/metricsAutomation.ts`

**Пример:**
```typescript
const automation = new MetricsAutomation();
automation.setThreshold("fps", 30, "warning");
automation.setThreshold("memory", 500, "alert");
```

### API

```typescript
class MetricsCollector {
    constructor(engine: Engine, scene: Scene);
    collect(): ExtendedMetrics;
}

class MetricsCharts {
    createChartsContainer(): HTMLDivElement;
    updateChart(chartId: string, value: number): void;
}

class MetricsExporter {
    exportToCSV(metrics: MetricsData[]): string;
    exportToJSON(metrics: MetricsData[]): string;
    download(data: string, filename: string, mimeType: string): void;
}
```

---

## ⚙️ F4 - Physics Panel

### Описание

Панель настройки физики в реальном времени с визуализацией и симуляцией.

### Горячая клавиша

**F4** - Открыть/закрыть панель физики

### Основные функции

#### 1. Настройка физики танка

**Параметры:**
- `hoverHeight` - Высота парения (0.5-2.0)
- `hoverStiffness` - Жесткость подвески (5000-50000)
- `hoverDamping` - Демпфирование (100-2000)
- `uprightForce` - Сила выравнивания (1000-10000)
- `movementDamping` - Демпфирование движения (0.1-1.0)
- `maxSpeed` - Максимальная скорость (10-50)
- `acceleration` - Ускорение (5000-20000)
- `turnSpeed` - Скорость поворота (1.0-5.0)

**Файл:** `src/client/physicsPanel.ts`

#### 2. Визуализация физики

- **Векторы сил** - Зелёные линии
- **Скорость** - Синие линии
- **Угловая скорость** - Красные линии
- **Центр масс** - Циановая сфера
- **Коллизии** - Маркеры в точках контакта

**Файл:** `src/client/physicsVisualizer.ts`

**Использование:**
```typescript
const visualizer = new PhysicsVisualizer(scene);
visualizer.setEnabled(true);
visualizer.updateOptions({
    showVectors: true,
    showVelocity: true,
    showCenterOfMass: true
});
```

#### 3. Режим симуляции

- Тестовые сценарии (падение, прыжок, столкновение)
- Сравнение результатов
- Изолированная среда

**Файл:** `src/client/physicsSimulator.ts`

**Доступные сценарии:**
- `falling_objects` - Падение объектов
- `jump_test` - Тест прыжка
- `collision_test` - Тест столкновений
- `stability_test` - Тест стабильности

#### 4. Пресеты

- До 10 сохранённых пресетов
- Импорт/экспорт пресетов
- Быстрое применение

**Пример:**
```typescript
// Сохранение пресета
physicsPanel.savePreset("fast_tank", currentConfig);

// Загрузка пресета
physicsPanel.loadPreset("fast_tank");
```

### API

```typescript
class PhysicsPanel {
    setTank(tank: TankController | null): void;
    setGame(game: Game | null): void;
    savePreset(name: string, config: any): void;
    loadPreset(name: string): void;
    exportPresets(): string;
    importPresets(data: string): void;
}

class PhysicsVisualizer {
    setEnabled(enabled: boolean): void;
    updateOptions(options: Partial<PhysicsVisualizationOptions>): void;
    visualizePhysics(mesh: Mesh, physicsBody: any): void;
}
```

---

## 💻 F5 - System Terminal

### Описание

Системная консоль с поддержкой команд, скриптов, макросов и автоматизации.

### Горячая клавиша

**F5** - Открыть/закрыть системную консоль

### Основные функции

#### 1. Система команд

**Встроенные команды:**
- `help` - Список всех команд
- `spawn <x> <y> <z>` - Спавн врага
- `teleport <x> <y> <z>` - Телепортация игрока
- `set <variable> <value>` - Установка переменной
- `get <variable>` - Получение переменной
- `clear` - Очистка консоли
- `history` - История команд

**Файл:** `src/client/commandSystem.ts`

**Пример:**
```typescript
const commandSystem = new CommandSystem(game);
await commandSystem.execute("spawn 10 0 10");
await commandSystem.execute("teleport 0 5 0");
```

#### 2. Автодополнение

- Tab для автодополнения
- Стрелки вверх/вниз для истории
- Подсветка синтаксиса

#### 3. Скрипты и макросы

- Выполнение скриптов из файлов
- Запись макросов
- Сохранение и загрузка скриптов

**Файл:** `src/client/scriptEngine.ts`

**Пример:**
```typescript
const scriptEngine = new ScriptEngine(commandSystem);

// Выполнение скрипта
await scriptEngine.executeScript(`
    spawn 0 0 0
    wait 2
    teleport 10 0 10
`);

// Запись макроса
const recorder = scriptEngine.recordMacro();
recorder.start();
// ... выполняем команды ...
const macro = recorder.stop();
scriptEngine.saveMacro("my_macro", macro);
```

#### 4. Автоматизация

- Триггеры на события
- Планировщик задач
- Условная логика

**Файл:** `src/client/terminalAutomation.ts`

#### 5. Визуальное оформление

- Темы (dark, light, custom)
- Подсветка синтаксиса
- Настраиваемые цвета

**Файл:** `src/client/terminalTheme.ts`

### API

```typescript
class CommandSystem {
    registerCommand(command: Command): void;
    async execute(input: string): Promise<string>;
    getHistory(direction: 'up' | 'down'): string | null;
    autocomplete(input: string): string[];
}

class ScriptEngine {
    async executeScript(script: string): Promise<string[]>;
    recordMacro(): MacroRecorder;
    saveScript(name: string, script: string): void;
    loadScript(name: string): string | null;
}
```

---

## 🎮 F6 - Session Settings

### Описание

Настройки игровой сессии: враги, волны, мир, режимы игры.

### Горячая клавиша

**F6** - Открыть/закрыть настройки сессии

### Основные функции

#### 1. Настройки врагов

- **Количество** - 0-50 врагов
- **Интервал спавна** - 1-60 секунд
- **Сложность AI** - easy, medium, hard
- **Типы врагов** - Настройка вероятности появления
- **Уровни врагов** - Минимум, максимум, масштабирование

**Файл:** `src/client/sessionSettings.ts`

#### 2. Зоны спавна

- Создание зон спавна
- Настройка радиуса
- Включение/выключение зон

**Пример:**
```typescript
const settings = sessionSettings.getSettings();
settings.spawnZones.push({
    id: "zone1",
    name: "Центр",
    center: { x: 0, y: 0, z: 0 },
    radius: 20,
    enabled: true
});
```

#### 3. Паттерны спавна

- `random` - Случайный
- `circle` - По кругу
- `line` - Линией
- `grid` - Сеткой
- `custom` - Пользовательский

#### 4. Редактор волн

- Визуальный редактор волн
- Настройка задержек
- Типы и количество врагов
- Паттерны спавна

**Файл:** `src/client/waveEditor.ts`

**Использование:**
- Открыть F6
- Перейти в раздел "Волны"
- Нажать "Редактор волн"
- Создать/редактировать волны

#### 5. Настройки мира

- **Погода** - clear, rain, snow, fog, storm
- **Время суток** - 0-24 часа
- **Видимость** - 0-1
- **Плотность тумана** - 0-1
- **Ветер** - Направление и сила

**Файл:** `src/client/worldManager.ts`

#### 6. Режимы игры

- **normal** - Обычный режим
- **survival** - Выживание (волны врагов)
- **capture** - Захват точек
- **raid** - Рейд (PvE с боссами)
- **sandbox** - Песочница

### API

```typescript
class SessionSettings {
    getSettings(): SessionSettingsData;
    setSettings(settings: SessionSettingsData): void;
    applySettings(): void;
}

interface SessionSettingsData {
    gameMode: GameMode;
    enemyCount: number;
    spawnInterval: number;
    aiDifficulty: "easy" | "medium" | "hard";
    enemyTypes: EnemyTypeConfig[];
    spawnZones: SpawnZone[];
    spawnPattern: SpawnPattern;
    waveSystem: WaveSystemConfig;
    worldSettings: WorldSettings;
}
```

---

## 🎯 F7 - Cheat Menu

### Описание

Меню читов для разработки и тестирования с профилями и категориями.

### Горячая клавиша

**F7** - Открыть/закрыть меню читов

### Основные функции

#### 1. Категории читов

**Combat (Боевые):**
- Бессмертие
- Бесконечные патроны
- Одним выстрелом
- Бесконечное здоровье

**Movement (Движение):**
- Супер скорость
- Прыжок
- Полет
- Ноклип

**Resources (Ресурсы):**
- Бесконечные кредиты
- Бесконечный опыт
- Максимальный уровень
- Все навыки

**Debug (Отладка):**
- Показать хитбоксы
- Показать пути врагов
- Бесконечный боезапас
- Нет перезарядки

**World (Мир):**
- Телепортация
- Изменить погоду
- Изменить время суток
- Управление гравитацией

**Time (Время):**
- Замедление времени
- Ускорение времени
- Пауза времени

**Visual (Визуальные):**
- Каркасный режим
- Показать FPS
- Показать координаты
- Ночное зрение

**Файл:** `src/client/cheatMenu.ts`

#### 2. Профили читов

- Сохранение наборов читов
- Загрузка профилей
- Импорт/экспорт профилей

**Пример:**
```typescript
// Сохранение профиля
cheatMenu.saveProfile("testing", activeCheats);

// Загрузка профиля
cheatMenu.loadProfile("testing");
```

#### 3. Импорт/экспорт

- Экспорт профилей в JSON
- Импорт профилей из JSON
- Обмен конфигурациями

### API

```typescript
class CheatMenu {
    setTank(tank: TankController | null): void;
    setGame(game: Game | null): void;
    toggle(): void;
    saveProfile(name: string, cheats: Map<string, boolean>): void;
    loadProfile(name: string): void;
    exportProfile(name: string): string;
    importProfile(data: string): void;
}
```

---

## 🔧 Общие функции

### 1. Система тем

Единая система тем для всех меню.

**Файл:** `src/client/uiTheme.ts`

**Доступные темы:**
- `dark` - Тёмная (по умолчанию)
- `light` - Светлая
- `custom` - Пользовательская

**Пример:**
```typescript
const themeManager = new ThemeManager();
themeManager.applyTheme("dark");
themeManager.createCustomTheme("my_theme", {
    background: "rgba(10, 0, 0, 0.95)",
    accent: "rgba(255, 0, 0, 0.6)"
});
```

### 2. Экспорт/импорт настроек

Единая система экспорта всех настроек всех меню.

**Файл:** `src/client/settingsExporter.ts`

**Пример:**
```typescript
const exporter = new SettingsExporter();
const bundle = exporter.exportAll();
exporter.download(bundle, "settings.json", "application/json");

// Импорт
const bundle = JSON.parse(settingsJson);
exporter.importAll(bundle);
```

### 3. Оптимизация производительности

- Дебаунсинг обновлений
- Виртуализация списков
- Кэширование вычислений

**Файл:** `src/client/performanceOptimizer.ts`

---

## 📖 API Reference

### ScreenshotManager

```typescript
class ScreenshotManager {
    constructor(engine: Engine, scene: Scene, hud: HUD | null);
    setHUD(hud: HUD | null): void;
    async capture(options: ScreenshotOptions): Promise<Blob>;
}

enum ScreenshotFormat {
    PNG = "image/png",
    JPEG = "image/jpeg",
    WEBP = "image/webp"
}

enum ScreenshotMode {
    FULL_SCREEN = "full",
    REGION = "region",
    GAME_ONLY = "game",
    UI_ONLY = "ui"
}
```

### MetricsCollector

```typescript
class MetricsCollector {
    constructor(engine: Engine, scene: Scene);
    collect(): ExtendedMetrics;
}

interface ExtendedMetrics {
    gpuUsage?: number;
    gpuMemory?: number;
    cpuUsage?: number;
    networkIn?: number;
    networkOut?: number;
    physicsObjects?: number;
    audioSources?: number;
    particles?: number;
    // ... и другие
}
```

### PhysicsVisualizer

```typescript
class PhysicsVisualizer {
    constructor(scene: Scene);
    setEnabled(enabled: boolean): void;
    updateOptions(options: Partial<PhysicsVisualizationOptions>): void;
    visualizePhysics(mesh: Mesh, physicsBody: any): void;
}
```

### CommandSystem

```typescript
class CommandSystem {
    constructor(game?: any);
    registerCommand(command: Command): void;
    async execute(input: string): Promise<string>;
    getHistory(direction: 'up' | 'down'): string | null;
    autocomplete(input: string): string[];
}

interface Command {
    name: string;
    description: string;
    usage: string;
    execute: (args: string[], game?: any) => Promise<string> | string;
    aliases?: string[];
}
```

### SessionSettings

```typescript
class SessionSettings {
    getSettings(): SessionSettingsData;
    setSettings(settings: SessionSettingsData): void;
    applySettings(): void;
}
```

### CheatMenu

```typescript
class CheatMenu {
    setTank(tank: TankController | null): void;
    setGame(game: Game | null): void;
    toggle(): void;
    saveProfile(name: string, cheats: Map<string, boolean>): void;
    loadProfile(name: string): void;
}
```

---

## 💡 Примеры использования

### Пример 1: Создание скриншота с фильтрами

```typescript
const screenshotManager = new ScreenshotManager(engine, scene, hud);

const blob = await screenshotManager.capture({
    format: ScreenshotFormat.JPEG,
    quality: 0.9,
    mode: ScreenshotMode.GAME_ONLY,
    filters: {
        brightness: 15,
        contrast: 20,
        saturation: 10
    },
    watermark: {
        text: "Protocol TX",
        position: "bottom-right",
        opacity: 0.8
    }
});

// Скачать скриншот
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `screenshot_${Date.now()}.jpg`;
a.click();
```

### Пример 2: Настройка автоматических скриншотов

```typescript
const autoManager = new AutoScreenshotManager(screenshotManager, game);

// Скриншот при убийстве врага
autoManager.setupRule({
    id: "kill_screenshot",
    enabled: true,
    trigger: AutoScreenshotTrigger.ENEMY_KILL,
    format: ScreenshotFormat.PNG,
    mode: ScreenshotMode.GAME_ONLY
});

// Скриншот каждые 60 секунд
autoManager.setupRule({
    id: "interval_screenshot",
    enabled: true,
    trigger: AutoScreenshotTrigger.INTERVAL,
    interval: 60,
    format: ScreenshotFormat.JPEG,
    quality: 0.85
});
```

### Пример 3: Сбор и экспорт метрик

```typescript
const collector = new MetricsCollector(engine, scene);
const exporter = new MetricsExporter();

const metrics = [];
for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    metrics.push(collector.collect());
}

// Экспорт в CSV
const csv = exporter.exportToCSV(metrics);
exporter.download(csv, "metrics.csv", "text/csv");

// Экспорт в JSON
const json = exporter.exportToJSON(metrics);
exporter.download(json, "metrics.json", "application/json");
```

### Пример 4: Настройка физики через панель

```typescript
const physicsPanel = new PhysicsPanel();
physicsPanel.setTank(tank);
physicsPanel.setGame(game);

// Сохранение пресета
physicsPanel.savePreset("agile_tank", {
    hoverHeight: 0.8,
    hoverStiffness: 30000,
    maxSpeed: 40,
    acceleration: 15000
});

// Применение пресета
physicsPanel.loadPreset("agile_tank");
```

### Пример 5: Создание пользовательской команды

```typescript
const commandSystem = new CommandSystem(game);

commandSystem.registerCommand({
    name: "heal",
    description: "Восстановить здоровье",
    usage: "heal [amount]",
    execute: async (args) => {
        const amount = args[0] ? parseInt(args[0]) : 100;
        if (game.tank) {
            game.tank.heal(amount);
            return `Восстановлено ${amount} HP`;
        }
        return "Танк не найден";
    },
    aliases: ["hp", "health"]
});

// Использование
await commandSystem.execute("heal 50");
await commandSystem.execute("hp 100");
```

### Пример 6: Настройка сессии с волнами

```typescript
const sessionSettings = new SessionSettings();
sessionSettings.setGame(game);

const settings = sessionSettings.getSettings();
settings.gameMode = "survival";
settings.enemyCount = 20;
settings.spawnInterval = 5;
settings.aiDifficulty = "hard";
settings.waveSystem = {
    enabled: true,
    waveSize: 10,
    waveInterval: 30
};

sessionSettings.setSettings(settings);
sessionSettings.applySettings();
```

### Пример 7: Использование профилей читов

```typescript
const cheatMenu = new CheatMenu();
cheatMenu.setTank(tank);
cheatMenu.setGame(game);

// Создание профиля для тестирования
const testingCheats = new Map([
    ["godmode", true],
    ["infiniteAmmo", true],
    ["superSpeed", true]
]);
cheatMenu.saveProfile("testing", testingCheats);

// Загрузка профиля
cheatMenu.loadProfile("testing");

// Экспорт профиля
const profileJson = cheatMenu.exportProfile("testing");
console.log(profileJson);
```

---

## 🔍 Интеграция в игру

Все меню интегрированы в `src/client/game.ts`:

```typescript
// F2 - Скриншот
if (e.code === "F2") {
    this.screenshotPanel?.toggle();
}

// F3 - Debug Dashboard
if (e.code === "F3") {
    this.debugDashboard?.toggle();
}

// F4 - Physics Panel
if (e.code === "F4") {
    this.physicsPanel?.toggle();
}

// F5 - System Terminal
if (e.code === "F5") {
    this.chatSystem?.toggleSystemTerminal();
}

// F6 - Session Settings
if (e.code === "F6") {
    this.sessionSettings?.toggle();
}

// F7 - Cheat Menu
if (e.code === "F7") {
    this.cheatMenu?.toggle();
}
```

---

## 📝 Примечания

- Все меню работают только во время игры (не в главном меню)
- Настройки сохраняются в localStorage
- Профили и пресеты можно экспортировать/импортировать
- Все меню имеют единый стиль и тему
- Производительность оптимизирована (дебаунсинг, кэширование)

---

## 🐛 Известные ограничения

1. **GPU метрики** - Ограниченно доступны в браузере
2. **CPU метрики** - Ограниченно доступны в браузере
3. **Сетевые метрики** - Требуют специальных разрешений браузера
4. **Автоматические скриншоты** - Могут влиять на производительность при большом количестве

---

**Последнее обновление:** 2025-12-XX

