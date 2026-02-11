# Файлы с оставшимися вызовами console.* (для замены на logger)

**Обновлено:** 2026-02-11 — замена завершена.

Все активные вызовы `console.log` / `console.error` / `console.warn` в клиентском коде заменены на `logger` (см. HANDOFF.md). Оставшиеся вхождения:

- **Не трогать:** `src/client/main.ts` (перехват console для Vercel Analytics), `src/client/utils/logger.ts` (реализация логгера).
- В остальных файлах остались только **закомментированные** строки с `console.*` (например в tankController.ts, game.ts, CustomMapBridge.ts и др.) — их можно не менять.

Проверка актуальности:

```bash
# В корне проекта, только активные вызовы (не в комментариях):
# grep -rn "console\.\(log\|error\|warn\)" src/client --include="*.ts" | grep -v "^\s*//"
# Ожидаемый результат: только main.ts и utils/logger.ts
```

---

## Обработанные в этой сессии (2026-02-11)

| Файл | Статус |
|------|--------|
| tank/engines/EngineTypes.ts | ✅ logger |
| tank/arsenal/ArsenalTypes.ts | ✅ logger |
| tank/tankSkins.ts | ✅ logger |
| tank/tankEditor.ts | ✅ logger |
| tank/chassisTransformAnimation.ts | ✅ logger |
| services/RealWorldGeneratorV3.ts | ✅ logger |
| services/OverpassService.ts | ✅ logger |
| services/GeoDataService.ts | ✅ logger |
| services/AiService.ts | ✅ logger |
| maps/EditorMapGeneratorInitializer.ts | ✅ logger |
| game/GameStats.ts | ✅ logger |
| mobile/MobilePerformance.ts | ✅ logger |
| terminalTheme.ts | ✅ logger |
| tankDuplicationLogger.ts | ✅ logger (обёртка переведена на logger) |
| serviceWorker.ts | ✅ logger |
| settingsPanel.ts | ✅ logger |
| playerStats.ts | ✅ logger |
| roadNetwork.ts | ✅ logger |
| missionSystem.ts | ✅ logger |
| currencyManager.ts | ✅ logger |
| debugLogger.ts | ✅ logger (единственный активный вызов — logger.warn) |

Файлы из старого списка (GameMapExporter, leaderboard, playerProgression, menu/settings, metricsCharts, voiceChat, ObserverRegistry, WorldBuilder, BaseMapGenerator) при проверке не содержали активных вызовов — либо уже были обработаны ранее, либо только в комментариях.
