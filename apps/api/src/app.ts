import fs from 'node:fs';

import cors from '@fastify/cors';
import {
  addTracksToCollection,
  commitLibrary,
  createCollection,
  getAlbumDetail,
  getCollectionDetail,
  getDatabase,
  getSeriesDetail,
  getTrackById,
  listAlbums,
  listCollections,
  listSeries,
  loadConfig,
  patchAlbum,
  patchCollection,
  patchTrack,
  resolveCoverAsset,
  resolveTrackEmbeddedCover,
  resolveTrackStream,
  searchAlbums,
  searchCatalog,
  searchTracks,
  syncMediaToCos,
} from '@vgm/core';
import {
  addCollectionTracksSchema,
  createCollectionSchema,
  patchAlbumSchema,
  patchCollectionSchema,
  patchTrackSchema,
} from '@vgm/shared';
import Fastify, { type FastifyReply } from 'fastify';
import { v7 as uuidv7 } from 'uuid';

const bytesPattern = /^bytes=(\d+)-(\d+)?$/;

function formatImportProgress(event: import('@vgm/shared').ImportProgressEvent) {
  const progress = event.total ? ` ${event.processed ?? 0}/${event.total}` : '';
  const elapsed = typeof event.elapsedMs === 'number' ? ` (${Math.round(event.elapsedMs / 1000)}s)` : '';
  return `[import:${event.phase}]${progress}${elapsed} ${event.message}`;
}

