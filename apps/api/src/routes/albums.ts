import {
  getAlbumDetail,
  getDatabase,
  listAlbums,
  searchAlbums,
} from '@vgm/core';
import { NotFoundError } from '@vgm/shared';
import type { FastifyInstance } from 'fastify';

import type { RouteContext } from './types.js';

const SAFE_ID = { type: 'string' as const, pattern: '^[a-zA-Z0-9_-]+$' };

export async function albumRoutes(app: FastifyInstance, { config }: RouteContext) {
  app.get('/api/albums/search', {
    schema: {
      querystring: {
        type: 'object' as const,
        properties: {
          q: { type: 'string' as const },
          artist: { type: 'string' as const },
          genre: { type: 'string' as const },
          year: { type: 'integer' as const, minimum: 0 },
          seriesId: SAFE_ID,
          limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer' as const, minimum: 0, default: 0 },
        },
      },
    },
  }, async (request) => {
    const context = await getDatabase(config);
    const { q, artist, genre, year, seriesId, limit, offset } = request.query as {
      q?: string;
      artist?: string;
      genre?: string;
      year?: number;
      seriesId?: string;
      limit?: number;
      offset?: number;
    };

    const result = await searchAlbums(context, {
      q,
      artist,
      genre,
      year,
      seriesId,
      limit: limit ?? 20,
      offset: offset ?? 0,
    });

    const baseUrl = config.baseUrl ?? `${request.protocol}://${request.headers.host}`;
    return {
      ...result,
      items: result.items.map((album) => ({
        ...album,
        coverUrl: `${baseUrl}/api/assets/${album.publicId}/cover`,
      })),
    };
  });

  app.get('/api/albums', async () => {
    const context = await getDatabase(config);
    return listAlbums(context);
  });

  app.get('/api/albums/:id', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const context = await getDatabase(config);
    const album = await getAlbumDetail(context, id);

    if (!album) {
      throw new NotFoundError('Album', id);
    }

    return album;
  });

  app.get('/api/albums/:id/tracks', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const context = await getDatabase(config);
    const album = await getAlbumDetail(context, id);

    if (!album) {
      throw new NotFoundError('Album', id);
    }

    return album.tracks;
  });
}
