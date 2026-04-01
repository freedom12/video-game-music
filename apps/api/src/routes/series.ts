import {
  getDatabase,
  getSeriesDetail,
  listSeries,
} from '@vgm/core';
import { NotFoundError } from '@vgm/shared';
import type { FastifyInstance } from 'fastify';

import type { RouteContext } from './types.js';

const SAFE_ID = { type: 'string' as const, pattern: '^[a-zA-Z0-9_-]+$' };

export async function seriesRoutes(app: FastifyInstance, { config }: RouteContext) {
  app.get('/api/series', async () => {
    const context = await getDatabase(config);
    return listSeries(context);
  });

  app.get('/api/series/:id', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const context = await getDatabase(config);
    const series = await getSeriesDetail(context, id);

    if (!series) {
      throw new NotFoundError('Series', id);
    }

    return series;
  });
}
