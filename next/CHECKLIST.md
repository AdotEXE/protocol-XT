# Чеклист плана Protocol TX

**Обновлено:** 2026-02-11  
Источник: `docs/список_незавершённых_задач_protocol_tx_e02b1b75.md`, `next/plan-tasks.md`

---

## Выполнено

- [x] **replace-console-log** — замена console на logger во всём клиенте (2026-02-11)
- [x] **real-ping-measurement** — реальный ping: sendPing в таймере, RTT/jitter, HUD «—» до первого PONG (2026-02-11)

---

## Критический приоритет (следующие по плану)

- [x] **refactor-game-ts** — завершён (2026-02-11): вынесен setupMenuCallbacks в game/setupMenuCallbacks.ts (IGameForMenuCallbacks, регистрация Restart/Exit/Start Game, F3 Physics Viewer, SupplyDrop в колбэке).
- [~] **refactor-hud-ts** — в работе: вынесены createCrosshairElements (прицел: кольца, точка, линии, углы). Ранее: notificationStyle, textBlockHeight, healthBarHelpers, tankStatsFormatters и др. Дальше — при необходимости переносить ещё блоки в компоненты/хелперы.
- [x] **complete-map-generators** — завершён (2026-02-11): createWallSegment(material: string | StandardMaterial, deferMerge?), createSandbag; Frontline, Polygon, Sand, Arena переведены

---

## Высокий приоритет

- [x] **integrate-ai-modules** — уже в коде (enemyTank, game)
- [x] **integrate-performance-optimizer** — уже в коде (game, LOD)

---

## Мультиплеер

- [x] **real-ping-measurement** — ping/pong, RTT, jitter (2026-02-11)
- [x] **client-side-prediction** — (2026-02-11) sequence numbers, storePredictedState, updatePredictedState; в reconciliation callback передаются positionDiff, predictedState, unconfirmedInputs
- [x] **server-reconciliation** — (2026-02-11) полный re-apply: TankController.applyInputForReplay(), очередь _replayInputQueue в GameMultiplayerCallbacks, после телепортации при positionDiff > 10 применяются unconfirmedInputs по одному за кадр
- [x] **lag-compensation** — (2026-02-11) handlePlayerHit: проверка hit против позиции цели с rewind (getPositionAtTime(rewindTime)); отклонение hit при distance > 8
- [x] **jitter-buffer** — уже в коде (multiplayer.ts: jitterBuffer, processJitterBuffer, targetDelay по jitter)
- [x] **menu-ping-queue** — пинг в статусе меню, блок очереди с кнопкой «Отменить поиск» (2026-02-11)
- [x] **binary-serialization** — уже в коде (USE_BINARY_SERIALIZATION, custom binary protocol в shared/protocol.ts)
- [x] **improved-delta-compression** — уже в коде (DeltaCompressor, квантизация, changedFields)
- [x] **adaptive-update-rate** — уже в коде (prioritizedBroadcaster.getAdaptiveUpdateRate, distance-based)
- [x] **improved-interpolation** — уже в коде (Hermite, буфер в networkPlayerTank)
- [x] **enhanced-anticheat** — (2026-02-11) rate limit для PLAYER_HIT (20/сек); валидация и rate limit input/shoot уже были
- [x] **spatial-partitioning** — уже в коде (server)
- [x] **batch-updates** — уже в коде (gameServer sendBatch)
- [x] **social-menu-integration** — (2026-02-11) sendInvite() вызывает sendGameInvite(); комната загружает друзей из socialSystem (loadRoomFriendsList), приглашение в игру через сервер

---

## Контент и геймплей

- [x] **expand-achievements** — (2026-02-11) ежедневные задания: добавлены daily_pickups, daily_critical; прогресс daily_damage/daily_critical в TankController, daily_pickups в setupMenuCallbacks; достижения supply_runner, season_warrior; боевой пропуск и сезон уже инициализируются в Game
- [x] **game-balancing** — (2026-02-11) docs/GAME_BALANCE.md (режимы, корпуса/пушки, экономика, рекомендации)
- [x] **new-game-modes** — уже в коде: ControlPointMode, EscortMode, SurvivalMode, RaidMode в server/gameModes.ts; matchmaking removeFromQueue расширен на control_point, escort, survival, raid
- [x] **visual-effects** — (2026-02-11) setupFog: экспорт FOG_START/FOG_END, setFogWeatherIntensity(scene, 0..1) для плотности тумана; постпроцессинг уже в PostProcessingManager

---

## Код и качество

- [x] **cleanup-todos** — завершён: TODO в src заменены на NOTE/реализацию; рекомендации по размерам файлов и типизации — docs/CODE_QUALITY.md
- [x] **testing** — (2026-02-11) добавлен Vitest: `npm test`, `npm run test:watch`; тесты: protocol roundtrip (PLAYER_INPUT, PLAYER_STATES), normalizeMapDataForGame; мок @babylonjs/core для shared-тестов

---

**Рекомендуемый следующий шаг:** продолжать **refactor-game-ts** (вынос логики в GameUpdate/GameCamera и др.) или **refactor-hud-ts**.
