# Супер-план аудита Protocol TX

**Дата:** 2026-02-11  
**Объём:** полная проверка проекта — ошибки, баги, уязвимости, утечки, мусор, технический долг

---

## Резюме

| Категория | Критично | Высоко | Средне | Низко |
|-----------|----------|--------|--------|-------|
| Сборка/типы | 1 ✅ | 0 | 0 | 0 |
| Безопасность | 2 | 1 | 0 | 0 |
| Типизация/качество кода | 0 | 1 | 2 | 0 |
| Мультиплеер/синхронизация | 0 | 5 | 4 | 3 |
| Память/события | 0 | 0 | 1 | 0 |
| Зависимости | 0 | 2 | 2 | 0 |
| UI/доступность | 0 | 0 | 1 | 0 |
| Производительность | 0 | 0 | 0 | 2 |

**Исправлено в рамках аудита:** сломанный импорт в `aircraftPhysics.ts` (сборка падала).

---

## 1. Критические и высокие (сделать в первую очередь)

### 1.1 Сборка — исправлено

- **Проблема:** `src/client/tank/aircraftPhysics.ts` импортировал `../../utils/logger` (выход за пределы `client/`).
- **Исправление:** Заменён на `../utils/logger`.
- **Статус:** ✅ исправлено.

### 1.2 Безопасность: хардкод учётных данных и ключей — исправлено

- **authUI.ts:** в production кнопка «Быстрый вход (админ)» удаляется из DOM; в dev используются env `VITE_ADMIN_QUICK_LOGIN_EMAIL` / `VITE_ADMIN_QUICK_LOGIN_PASSWORD` (fallback только для dev). **Статус:** выполнено.
- **firebaseService.ts:** убран fallback API key; конфиг только из env (пустые строки при отсутствии). **Статус:** выполнено.

### 1.3 Зависимости: уязвимости npm

- **npm audit:** 14 уязвимостей (4 high, 10 moderate).
  - **high:** fast-xml-parser (DoS), path-to-regexp (ReDoS).
  - **moderate:** esbuild (dev server), lodash (prototype pollution), undici, xml2js и др.
- **Действие:**
  - Выполнить `npm audit fix` для всего, что не ломает сборку.
  - Для `npm audit fix --force` (path-to-regexp/@vercel/node, vitest/esbuild) — выделить отдельную задачу: обновить vitest/vite, проверить Vercel, прогнать тесты и ручные проверки.

### 1.4 Типизация и подавление проверок

- **gameServer.ts:** добавлены интерфейсы `ConnectData`, `CreateRoomData`; типизированы `handleConnect(ws, data: ConnectData)` и `handleCreateRoom(player, data: CreateRoomData)`; тип для `connectData` при отправке CONNECTED. Остальные handlers по-прежнему с `data: any`; 4× `@ts-ignore` для отключённых античит-методов оставлены с комментариями.
- **game.ts, tankController.ts:** множество `(this.tank as any).*`, `(this.hud as any).*` — поэтапная замена на интерфейсы в среднесрочной перспективе.

---

## 2. Средний приоритет

### 2.1 Мультиплеер и синхронизация (из docs/MULTIPLAYER_SYNC_PROBLEMS.md)

- **Периодическая полная синхронизация:** уже реализована в `deltaCompression.ts` (FULL_STATE_INTERVAL = 60) и в `gameServer.ts` (isFullState каждые 120 тиков). **Статус:** выполнено.
- **Порядок вызовов:** `updatePositionCache()` вызывается в `onAfterPhysicsObservable` (TankController); отправка позиции в мультиплеер использует `getCachedChassisPosition()`. Порядок корректен. **Статус:** проверено.
- **Синхронизация turretRotation/aimPitch при reconciliation:** при первой телепортации (спавн) и при принудительной телепортации (>10) в GameMultiplayerCallbacks после установки позиции задаются `turret.rotation.y`, `barrel.rotation.x`, `tank.aimPitch` из серверного состояния. Мягкая коррекция башни/ствола уже была в updateLocalPlayerToServer. **Статус:** выполнено.
- Остаётся (по желанию): унификация физики клиент/сервер, реальный deltaTime на сервере, метрики и визуализация расхождений.

### 2.2 Пустые catch и логирование — исправлено

- **chatSystem.ts:** пустые catch заменены на `logger.debug` с контекстом. **Статус:** выполнено.
- **console в клиенте:** заменены на logger в hud, chatSystem, modelFileLoader, modelFileSaver. В shared/protocol.ts оставлен `console.warn` (общий код без доступа к клиентскому logger). **Статус:** выполнено.

### 2.3 XSS и innerHTML — частично исправлено

