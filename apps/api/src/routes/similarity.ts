import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { findSimilarByFile, getDatabase } from '@vgm/core';
import type { FastifyInstance } from 'fastify';

import type { RouteContext } from './types.js';

export async function similarityRoutes(app: FastifyInstance, { config }: RouteContext) {
  app.post('/api/similarity/search', async (request, reply) => {
    const context = await getDatabase(config);
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ code: 'NO_FILE', message: '请上传一个音频文件' });
    }

    const { limit } = request.query as { limit?: string };
    const topK = limit !== undefined ? Math.min(Math.max(Number(limit), 1), 100) : 20;

    // Save uploaded file to temp directory
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vgm-sim-'));
    const ext = path.extname(data.filename) || '.tmp';
    const tmpFile = path.join(tmpDir, `upload${ext}`);

    try {
      await fs.writeFile(tmpFile, await data.toBuffer());

      const results = await findSimilarByFile(context, tmpFile, topK);

      const baseUrl = config.baseUrl ?? `${request.protocol}://${request.headers.host}`;
      return {
        items: results.map((item) => ({
          ...item,
          streamUrl: `${baseUrl}/api/tracks/${item.publicId}/stream`,
          coverUrl: item.albumId ? `${baseUrl}/api/assets/${item.albumId}/cover` : undefined,
        })),
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
}
