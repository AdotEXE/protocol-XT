import 'dotenv/config';
import { GameServer } from "./gameServer";
import * as net from "net";
import * as http from "http";

const DEFAULT_WS_PORT = 8000;  // WebSocket сервер
const DEFAULT_HTTP_PORT = 7000; // HTTP мониторинг
const HOST = process.env.HOST || "0.0.0.0"; // 0.0.0.0 = слушать на всех интерфейсах

/**
 * Проверяет, свободен ли порт
 */
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
            server.once('close', () => resolve(true));
            server.close();
        });
        server.on('error', () => resolve(false));
    });
}

/**
 * Находит свободный порт, начиная с указанного
 */
async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
        const port = startPort + i;
        const available = await isPortAvailable(port);
        if (available) {
            return port;
        }
    }
    throw new Error(`Не удалось найти свободный порт в диапазоне ${startPort}-${startPort + maxAttempts - 1}`);
}

/**
 * Создает HTTP сервер для мониторинга на порту 7000
 */
function createHTTPServer(gameServer: GameServer): http.Server {
    const httpPort = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT) : DEFAULT_HTTP_PORT;
    
    const httpServer = http.createServer((req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        // API для мониторинга
        if (req.url === '/api/stats' && req.method === 'GET') {
            const stats = gameServer.getStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats, null, 2));
            return;
        }
        
        // Health check
        if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
            return;
        }
        
        // 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    });
    
    httpServer.listen(httpPort, HOST, () => {
        console.log(`[Server] ✅ HTTP server started on http://${HOST}:${httpPort}`);
        console.log(`[Server]    - Health: http://localhost:${httpPort}/health`);
        console.log(`[Server]    - Stats: http://localhost:${httpPort}/api/stats`);
    });
    
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
            console.warn(`[Server] ⚠️ HTTP порт ${httpPort} занят, пропускаем HTTP сервер`);
        } else {
            console.error(`[Server] ❌ HTTP server error:`, error);
        }
    });
    
    return httpServer;
}

async function startServer(): Promise<GameServer> {
    let wsPort = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_WS_PORT;
    
    // Проверяем доступность WebSocket порта с повторными попытками
    let available = await isPortAvailable(wsPort);
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!available && attempts < maxAttempts) {
        attempts++;
        console.warn(`[Server] ⚠️ Порт ${wsPort} занят (попытка ${attempts}/${maxAttempts}), ждем 2 секунды...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        available = await isPortAvailable(wsPort);
    }
    
    if (!available) {
        console.warn(`[Server] ⚠️ Порт ${wsPort} все еще занят после ${maxAttempts} попыток, ищем свободный порт...`);
        try {
            wsPort = await findAvailablePort(wsPort);
            console.log(`[Server] ✅ Найден свободный порт: ${wsPort}`);
            console.warn(`[Server] ⚠️ ВНИМАНИЕ: Сервер запущен на порту ${wsPort} вместо ${DEFAULT_WS_PORT}`);
            console.warn(`[Server] ⚠️ Клиент должен подключаться к ws://localhost:${wsPort}`);
        } catch (error) {
            console.error(`[Server] ❌ Ошибка при поиске свободного порта:`, error);
            console.error(`[Server] Попробуйте:`);
            console.error(`[Server]   1. Закрыть процесс, использующий порт ${DEFAULT_WS_PORT}`);
            console.error(`[Server]   2. Или установить переменную окружения PORT=<другой_порт>`);
            console.error(`[Server]   3. Или запустить: npm run kill:ports`);
            console.error(`[Server]   4. Или вручную: netstat -ano | findstr :${DEFAULT_WS_PORT}`);
            process.exit(1);
        }
    }
    
    const gameServer = new GameServer(wsPort, HOST);
    
    // Запускаем HTTP сервер для мониторинга на порту 7000
    createHTTPServer(gameServer);
    
    return gameServer;
}

let gameServerInstance: GameServer | null = null;

startServer().then((server) => {
    gameServerInstance = server;
}).catch((error) => {
    console.error("[Server] ❌ Критическая ошибка при запуске сервера:", error);
    process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Server] Shutting down...");
    if (gameServerInstance) {
        gameServerInstance.shutdown();
    }
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Server] Shutting down...");
    if (gameServerInstance) {
        gameServerInstance.shutdown();
    }
    process.exit(0);
});

