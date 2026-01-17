# Docker Setup for Protocol TX

This document explains how to run Protocol TX using Docker.

## Prerequisites

- Docker installed (Docker Desktop or Docker Engine)
- Docker Compose installed (usually comes with Docker Desktop)

## Quick Start

### Development Mode (Recommended)

Run both client and server in a single container:

```bash
docker-compose up dev
```

This will:
- Start Vite dev server on http://localhost:5000
- Start WebSocket server on ws://localhost:8000
- Start HTTP monitoring on http://localhost:7000

### Production Mode

Build and run the production version:

```bash
docker-compose up prod
```

This will:
- Build the optimized production bundle
- Start preview server on http://localhost:4173
- Start WebSocket server on ws://localhost:8000
- Start HTTP monitoring on http://localhost:7000

### Separate Client and Server (Advanced)

Run client and server in separate containers:

```bash
docker-compose --profile separate up
```

This gives you more control and allows independent scaling.

## Docker Commands

### Build the Image

```bash
# Development
docker-compose build dev

# Production
docker-compose build prod
```

### Run in Background

```bash
docker-compose up -d dev
```

### View Logs

```bash
docker-compose logs -f dev
```

### Stop Containers

```bash
docker-compose down
```

### Rebuild and Restart

```bash
docker-compose up --build dev
```

### Access Container Shell

```bash
docker exec -it protocol-tx-dev sh
```

## Port Mapping

| Service | Container Port | Host Port | Description |
|---------|---------------|-----------|-------------|
| Vite Dev Server | 5000 | 5000 | Client development server |
| Vite Preview | 4173 | 4173 | Production preview server |
| HTTP Monitoring | 7000 | 7000 | Server monitoring API |
| WebSocket Server | 8000 | 8000 | Multiplayer game server |

## Environment Variables

You can customize the setup by creating a `.env` file:

```env
# Server configuration
PORT=8000
HTTP_PORT=7000
HOST=0.0.0.0

# Client configuration
VITE_WS_SERVER_URL=ws://localhost:8000
NODE_ENV=development
```

## Troubleshooting

### Port Already in Use

If you get a port conflict error:

```bash
# Kill local processes on those ports
npm run kill:ports

# Or manually kill processes
lsof -ti:5000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
lsof -ti:7000 | xargs kill -9
```

### Container Won't Start

```bash
# Clean up and rebuild
docker-compose down
docker-compose build --no-cache dev
docker-compose up dev
```

### Changes Not Reflected

The development container uses volume mounting, so changes should be reflected immediately. If not:

```bash
# Restart the container
docker-compose restart dev
```

### View Container Logs

```bash
# All logs
docker-compose logs dev

# Follow logs in real-time
docker-compose logs -f dev

# Last 100 lines
docker-compose logs --tail=100 dev
```

## Development Workflow

1. **Start development environment:**
   ```bash
   docker-compose up dev
   ```

2. **Open browser:**
   - Game: http://localhost:5000
   - Monitoring: http://localhost:7000/health

3. **Make changes:**
   - Edit files in your local directory
   - Changes are synced via volume mount
   - Vite HMR will auto-reload

4. **View logs:**
   ```bash
   docker-compose logs -f dev
   ```

5. **Stop when done:**
   ```bash
   docker-compose down
   ```

## Production Deployment

For production deployment:

```bash
# Build production image
docker-compose build prod

# Run with restart policy
docker-compose up -d prod

# Check health
curl http://localhost:7000/health
```

## Advanced Usage

### Custom Dockerfile Target

```bash
docker build --target development -t protocol-tx:dev .
docker build --target production -t protocol-tx:prod .
```

### Run Without Docker Compose

```bash
# Development
docker run -p 5000:5000 -p 7000:7000 -p 8000:8000 \
  -v $(pwd):/app \
  -v /app/node_modules \
  protocol-tx:dev

# Production
docker run -p 4173:4173 -p 7000:7000 -p 8000:8000 \
  protocol-tx:prod
```

## Notes

- The development container mounts your source code as a volume, so changes are reflected immediately
- Node modules are stored in an anonymous volume to prevent conflicts with host system
- The production build is optimized and runs the preview server
- Both client and server run in the same container by default for simplicity
