import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
    const { category, filename } = req.query;

    if (!category || !filename) {
        return res.status(400).json({ error: 'Missing category or filename' });
    }

    let modelsDir = path.join(process.cwd(), 'json_models');

    // Fallback for some deployment scenarios:
    if (!fs.existsSync(modelsDir)) {
        modelsDir = path.join(process.cwd(), '../json_models');
    }

    // If still not found, try to locate relative to this file
    if (!fs.existsSync(modelsDir)) {
        modelsDir = path.resolve(__dirname, '../../json_models');
    }

    if (!fs.existsSync(modelsDir)) {
        return res.status(500).json({ error: 'Models directory not found' });
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
