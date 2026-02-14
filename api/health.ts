import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
    const cwd = process.cwd();

    // Check for json_models directory in various locations
    const locations = [
        path.join(cwd, 'json_models'),
        path.join(cwd, '..', 'json_models'),
        path.join(cwd, '..', '..', 'json_models'),
        '/var/task/json_models'
    ];

    const checks = locations.map(loc => ({
        path: loc,
        exists: fs.existsSync(loc),
        contents: fs.existsSync(loc) ? fs.readdirSync(loc).slice(0, 10) : null
    }));

    // Get CWD contents
    let cwdContents: string[] = [];
    try {
        cwdContents = fs.readdirSync(cwd);
    } catch (e) {
        cwdContents = ['Error reading CWD'];
    }

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            cwd: cwd,
            cwdContents: cwdContents,
            env: {
                VERCEL: process.env.VERCEL,
                VERCEL_ENV: process.env.VERCEL_ENV,
                VERCEL_REGION: process.env.VERCEL_REGION
            }
        },
        modelDirectoryChecks: checks,
        foundModelsDirectory: checks.find(c => c.exists)?.path || 'NOT FOUND'
    });
}
