import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
    const { category = 'all' } = req.query;

    const models: Array<{ category: string; filename: string; size: number; modified: number }> = [];

    // Vercel serverless functions run in a different CWD on production.
    // We need to resolve path carefully.
    // Assuming structure: root/json_models
    let modelsDir = path.join(process.cwd(), 'json_models');

    // Fallback for some deployment scenarios:
    if (!fs.existsSync(modelsDir)) {
        modelsDir = path.join(process.cwd(), '../json_models'); // Try one level up if in nested function dir
    }

    // If still not found, try to locate relative to this file
    if (!fs.existsSync(modelsDir)) {
        modelsDir = path.resolve(__dirname, '../../json_models');
    }

    if (!fs.existsSync(modelsDir)) {
        return res.status(500).json({ error: 'Models directory not found', debugSum: `CWD: ${process.cwd()}, expected: ${modelsDir}` });
    }

    const customTanksDir = path.join(modelsDir, 'custom-tanks');
    const baseTypesDir = path.join(modelsDir, 'base-types');
    const generatedModelsDir = path.join(modelsDir, 'generated-models');

    if (category === 'all' || category === 'custom-tanks') {
        if (fs.existsSync(customTanksDir)) {
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
        }
    }

    if (category === 'all' || category === 'base-types') {
        if (fs.existsSync(baseTypesDir)) {
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
        }
    }

    if (category === 'all' || category === 'generated-models') {
        if (fs.existsSync(generatedModelsDir)) {
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
        }
    }

    res.status(200).json({ success: true, models });
}
