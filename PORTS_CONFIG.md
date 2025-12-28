# Конфигурация портов

## Текущая конфигурация портов

### Порт 5000 - Vite Dev Server (Игра)
- **Назначение**: Клиентская часть игры (Vite dev server)
- **Конфигурация**: `vite.config.ts` → `server.port: 5000`
- **Запуск**: `npm run dev`
- **URL**: `http://localhost:5000`

### Порт 7000 - HTTP Мониторинг
- **Назначение**: HTTP API для мониторинга сервера
- **Конфигурация**: `src/server/index.ts` → `DEFAULT_HTTP_PORT = 7000`
- **Переменная окружения**: `HTTP_PORT` (опционально)
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

## Скрипты

### Закрыть процессы на портах
```powershell
npm run kill:ports
```
Закрывает процессы на портах 5000, 7000, 8000

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

## Проверка работоспособности

1. **Проверка портов**:
   ```powershell
   npm run kill:ports
   ```

2. **Запуск сервера**:
   ```powershell
   npm run server:start
   ```
   Должно вывести:
   - `[Server] ✅ WebSocket server started on 0.0.0.0:8000`
   - `[Server] ✅ HTTP server started on http://0.0.0.0:7000`

3. **Запуск клиента**:
   ```powershell
   npm run dev
   ```
   Игра будет доступна на `http://localhost:5000`

4. **Проверка подключения**:
   - В консоли браузера должно быть: `[Multiplayer] Connected to server`
   - В консоли сервера должно быть: `[Server] New client connected`

## Решение проблем

### Порт занят
1. Запустите `npm run kill:ports`
2. Или вручную закройте процесс:
   ```powershell
   netstat -ano | findstr :8000
   taskkill /PID <PID> /F
   ```

### Не подключается к серверу
1. Убедитесь что сервер запущен: `npm run server:start`
2. Проверьте URL в консоли браузера
3. Проверьте переменную окружения `VITE_WS_SERVER_URL`