- В **menu.ts** для списков игроков, комнат и друзей добавлено экранирование через `this.escapeHtml()`: имена игроков (player.name), id игроков, id комнат, режим (room.mode), тип карты (room.mapType), имена друзей и id друзей. Расширенное лобби (exp-lobby): room.id, room.mapName, room.ping в карточках комнат также экранируются. Чат и gameDialogs уже использовали escapeHtml. **Статус:** аудит выполнен, критические места (лобби, комнаты, друзья, exp-lobby) закрыты.

### 2.4 eval в logger — исправлено

- **logger.ts:** убран eval; используется прямая проверка `typeof import.meta !== "undefined"` и обращение к `import.meta.env`; fallback для Node через `process.env.NODE_ENV`. **Статус:** выполнено.

### 2.5 Память и подписки

- В проекте много `addEventListener` / Observable / setInterval; во многих модулях есть соответствующие remove/dispose/clear (см. MEMORY_LEAKS_AND_BUGS_REPORT.md).
- **Рекомендация:** при добавлении новых подписок/интервалов сразу планировать отписку в dispose/cleanup; периодически проверять тяжёлые экраны (меню, редактор карт, гараж) на отписку при закрытии.

---

## 3. Низкий приоритет и оптимизации

### 3.1 Мультиплеер (низкий приоритет)

- Избыточное логирование в multiplayer/gameServer — уменьшить частоту или сделать условным (уровень логирования).
- Метрики синхронизации — средняя разница позиций, частота reconciliation.
- Визуализация расхождений для отладки (линия предсказанная ↔ серверная позиция).

### 3.2 Сборка и бандл

- Предупреждения Vite: динамический и статический импорт одних и тех же модулей (inGameDialogs, tankTypes, trackTypes, ModuleTypes, avatarEditor) — при желании упростить схему импортов, чтобы уменьшить дублирование чанков.
- Очень большие чанки (>2000 kB): babylon-core, game-core, vendor — рассмотреть code-splitting (ленивая загрузка сцен, редакторов, тяжёлых экранов).
- В vite-plugin-compression пути в dist содержат полный Windows-путь — по возможности генерировать выход без абсолютного пути (настройка output).

### 3.3 Мусор и техдолг

- **Закомментированный console.log:** удалены в achievements, game (2 места), gameModes (2 места). Остальные остаются внутри крупных закомментированных блоков (tankController, roadNetwork и др.). **Статус:** частично выполнено.
- **protocol_test.ts:** ручной скрипт; логика покрыта в protocol.spec.ts. Оставлен как скрипт для ручной проверки.

---

## 4. Чек-лист по приоритетам

### Немедленно (критично/высоко)

- [x] Исправить импорт logger в aircraftPhysics.ts
- [x] Убрать или защитить быстрый вход админа с паролем "admin" (authUI.ts): в PROD кнопка удаляется, в dev доступны env VITE_ADMIN_QUICK_LOGIN_EMAIL / PASSWORD
- [x] Убрать хардкод Firebase API key в firebaseService.ts; конфиг только из env (пустые строки при отсутствии)
- [x] Выполнить `npm audit fix` (без --force); сборка и тесты проходят

### Краткосрочно (средний приоритет)

- [x] Типы для gameServer: добавлены ConnectData, CreateRoomData; типизированы handleConnect и handleCreateRoom
- [x] Заменить пустые catch в chatSystem на логирование (logger.debug)
- [x] Заменить активные console.* на logger в hud, chatSystem, modelFileLoader, modelFileSaver (protocol оставлен — shared)
- [x] Аудит innerHTML: в menu.ts escapeHtml для имён игроков, id комнат, режимов, карт, друзей (playerItem, roomItem, friendItem)
- [x] Убрать eval из logger.ts (проверка import.meta без eval)
- [x] MULTIPLAYER_SYNC: порядок вызовов проверен; периодическая полная синхронизация уже в коде; turretRotation/aimPitch при reconciliation и при force teleport добавлены в GameMultiplayerCallbacks

### Среднесрочно (низкий приоритет)

- [ ] Решить оставшиеся npm audit (vitest/vite, @vercel/node) в отдельной задаче
- [ ] Постепенная замена (tank/hud/game as any) на интерфейсы
- [ ] Метрики и опциональная визуализация расхождений в мультиплеере (частично есть syncMetrics и reconciliation lines)
- [x] Очистка закомментированного console.log (achievements, game, gameModes)
- [ ] Code-splitting для больших чанков (Babylon, редакторы)

---

## 5. Ссылки на документы

- Синхронизация мультиплеера: `docs/MULTIPLAYER_SYNC_PROBLEMS.md`
- Утечки и исправления: `docs/MEMORY_LEAKS_AND_BUGS_REPORT.md`
- Устранение неполадок: `docs/TROUBLESHOOTING.md`
- Качество кода: `docs/CODE_QUALITY.md`
- Баланс: `docs/GAME_BALANCE.md`

---

*Аудит выполнен автоматически по результатам поиска по коду, сборки, тестов и npm audit. Рекомендуется регулярно обновлять план по мере исправлений.*
