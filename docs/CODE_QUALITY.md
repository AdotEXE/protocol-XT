# Качество кода (Protocol TX)

Краткие рекомендации по поддержанию качества кода в проекте.

## Тестирование

- **Запуск тестов:** `npm test` (Vitest), `npm run test:watch` — в watch-режиме.
- **Охват:** unit-тесты для чистых функций в `src/shared` и `src/client/game` (без зависимости от Babylon/DOM).
- **Файлы:** `*.spec.ts` в `src/shared/`, `src/client/game/`.
- **Примеры:** сериализация/десериализация протокола (`protocol.spec.ts`), нормализация данных карты (`normalizeMapDataForGame.spec.ts`).
- Тесты, требующие Babylon.js (например, `reconciliation.test.ts`), можно подключать отдельно при наличии окружения (например, jsdom + мок Babylon).

## Типизация

- Строгий TypeScript: избегать `any`; при неизвестном типе использовать `unknown` и type guards.
- Общие типы и протоколы — в `src/shared/`.

## Размер файлов

- Крупные модули (например, `game.ts`, `hud.ts`) по плану рефакторятся: логика выносится в отдельные файлы и хелперы (см. `next/CHECKLIST.md`, refactor-game-ts, refactor-hud-ts).

## Стиль и ошибки

- JSDoc для публичных API и неочевидной логики.
- Обработка ошибок: не глотать исключения, использовать `logger` вместо `console` в коде приложения (см. `.cursorrules`).
