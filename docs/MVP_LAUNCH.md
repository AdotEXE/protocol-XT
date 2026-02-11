# Запуск MVP Protocol TX

Краткий чек-лист для вывода минимально играбельной версии в прод: деплой клиента и сервера, связка через переменные окружения, проверка одиночной игры и мультиплеера.

Подробности по шагам — в указанных документах.

---

## Чек-лист MVP

- [ ] **1. Клиент на Vercel**  
  Задеплоить проект (Git или Vercel CLI). Build: `npm run build`, output: `dist`.  
  См. [DEPLOYMENT.md](DEPLOYMENT.md) (Vercel), [VERCEL_SETUP.md](VERCEL_SETUP.md).

- [ ] **2. Сервер на Railway**  
  Создать проект из репозитория. Используется `railway.json`: build `npm install && npm run build:server`, start `npm run start:server`. В Settings → Networking выдать публичный домен.  
  См. [DEPLOY_SERVER.md](DEPLOY_SERVER.md).

- [ ] **3. Связка клиент — сервер**  
  В Vercel: Settings → Environment Variables → добавить  
  `VITE_WS_SERVER_URL=wss://<ваш-домен-railway>`  
  (обязательно `wss://`). Передеплоить клиент.  
  См. [ARCHITECTURE.md](ARCHITECTURE.md) (секция «Что от вас требуется»).

- [ ] **4. Firebase (опционально)**  
  Если нужны вход и прогресс: в Vercel задать переменные Firebase (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` и при необходимости остальные). В Firebase Console включить Anonymous sign-in при игре без аккаунта.  
  См. [FIREBASE_KEYS_EXPLAINED.md](FIREBASE_KEYS_EXPLAINED.md).

- [ ] **5. Smoke test**  
  - Открыть сайт на Vercel — меню загружается, в консоли браузера нет критичных ошибок.  
  - Играть → Одиночная игра → карта/режим → старт. Проверить управление (сервер не нужен).  
  - Два браузера/вкладки на деплое → Мультиплеер → создать/войти в комнату → оба в одной комнате, видимость и базовая синхронизация.  
  См. [CI_CD_CHECKLIST.md](CI_CD_CHECKLIST.md) (секция «Проверка работоспособности»).

---

## Ссылки

| Документ | Назначение |
|----------|------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Варианты деплоя (Vercel, Netlify и др.), сборка, настройки. |
| [DEPLOY_SERVER.md](DEPLOY_SERVER.md) | Деплой игрового сервера на Railway, переменные, получение URL. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Схема клиент/сервер и обязательная настройка `VITE_WS_SERVER_URL`. |
| [CI_CD_CHECKLIST.md](CI_CD_CHECKLIST.md) | Быстрая проверка деплоя и smoke test. |
| [FIREBASE_KEYS_EXPLAINED.md](FIREBASE_KEYS_EXPLAINED.md) | Переменные Firebase для авторизации. |

---

## Git и автодеплой (по желанию)

- Пуш в удалённый репозиторий: добавить `origin` (`git remote add origin <url>`), затем `git push`.
- Автодеплой при push: подключить репозиторий к Vercel и Railway; при использовании ветки `master` вместо `main` при необходимости поправить триггеры в [.github/workflows/ci.yml](../.github/workflows/ci.yml).  
  См. [CI_CD_CHECKLIST.md](CI_CD_CHECKLIST.md).
