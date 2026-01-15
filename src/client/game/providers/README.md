# Provider Architecture

Система провайдеров для унификации логики SP (Single Player) и MP (Multiplayer).

## Принцип работы

Вместо `if (isMultiplayer)` проверок по всему коду, используется паттерн Strategy:

```typescript
// Создание провайдера
const rewardProvider = ProviderFactory.createRewardProvider(isMultiplayer);

// Использование (одинаковый код для SP и MP)
const reward = rewardProvider.awardKill(context);
await rewardProvider.applyReward(reward, playerId);
```

## Структура

```
providers/
├── interfaces/           # Интерфейсы провайдеров
│   ├── IRewardProvider.ts
│   └── index.ts
├── local/                # SP реализации
│   ├── LocalRewardProvider.ts
│   └── index.ts
├── network/              # MP реализации
│   ├── NetworkRewardProvider.ts
│   └── index.ts
├── ProviderFactory.ts    # Фабрика создания провайдеров
├── types.ts              # Общие типы
└── README.md             # Эта документация
```

## Провайдеры

### IRewardProvider

Управляет начислением наград за убийства, урон, выживание и сбор предметов.

**SP (LocalRewardProvider)**:
- Начисляет награды сразу
- Обновляет локальные системы (опыт, кредиты, достижения)

**MP (NetworkRewardProvider)**:
- Показывает временные награды (optimistic update)
- Ждёт подтверждения от сервера
- Синхронизирует с серверными данными

## Добавление нового провайдера

1. Создать интерфейс в `interfaces/`
2. Создать SP реализацию в `local/`
3. Создать MP реализацию в `network/`
4. Добавить метод создания в `ProviderFactory`
