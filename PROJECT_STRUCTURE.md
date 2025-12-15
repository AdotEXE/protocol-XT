# Структура проекта Protocol TX

```
TX/
├── 📄 Конфигурационные файлы
│   ├── package.json              # Зависимости и скрипты npm
│   ├── package-lock.json         # Блокировка версий зависимостей
│   ├── tsconfig.json             # Конфигурация TypeScript
│   ├── vite.config.ts            # Конфигурация Vite (сборщик)
│   ├── vercel.json               # Конфигурация Vercel (деплой)
│   ├── netlify.toml              # Конфигурация Netlify
│   └── index.html                # Главный HTML файл
│
├── 📁 src/                       # Исходный код
│   │
│   ├── 📁 client/                # Клиентская часть (браузер)
│   │   ├── 🎮 Основные системы
│   │   │   ├── main.ts                    # Точка входа клиента
│   │   │   ├── game.ts                    # Главный класс игры
│   │   │   ├── hud.ts                     # HUD (интерфейс)
│   │   │   └── menu.ts                    # Меню игры
│   │   │
│   │   ├── 🏎️ Система танков
│   │   │   ├── tankController.ts          # Контроллер танка игрока
│   │   │   ├── tankTypes.ts               # Типы корпусов и пушек
│   │   │   ├── enemyTank.ts               # Вражеские танки
│   │   │   ├── networkPlayerTank.ts       # Сетевые игроки
│   │   │   └── 📁 tank/                   # Модули танка
│   │   │       ├── index.ts               # Экспорт модулей
│   │   │       ├── constants.ts           # Константы
│   │   │       ├── types.ts               # Типы
│   │   │       ├── tankHealth.ts          # Здоровье
│   │   │       ├── tankMovement.ts        # Движение
│   │   │       ├── tankShooting.ts        # Стрельба
│   │   │       ├── tankProjectiles.ts     # Снаряды
│   │   │       ├── tankVisuals.ts         # Визуализация
│   │   │       └── tankAbilities.ts       # Способности
│   │   │
│   │   ├── 🏪 Гараж
│   │   │   ├── garage.ts                  # Основной класс гаража
│   │   │   └── 📁 garage/                 # Модули гаража (НОВОЕ)
│   │   │       ├── materials.ts           # Фабрика материалов
│   │   │       ├── chassisDetails.ts      # Генератор деталей корпусов
│   │   │       └── cannonDetails.ts       # Генератор деталей пушек
│   │   │
│   │   ├── 🌍 Генерация мира
│   │   │   ├── chunkSystem.ts             # Система чанков
│   │   │   ├── coverGenerator.ts          # Генератор укрытий
│   │   │   ├── poiSystem.ts               # Система точек интереса
│   │   │   ├── roadNetwork.ts             # Дорожная сеть
│   │   │   ├── noiseGenerator.ts          # Генератор шума
│   │   │   └── destructionSystem.ts       # Система разрушений
│   │   │
│   │   ├── 🎯 Игровые режимы
│   │   │   ├── battleRoyale.ts            # Батл-ройал
│   │   │   ├── ctfVisualizer.ts           # Capture the Flag
│   │   │   ├── missionSystem.ts           # Система миссий
│   │   │   └── aimingSystem.ts            # Система прицеливания
│   │   │
│   │   ├── 👥 Мультиплеер и социальные функции
│   │   │   ├── multiplayer.ts             # Мультиплеер
│   │   │   ├── chatSystem.ts              # Чат
│   │   │   ├── socialSystem.ts            # Социальная система
│   │   │   ├── voiceChat.ts               # Голосовой чат
│   │   │   └── leaderboard.ts             # Таблица лидеров
│   │   │
│   │   ├── 📊 Прогресс и статистика
│   │   │   ├── playerStats.ts             # Статистика игрока
│   │   │   ├── playerProgression.ts       # Прогрессия
│   │   │   ├── experienceSystem.ts        # Система опыта
│   │   │   ├── achievements.ts            # Достижения
│   │   │   ├── skillTreeConfig.ts         # Дерево навыков
│   │   │   ├── realtimeStats.ts           # Статистика в реальном времени
│   │   │   └── currencyManager.ts         # Управление валютой
│   │   │
│   │   ├── 🎬 Эффекты и визуализация
│   │   │   ├── effects.ts                 # Эффекты (частицы, взрывы)
│   │   │   └── replaySystem.ts            # Система реплеев
│   │   │
│   │   ├── 🔊 Звук
│   │   │   ├── soundManager.ts            # Менеджер звука
│   │   │   ├── soundPatterns.ts           # Паттерны звуков
│   │   │   └── jsfxr.ts                   # Генератор звуков
│   │   │
│   │   ├── 🔧 Утилиты и сервисы
│   │   │   ├── firebaseService.ts         # Firebase интеграция
│   │   │   ├── consumables.ts             # Расходники
│   │   │   ├── enemy.ts                   # Враги (базовый класс)
│   │   │   └── 📁 utils/                  # Утилиты
│   │   │       ├── logger.ts              # Логирование
│   │   │       └── uiScale.ts             # Масштабирование UI
│   │   │
│   │   ├── 🎨 Стили
│   │   │   └── 📁 styles/
│   │   │       └── responsive.css         # Адаптивные стили
│   │   │
│   │   └── 📁 Пустые директории (для будущего использования)
│   │       ├── core/                      # Ядро (пусто)
│   │       ├── menu/                      # Меню (пусто)
│   │       ├── ui/                        # UI компоненты (пусто)
│   │       └── world/                     # Мир (пусто)
│   │
│   ├── 📁 server/                # Серверная часть (Node.js)
│   │   ├── index.ts                      # Точка входа сервера
│   │   ├── gameServer.ts                 # Главный сервер игры
│   │   ├── room.ts                       # Комнаты игроков
│   │   ├── player.ts                     # Игрок (сервер)
│   │   ├── projectile.ts                 # Снаряды (сервер)
│   │   ├── enemy.ts                      # Враги (сервер)
│   │   ├── gameModes.ts                  # Игровые режимы (сервер)
│   │   ├── ctf.ts                        # Capture the Flag (сервер)
│   │   ├── matchmaking.ts                # Подбор соперников
│   │   ├── deltaCompression.ts           # Дельта-сжатие
│   │   └── validation.ts                 # Валидация данных
│   │
│   ├── 📁 shared/                # Общий код (клиент + сервер)
│   │   ├── types.ts                      # Общие типы
│   │   ├── messages.ts                   # Сообщения протокола
│   │   └── protocol.ts                   # Протокол связи
│   │
│   └── vite-env.d.ts             # Типы Vite
│
├── 📁 public/                    # Публичные ресурсы
│   ├── favicon.svg                # Иконка сайта
│   ├── HavokPhysics.wasm         # Физический движок (WASM)
│   └── 📁 assets/                 # Ресурсы (пусто)
│
├── 📁 dist/                      # Собранные файлы (генерируется)
│   ├── index.html
│   ├── HavokPhysics.wasm
│   └── 📁 assets/
│       ├── *.js                   # Скомпилированный JavaScript
│       ├── *.css                  # Стили
│       └── *.wasm                 # WebAssembly модули
│
├── 📁 docs/                      # Документация
│   ├── ARCHITECTURE.md            # Архитектура проекта
│   ├── FEATURES.md                # Описание функций
│   ├── API.md                     # API документация
│   ├── SETUP.md                   # Инструкции по установке
│   ├── DEPLOYMENT.md              # Деплой
│   ├── VERCEL_SETUP.md            # Настройка Vercel
│   ├── PERFORMANCE.md             # Производительность
│   ├── SECURITY.md                # Безопасность
│   ├── BEST_PRACTICES.md          # Лучшие практики
│   ├── TROUBLESHOOTING.md         # Решение проблем
│   ├── EXAMPLES.md                # Примеры
│   ├── DIAGRAMS.md                # Диаграммы
│   └── development_plan.md        # План разработки
│
├── 📁 .github/                    # GitHub конфигурация
│   └── 📁 workflows/
│       └── deploy-vercel.yml      # CI/CD для Vercel
│
├── 📁 outputs/                    # Логи и отчеты сборки
│   ├── build_output_*.txt         # Выводы сборки
│   ├── tsc_check*.txt             # Проверки TypeScript
│   ├── errors_list.txt            # Списки ошибок
│   └── *.log                      # Логи
│
├── 📄 Документация корневого уровня
│   ├── README.md                  # Главный README
│   ├── CHANGELOG.md               # История изменений
│   ├── QUICKSTART.md              # Быстрый старт
│   ├── CONTRIBUTING.md            # Инструкции для контрибьюторов
│   ├── SOUNDS_LIST.md             # Список звуков
│   └── garage_analysis.md         # Анализ гаража
│
└── 📁 node_modules/               # Зависимости (генерируется, не в репо)
```

## Ключевые особенности структуры:

### 🎯 Архитектура
- **Разделение клиент/сервер**: Четкое разделение на `src/client/` и `src/server/`
- **Общий код**: `src/shared/` для типов и протоколов
- **Модульность**: Системы разделены на отдельные файлы

### 🏗️ Модульная структура
- **Танк**: Модульная система в `src/client/tank/` с отдельными компонентами
- **Гараж**: Новая модульная структура в `src/client/garage/`
  - `materials.ts` - Фабрика материалов
  - `chassisDetails.ts` - Детали корпусов
  - `cannonDetails.ts` - Детали пушек

### 🛠️ Технологии
- **Vite**: Современный сборщик
- **TypeScript**: Типизированный JavaScript
- **Babylon.js**: 3D движок
- **Havok Physics**: Физический движок (WASM)
- **Vercel**: Хостинг и деплой

### 📦 Сборка и деплой
- **GitHub Actions**: Автоматический деплой на Vercel
- **Vite**: Сборка клиентской части
- **Node.js**: Серверная часть

### 📊 Статистика проекта
- **Клиент**: ~50+ TypeScript файлов
- **Сервер**: ~10 TypeScript файлов
- **Общий код**: 3 файла
- **Документация**: 15+ MD файлов
