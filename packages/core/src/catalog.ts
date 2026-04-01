import type {
  AlbumDetail,
  AlbumListItem,
  AlbumSearchItem,
  AlbumSearchResult,
  CollectionDetail,
  LibrarySearchResult,
  SeriesDetail,
  SeriesListItem,
  TrackDetail,
  TrackListItem,
  TrackSearchItem,
  TrackSearchResult,
} from '@vgm/shared';

import {
  all,
  get,
  mapAlbum,
  mapAlbumTrack,
  mapCollection,
  mapCollectionTrack,
  mapMediaAsset,
  mapTrack,
  placeholders,
  run,
} from './db.js';
import type { DatabaseContext } from './db.js';

function trackLabel(track: { displayTitle?: string; title: string }): string {
  return track.displayTitle || track.title;
}

function artistLabel(track: { displayArtist?: string; artist: string }): string {
  return track.displayArtist || track.artist;
}

function albumLabel(album: { displayTitle?: string; title: string }): string {
  return album.displayTitle || album.title;
}

function albumArtistLabel(album: { displayArtist?: string; albumArtist: string }): string {
  return album.displayArtist || album.albumArtist;
}

export function listAlbums(context: DatabaseContext): AlbumListItem[] {
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      a.*,
      COUNT(at.trackId) AS trackCount,
      COUNT(DISTINCT at.discNumber) AS discCount
    FROM albums a
    LEFT JOIN albumTracks at ON at.albumId = a.publicId
    WHERE a.isSystemGenerated = 1 AND a.hidden = 0
    GROUP BY a.publicId
    ORDER BY a.sortTitle ASC, a.year ASC
  `);

  return rows.map((row) => {
    const album = mapAlbum(row);
    return {
      publicId: album.publicId,
      title: albumLabel(album),
      albumArtist: albumArtistLabel(album),
      year: album.year,
      trackCount: Number(row.trackCount ?? 0),
      discCount: Number(row.discCount ?? 0),
    };
  });
}

export function getAlbumDetail(context: DatabaseContext, albumId: string): AlbumDetail | null {
  const albumRow = get<Record<string, unknown>>(context, `
    SELECT *
    FROM albums
    WHERE publicId = ? AND hidden = 0
  `, [albumId]);

  if (!albumRow) {
    return null;
  }

  const album = mapAlbum(albumRow);
  const trackRows = all<Record<string, unknown>>(context, `
    SELECT
      at.albumId,
      at.trackId,
      at.discNumber,
      at.discTitle,
      at.trackNumber,
      at.sortOrder,
      at.createdAt AS albumTrackCreatedAt,
      t.*
    FROM albumTracks at
    INNER JOIN tracks t ON t.publicId = at.trackId
    WHERE at.albumId = ? AND t.hidden = 0
    ORDER BY at.sortOrder ASC
  `, [albumId]);

  const tracks: TrackListItem[] = trackRows.map((row) => ({
    publicId: String(row.publicId),
    title: typeof row.displayTitle === 'string' && row.displayTitle ? row.displayTitle : String(row.title),
    artist: typeof row.displayArtist === 'string' && row.displayArtist ? row.displayArtist : String(row.artist),
    durationSeconds: Number(row.durationSeconds ?? 0),
    trackNumber: Number(row.trackNumber ?? 0),
    discNumber: Number(row.discNumber ?? 1),
    discTitle: typeof row.discTitle === 'string' ? row.discTitle : undefined,
    mediaAssetId: String(row.mediaAssetId),
  }));

  return {
    publicId: album.publicId,
    title: albumLabel(album),
    albumArtist: albumArtistLabel(album),
    year: album.year,
    trackCount: tracks.length,
    discCount: new Set(tracks.map((item) => item.discNumber)).size,
    sourceDirectory: album.sourceDirectory,
    tracks,
  };
}

/** Internal: returns full TrackRecord for core-internal use (e.g. media resolution). */
export function getTrackRecordById(context: DatabaseContext, trackId: string) {
  const row = get<Record<string, unknown>>(context, `
    SELECT *
    FROM tracks
    WHERE publicId = ? AND hidden = 0
  `, [trackId]);

  return row ? mapTrack(row) : null;
}

export function getTrackById(context: DatabaseContext, trackId: string): TrackDetail | null {
  const track = getTrackRecordById(context, trackId);
  if (!track) return null;
  return {
    publicId: track.publicId,
    title: trackLabel(track),
    artist: artistLabel(track),
    durationSeconds: track.durationSeconds,
    format: track.format,
    year: track.year,
    genre: track.genre,
  };
}

export function getMediaAssetById(context: DatabaseContext, assetId: string) {
  const row = get<Record<string, unknown>>(context, `
    SELECT *
    FROM mediaAssets
    WHERE publicId = ? AND presenceStatus = 'active'
  `, [assetId]);

  return row ? mapMediaAsset(row) : null;
}

export function listCollections(context: DatabaseContext): Array<{
  publicId: string;
  title: string;
  description?: string;
  status: 'draft' | 'published';
  trackCount: number;
}> {
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      c.*,
      COUNT(ct.trackId) AS trackCount
    FROM collections c
    LEFT JOIN collectionTracks ct ON ct.collectionId = c.publicId
    GROUP BY c.publicId
    ORDER BY c.updatedAt DESC
  `);

  return rows.map((row) => {
    const collection = mapCollection(row);
    return {
      publicId: collection.publicId,
      title: collection.title,
      description: collection.description,
      status: collection.status,
      trackCount: Number(row.trackCount ?? 0),
    };
  });
}

