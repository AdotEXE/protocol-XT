# Конфигурация портов

## Текущая конфигурация портов

### Порт 3000 - PolyGen Studio Editor (Редактор карт)
- **Назначение**: Редактор карт (отдельный проект)
- **Конфигурация**: `PolyGenStudio-main/vite.config.ts` → `server.port: 3000`
- **Запуск**: `cd PolyGenStudio-main && npm run dev` или через `npm run dev:unified`
- **URL**: `http://localhost:3000`
- **Примечание**: Опциональный сервис, запускается только при необходимости редактирования карт

### Порт 5000 - Vite Dev Server (Игра)
- **Назначение**: Клиентская часть игры (Vite dev server)
- **Конфигурация**: `vite.config.ts` → `server.port: 5000`
- **Запуск**: `npm run dev` или через `npm run dev:unified`
- **URL**: `http://localhost:5000`

### Порт 7000 - HTTP Мониторинг
- **Назначение**: HTTP API для мониторинга сервера
- **Конфигурация**: `src/server/index.ts` → `DEFAULT_HTTP_PORT = 7000`
- **Переменная окружения**: `HTTP_PORT` (опционально)
- **Запуск**: Автоматически запускается вместе с сервером (`npm run server`)
- **Endpoints**:
  - `http://localhost:7000/health` - проверка здоровья
  - `http://localhost:7000/api/stats` - статистика сервера

### Порт 8000 - WebSocket Сервер (Мультиплеер)
- **Назначение**: Игровой WebSocket сервер для мультиплеера
- **Конфигурация**: `src/server/index.ts` → `DEFAULT_WS_PORT = 8000`
- **Переменная окружения**: `PORT` (опционально)
- **URL**: `ws://localhost:8000`
- **Клиент**: Автоматически подключается к `ws://localhost:8000`
- **Переменная окружения клиента**: `VITE_WS_SERVER_URL` (опционально)
- **Запуск**: `npm run server` или через `npm run dev:unified`

### Порт 9000 - Web Dashboard (Мониторинг)
- **Назначение**: Веб-дашборд для мониторинга всех сервисов
- **Конфигурация**: `scripts/web-dashboard/server.ts` → `PORT = 9000`
- **Запуск**: `npm run dev:web` (опционально)
- **URL**: `http://localhost:9000`
- **Примечание**: Опциональный сервис, запускается отдельно для веб-мониторинга

## Переменные окружения

### Сервер
```env
PORT=8000              # WebSocket порт (по умолчанию 8000)
HTTP_PORT=7000         # HTTP порт мониторинга (по умолчанию 7000)
HOST=0.0.0.0          # Хост для прослушивания (по умолчанию 0.0.0.0)
```

### Клиент
```env
VITE_WS_SERVER_URL=ws://localhost:8000  # URL WebSocket сервера
```

### Редактор карт (PolyGen Studio)
```env
# Порт настраивается в PolyGenStudio-main/vite.config.ts
# По умолчанию: 3000
```

### Web Dashboard
```env
# Порт настраивается в scripts/web-dashboard/server.ts
# По умолчанию: 9000
```

## Скрипты

### Закрыть процессы на портах
```powershell
npm run kill:ports
```
Закрывает процессы на портах 3000, 5000, 7000, 8000, 9000

### Запуск всех сервисов (рекомендуется)
```powershell
npm run dev:go
```
Запускает:
- Сервер (WebSocket на порту 8000, HTTP на порту 7000)
- Клиент (Vite на порту 5000)
- Редактор карт (на порту 3000, если нужен)

### Запуск сервера
```powershell
npm run server:start
```
Автоматически закрывает процессы и запускает сервер на портах 7000 и 8000

### Обычный запуск
```powershell
npm run server
```
Запускает сервер без закрытия процессов

### Web Dashboard (опционально)
```powershell
npm run dev:web
```
Запускает веб-дашборд на порту 9000

## Проверка работоспособности

1. **Проверка портов**:
   ```powershell
   npm run kill:ports
   ```

2. **Запуск всех сервисов**:
   ```powershell
   npm run dev:go
   ```
   Запустит:
   - Сервер (WebSocket на порту 8000, HTTP на порту 7000)
   - Клиент (Vite на порту 5000)
   - Редактор карт (на порту 3000, если нужен)

3. **Запуск только сервера**:
   ```powershell
   npm run server:start
   ```
   Должно вывести:
   - `[Server] ✅ WebSocket server started on 0.0.0.0:8000`
   - `[Server] ✅ HTTP server started on http://0.0.0.0:7000`

4. **Запуск только клиента**:
   ```powershell
   npm run dev
   ```
   Игра будет доступна на `http://localhost:5000`

5. **Запуск Web Dashboard (опционально)**:
   ```powershell
   npm run dev:web
   ```
   Дашборд будет доступен на `http://localhost:9000`

6. **Проверка подключения**:
   - В консоли браузера должно быть: `[Multiplayer] Connected to server`
   - В консоли сервера должно быть: `[Server] New client connected`

## Решение проблем

### Порт занят
1. Запустите `npm run kill:ports` - закроет все порты (3000, 5000, 7000, 8000, 9000)
2. Или вручную закройте процесс:
   ```powershell
   netstat -ano | findstr :8000
   taskkill /PID <PID> /F
   ```

### Не подключается к серверу
1. Убедитесь что сервер запущен: `npm run server:start` или `npm run dev:go`
2. Проверьте URL в консоли браузера (должен быть `ws://localhost:8000`)
3. Проверьте переменную окружения `VITE_WS_SERVER_URL`
4. Проверьте, что порт 8000 не занят: `netstat -ano | findstr :8000`

### Проверка всех портов
```powershell
# Проверить все используемые порты
netstat -ano | findstr ":3000 :5000 :7000 :8000 :9000"
```
