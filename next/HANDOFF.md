# Передача контекста (handoff) — Protocol TX

**Дата:** 2026-02-11  
**Цель:** Другой ИИ может продолжить работу с того же места.

---

## Что уже сделано

### 1. Замена console.log на logger — завершена (2026-02-11)

- Во всём клиентском коде (`src/client/`) все активные вызовы `console.log`/`console.error`/`console.warn` заменены на `logger`. Остались только закомментированные строки, `main.ts` и `utils/logger.ts` (по правилам не трогать).
- Список обработанных в последней сессии — в **next/FILES_LOGGER_REMAINING.md**.

### 2. Реальное измерение ping (2026-02-11)

- В таймере пинга используется `sendPing()` (формат timestamp + sequence), а не `syncClock()` (который отправлял только `seq` и ломал расчёт RTT на сервере и клиенте).
- Начальное значение RTT = 0; в HUD до первого PONG показывается «PING: —».
- Сервер уже отвечал PONG с serverTime; клиент уже считал jitter и EWMA — теперь пинг реально обновляется.

### 3. Меню: пинг и отмена очереди (2026-02-11)

- В блоке статуса мультиплеера добавлен элемент **mp-ping** (отображает пинг до сервера; «—» до первого измерения).
- Добавлен блок **mp-queue-info** (режим, размер очереди, таймер, оценка времени, кнопка **«Отменить поиск»**); кнопка уже была привязана к `cancelMultiplayerQueue()`.

### 4. Очистка TODO (cleanup-todos, 2026-02-11)

- **Версия игры:** в vite.config добавлен `__GAME_VERSION__` из `.version.json`; в modelFileLoader и modelFileSaver используется эта версия вместо хардкода.
- **TODO в src:** все комментарии `// TODO` заменены на `// NOTE` с пояснением или на реализацию (menu: просмотр профиля, ready, приватность, список игроков, maxPlayers, настройки комнаты, передача прав, кик; GameStatsOverlay, BotMetricsCollector, supplyDropSystem, mapEditor, CustomMapRunner). В menu для maxPlayers используется `getRoomMaxPlayers?.() ?? 32`.

### 5. Синхронизация плана с кодом (2026-02-11)

Проверено по коду и отмечено как **completed** (уже реализовано):
- **integrate-ai-modules** — AIPathfinding в enemyTank (findPath, findFlankPosition, setRoadNetwork), AICoordinator в game (registerBot, unregisterBot, передача в EnemyManager).
- **integrate-performance-optimizer** — PerformanceOptimizer в game (LOD, optimizeAllStaticMeshes, конфиг из AdaptiveQualityScaler).
- **spatial-partitioning** — SpatialHashGrid в server/spatialHash.ts, использование в gameServer и deltaCompression.
- **batch-updates** — sendBatch в gameServer, тип BATCH, группировка сообщений по игрокам.
- **improved-interpolation** — в networkPlayerTank: cubic Hermite, position buffer, useCubicInterpolation, сглаживание Y.

### 6. Обновление планов

- В `docs/список_незавершённых_задач_protocol_tx_e02b1b75.md` задачи **replace-console-log**, **real-ping-measurement**, **menu-ping-queue** — **completed**, дата обновления 2026-02-11.

### 8. refactor-game-ts (частично, 2026-02-11)

