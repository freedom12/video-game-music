import {
  getCollectionDetail,
  getDatabase,
  listCollections,
} from '@vgm/core';
import { NotFoundError } from '@vgm/shared';
import type { FastifyInstance } from 'fastify';

import type { RouteContext } from './types.js';

export async function collectionRoutes(app: FastifyInstance, { config }: RouteContext) {
  app.get('/api/collections', async () => {
    const context = await getDatabase(config);
    return listCollections(context);
  });

  app.get('/api/collections/:id', async (request) => {
    const context = await getDatabase(config);
    const collection = await getCollectionDetail(context, (request.params as { id: string }).id);

    if (!collection) {
      throw new NotFoundError('Collection', (request.params as { id: string }).id);
    }

    return collection;
  });
}
