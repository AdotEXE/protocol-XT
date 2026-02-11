# next — передача контекста для следующего ИИ

Папка **next** содержит всё необходимое, чтобы другой ИИ мог продолжить работу над проектом Protocol TX с того же места.

## С чего начать

1. **Прочитай [HANDOFF.md](./HANDOFF.md)** — там текущее состояние, что уже сделано и что делать дальше.
2. **Проверь [TASKS_PENDING.md](./TASKS_PENDING.md)** — список незавершённых задач (выжимка из основного плана).
3. **При необходимости** — смотри полные планы в `docs/` (пути указаны в HANDOFF.md).

## Содержимое папки next

| Файл | Назначение |
|------|------------|
| **README.md** | Этот файл — навигация по next. |
| **HANDOFF.md** | Контекст передачи: что сделано, что следующее, важные пути. |
| **TASKS_PENDING.md** | Краткий список оставшихся задач (pending). |
| **FILES_LOGGER_REMAINING.md** | Файлы, где ещё могут быть вызовы `console.*` (для замены на logger). |
| **plan-tasks.md** | Полный план задач (YAML todos + детальное описание по приоритетам). |
| **plan-improvements.md** | План улучшений: приоритеты, оценки времени, быстрые победы. |

## Основные документы проекта (в корне и docs/)

- **Полный список задач (YAML + текст):** `next/plan-tasks.md` (копия: `docs/список_незавершённых_задач_protocol_tx_e02b1b75.md`)
- **План улучшений (приоритеты, описание):** `next/plan-improvements.md` (копия: `docs/NEXT_IMPROVEMENTS_PLAN.md`)
- **Статус разработки:** `docs/DEVELOPMENT_STATUS.md`
- **Архитектура:** `docs/ARCHITECTURE.md`, `CORE_SYSTEMS.md`

## Технологии

- **Клиент:** TypeScript, Vite, Babylon.js, Havok Physics.
- **Сервер:** Node.js, Express, Geckos.io (WebSockets).
- **Структура:** `src/client/`, `src/server/`, `src/shared/`.

Логирование: централизованный **logger** в `src/client/utils/logger.ts`. В production не-ошибки отключаются автоматически. Не заменять вызовы в `main.ts` (перехват console для Vercel analytics) и внутри самого `utils/logger.ts`.
