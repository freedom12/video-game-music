import fs from 'node:fs';

import {
  getDatabase,
  getTrackById,
  resolveCoverAsset,
  resolveTrackEmbeddedCover,
  resolveTrackStream,
  searchTracks,
} from '@vgm/core';
import { NotFoundError } from '@vgm/shared';
import type { FastifyInstance } from 'fastify';

import { streamLocalFile } from '../streaming.js';
import type { RouteContext } from './types.js';

const SAFE_ID = { type: 'string' as const, pattern: '^[a-zA-Z0-9_-]+$' };

export async function trackRoutes(app: FastifyInstance, { config }: RouteContext) {
  app.get('/api/tracks/search', {
    schema: {
      querystring: {
        type: 'object' as const,
        properties: {
          q: { type: 'string' as const },
          album: { type: 'string' as const },
          artist: { type: 'string' as const },
          genre: { type: 'string' as const },
          year: { type: 'integer' as const, minimum: 0 },
          seriesId: SAFE_ID,
          discNumber: { type: 'integer' as const, minimum: 1 },
          trackNumber: { type: 'integer' as const, minimum: 1 },
          limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer' as const, minimum: 0, default: 0 },
        },
      },
    },
  }, async (request) => {
    const context = await getDatabase(config);
    const { q, album, artist, genre, year, seriesId, discNumber, trackNumber, limit, offset } = request.query as {
      q?: string;
      album?: string;
      artist?: string;
      genre?: string;
      year?: number;
      seriesId?: string;
      discNumber?: number;
      trackNumber?: number;
      limit?: number;
      offset?: number;
    };

    const result = await searchTracks(context, {
      q,
      album,
      artist,
      genre,
      year,
      seriesId,
      discNumber,
      trackNumber,
      limit: limit ?? 20,
      offset: offset ?? 0,
    });

    const baseUrl = config.baseUrl ?? `${request.protocol}://${request.headers.host}`;
    return {
      ...result,
      items: result.items.map((track) => ({
        ...track,
        streamUrl: `${baseUrl}/api/tracks/${track.publicId}/stream`,
        coverUrl: track.albumId ? `${baseUrl}/api/assets/${track.albumId}/cover` : undefined,
      })),
    };
  });

  app.get('/api/tracks/:id', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const context = await getDatabase(config);
    const track = await getTrackById(context, id);

    if (!track) {
      throw new NotFoundError('Track', id);
    }

    return track;
  });

  app.get('/api/tracks/:id/stream', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const context = await getDatabase(config);
    const stream = await resolveTrackStream(context, config, id);

    if (!stream) {
      throw new NotFoundError('Track stream', id);
    }

    if (stream.mode === 'redirect') {
      reply.header('Cache-Control', 'private, max-age=3600');
      reply.redirect(stream.redirectUrl!);
      return;
    }

    return streamLocalFile(reply, stream.filePath!, stream.mimeType || 'audio/mpeg', request.headers.range);
  });

  app.get('/api/tracks/:id/embedded-cover', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const context = await getDatabase(config);
    const coverBuffer = await resolveTrackEmbeddedCover(context, config, id);
    if (!coverBuffer) {
      throw new NotFoundError('Embedded cover');
    }
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(coverBuffer);
  });

  app.get('/api/assets/:id/cover', {
    schema: { params: { type: 'object' as const, properties: { id: SAFE_ID }, required: ['id'] } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cover = await resolveCoverAsset(config, id);

    if (!cover) {
      throw new NotFoundError('Cover', id);
    }

    if (cover.mode === 'redirect') {
      reply.redirect(cover.redirectUrl!);
      return;
    }

    const stat = fs.statSync(cover.filePath!);
    reply.header('Content-Type', cover.mimeType || 'image/jpeg');
    reply.header('Content-Length', stat.size);
    reply.header('Cache-Control', 'public, max-age=86400');
    return fs.createReadStream(cover.filePath!);
  });
}
