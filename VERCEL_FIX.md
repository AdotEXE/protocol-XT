# Vercel Deployment Fix - Protocol XT

## Problem Summary
The game was failing on Vercel with 500 errors when loading models from `/api/models/list` endpoints.

## Root Causes Identified

### 1. **ESM Module Syntax Breaking Serverless Functions** ❌
The API handlers in `api/models/list.ts` and `api/models/load.ts` were using:
```typescript
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Problem**: `import.meta.url` is ESM-only syntax. Vercel's Node.js runtime expects CommonJS by default, causing the functions to fail during execution.

### 2. **Rewrite Rule Catching API Routes** ❌
In `vercel.json`, the rewrite configuration was:
```json
"rewrites": [
  {
    "source": "/(.*)",
    "destination": "/index.html"
  }
]
```

**Problem**: This catches ALL routes including `/api/*`, preventing serverless functions from being invoked. API requests were being redirected to `index.html` instead of the serverless functions.

### 3. **Incomplete Vercel Functions Configuration** ⚠️
The functions config lacked explicit runtime and file pattern specifications.

## Solutions Applied

### ✅ 1. Removed ESM Syntax from API Functions
- Removed `import.meta.url` usage
- Created a `findModelsDirectory()` helper with multiple fallback strategies
- Uses CommonJS-compatible path resolution
- Files updated:
  - `api/models/list.ts`
  - `api/models/load.ts`

### ✅ 2. Fixed Rewrite Rules
Updated `vercel.json` rewrites to explicitly exclude API routes:
```json
"rewrites": [
  {
    "source": "/api/(.*)",
    "destination": "/api/$1"
  },
  {
    "source": "/(.*)",
    "destination": "/index.html"
  }
]
```

### ✅ 3. Added TypeScript Configuration for API Directory
Created `api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    ...
  }
}
```

### ✅ 4. Explicitly Set CommonJS Mode
Created `api/package.json`:
```json
{
  "type": "commonjs"
}
```

### ✅ 5. Enhanced Vercel Functions Configuration
Updated `vercel.json`:
```json
"functions": {
  "api/**/*.ts": {
    "runtime": "@vercel/node@3",
    "includeFiles": "json_models/**/*.json"
  }
}
```

### ✅ 6. Added Health Check Endpoint
Created `api/health.ts` for debugging deployment issues:
- Shows CWD and environment info
- Lists all checked paths for `json_models`
- Displays directory contents for verification

## Testing the Fix

### Local Testing
```bash
# Build the project
npm run build

# Test API endpoints locally (if running dev server)
curl http://localhost:7001/api/models/list?category=base-types
```

### Vercel Deployment Testing

1. **Deploy to Vercel**
```bash
vercel --prod
```

2. **Test Health Endpoint First**
```bash
curl https://protocol-xt.vercel.app/api/health
```

This will show:
- Current working directory
- Whether `json_models` directory is found
- Which fallback path worked
- Directory contents for debugging

3. **Test Model Loading**
```bash
# Test base-types
curl https://protocol-xt.vercel.app/api/models/list?category=base-types

# Test custom-tanks
curl https://protocol-xt.vercel.app/api/models/list?category=custom-tanks

# Test loading a specific model
curl https://protocol-xt.vercel.app/api/models/load?category=base-types&filename=cannon-standard.json
```

## Expected Results

After deployment, all API endpoints should return:
- Status 200
- JSON data with `{ success: true, models: [...] }` or `{ success: true, data: {...} }`

The health endpoint should show:
```json
{
  "status": "ok",
  "foundModelsDirectory": "/var/task/json_models" // or similar path
}
```

## Troubleshooting

### If models still aren't found:
1. Check the health endpoint output
2. Verify `json_models` directory is in the repo and committed
3. Check Vercel build logs for file inclusion
4. Ensure the `includeFiles` pattern matches your directory structure

### If getting 404 on API routes:
1. Verify the rewrites are correct in deployed `vercel.json`
2. Check Vercel dashboard for function deployment status
3. Review Vercel function logs in the dashboard

## Files Modified
1. `vercel.json` - Fixed rewrites and functions config
2. `api/models/list.ts` - Removed ESM syntax
3. `api/models/load.ts` - Removed ESM syntax
4. `api/tsconfig.json` - Created (new file)
5. `api/package.json` - Created (new file)
6. `api/health.ts` - Created (new file)

## Commit Message
```
fix(vercel): resolve 500 errors on model loading API endpoints

- Remove ESM syntax (import.meta.url) from API functions
- Fix rewrite rules to exclude API routes
- Add TypeScript config for API directory with CommonJS
- Explicitly set CommonJS mode for API functions
- Enhance Vercel functions configuration with runtime spec
- Add health check endpoint for deployment debugging

Fixes model loading errors: https://protocol-xt.vercel.app/api/models/list
```
