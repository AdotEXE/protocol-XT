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
    const { category = 'all' } = req.query;

    const models: Array<{ category: string; filename: string; size: number; modified: number }> = [];

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

    const customTanksDir = path.join(modelsDir, 'custom-tanks');
    const baseTypesDir = path.join(modelsDir, 'base-types');
    const generatedModelsDir = path.join(modelsDir, 'generated-models');

    if (category === 'all' || category === 'custom-tanks') {
        if (fs.existsSync(customTanksDir)) {
            try {
                const files = fs.readdirSync(customTanksDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const filePath = path.join(customTanksDir, file);
                    const stats = fs.statSync(filePath);
                    models.push({
                        category: 'custom-tanks',
                        filename: file,
                        size: stats.size,
                        modified: stats.mtimeMs
                    });
                }
            } catch (e) {
                console.error('Error reading custom-tanks:', e);
            }
        }
    }

    if (category === 'all' || category === 'base-types') {
        if (fs.existsSync(baseTypesDir)) {
            try {
                const files = fs.readdirSync(baseTypesDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const filePath = path.join(baseTypesDir, file);
                    const stats = fs.statSync(filePath);
                    models.push({
                        category: 'base-types',
                        filename: file,
                        size: stats.size,
                        modified: stats.mtimeMs
                    });
                }
            } catch (e) {
                console.error('Error reading base-types:', e);
            }
        }
    }

    if (category === 'all' || category === 'generated-models') {
        if (fs.existsSync(generatedModelsDir)) {
            try {
                const files = fs.readdirSync(generatedModelsDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const filePath = path.join(generatedModelsDir, file);
                    const stats = fs.statSync(filePath);
                    models.push({
                        category: 'generated-models',
                        filename: file,
                        size: stats.size,
                        modified: stats.mtimeMs
                    });
                }
            } catch (e) {
                console.error('Error reading generated-models:', e);
            }
        }
    }

    res.status(200).json({ success: true, models });
}