export function getCollectionDetail(context: DatabaseContext, collectionId: string): CollectionDetail | null {
  const collectionRow = get<Record<string, unknown>>(context, `
    SELECT *
    FROM collections
    WHERE publicId = ?
  `, [collectionId]);

  if (!collectionRow) {
    return null;
  }

  const collection = mapCollection(collectionRow);
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      ct.collectionId,
      ct.trackId AS collectionTrackId,
      ct.sortOrder AS collectionSortOrder,
      t.*,
      a.publicId AS albumPublicId,
      a.title AS albumTitle,
      a.displayTitle AS albumDisplayTitle
    FROM collectionTracks ct
    INNER JOIN tracks t ON t.publicId = ct.trackId
    LEFT JOIN albumTracks at ON at.trackId = t.publicId
    LEFT JOIN albums a ON a.publicId = at.albumId
    WHERE ct.collectionId = ? AND t.hidden = 0
    GROUP BY ct.collectionId, t.publicId
    ORDER BY ct.sortOrder ASC
  `, [collectionId]);

  return {
    publicId: collection.publicId,
    title: collection.title,
    description: collection.description,
    status: collection.status,
    trackCount: rows.length,
    tracks: rows.map((row) => {
      const track = mapTrack(row);
      return {
        publicId: track.publicId,
        title: trackLabel(track),
        artist: artistLabel(track),
        durationSeconds: track.durationSeconds,
        trackNumber: track.sourceMeta.trackNumber ?? 0,
        discNumber: track.sourceMeta.discNumber ?? 0,
        mediaAssetId: track.mediaAssetId,
        albumId: typeof row.albumPublicId === 'string' ? row.albumPublicId : undefined,
        albumTitle: typeof row.albumDisplayTitle === 'string' && row.albumDisplayTitle
          ? row.albumDisplayTitle
          : typeof row.albumTitle === 'string'
            ? row.albumTitle
            : undefined,
      };
    }),
  };
}

export function searchCatalog(context: DatabaseContext, query: string): LibrarySearchResult {
  const keyword = `%${query.trim()}%`;
  const albumRows = query.trim()
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM albums
      WHERE hidden = 0 AND (
        title LIKE ? OR
        COALESCE(displayTitle, '') LIKE ? OR
        albumArtist LIKE ? OR
        COALESCE(displayArtist, '') LIKE ?
      )
      ORDER BY sortTitle ASC, year ASC
      LIMIT 20
    `, [keyword, keyword, keyword, keyword])
    : [];

  const trackRows = query.trim()
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM tracks
      WHERE hidden = 0 AND (
        title LIKE ? OR
        COALESCE(displayTitle, '') LIKE ? OR
        artist LIKE ? OR
        COALESCE(displayArtist, '') LIKE ?
      )
      ORDER BY title ASC
      LIMIT 30
    `, [keyword, keyword, keyword, keyword])
    : [];

  const tracks = trackRows.map(mapTrack);
  const links = tracks.length > 0
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM albumTracks
      WHERE trackId IN (${placeholders(tracks.length)})
      ORDER BY sortOrder ASC
    `, tracks.map((track) => track.publicId)).map(mapAlbumTrack)
    : [];

  const firstAlbumMap = new Map<string, string>();
  for (const link of links) {
    if (!firstAlbumMap.has(link.trackId)) {
      firstAlbumMap.set(link.trackId, link.albumId);
    }
  }

  const albumIds = [...new Set(firstAlbumMap.values())];
  const relatedAlbums = albumIds.length > 0
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM albums
      WHERE publicId IN (${placeholders(albumIds.length)})
    `, albumIds).map(mapAlbum)
    : [];
  const albumMap = new Map(relatedAlbums.map((album) => [album.publicId, album]));

  return {
    albums: albumRows.map((row) => {
      const album = mapAlbum(row);
      return {
        publicId: album.publicId,
        title: albumLabel(album),
        albumArtist: albumArtistLabel(album),
        year: album.year,
        trackCount: 0,
        discCount: 0,
      };
    }),
    tracks: tracks.map((track) => {
      const album = albumMap.get(firstAlbumMap.get(track.publicId) ?? '');
      return {
        publicId: track.publicId,
        title: trackLabel(track),
        artist: artistLabel(track),
        durationSeconds: track.durationSeconds,
        trackNumber: track.sourceMeta.trackNumber ?? 0,
        discNumber: track.sourceMeta.discNumber ?? 0,
        mediaAssetId: track.mediaAssetId,
        albumId: album?.publicId,
        albumTitle: album ? albumLabel(album) : undefined,
      };
    }),
  };
}

export interface AlbumSearchFilters {
  /** 按专辑标题关键词搜索（模糊匹配） */
  q?: string;
  /** 按专辑艺术家名称关键词筛选（模糊匹配） */
  artist?: string;
  /** 按流派关键词筛选（模糊匹配） */
  genre?: string;
  /** 按发行年份精确筛选 */
  year?: number;
  /** 按系列 publicId 精确筛选 */
  seriesId?: string;
  /** 返回结果数量上限，默认 20，最大 100 */
  limit?: number;
  /** 分页偏移量，默认 0 */
  offset?: number;
}

export function searchAlbums(
  context: DatabaseContext,
  filters: AlbumSearchFilters,
): AlbumSearchResult {
  const { q, artist, genre, year, seriesId, limit = 20, offset = 0 } = filters;
  const clampedLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safeOffset = Math.max(0, Number(offset) || 0);

  const joinParts: string[] = [
    'LEFT JOIN albumTracks at ON at.albumId = a.publicId',
  ];
  const conditions: string[] = ['a.hidden = 0', 'a.isSystemGenerated = 1'];
  const params: unknown[] = [];

  if (seriesId) {
    joinParts.push('INNER JOIN seriesAlbums sa ON sa.albumId = a.publicId');
    conditions.push('sa.seriesId = ?');
    params.push(seriesId);
  }

  if (q?.trim()) {
    const kw = `%${q.trim()}%`;
    conditions.push("(a.title LIKE ? OR COALESCE(a.displayTitle, '') LIKE ?)");
    params.push(kw, kw);
  }

  if (artist?.trim()) {
    const kw = `%${artist.trim()}%`;
    conditions.push("(a.albumArtist LIKE ? OR COALESCE(a.displayArtist, '') LIKE ?)");
    params.push(kw, kw);
  }

  if (genre?.trim()) {
    const kw = `%${genre.trim()}%`;
    joinParts.push('LEFT JOIN tracks t ON t.publicId = at.trackId');
    conditions.push('t.genre LIKE ?');
    params.push(kw);
  }

  if (year !== undefined && !Number.isNaN(Number(year))) {
    conditions.push('a.year = ?');
    params.push(Number(year));
  }

  const joinClause = joinParts.join('\n    ');
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countRow = get<Record<string, unknown>>(context, `
    SELECT COUNT(DISTINCT a.publicId) AS total
    FROM albums a
    ${joinClause}
    ${whereClause}
  `, params);

  const total = Number(countRow?.total ?? 0);

  const rows = all<Record<string, unknown>>(context, `
    SELECT
      a.*,
      COUNT(DISTINCT at.trackId) AS trackCount,
      COUNT(DISTINCT at.discNumber) AS discCount,
      sa2.seriesId AS seriesPublicId,
      s.name AS seriesName
    FROM albums a
    ${joinClause}
    LEFT JOIN seriesAlbums sa2 ON sa2.albumId = a.publicId
    LEFT JOIN series s ON s.publicId = sa2.seriesId
    ${whereClause}
    GROUP BY a.publicId
    ORDER BY a.sortTitle ASC, a.year ASC
    LIMIT ? OFFSET ?
  `, [...params, clampedLimit, safeOffset]);

  const items: AlbumSearchItem[] = rows.map((row) => {
    const album = mapAlbum(row);
    return {
      publicId: album.publicId,
      title: albumLabel(album),
      albumArtist: albumArtistLabel(album),
      year: album.year,
      trackCount: Number(row.trackCount ?? 0),
      discCount: Number(row.discCount ?? 0),
      seriesId: typeof row.seriesPublicId === 'string' ? row.seriesPublicId : undefined,
      seriesName: typeof row.seriesName === 'string' ? row.seriesName : undefined,
    };
  });

  return { items, total, limit: clampedLimit, offset: safeOffset };
}

export interface TrackSearchFilters {
  /** 按曲目标题关键词搜索（模糊匹配） */
  q?: string;
  /** 按专辑名称关键词筛选（模糊匹配） */
  album?: string;
  /** 按艺术家名称关键词筛选（模糊匹配） */
  artist?: string;
  /** 按流派关键词筛选（模糊匹配） */
  genre?: string;
  /** 按发行年份精确筛选 */
  year?: number;
  /** 按系列 publicId 精确筛选 */
  seriesId?: string;
  /** 按碟片号精确筛选 */
  discNumber?: number;
  /** 按曲目号精确筛选 */
  trackNumber?: number;
  /** 返回结果数量上限，默认 20，最大 100 */
  limit?: number;
  /** 分页偏移量，默认 0 */
  offset?: number;
}

export function searchTracks(
  context: DatabaseContext,
  filters: TrackSearchFilters,
): TrackSearchResult {
  const { q, album, artist, genre, year, seriesId, discNumber, trackNumber, limit = 20, offset = 0 } = filters;
  const clampedLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safeOffset = Math.max(0, Number(offset) || 0);

  // Build dynamic JOIN / WHERE clauses
  const joinParts: string[] = [
    'LEFT JOIN albumTracks at ON at.trackId = t.publicId',
    'LEFT JOIN albums a ON a.publicId = at.albumId AND a.hidden = 0',
  ];
  const conditions: string[] = ['t.hidden = 0'];
  const params: unknown[] = [];

  if (seriesId) {
    joinParts.push('INNER JOIN seriesAlbums sa ON sa.albumId = a.publicId');
    conditions.push('sa.seriesId = ?');
    params.push(seriesId);
  }

  if (q?.trim()) {
    const kw = `%${q.trim()}%`;
    conditions.push("(t.title LIKE ? OR COALESCE(t.displayTitle, '') LIKE ?)");
    params.push(kw, kw);
  }

  if (album?.trim()) {
    const kw = `%${album.trim()}%`;
    conditions.push("(a.title LIKE ? OR COALESCE(a.displayTitle, '') LIKE ?)");
    params.push(kw, kw);
  }

  if (artist?.trim()) {
    const kw = `%${artist.trim()}%`;
    conditions.push("(t.artist LIKE ? OR COALESCE(t.displayArtist, '') LIKE ?)");
    params.push(kw, kw);
  }

  if (genre?.trim()) {
    const kw = `%${genre.trim()}%`;
    conditions.push('t.genre LIKE ?');
    params.push(kw);
  }

  if (year !== undefined && !Number.isNaN(Number(year))) {
    conditions.push('t.year = ?');
    params.push(Number(year));
  }

  if (discNumber !== undefined && !Number.isNaN(Number(discNumber))) {
    conditions.push('at.discNumber = ?');
    params.push(Number(discNumber));
  }

  if (trackNumber !== undefined && !Number.isNaN(Number(trackNumber))) {
    conditions.push('at.trackNumber = ?');
    params.push(Number(trackNumber));
  }

  const joinClause = joinParts.join('\n    ');
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countRow = get<Record<string, unknown>>(context, `
    SELECT COUNT(DISTINCT t.publicId) AS total
    FROM tracks t
    ${joinClause}
    ${whereClause}
  `, params);

  const total = Number(countRow?.total ?? 0);

  const rows = all<Record<string, unknown>>(context, `
    SELECT
      t.*,
      at.trackNumber,
      at.discNumber,
      at.discTitle,
      a.publicId AS albumPublicId,
      COALESCE(a.displayTitle, a.title) AS albumTitle,
      COALESCE(a.displayArtist, a.albumArtist) AS albumArtist
    FROM tracks t
    ${joinClause}
    ${whereClause}
    GROUP BY t.publicId
    ORDER BY COALESCE(t.displayTitle, t.title) ASC
    LIMIT ? OFFSET ?
  `, [...params, clampedLimit, safeOffset]);

  const items: TrackSearchItem[] = rows.map((row) => {
    const track = mapTrack(row);
    return {
      publicId: track.publicId,
      title: trackLabel(track),
      artist: artistLabel(track),
      durationSeconds: track.durationSeconds,
      trackNumber: Number(row.trackNumber ?? track.sourceMeta.trackNumber ?? 0),
      discNumber: Number(row.discNumber ?? track.sourceMeta.discNumber ?? 0),
      discTitle: typeof row.discTitle === 'string' ? row.discTitle : undefined,
      mediaAssetId: track.mediaAssetId,
      albumId: typeof row.albumPublicId === 'string' ? row.albumPublicId : undefined,
      albumTitle: typeof row.albumTitle === 'string' ? row.albumTitle : undefined,
      albumArtist: typeof row.albumArtist === 'string' ? row.albumArtist : undefined,
      year: track.year,
      genre: track.genre,
    };
  });

  return { items, total, limit: clampedLimit, offset: safeOffset };
}

const TRACK_PATCHABLE_COLUMNS = new Set(['displayTitle', 'displayArtist', 'hidden']);

export function patchTrack(context: DatabaseContext, trackId: string, input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([key, value]) => value !== undefined && TRACK_PATCHABLE_COLUMNS.has(key));
  if (entries.length === 0) {
    return getTrackById(context, trackId);
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  run(context, `
    UPDATE tracks
    SET ${setClause}, updatedAt = ?
    WHERE publicId = ?
  `, [...entries.map(([, value]) => value), new Date().toISOString(), trackId]);

  return getTrackById(context, trackId);
}

const ALBUM_PATCHABLE_COLUMNS = new Set(['displayTitle', 'displayArtist', 'hidden']);

export function patchAlbum(context: DatabaseContext, albumId: string, input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([key, value]) => value !== undefined && ALBUM_PATCHABLE_COLUMNS.has(key));
  if (entries.length === 0) {
    const row = get<Record<string, unknown>>(context, `SELECT * FROM albums WHERE publicId = ?`, [albumId]);
    return row ? mapAlbum(row) : null;
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  run(context, `
    UPDATE albums
    SET ${setClause}, updatedAt = ?
    WHERE publicId = ?
  `, [...entries.map(([, value]) => value), new Date().toISOString(), albumId]);

  const row = get<Record<string, unknown>>(context, `SELECT * FROM albums WHERE publicId = ?`, [albumId]);
  return row ? mapAlbum(row) : null;
}

export function createCollection(context: DatabaseContext, collection: {
  publicId: string;
  title: string;
  description?: string;
  status: 'draft' | 'published';
}) {
  const now = new Date().toISOString();
  run(context, `
    INSERT INTO collections (publicId, title, description, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    collection.publicId,
    collection.title,
    collection.description ?? null,
    collection.status,
    now,
    now,
  ]);

  const row = get<Record<string, unknown>>(context, `SELECT * FROM collections WHERE publicId = ?`, [collection.publicId]);
  return row ? mapCollection(row) : null;
}