- Удалены обёртки в Game: `getCurrentEnemyDifficulty`, `getDifficultyRewardMultiplier`, `getAdaptiveEnemyDifficultyScale`. Везде используются прямые вызовы `this.gameEnemies.*`. cheatMenu переведён на `game.gameEnemies?.getCurrentDifficulty()` / `getAdaptiveDifficultyScale()`.
- **GameUI**: добавлен `applyFromSettings(settings, options?: { setTerminalVisible })`. В Game `applyUISettings()` — один вызов `gameUI.applyFromSettings(...)`.
- **GameAudio**: добавлен `applyFromSettings(settings)`; в Game `applyAudioSettings()` — `gameAudio.applyFromSettings(settings)`.
- **Game**: добавлен `applyAllSettingsFromMenu()` — единая точка применения настроек из меню. Дублирующие вызовы заменены на один.
- **GameUpdate**: перенесена логика мини-карты/радара — `getActiveProjectiles()`, `updateRadarBuildings()`, `updateMinimapProjectiles()`, `updateFullMapProjectiles()`, `updateEnemyHealthForMinimap()`, `updateEnemyLookHP()`. В Game методы делегируют в `gameUpdate.*`.
- **GameEnemies**: добавлен `cleanupDeadEnemies()`. В Game `cleanupDeadEnemies()` делегирует в `gameEnemies.cleanupDeadEnemies()`.
- **createSafetyPlane**: вынесена в `game/createSafetyPlane.ts`. Game вызывает функцию при наличии сцены; экспорт в `game/index.ts`.
- **applyGraphicsSettings**: вынесена в `game/applyGraphicsSettings.ts`. Game.applyGraphicsSettings() делегирует в неё.
- **setupFog**: вынесена в `game/setupFog.ts`. Game.setupFog() вызывает её при наличии сцены.
- **showSoftwareRendererWarning**: вынесена в `game/showSoftwareRendererWarning.ts`. Game вызывает её при обнаружении программного рендерера.
- **updateCanvasPointerEvents**: вынесена в `game/updateCanvasPointerEvents.ts`. Game.updateCanvasPointerEvents() делегирует в неё.
- **loadingScreenHelpers**: в `game/loadingScreenHelpers.ts` вынесены createLoadingScreen, updateLoadingProgress, hideLoadingScreen. Game делегирует в них.
- **achievementMissionHandlers**: в `game/achievementMissionHandlers.ts` вынесены handleAchievementUnlocked и handleMissionComplete. Game передаёт deps и вызывает их.
- **saveGameStateForAutoRestart**: вынесена в `game/saveGameStateForAutoRestart.ts`. Game собирает mapType и settings и вызывает её.
- **updateExplorerProgress**: вынесена в `game/updateExplorerProgress.ts`. Вызывается из Game.startGame().
- **ensureCanvasVisible**: вынесена в `game/ensureCanvasVisible.ts`. Используется в Game.startGame().
- **getMapDisplayName**: вынесена в `game/getMapDisplayName.ts` (функция `getMapDisplayName(mapType)`). Словарь названий карт для UI; вызывается в Game.startGame() (уведомление о карте отключено). Экспорт в `game/index.ts`.
- **mouseSensitivityFromSettings**: в `game/mouseSensitivityFromSettings.ts` функция `getMouseSensitivityFromSettings(settingsValue: number)` — преобразование 1–10 в 0.001–0.006. Game.applyControlSettings() использует её.
- **handleEnemyDeath**: в `game/handleEnemyDeath.ts` функция `handleEnemyDeath(deps, enemy)` и тип `HandleEnemyDeathDeps`. Вся логика смерти врага (награды, достижения, dispose, респавн в гараже). Game.handleEnemyDeath() собирает deps и вызывает функцию.
- **buildDetailedTankStatsData**: в `game/buildDetailedTankStatsData.ts` функция `buildDetailedTankStatsData(tank, upgradeManager)` возвращает `{ tankStatsData, syncToTank }`. Типы: TankForStatsLike, UpgradeManagerLike, DetailedTankStatsSync, BuildDetailedTankStatsResult. Game.updateDetailedTankStatsPanel() вызывает её, применяет syncToTank к танку и передаёт tankStatsData в hud.updateDetailedTankStats().
- **checkForCustomTank**: в `game/checkForCustomTank.ts` функция `checkForCustomTank(tank)` — читает 'testCustomTank' из localStorage, применяет конфиг к танку, удаляет ключ. Тип TankWithCustomConfig. Game.checkForCustomTank() делегирует в неё.
- **cleanupUnusedResources**: в `game/cleanupUnusedResources.ts` — `cleanupUnusedResources(scene, options?)` и `getMemoryStatsFromScene(scene)` (тип MemoryStats). Game.cleanupUnusedResources() и getMemoryStats() делегируют в них.
- **normalizeMapDataForGame**: в `game/normalizeMapDataForGame.ts` функция `normalizeMapDataForGame(data)` — нормализует сырые данные карты к формату (version, name, mapType, terrainEdits, placedObjects, triggers, metadata, seed). Типы NormalizedMapData, NormalizedMapDataMetadata. Game.normalizeMapDataForGame() делегирует в неё.
- **getRawSpawnPositionsFromMapData**: в `game/getRawSpawnPositionsFromMapData.ts` функция `getRawSpawnPositionsFromMapData(customMapData)` — возвращает сырые Vector3[] из triggers и placedObjects (type === 'spawn'), при отсутствии — дефолтные по mapSize. Game.injectCustomMapSpawnPositions() использует её, затем пересчитывает Y через findSafeSpawnPositionAt и пишет в chunkSystem.garagePositions.
- **cameraShakeHelper**: в `game/cameraShakeHelper.ts` вынесены `updateCameraShakeState(state, tank)`, `addCameraShakeIntensity(state, intensity)`, тип `CameraShakeState`, константа `DEFAULT_CAMERA_SHAKE_DECAY`. Тряска только при 80%+ скорости танка. Game хранит `cameraShakeState`, вызывает хелперы в update-цикле и в addCameraShake().
- **globalKeyboardShortcuts**: в `game/globalKeyboardShortcuts.ts` вынесена регистрация глобальных горячих клавиш: `registerGlobalKeyboardShortcuts(game)`. Обрабатываются Ctrl+7, F2, F6, F7, F8, F9, F10, F11, Enter/Backquote (чат), события botPerformance UI. Тип `GlobalKeyboardShortcutsAPI`. Game.setupGlobalKeyboardShortcuts() делегирует в эту функцию.
- **gameKeyboardHandler**: в `game/gameKeyboardHandler.ts` вынесена регистрация игровых клавиш: `registerGameKeyboardHandler(game)`. Обрабатываются B (гараж), G (ворота/закрыть гараж), Ctrl+Shift+M (редактор карт), J (миссии), M (карта), Escape (каскад закрытия UI и главное меню/пауза), 1–5 (припасы). Тип `GameKeyboardHandlerAPI`. Флаг от двойной регистрации хранится в `game._gameKeyboardHandlerRegistered`. Game вызывает регистрацию в том же месте, где раньше вешался addEventListener (в init после production-оптимизаций).
- **refactor-game-ts** (завершён 2026-02-11): вынесен **setupMenuCallbacks** в `game/setupMenuCallbacks.ts`. Интерфейс `IGameForMenuCallbacks`, функция `setupMenuCallbacks(mainMenu, game)`. Регистрация Restart/Exit/Start Game, инициализация SupplyDrop и F3 Physics Viewer внутри onStartGame. Game.setupMenuCallbacks() вызывает эту функцию. Экспорт в `game/index.ts`.
- **refactor-hud-ts** (продолжение): вынесен **createCrosshairElements** в `hud/createCrosshairElements.ts` — создание колец, точки, линий и углов прицела. HUD.createCrosshair() вызывает эту функцию и присваивает elements/dot.
- **client-side-prediction** (2026-02-11): в reconciliation callback добавлены и передаются: `positionDiff` (расстояние до серверной позиции), `predictedState` для confirmed sequence, `unconfirmedInputs` (массив PlayerInput для re-apply). Тип callback расширен полем `unconfirmedInputs?: PlayerInput[]`. GameMultiplayerCallbacks.handleReconciliation принимает `unconfirmedInputs` (для будущего re-apply после телепортации к серверу).
- **Phase 2 (мультиплеер) — завершена (2026-02-11):**
  - **Server reconciliation:** TankController.applyInputForReplay(PlayerInput), в GameMultiplayerCallbacks очередь _replayInputQueue; при телепортации (positionDiff > 10) сохраняются unconfirmedInputs и по одному применяются за кадр в updateLocalPlayerToServer.
  - **Lag compensation:** в handlePlayerHit (gameServer) проверка hit против позиции цели с rewind (getPositionAtTime(rewindTime)), отклонение при distance > 8.
  - **Jitter buffer, binary serialization, delta compression, adaptive update rate:** уже были в коде; отмечены в CHECKLIST.
  - **Enhanced anticheat:** rate limit для PLAYER_HIT (20/сек) в gameServer.handlePlayerHit.
  - **Social menu integration:** multiplayer.sendInvite(friendId) теперь вызывает sendGameInvite(friendId), приглашения в игру уходят на сервер.
