import 'dotenv/config';
import { GameServer } from "./gameServer";
import * as net from "net";
import * as http from "http";
import { serverLogger } from "./logger";
import { handleUpgradeRequest } from "./upgrade";

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

    const httpServer = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // API прокачки
        const handledByUpgrade = await handleUpgradeRequest(req, res);
        if (handledByUpgrade) {
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
        serverLogger.log(`[Server] ✅ HTTP server started on http://${HOST}:${httpPort}`);
        serverLogger.log(`[Server]    - Health: http://localhost:${httpPort}/health`);
        serverLogger.log(`[Server]    - Stats: http://localhost:${httpPort}/api/stats`);
    });

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
            serverLogger.warn(`[Server] ⚠️ HTTP порт ${httpPort} занят, пропускаем HTTP сервер`);
        } else {
            serverLogger.error(`[Server] ❌ HTTP server error:`, error);
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
        serverLogger.warn(`[Server] ⚠️ Порт ${wsPort} занят (попытка ${attempts}/${maxAttempts}), ждем 2 секунды...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        available = await isPortAvailable(wsPort);
    }

    if (!available) {
        serverLogger.warn(`[Server] ⚠️ Порт ${wsPort} все еще занят после ${maxAttempts} попыток, ищем свободный порт...`);
        try {
            wsPort = await findAvailablePort(wsPort);
            serverLogger.log(`[Server] ✅ Найден свободный порт: ${wsPort}`);
            serverLogger.warn(`[Server] ⚠️ ВНИМАНИЕ: Сервер запущен на порту ${wsPort} вместо ${DEFAULT_WS_PORT}`);
            serverLogger.warn(`[Server] ⚠️ Клиент должен подключаться к ws://localhost:${wsPort}`);
        } catch (error) {
            serverLogger.error(`[Server] ❌ Ошибка при поиске свободного порта:`, error);
            serverLogger.error(`[Server] Попробуйте:`);
            serverLogger.error(`[Server]   1. Закрыть процесс, использующий порт ${DEFAULT_WS_PORT}`);
            serverLogger.error(`[Server]   2. Или установить переменную окружения PORT=<другой_порт>`);
            serverLogger.error(`[Server]   3. Или запустить: npm run kill:ports`);
            serverLogger.error(`[Server]   4. Или вручную: netstat -ano | findstr :${DEFAULT_WS_PORT}`);
            process.exit(1);
        }
    }

    const gameServer = new GameServer(wsPort, HOST);

    // Запускаем HTTP сервер для мониторинга на порту 7000
    createHTTPServer(gameServer);

    // --- Geckos.io UDP Integration ---
    try {
        // Find a port for UDP (default 9208)
        const udpPort = await findAvailablePort(9208);

        // Initialize Geckos
        // @ts-ignore
        const geckos = (await import('@geckos.io/server')).default;
        const io = geckos({
            cors: { allowAuthorization: true, origin: "*" },
            // iceCandidates can be configured here if needed for NAT traversal
        });

        io.listen(udpPort);
        serverLogger.log(`[Server] 🦎 UDP Signaling server started on http://${HOST}:${udpPort}`);
        serverLogger.log(`[Server] 🦎 UDP Data port: ${udpPort}`); // Geckos uses same port number for UDP usually if using node-datachannel

        gameServer.setGeckosServer(io);
        gameServer.setUdpPort(udpPort);
    } catch (error) {
        serverLogger.error("[Server] ❌ Failed to start UDP server:", error);
        // Continue without UDP
    }

    return gameServer;
}

let gameServerInstance: GameServer | null = null;

startServer().then((server) => {
    gameServerInstance = server;
    // Устанавливаем ссылку на сервер в TUI логгере для мониторинга
    serverLogger.setGameServer(server);
}).catch((error) => {
    serverLogger.error("[Server] ❌ Критическая ошибка при запуске сервера:", error);
    process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
    serverLogger.log("\n[Server] Shutting down...");
    if (gameServerInstance) {
        gameServerInstance.shutdown();
    }
    serverLogger.cleanup();
    process.exit(0);
});

process.on("SIGTERM", () => {
    serverLogger.log("\n[Server] Shutting down...");
    if (gameServerInstance) {
        gameServerInstance.shutdown();
    }
    serverLogger.cleanup();
    process.exit(0);
});