const COLLECTION_PATCHABLE_COLUMNS = new Set(['title', 'description', 'status']);

export function patchCollection(context: DatabaseContext, collectionId: string, input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([key, value]) => value !== undefined && COLLECTION_PATCHABLE_COLUMNS.has(key));
  if (entries.length === 0) {
    const row = get<Record<string, unknown>>(context, `SELECT * FROM collections WHERE publicId = ?`, [collectionId]);
    return row ? mapCollection(row) : null;
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  run(context, `
    UPDATE collections
    SET ${setClause}, updatedAt = ?
    WHERE publicId = ?
  `, [...entries.map(([, value]) => value), new Date().toISOString(), collectionId]);

  const row = get<Record<string, unknown>>(context, `SELECT * FROM collections WHERE publicId = ?`, [collectionId]);
  return row ? mapCollection(row) : null;
}

export function addTracksToCollection(context: DatabaseContext, collectionId: string, trackIds: string[]) {
  const lastRow = get<Record<string, unknown>>(context, `
    SELECT sortOrder
    FROM collectionTracks
    WHERE collectionId = ?
    ORDER BY sortOrder DESC
    LIMIT 1
  `, [collectionId]);

  let sortOrder = Number(lastRow?.sortOrder ?? 0);
  const now = new Date().toISOString();

  for (const trackId of trackIds) {
    sortOrder += 1;
    run(context, `
      INSERT OR IGNORE INTO collectionTracks (collectionId, trackId, sortOrder, createdAt)
      VALUES (?, ?, ?, ?)
    `, [collectionId, trackId, sortOrder, now]);
  }

  return getCollectionDetail(context, collectionId);
}

