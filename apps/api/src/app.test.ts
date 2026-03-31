import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @vgm/core — no real database or filesystem needed
// ---------------------------------------------------------------------------
vi.mock('@vgm/core', () => {
  const mockConfig = {
    apiPort: 5005,
    workspaceRoot: "/tmp",
    databasePath: ":memory:",
    mediaSource: "local" as const,
    libraryRoot: "/tmp/library",
    mediaCacheDir: "/tmp/cache",
  };

  const mockAlbumListItem = {
    publicId: 'album-1',
    title: 'Pokémon Gold & Silver',
    albumArtist: 'Go Ichinose',
    year: 2000,
    trackCount: 4,
    discCount: 1,
    coverAssetId: 'asset-cover-1',
  };

  const mockTrackListItem = {
    publicId: 'track-1',
    title: 'Pallet Town',
    artist: 'Junichi Masuda',
    durationSeconds: 120,
    trackNumber: 1,
    discNumber: 1,
    discTitle: undefined,
    mediaAssetId: 'asset-1',
  };

  const mockAlbumDetail = {
    ...mockAlbumListItem,
    sourceDirectory: 'pokemon/gold-silver',
    tracks: [mockTrackListItem],
  };

  const mockTrackRecord = {
    publicId: 'track-1',
    mediaAssetId: 'asset-1',
    title: 'Pallet Town',
    artist: 'Junichi Masuda',
    durationSeconds: 120,
    format: 'mp3',
    year: 1996,
    genre: 'Game',
    sourceMeta: {
      title: 'Pallet Town',
      album: 'Pokémon Red & Green',
      artist: 'Junichi Masuda',
      albumArtist: 'Junichi Masuda',
      year: 1996,
      trackNumber: 1,
      discNumber: 1,
    },
    displayTitle: undefined,
    displayArtist: undefined,
    hidden: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockCollection = {
    publicId: 'col-1',
    title: 'My Favorites',
    description: 'Best tracks',
    status: 'published' as const,
    coverAssetId: undefined,
    trackCount: 1,
  };

  const mockCollectionDetail = {
    publicId: 'col-1',
    title: 'My Favorites',
    description: 'Best tracks',
    status: 'published' as const,
    coverAssetId: undefined,
    tracks: [
      {
        ...mockTrackListItem,
        albumId: 'album-1',
        albumTitle: 'Pokémon Gold & Silver',
      },
    ],
  };

  const mockSeriesListItem = {
    publicId: 'series-1',
    name: 'Pokémon',
    sortTitle: 'pokemon',
    albumCount: 10,
  };

  const mockSeriesDetail = {
    publicId: 'series-1',
    name: 'Pokémon',
    sortTitle: 'pokemon',
    albums: [mockAlbumListItem],
  };

  const mockAlbumSearchResult = {
    items: [
      {
        ...mockAlbumListItem,
        seriesId: 'series-1',
        seriesName: 'Pokémon',
      },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  };

  const mockTrackSearchResult = {
    items: [
      {
        ...mockTrackListItem,
        albumId: 'album-1',
        albumTitle: 'Pokémon Gold & Silver',
        albumArtist: 'Go Ichinose',
        year: 2000,
        genre: 'Game',
        coverAssetId: 'asset-cover-1',
      },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  };

  const mockSearchResult = {
    albums: [mockAlbumListItem],
    tracks: [{ ...mockTrackListItem, albumId: 'album-1', albumTitle: 'Pokémon Gold & Silver' }],
  };

  return {
    loadConfig: vi.fn(() => mockConfig),
    loadWorkspaceEnv: vi.fn(),
    getDatabase: vi.fn(async () => ({})),

    listAlbums: vi.fn(async () => [mockAlbumListItem]),
    getAlbumDetail: vi.fn(async (_ctx: unknown, id: string) =>
      id === 'album-1' ? mockAlbumDetail : null,
    ),
    searchAlbums: vi.fn(async () => mockAlbumSearchResult),

    getTrackById: vi.fn(async (_ctx: unknown, id: string) =>
      id === 'track-1' ? mockTrackRecord : null,
    ),
    searchTracks: vi.fn(async () => mockTrackSearchResult),

    resolveTrackStream: vi.fn(async (_ctx: unknown, _cfg: unknown, id: string) =>
      id === 'track-1'
        ? { mode: 'redirect' as const, redirectUrl: 'http://cdn.example.com/audio/track-1.mp3' }
        : null,
    ),
    resolveTrackEmbeddedCover: vi.fn(async () => null),

    resolveCoverAsset: vi.fn(async () => null),

    listCollections: vi.fn(async () => [mockCollection]),
    getCollectionDetail: vi.fn(async (_ctx: unknown, id: string) =>
      id === 'col-1' ? mockCollectionDetail : null,
    ),

    listSeries: vi.fn(async () => [mockSeriesListItem]),
    getSeriesDetail: vi.fn(async (_ctx: unknown, id: string) =>
      id === 'series-1' ? mockSeriesDetail : null,
    ),

    searchCatalog: vi.fn(async () => mockSearchResult),

    // admin stubs (unused in public-API tests but required for import resolution)
    commitLibrary: vi.fn(),
    uploadMediaToCos: vi.fn(),
    patchAlbum: vi.fn(),
    patchTrack: vi.fn(),
    createCollection: vi.fn(),
    patchCollection: vi.fn(),
    addTracksToCollection: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import type { FastifyInstance } from 'fastify';
import { createApp } from './app.js';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('Public API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health ────────────────────────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('returns ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });
  });

  // ── Albums ────────────────────────────────────────────────────────────────

  describe('GET /api/albums', () => {
    it('returns array of albums', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/albums' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toMatchObject({ publicId: 'album-1', title: 'Pokémon Gold & Silver' });
    });
  });

  describe('GET /api/albums/search', () => {
    it('returns paginated result with coverUrl field', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/albums/search?q=pokemon' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('limit');
      expect(body).toHaveProperty('offset');
      expect(body.items[0]).toHaveProperty('coverUrl');
    });

    it('passes query params to searchAlbums', async () => {
      const { searchAlbums } = await import('@vgm/core');
      await app.inject({
        method: 'GET',
        url: '/api/albums/search?q=gold&artist=Ichinose&year=2000&limit=10&offset=5',
      });
      expect(searchAlbums).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ q: 'gold', artist: 'Ichinose', year: 2000, limit: 10, offset: 5 }),
      );
    });
  });

  describe('GET /api/albums/:id', () => {
    it('returns album detail', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/albums/album-1' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ publicId: 'album-1' });
      expect(Array.isArray(body.tracks)).toBe(true);
    });

    it('returns 404 for unknown album', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/albums/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/albums/:id/tracks', () => {
    it('returns tracks array', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/albums/album-1/tracks' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toMatchObject({ publicId: 'track-1' });
    });

    it('returns 404 for unknown album', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/albums/does-not-exist/tracks' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Tracks ────────────────────────────────────────────────────────────────

  describe('GET /api/tracks/search', () => {
    it('returns paginated result with streamUrl and coverUrl', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tracks/search?q=pallet' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('total');
      expect(body.items[0]).toHaveProperty('streamUrl');
      expect(body.items[0]).toHaveProperty('coverUrl');
    });

    it('passes query params to searchTracks', async () => {
      const { searchTracks } = await import('@vgm/core');
      await app.inject({
        method: 'GET',
        url: '/api/tracks/search?q=pallet&album=gold&artist=Masuda&genre=Game&year=1996&limit=5&offset=0',
      });
      expect(searchTracks).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          q: 'pallet',
          album: 'gold',
          artist: 'Masuda',
          genre: 'Game',
          year: 1996,
          limit: 5,
          offset: 0,
        }),
      );
    });
  });

  describe('GET /api/tracks/:id', () => {
    it('returns track detail', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tracks/track-1' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ publicId: 'track-1', title: 'Pallet Town' });
    });

    it('returns 404 for unknown track', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tracks/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/tracks/:id/stream', () => {
    it('redirects for known track', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tracks/track-1/stream' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('http://cdn.example.com/audio/track-1.mp3');
    });

    it('returns 404 for unknown track', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tracks/does-not-exist/stream' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/tracks/:id/embedded-cover', () => {
    it('returns 404 when no embedded cover', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tracks/track-1/embedded-cover' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Assets ────────────────────────────────────────────────────────────────

  describe('GET /api/assets/:id/cover', () => {
    it('returns 404 when cover not found', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/assets/asset-1/cover' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Collections ───────────────────────────────────────────────────────────

  describe('GET /api/collections', () => {
    it('returns array of collections', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/collections' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toMatchObject({ publicId: 'col-1', title: 'My Favorites' });
    });
  });

  describe('GET /api/collections/:id', () => {
    it('returns collection detail with tracks', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/collections/col-1' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ publicId: 'col-1' });
      expect(Array.isArray(body.tracks)).toBe(true);
    });

    it('returns 404 for unknown collection', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/collections/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Series ────────────────────────────────────────────────────────────────

  describe('GET /api/series', () => {
    it('returns array of series', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/series' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toMatchObject({ publicId: 'series-1', name: 'Pokémon' });
    });
  });

  describe('GET /api/series/:id', () => {
    it('returns series detail with albums', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/series/series-1' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ publicId: 'series-1', name: 'Pokémon' });
      expect(Array.isArray(body.albums)).toBe(true);
    });

    it('returns 404 for unknown series', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/series/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Global Search ─────────────────────────────────────────────────────────

  describe('GET /api/search', () => {
    it('returns albums and tracks', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/search?q=pokemon' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('albums');
      expect(body).toHaveProperty('tracks');
      expect(Array.isArray(body.albums)).toBe(true);
      expect(Array.isArray(body.tracks)).toBe(true);
    });

    it('returns empty result with no query', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/search' });
      expect(res.statusCode).toBe(200);
    });
  });
});