- **Phase 3 (контент и геймплей) — завершена (2026-02-11):**
  - **expand-achievements:** новые ежедневные задания daily_pickups, daily_critical; прогресс daily_damage и daily_critical в TankController (при уроне/крите); daily_pickups и supply_runner в setupMenuCallbacks при подборе; достижения supply_runner, season_warrior в achievements.ts; tank.dailyQuestsSystem в Game.
  - **game-balancing:** создан docs/GAME_BALANCE.md (режимы, корпуса/пушки, экономика).
  - **new-game-modes:** режимы Control Point, Escort, Survival, Raid уже в server/gameModes.ts; в gameServer при отключении игрока добавлено удаление из очередей control_point, escort, survival, raid.
  - **visual-effects:** setupFog экспортирует FOG_START, FOG_END и setFogWeatherIntensity(scene, 0..1); экспорт в game/index.ts.
- **refactor-hud-ts** (в работе): вынесены хелперы — notificationStyle, textBlockHeight, notificationSpamGuard, createSimpleNotificationElement, notificationListHelpers, createAchievementNotificationElement, achievementNotificationFade, createHotReloadNotificationElement, poiCaptureLabels, tankStatsFormatters (formatTankStatsRow, formatBonusPercent, formatBonusValue, formatStatWithBonus, getRarityColor), healthBarHelpers (getHealthBarFillColor, getHealthBarFillWidth, isLowHealth, formatHealthText, LOW_HP_THRESHOLD). Полоса здоровья и перезарядки используют хелперы; порог низкого HP и текст здоровья — из одного модуля. networkIndicatorHelpers (formatPingText, getPingColor, formatDriftText, getDriftColor). timeFormatters (formatTimeMMSS, formatInvulnerabilityText) — игра, защита, смерть, гараж, матч, BR. distanceHelpers (formatDistanceMeters, getEnemyDistanceColor). colorHelpers (hexToRgb, rgbToHex, interpolateColor) — эффекты свечения. scaleHelpers (scalePx, scaleFontSize) — обёртки над utils/uiScale для GUI. Дальше — перенос логики в компоненты или хелперы.
- **Phase 4 (код и качество) — завершена (2026-02-11):**
  - **Cleanup:** Рекомендации по качеству кода вынесены в docs/CODE_QUALITY.md (тесты, типизация, размер файлов, стиль).
  - **Testing:** Добавлен Vitest (devDependency), скрипты `npm test` и `npm run test:watch`. Созданы тесты: src/shared/protocol.spec.ts (roundtrip PLAYER_INPUT и PLAYER_STATES), src/client/game/normalizeMapDataForGame.spec.ts (нормализация карты). Для загрузки shared-кода в тестах добавлен мок @babylonjs/core (src/__mocks__/babylonjs.ts), alias в vitest.config.ts.

