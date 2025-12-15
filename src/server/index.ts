import { GameServer } from "./gameServer";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

const server = new GameServer(PORT);

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Server] Shutting down...");
    server.shutdown();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Server] Shutting down...");
    server.shutdown();
    process.exit(0);
});

