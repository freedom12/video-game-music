import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { findSimilarByFile, getDatabase } from '@vgm/core';
import type { FastifyInstance } from 'fastify';

import type { RouteContext } from './types.js';

export async function similarityRoutes(app: FastifyInstance, { config }: RouteContext) {
  app.post('/api/similarity/search', {
    schema: {
      querystring: {
        type: 'object' as const,
        properties: {
          limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const context = await getDatabase(config);
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ code: 'NO_FILE', message: '请上传一个音频文件' });
    }

    const { limit } = request.query as { limit?: number };
    const topK = limit ?? 20;

    // Save uploaded file to temp directory
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vgm-sim-'));
    const ext = path.extname(data.filename) || '.tmp';
    const tmpFile = path.join(tmpDir, `upload${ext}`);

    try {
      await pipeline(data.file, createWriteStream(tmpFile));

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
