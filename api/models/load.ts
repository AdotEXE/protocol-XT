import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

<<<<<<< HEAD
/**
 * Finds the json_models directory with multiple fallback strategies
 * for Vercel's serverless environment
 */
function findModelsDirectory(): { found: boolean; path: string; cwdContents?: string[] } {
    // Strategy 1: Root of deployment (most common for Vercel)
    let modelsDir = path.join(process.cwd(), 'json_models');
    if (fs.existsSync(modelsDir)) {
        return { found: true, path: modelsDir };
    }

    // Strategy 2: One level up (if function is in a subdirectory)
    modelsDir = path.join(process.cwd(), '..', 'json_models');
    if (fs.existsSync(modelsDir)) {
        return { found: true, path: modelsDir };
    }

    // Strategy 3: Check if we're in api directory, go up two levels
    modelsDir = path.join(process.cwd(), '..', '..', 'json_models');
    if (fs.existsSync(modelsDir)) {
        return { found: true, path: modelsDir };
    }

    // Strategy 4: Check relative to the function working directory
    // In Vercel, functions are often bundled with their dependencies
    modelsDir = path.resolve('/var/task/json_models');
    if (fs.existsSync(modelsDir)) {
        return { found: true, path: modelsDir };
    }

    // Failed to find - gather debug info
    let cwdContents: string[] = [];
    try {
        cwdContents = fs.readdirSync(process.cwd());
    } catch (e) {
        cwdContents = ['Error reading CWD'];
    }

    return {
        found: false,
        path: modelsDir,
        cwdContents
    };
=======
function resolveModelsDir(): { dir: string | null; checked: string[] } {
    const checked: string[] = [];
    const candidates: string[] = [];
    const cwd = process.cwd();

    // Most common locations on Vercel and local dev
    candidates.push(path.join(cwd, 'json_models'));
    candidates.push(path.join(cwd, 'api', 'json_models'));
    candidates.push('/var/task/json_models');

    // Walk up from cwd to handle nested runtime directories
    let cursor = cwd;
    for (let i = 0; i < 8; i++) {
        candidates.push(path.join(cursor, 'json_models'));
        const parent = path.dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
    }

    for (const candidate of candidates) {
        const normalized = path.normalize(candidate);
        if (checked.includes(normalized)) continue;
        checked.push(normalized);
        try {
            if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
                return { dir: normalized, checked };
            }
        } catch {
            // Keep scanning candidates.
        }
    }

    return { dir: null, checked };
>>>>>>> 367fb4f (fix: harden models API path resolution and ws parsing)
}

export default function handler(req: VercelRequest, res: VercelResponse) {
    const { category, filename } = req.query;

    if (!category || !filename) {
        return res.status(400).json({ error: 'Missing category or filename' });
    }

<<<<<<< HEAD
    // Find models directory with comprehensive fallback strategy
    const modelsLocation = findModelsDirectory();

    if (!modelsLocation.found) {
        return res.status(500).json({
            error: 'Models directory not found',
            debugInfo: {
                cwd: process.cwd(),
                attemptedPath: modelsLocation.path,
                cwdContents: modelsLocation.cwdContents
            }
=======
    const { dir: modelsDir, checked } = resolveModelsDir();
    if (!modelsDir) {
        // List directories in CWD to help debugging
        let cwdList: string[] = [];
        try {
            cwdList = fs.readdirSync(process.cwd());
        } catch (e) {
            cwdList = ['Error reading CWD'];
        }

        return res.status(500).json({ 
            error: 'Models directory not found',
            debugSum: `CWD: ${process.cwd()}`,
            checkedPaths: checked,
            cwdContents: cwdList,
>>>>>>> 367fb4f (fix: harden models API path resolution and ws parsing)
        });
    }

    const modelsDir = modelsLocation.path;

    const categories: { [key: string]: string } = {
        'custom-tanks': path.join(modelsDir, 'custom-tanks'),
        'base-types': path.join(modelsDir, 'base-types'),
        'generated-models': path.join(modelsDir, 'generated-models')
    };

    const targetDir = categories[category as string];
    if (!targetDir) {
        return res.status(400).json({ error: 'Invalid category' });
    }

    const filePath = path.join(targetDir, filename as string);
    if (!filePath.startsWith(targetDir)) {
        return res.status(400).json({ error: 'Path traversal detected' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        res.status(200).json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to read file', details: error.message });
    }
}
