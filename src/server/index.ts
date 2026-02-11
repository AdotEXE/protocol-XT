import 'dotenv/config';
import { GameServer } from "./gameServer";
import * as net from "net";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { serverLogger } from "./logger";
import { handleUpgradeRequest } from "./upgrade";
import { getLocalIP, getAllLocalIPs } from "../../scripts/get-local-ip";

const DEFAULT_WS_PORT = 8000;  // WebSocket сервер
const DEFAULT_HTTP_PORT = 7001; // HTTP мониторинг (changed from 7000 to avoid macOS AirPlay conflict)
const HOST = process.env.HOST || "0.0.0.0"; // Слушаем на всех интерфейсах для доступа из сети

// Путь к папке с моделями (C:\Users\dzoblin\Desktop\TX\json_models)
// Можно переопределить через переменную окружения MODELS_DIR
// По умолчанию используем папку проекта (где находится package.json)
const PROJECT_ROOT = process.cwd(); // Корень проекта (где package.json)
const DEFAULT_MODELS_PATH = path.join(PROJECT_ROOT, 'json_models');
const MODELS_BASE = process.env.MODELS_DIR || DEFAULT_MODELS_PATH;
const MODELS_DIR = path.isAbsolute(MODELS_BASE) ? MODELS_BASE : path.resolve(PROJECT_ROOT, MODELS_BASE);
const CUSTOM_TANKS_DIR = path.join(MODELS_DIR, 'custom-tanks');
const BASE_TYPES_DIR = path.join(MODELS_DIR, 'base-types');
const GENERATED_MODELS_DIR = path.join(MODELS_DIR, 'generated-models');

/**
 * Создает необходимые папки для моделей
 */
function ensureModelsDirectories(): void {
    const dirs = [MODELS_DIR, CUSTOM_TANKS_DIR, BASE_TYPES_DIR, GENERATED_MODELS_DIR];
    serverLogger.log(`[Models] 📁 Project root: ${PROJECT_ROOT}`);
    serverLogger.log(`[Models] 📁 Models directory: ${MODELS_DIR}`);

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            serverLogger.log(`[Models] ✅ Created directory: ${dir}`);
        } else {
            serverLogger.log(`[Models] ✓ Directory exists: ${dir}`);
        }
    }

    serverLogger.log(`[Models] 📂 Directory structure:`);
    serverLogger.log(`  - Base types: ${BASE_TYPES_DIR}`);
    serverLogger.log(`  - Custom tanks: ${CUSTOM_TANKS_DIR}`);
    serverLogger.log(`  - Generated models: ${GENERATED_MODELS_DIR}`);
}

/**
 * Валидирует путь файла (защита от path traversal)
 */
function validateFilePath(filePath: string, category: string): { valid: boolean; fullPath: string | null; error: string | null } {
    // Определяем базовую директорию по категории
    let baseDir: string;
    switch (category) {
        case 'custom-tanks':
            baseDir = CUSTOM_TANKS_DIR;
            break;
        case 'base-types':
            baseDir = BASE_TYPES_DIR;
            break;
        case 'generated-models':
            baseDir = GENERATED_MODELS_DIR;
            break;
        default:
            return { valid: false, fullPath: null, error: 'Invalid category' };
    }

    // Проверяем расширение файла
    if (!filePath.endsWith('.json')) {
        return { valid: false, fullPath: null, error: 'File must have .json extension' };
    }

    // Нормализуем путь и проверяем на path traversal
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || normalizedPath.startsWith('/') || normalizedPath.startsWith('\\')) {
        return { valid: false, fullPath: null, error: 'Invalid file path (path traversal detected)' };
    }

    const fullPath = path.join(baseDir, normalizedPath);

    // Проверяем что файл находится внутри базовой директории
    if (!fullPath.startsWith(baseDir)) {
        return { valid: false, fullPath: null, error: 'Invalid file path (outside allowed directory)' };
    }

    return { valid: true, fullPath, error: null };
}

/**
 * Обработчик сохранения модели
 */