### 7. complete-map-generators — завершено (2026-02-11)

- **BaseMapGenerator**: `createWallSegment(name, w, h, d, position, material: string | StandardMaterial, parent, addPhysics?, deferMerge?)`, `createSandbag(position, parent, materialName?, addPhysics?)`.
- **FrontlineGenerator**, **PolygonGenerator**, **SandGenerator**, **ArenaGenerator** переведены на эти хелперы (стены периметра, мешки с песком). Arena использует createWallSegment с кастомным материалом (StandardMaterial).

---

## С чего продолжить (рекомендуемый порядок)

1. **Следующие задачи по плану**  
   Брать из **docs/список_незавершённых_задач_protocol_tx_e02b1b75.md** (задачи со статусом `pending`). Краткая выжимка — **next/TASKS_PENDING.md**. Приоритеты и детали — **docs/NEXT_IMPROVEMENTS_PLAN.md**. Ближайшие по приоритету: рефакторинг `game.ts`, рефакторинг `hud.ts`, генераторы карт, интеграция AI/PerformanceOptimizer, мультиплеер (ping, prediction, reconciliation).

2. **Перед крупными изменениями**  
   Проверить актуальность списка задач и статусов в `docs/список_незавершённых_задач_protocol_tx_e02b1b75.md` и при необходимости обновить статусы после выполнения.

---

## Важные пути

- План задач (YAML + текст): `docs/список_незавершённых_задач_protocol_tx_e02b1b75.md`
- План улучшений: `docs/NEXT_IMPROVEMENTS_PLAN.md`
- Общий статус разработки: `docs/DEVELOPMENT_STATUS.md`
- Логгер (клиент): `src/client/utils/logger.ts`
- Точка входа клиента: `src/client/main.ts`
- Игра: `src/client/game.ts` (большой файл, в планах рефакторинг)

---

## Запуск и сборка

- `npm install` — зависимости  
- `npm run dev` — клиент (Vite)  
- `npm run server:dev` — сервер  
- `npm run build` — сборка

Детали — в `README.md` в корне и в `docs/SETUP.md`.
