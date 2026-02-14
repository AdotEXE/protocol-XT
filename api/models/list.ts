import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function handler(req: VercelRequest, res: VercelResponse) {
    const { category = 'all' } = req.query;

    const models: Array<{ category: string; filename: string; size: number; modified: number }> = [];

    // Vercel serverless functions run in a different CWD on production.
    // We need to resolve path carefully.
    // Assuming structure: root/json_models
    // Debugging: log current CWD and available directories
    let modelsDir = path.join(process.cwd(), 'json_models');
    
    // Fallback for some deployment scenarios:
    if (!fs.existsSync(modelsDir)) {
        modelsDir = path.join(process.cwd(), '../json_models'); // Try one level up if in nested function dir
    }

    // If still not found, try to locate relative to this file
    if (!fs.existsSync(modelsDir)) {
        modelsDir = path.resolve(__dirname, '../../json_models');
    }
    
    // If still not found, try one more common Vercel pattern (root relative to function)
    if (!fs.existsSync(modelsDir)) {
        modelsDir = path.join(process.cwd(), 'api', 'json_models');
    }

    if (!fs.existsSync(modelsDir)) {
        // List directories in CWD to help debugging
        let cwdList: string[] = [];
        try {
            cwdList = fs.readdirSync(process.cwd());
        } catch (e) {
            cwdList = ['Error reading CWD'];
        }
        
        return res.status(500).json({ 
            error: 'Models directory not found', 
            debugSum: `CWD: ${process.cwd()}, expected: ${modelsDir}`,
            cwdContents: cwdList
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