async function handleSaveModel(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                // Поддерживаем оба формата: 'content' и 'data' для обратной совместимости
                const { filename, category, content, data: dataField } = data;
                const modelData = content || dataField;

                if (!filename || !category || !modelData) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing required fields: filename, category, and data/content' }));
                    return;
                }

                const validation = validateFilePath(filename, category);
                if (!validation.valid) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: validation.error }));
                    return;
                }

                // Валидируем JSON
                const jsonContent = typeof modelData === 'string' ? modelData : JSON.stringify(modelData, null, 2);
                try {
                    JSON.parse(jsonContent);
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON content' }));
                    return;
                }

                // Сохраняем файл
                fs.writeFileSync(validation.fullPath!, jsonContent, 'utf-8');
                serverLogger.log(`[Models] ✅ Saved model: ${category}/${filename}`);
                serverLogger.log(`[Models]    Path: ${validation.fullPath}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: validation.fullPath }));
            } catch (e) {
                serverLogger.error('[Models] Error saving model:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save model', details: String(e) }));
            }
        });
    } catch (e) {
        serverLogger.error('[Models] Error handling save request:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
}

/**
 * Обработчик загрузки модели
 */
function handleLoadModel(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const category = url.searchParams.get('category');
        const filename = url.searchParams.get('filename');

        if (!category || !filename) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameters: category, filename' }));
            return;
        }

        const validation = validateFilePath(filename, category);
        if (!validation.valid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: validation.error }));
            return;
        }

        if (!fs.existsSync(validation.fullPath!)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
        }

        const content = fs.readFileSync(validation.fullPath!, 'utf-8');
        const data = JSON.parse(content);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
    } catch (e) {
        serverLogger.error('[Models] Error loading model:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load model', details: String(e) }));
    }
}

/**
 * Обработчик списка моделей
 */
function handleListModels(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const category = url.searchParams.get('category') || 'all';

        const models: Array<{ category: string; filename: string; size: number; modified: number }> = [];

        if (category === 'all' || category === 'custom-tanks') {
            if (fs.existsSync(CUSTOM_TANKS_DIR)) {
                const files = fs.readdirSync(CUSTOM_TANKS_DIR).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const filePath = path.join(CUSTOM_TANKS_DIR, file);
                    const stats = fs.statSync(filePath);
                    models.push({
                        category: 'custom-tanks',
                        filename: file,
                        size: stats.size,
                        modified: stats.mtimeMs
                    });
                }
            }
        }

        if (category === 'all' || category === 'base-types') {
            if (fs.existsSync(BASE_TYPES_DIR)) {
                const files = fs.readdirSync(BASE_TYPES_DIR).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const filePath = path.join(BASE_TYPES_DIR, file);
                    const stats = fs.statSync(filePath);
                    models.push({
                        category: 'base-types',
                        filename: file,
                        size: stats.size,
                        modified: stats.mtimeMs
                    });
                }
            }
        }

        if (category === 'all' || category === 'generated-models') {
            if (fs.existsSync(GENERATED_MODELS_DIR)) {
                const files = fs.readdirSync(GENERATED_MODELS_DIR).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const filePath = path.join(GENERATED_MODELS_DIR, file);
                    const stats = fs.statSync(filePath);
                    models.push({
                        category: 'generated-models',
                        filename: file,
                        size: stats.size,
                        modified: stats.mtimeMs
                    });
                }
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, models }));
    } catch (e) {
        serverLogger.error('[Models] Error listing models:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to list models', details: String(e) }));
    }
}

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

        // API для моделей - сохранение
        if (req.url === '/api/models/save' && req.method === 'POST') {
            await handleSaveModel(req, res);
            return;
        }

        // API для моделей - загрузка
        if (req.url?.startsWith('/api/models/load') && req.method === 'GET') {
            handleLoadModel(req, res);
            return;
        }

        // API для моделей - список
        if (req.url?.startsWith('/api/models/list') && req.method === 'GET') {
            handleListModels(req, res);
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
        const localIP = getLocalIP();
        serverLogger.log(`[Server] ✅ HTTP server started on http://127.0.0.1:${httpPort}`);
        if (localIP) {
            serverLogger.log(`[Server]    - Network: http://${localIP}:${httpPort}`);
        }
        serverLogger.log(`[Server]    - Health: http://127.0.0.1:${httpPort}/health`);
        serverLogger.log(`[Server]    - Stats: http://127.0.0.1:${httpPort}/api/stats`);
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

    // Создаем необходимые папки для моделей
    ensureModelsDirectories();

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
        serverLogger.log(`[Server] 🦎 UDP Signaling server started on http://127.0.0.1:${udpPort}`);
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

