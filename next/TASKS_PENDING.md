# Незавершённые задачи (pending) — выжимка

Источник: `docs/список_незавершённых_задач_protocol_tx_e02b1b75.md`.  
Актуальный полный список и зависимости — только в этом файле.

---

## Уже выполнено (не брать)

- **replace-console-log** — замена console на logger во всём клиенте завершена (2026-02-10 + оставшиеся файлы 2026-02-11).
- **real-ping-measurement** — реальный ping: таймер переведён на sendPing(), RTT/jitter считаются, в HUD «—» до первого PONG (2026-02-11).
- **menu-ping-queue** — в меню: пинг в статусе (mp-ping), блок очереди с кнопкой «Отменить поиск» (2026-02-11).
- **complete-map-generators** — логика создания стен/мешков вынесена в BaseMapGenerator (createWallSegment, createSandbag); Frontline, Polygon, Sand, Arena переведены (2026-02-11).

---

## Pending — приоритетные

| ID | Задача |
|----|--------|
| refactor-game-ts | В работе: вынесены handleEnemyDeath, buildDetailedTankStatsData, mouseSensitivity и др. Дальше — refactor-hud-ts или иные выносы |
| refactor-hud-ts | В работе: вынесен notificationStyle.ts. Компоненты в hud/components/. Дальше — перенос логики из hud.ts |
| ~~complete-map-generators~~ | ✅ Выполнено (2026-02-11): createWallSegment/createSandbag в BaseMapGenerator, все генераторы переведены |
| ~~integrate-ai-modules~~ | ✅ Уже в коде (enemyTank + game) |
| ~~integrate-performance-optimizer~~ | ✅ Уже в коде (game, LOD, optimizeAllStaticMeshes) |

## Мультиплеер

| ID | Задача | Зависимости |
|----|--------|-------------|
| client-side-prediction | Client-Side Prediction, sequence numbers | — |
| server-reconciliation | Server Reconciliation, откат по sequence | client-side-prediction |
| ~~real-ping-measurement~~ | ✅ Выполнено (2026-02-11) | — |
| lag-compensation | Lag Compensation на сервере | real-ping-measurement |
| jitter-buffer | Jitter Buffer | real-ping-measurement |
| ~~menu-ping-queue~~ | ✅ Выполнено (2026-02-11): пинг в статусе, блок очереди с кнопкой «Отменить поиск» | real-ping-measurement |
| binary-serialization | MessagePack вместо JSON | — |
| improved-delta-compression | Улучшение дельта-компрессии | — |
| adaptive-update-rate | Адаптивная частота обновлений | — |
| ~~improved-interpolation~~ | ✅ Уже в коде (networkPlayerTank: Hermite, буфер) | — |
| enhanced-anticheat | Расширение античита | — |
| ~~spatial-partitioning~~ | ✅ Уже в коде (server spatialHash.ts, gameServer) | — |
| ~~batch-updates~~ | ✅ Уже в коде (sendBatch, BATCH в gameServer) | — |
| social-menu-integration | Интеграция socialMenu с мультиплеером | — |

## Контент и геймплей

| ID | Задача |
|----|--------|
| expand-achievements | Достижения: ежедневные задания, сезоны, боевой пропуск |
| game-balancing | Балансировка корпусов, пушек, цен, тесты с игроками |
| new-game-modes | Режимы: Control Point, Escort, Survival, Raid |
| visual-effects | Постпроцессинг, освещение, погода |

## Код и качество

| ID | Задача |
|----|--------|
| cleanup-todos | Удалить/обработать TODO (~39), размеры файлов, типизация |
| testing | Функциональное тестирование (корпуса, пушки, способности, гараж, превью) |

---

Для зависимостей и полного текста задач смотри **docs/список_незавершённых_задач_protocol_tx_e02b1b75.md**.  
Для приоритетов и описания шагов — **docs/NEXT_IMPROVEMENTS_PLAN.md**.
