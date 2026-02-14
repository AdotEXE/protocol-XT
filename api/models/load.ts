import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

function resolveModelsDir(): { dir: string | null; checked: string[] } {
    const checked: string[] = [];
    const candidates: string[] = [];
    const cwd = process.cwd();

    candidates.push(path.join(cwd, 'json_models'));
    candidates.push(path.join(cwd, 'api', 'json_models'));
    candidates.push('/var/task/json_models');

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
            // Continue with next candidate.
        }
    }

    return { dir: null, checked };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
    const { category, filename } = req.query;

    if (!category || !filename) {
        return res.status(400).json({ error: 'Missing category or filename' });
    }

    const { dir: modelsDir, checked } = resolveModelsDir();
    if (!modelsDir) {
        let cwdList: string[] = [];
        try {
            cwdList = fs.readdirSync(process.cwd());
        } catch {
            cwdList = ['Error reading CWD'];
        }

        return res.status(500).json({
            error: 'Models directory not found',
            debugSum: `CWD: ${process.cwd()}`,
            checkedPaths: checked,
            cwdContents: cwdList,
        });
    }

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