export function listSeries(context: DatabaseContext): SeriesListItem[] {
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      s.*,
      COUNT(sa.albumId) AS albumCount
    FROM series s
    LEFT JOIN seriesAlbums sa ON sa.seriesId = s.publicId
    GROUP BY s.publicId
    ORDER BY s.sortTitle ASC
  `);

  return rows.map((row) => ({
    publicId: String(row.publicId),
    name: String(row.name),
    sortTitle: String(row.sortTitle),
    albumCount: Number(row.albumCount ?? 0),
  }));
}

export function getSeriesDetail(context: DatabaseContext, seriesId: string): SeriesDetail | null {
  const seriesRow = get<Record<string, unknown>>(context, `
    SELECT * FROM series WHERE publicId = ?
  `, [seriesId]);

  if (!seriesRow) {
    return null;
  }

  const albumRows = all<Record<string, unknown>>(context, `
    SELECT
      a.*,
      COUNT(at.trackId) AS trackCount,
      COUNT(DISTINCT at.discNumber) AS discCount
    FROM seriesAlbums sa
    INNER JOIN albums a ON a.publicId = sa.albumId
    LEFT JOIN albumTracks at ON at.albumId = a.publicId
    WHERE sa.seriesId = ? AND a.hidden = 0
    GROUP BY a.publicId
    ORDER BY (sa.sortOrder IS NULL) ASC, sa.sortOrder ASC, a.sortTitle ASC, a.year ASC
  `, [seriesId]);

  const albums: AlbumListItem[] = albumRows.map((row) => {
    const album = mapAlbum(row);
    return {
      publicId: album.publicId,
      title: albumLabel(album),
      albumArtist: albumArtistLabel(album),
      year: album.year,
      trackCount: Number(row.trackCount ?? 0),
      discCount: Number(row.discCount ?? 0),
    };
  });

  return {
    publicId: String(seriesRow.publicId),
    name: String(seriesRow.name),
    sortTitle: String(seriesRow.sortTitle),
    albums,
  };
}
