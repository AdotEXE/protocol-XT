import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const data = req.body;
        const { filename, category, content, data: dataField } = data;
        const modelData = content || dataField;

        if (!filename || !category || !modelData) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Vercel serverless file system is read-only (mostly).
        // This function will likely fail in production if we try to write to disk permanently.
        // We can simulate success for now or return a warning.

        // However, /tmp is writable but ephemeral.
        const tmpDir = '/tmp';
        const savePath = path.join(tmpDir, filename);

        // We can write to tmp to verify payload is valid
        const jsonContent = typeof modelData === 'string' ? modelData : JSON.stringify(modelData, null, 2);
        fs.writeFileSync(savePath, jsonContent);

        // Since we cannot persist to repo, we just return success but warn.
        console.warn(`[ModelSaver] Saved model to ephemeral path: ${savePath}. This will be lost after function shutdown.`);

        return res.status(200).json({
            success: true,
            path: savePath,
            warning: 'File saved to ephemeral storage only. Permanent storage requires a database.'
        });

    } catch (error: any) {
        console.error('[ModelSaver] Error saving model:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