export async function createApp() {
  const config = loadConfig(process.env, process.cwd());
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/admin')) {
      return;
    }

    if (!config.adminToken) {
      return reply.code(403).send({ message: 'Admin access is disabled: ADMIN_TOKEN is not configured' });
    }

    const token = request.headers['x-admin-token'];
    if (token !== config.adminToken) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/albums/search', async (request) => {
    const context = await getDatabase(config);
    const { q, artist, genre, year, seriesId, limit, offset } = request.query as {
      q?: string;
      artist?: string;
      genre?: string;
      year?: string;
      seriesId?: string;
      limit?: string;
      offset?: string;
    };

    const result = await searchAlbums(context, {
      q,
      artist,
      genre,
      year: year !== undefined ? Number(year) : undefined,
      seriesId,
      limit: limit !== undefined ? Number(limit) : 20,
      offset: offset !== undefined ? Number(offset) : 0,
    });

    const baseUrl = config.baseUrl ?? `${request.protocol}://${request.headers.host}`;
    return {
      ...result,
      items: result.items.map((album) => ({
        ...album,
        coverUrl: album.coverAssetId ? `${baseUrl}/api/assets/${album.coverAssetId}/cover` : undefined,
      })),
    };
  });

  app.get('/api/albums', async () => {
    const context = await getDatabase(config);
    return listAlbums(context);
  });

  app.get('/api/albums/:id', async (request, reply) => {
    const context = await getDatabase(config);
    const album = await getAlbumDetail(context, (request.params as { id: string }).id);

    if (!album) {
      reply.code(404).send({ message: 'Album not found' });
      return;
    }

    return album;
  });

  app.get('/api/albums/:id/tracks', async (request, reply) => {
    const context = await getDatabase(config);
    const album = await getAlbumDetail(context, (request.params as { id: string }).id);

    if (!album) {
      reply.code(404).send({ message: 'Album not found' });
      return;
    }

    return album.tracks;
  });

  app.get('/api/tracks/search', async (request) => {
    const context = await getDatabase(config);
    const { q, album, artist, genre, year, seriesId, discNumber, trackNumber, limit, offset } = request.query as {
      q?: string;
      album?: string;
      artist?: string;
      genre?: string;
      year?: string;
      seriesId?: string;
      discNumber?: string;
      trackNumber?: string;
      limit?: string;
      offset?: string;
    };

    const result = await searchTracks(context, {
      q,
      album,
      artist,
      genre,
      year: year !== undefined ? Number(year) : undefined,
      seriesId,
      discNumber: discNumber !== undefined ? Number(discNumber) : undefined,
      trackNumber: trackNumber !== undefined ? Number(trackNumber) : undefined,
      limit: limit !== undefined ? Number(limit) : 20,
      offset: offset !== undefined ? Number(offset) : 0,
    });

    const baseUrl = config.baseUrl ?? `${request.protocol}://${request.headers.host}`;
    return {
      ...result,
      items: result.items.map((track) => ({
        ...track,
        streamUrl: `${baseUrl}/api/tracks/${track.publicId}/stream`,
        coverUrl: track.coverAssetId ? `${baseUrl}/api/assets/${track.coverAssetId}/cover` : undefined,
      })),
    };
  });

  app.get('/api/tracks/:id', async (request, reply) => {
    const context = await getDatabase(config);
    const track = await getTrackById(context, (request.params as { id: string }).id);

    if (!track) {
      reply.code(404).send({ message: 'Track not found' });
      return;
    }

    return track;
  });

  app.get('/api/tracks/:id/stream', async (request, reply) => {
    const context = await getDatabase(config);
    const stream = await resolveTrackStream(context, config, (request.params as { id: string }).id);

    if (!stream) {
      reply.code(404).send({ message: 'Track stream not found' });
      return;
    }

    if (stream.mode === 'redirect') {
      reply.header('Cache-Control', 'private, max-age=3600');
      reply.redirect(stream.redirectUrl!);
      return;
    }

    return streamLocalFile(reply, stream.filePath!, stream.mimeType || 'audio/mpeg', request.headers.range);
  });

  app.get('/api/tracks/:id/embedded-cover', async (request, reply) => {
    const context = await getDatabase(config);
    const coverBuffer = await resolveTrackEmbeddedCover(context, config, (request.params as { id: string }).id);
    if (!coverBuffer) {
      reply.code(404).send({ message: 'No embedded cover' });
      return;
    }
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(coverBuffer);
  });

  app.get('/api/assets/:id/cover', async (request, reply) => {
    const context = await getDatabase(config);
    const cover = await resolveCoverAsset(context, config, (request.params as { id: string }).id);

    if (!cover) {
      reply.code(404).send({ message: 'Cover not found' });
      return;
    }

    if (cover.mode === 'redirect') {
      reply.redirect(cover.redirectUrl!);
      return;
    }

    reply.header('Content-Type', cover.mimeType || 'image/jpeg');
    return fs.createReadStream(cover.filePath!);
  });

  app.get('/api/collections', async () => {
    const context = await getDatabase(config);
    return listCollections(context);
  });

  app.get('/api/collections/:id', async (request, reply) => {
    const context = await getDatabase(config);
    const collection = await getCollectionDetail(context, (request.params as { id: string }).id);

    if (!collection) {
      reply.code(404).send({ message: 'Collection not found' });
      return;
    }

    return collection;
  });

  app.get('/api/series', async () => {
    const context = await getDatabase(config);
    return listSeries(context);
  });

  app.get('/api/series/:id', async (request, reply) => {
    const context = await getDatabase(config);
    const series = await getSeriesDetail(context, (request.params as { id: string }).id);

    if (!series) {
      reply.code(404).send({ message: 'Series not found' });
      return;
    }

    return series;
  });

  app.get('/api/search', async (request) => {
    const context = await getDatabase(config);
    const { q = '' } = request.query as { q?: string };
    return searchCatalog(context, q);
  });

  app.post('/api/admin/import/commit', async (request) => {
    const context = await getDatabase(config);
    return commitLibrary(context, {
      ...config,
      onImportProgress: (event) => request.log.info(formatImportProgress(event)),
    });
  });

  app.post('/api/admin/sync/cos', async () => {
    const context = await getDatabase(config);
    return syncMediaToCos(context, config);
  });

  app.patch('/api/admin/albums/:id', async (request, reply) => {
    const context = await getDatabase(config);
    const input = patchAlbumSchema.parse(request.body);
    const album = await patchAlbum(context, (request.params as { id: string }).id, input);

    if (!album) {
      reply.code(404).send({ message: 'Album not found' });
      return;
    }

    return album;
  });

  app.patch('/api/admin/tracks/:id', async (request, reply) => {
    const context = await getDatabase(config);
    const input = patchTrackSchema.parse(request.body);
    const track = await patchTrack(context, (request.params as { id: string }).id, input);

    if (!track) {
      reply.code(404).send({ message: 'Track not found' });
      return;
    }

    return track;
  });

  app.post('/api/admin/collections', async (request) => {
    const context = await getDatabase(config);
    const input = createCollectionSchema.parse(request.body);

    return createCollection(context, {
      publicId: uuidv7(),
      title: input.title,
      description: input.description,
      coverAssetId: input.coverAssetId,
      status: input.status,
    });
  });

  app.patch('/api/admin/collections/:id', async (request, reply) => {
    const context = await getDatabase(config);
    const input = patchCollectionSchema.parse(request.body);
    const collection = await patchCollection(context, (request.params as { id: string }).id, input);

    if (!collection) {
      reply.code(404).send({ message: 'Collection not found' });
      return;
    }

    return collection;
  });

  app.post('/api/admin/collections/:id/tracks', async (request) => {
    const context = await getDatabase(config);
    const input = addCollectionTracksSchema.parse(request.body);
    return addTracksToCollection(context, (request.params as { id: string }).id, input.trackIds);
  });

  return app;
}

async function streamLocalFile(
  reply: FastifyReply,
  filePath: string,
  mimeType: string,
  rangeHeader: string | string[] | undefined,
) {
  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;
  const headerValue = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader;

  if (headerValue) {
    const match = bytesPattern.exec(headerValue);

    if (match) {
      const start = Number.parseInt(match[1] ?? '0', 10);
      const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', end - start + 1);
      reply.header('Content-Type', mimeType);
      return fs.createReadStream(filePath, { start, end });
    }
  }

  reply.header('Content-Length', fileSize);
  reply.header('Content-Type', mimeType);
  reply.header('Accept-Ranges', 'bytes');
  return fs.createReadStream(filePath);
}
