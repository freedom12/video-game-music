import {
  getCollectionDetail,
  getDatabase,
  listCollections,
} from '@vgm/core';
import { NotFoundError } from '@vgm/shared';
import type { FastifyInstance } from 'fastify';

import type { RouteContext } from './types.js';

const SAFE_ID = { type: 'string' as const, pattern: '^[a-zA-Z0-9_-]+$' };

export async function collectionRoutes(app: FastifyInstance, { config }: RouteContext) {
  app.get('/api/collections', async () => {
    const context = await getDatabase(config);
    return listCollections(context);
  });

  app.get('/api/collections/:id', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const context = await getDatabase(config);
    const collection = await getCollectionDetail(context, id);

    if (!collection) {
      throw new NotFoundError('Collection', id);
    }

    return collection;
  });
}
