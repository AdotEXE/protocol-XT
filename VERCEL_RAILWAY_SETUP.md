# Vercel + Railway Deployment Guide

## Architecture Overview

Your game uses a **split deployment architecture**:

```
┌─────────────────────────────────────────────────┐
│                    VERCEL                       │
│  - Static frontend (HTML, JS, CSS, assets)      │
│  - API functions (/api/models/*)                │
│  - CDN for fast global delivery                 │
└─────────────────────────────────────────────────┘
                     │
                     │ WebSocket Connection
                     │ (wss://)
                     ▼
┌─────────────────────────────────────────────────┐
│                   RAILWAY                       │
│  - WebSocket Game Server (src/server/)          │
│  - Persistent connections for multiplayer       │
│  - Game state management (rooms, players)       │
│  - Real-time game logic                         │
└─────────────────────────────────────────────────┘
```

## Why This Split?

**Vercel CANNOT run WebSocket servers** because:
- Serverless functions are stateless and short-lived
- WebSockets require persistent, long-lived connections
- Game state needs to be maintained in memory

**Railway CAN run WebSocket servers** because:
- Provides traditional server hosting
- Supports persistent connections
- Can maintain game state in memory

## Setup Instructions

### Step 1: Deploy Game Server to Railway

1. **Check if Already Deployed**
   ```bash
   railway status
   ```

2. **If Not Deployed, Deploy Now**
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli

   # Login
   railway login

   # Link project (or create new)
   railway link

   # Deploy
   railway up
   ```

3. **Get Your Railway WebSocket URL**
   ```bash
   railway domain
   ```

   This will give you something like: `your-app.railway.app`

   Your WebSocket URL will be: `wss://your-app.railway.app`

### Step 2: Configure Vercel Environment Variable

1. **Go to Vercel Dashboard**
   - Navigate to your project: https://vercel.com/dashboard
   - Select `protocol-xt` project
   - Go to Settings → Environment Variables

2. **Add WebSocket Server URL**
   ```
   Name:  VITE_WS_SERVER_URL
   Value: wss://your-app.railway.app
   ```

   **Important**: Use your actual Railway domain!

3. **Redeploy Vercel**
   - The new environment variable will be used on next deployment
   - Or manually trigger redeploy from Vercel dashboard

### Step 3: Local Development Setup

1. **Copy .env.sample to .env**
   ```bash
   cp .env.sample .env
   ```

2. **Edit .env for local development**
   ```env
   # For local dev, comment out or remove VITE_WS_SERVER_URL
   # to use localhost:8000 automatically
   # VITE_WS_SERVER_URL=wss://your-app.railway.app
   ```

3. **Run both servers locally**
   ```bash
   # Terminal 1: Game server
   npm run server

   # Terminal 2: Frontend
   npm run dev
   ```

## Testing Production Deployment

### 1. Test Railway Game Server

```bash
# Check if WebSocket server is running
wscat -c wss://your-app.railway.app

# Or use curl for basic health check
curl https://your-app.railway.app/health
```

### 2. Test Vercel Frontend

1. Open https://protocol-xt.vercel.app
2. Open DevTools Console (F12)
3. Look for multiplayer connection logs:
   ```
   [Multiplayer] Using WebSocket URL from environment: wss://...
   [Multiplayer] Connected to server
   ```

### 3. Test Multiplayer Room Creation

1. Click "Multiplayer" in the menu
2. Try to create a room
3. If successful, you should see:
   - "Room created successfully"
   - No "INVALID_MESSAGE" errors

## Troubleshooting

### Error: "Failed to parse message"

**Cause**: Client is trying to connect to Vercel instead of Railway

**Fix**:
1. Verify `VITE_WS_SERVER_URL` is set in Vercel environment variables
2. Redeploy Vercel to apply the new variable
3. Check browser console for the WebSocket URL being used

### Error: "WebSocket connection failed"

**Cause**: Railway server might not be running

**Fix**:
```bash
# Check Railway deployment status
railway status

# View logs
railway logs

# Redeploy if needed
railway up
```

### Error: Connection timeout

**Cause**: Firewall or Railway service not exposing WebSocket port

**Fix**:
1. Check Railway service exposes port 8000
2. Ensure Railway domain is public
3. Verify no firewall blocking WSS connections

## Environment Variable Reference

### Vercel (Frontend)
```env
VITE_WS_SERVER_URL=wss://your-app.railway.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
# ... other VITE_ variables
```

### Railway (Game Server)
```env
PORT=8000
FIREBASE_PROJECT_ID=protocol-tx
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

## Current Status

- ✅ Models API fixed (Vercel serverless functions)
- ⚠️ WebSocket needs Railway deployment
- 📝 Next: Set `VITE_WS_SERVER_URL` in Vercel

## Quick Fix Checklist

- [ ] Deploy game server to Railway: `railway up`
- [ ] Get Railway domain: `railway domain`
- [ ] Set `VITE_WS_SERVER_URL` in Vercel dashboard
- [ ] Redeploy Vercel
- [ ] Test multiplayer room creation
- [ ] Victory! 🎉
